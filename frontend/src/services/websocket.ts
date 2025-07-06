// frontend/src/services/websocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  simulationId: string;
  event: {
    type: string;
    timestamp: number;
    data: any;
  };
}

interface QueuedMessage {
  message: WebSocketMessage;
  timestamp: number;
}

interface MessageStats {
  received: number;
  processed: number;
  dropped: number;
  textMessages: number;
  blobMessages: number;
  arrayBufferMessages: number;
  parseErrors: number;
  corruptedMessages: number;
  successfulConversions: number;
  recoveredMessages: number;
  totallyCorrupted: number;
}

// FIXED: Helper function to get the correct WebSocket URL with better fallback logic
const getWebSocketUrl = (): string => {
  // Development vs Production environment detection
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1';

  if (isDevelopment) {
    // Development: Connect to local backend
    const wsPort = process.env.REACT_APP_WS_PORT || '3001';
    const wsHost = process.env.REACT_APP_WS_HOST || 'localhost';
    const wsUrl = `ws://${wsHost}:${wsPort}`;
    console.log('🔧 Development WebSocket URL:', wsUrl);
    return wsUrl;
  } else {
    // Production: Use environment variable or fallback to Render backend
    let backendWsUrl = process.env.REACT_APP_BACKEND_WS_URL;
    
    if (!backendWsUrl && process.env.REACT_APP_BACKEND_URL) {
      // Convert HTTP URL to WebSocket URL
      backendWsUrl = process.env.REACT_APP_BACKEND_URL
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:');
    }
    
    if (!backendWsUrl) {
      // Final fallback to known backend
      backendWsUrl = 'wss://trading-simulator-iw7q.onrender.com';
    }
    
    console.log('🔧 Production WebSocket URL:', backendWsUrl);
    return backendWsUrl;
  }
};

// Helper function to safely get error message
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
};

export const useWebSocket = (simulationId?: string, isPaused?: boolean) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Refs for stable state management
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const messageQueue = useRef<QueuedMessage[]>([]);
  const isProcessing = useRef(false);
  const lastProcessedTime = useRef(0);
  const lastMessageId = useRef<string>('');
  
  // Enhanced corruption tracking
  const corruptionBuffer = useRef<ArrayBuffer[]>([]);
  const lastValidMessage = useRef<any>(null);
  
  // Stable configuration
  const maxReconnectAttempts = 8; // Increased for better reliability
  const reconnectDelay = 1500; // Slightly longer delay
  const maxQueueSize = 200; // Increased for ultra-fast mode
  const maxMessageAge = 10000; // 10 seconds
  const batchProcessingDelay = 16; // 60fps
  
  // Enhanced message stats tracking
  const messageStats = useRef<MessageStats>({
    received: 0,
    processed: 0,
    dropped: 0,
    textMessages: 0,
    blobMessages: 0,
    arrayBufferMessages: 0,
    parseErrors: 0,
    corruptedMessages: 0,
    successfulConversions: 0,
    recoveredMessages: 0,
    totallyCorrupted: 0
  });

  // Enhanced corruption recovery system with proper TypeScript
  const parseWebSocketMessage = useCallback(async (data: any): Promise<any> => {
    let messageText: string = '';
    
    try {
      if (typeof data === 'string') {
        messageStats.current.textMessages++;
        messageText = data;
        console.log('✅ TEXT message received (optimal format)');
        
      } else if (data instanceof ArrayBuffer) {
        messageStats.current.arrayBufferMessages++;
        console.log('🔄 ArrayBuffer received - attempting recovery...', {
          byteLength: data.byteLength,
          firstBytes: Array.from(new Uint8Array(data.slice(0, 10))).map(b => b.toString(16)).join(' ')
        });
        
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          messageText = decoder.decode(data);
          messageStats.current.successfulConversions++;
          console.log('✅ ArrayBuffer decoded via UTF-8');
          
        } catch (utf8Error: unknown) {
          console.log('⚠️ UTF-8 failed, trying recovery strategies...', {
            error: getErrorMessage(utf8Error),
            byteLength: data.byteLength
          });
          
          try {
            const encodings = ['utf-8', 'latin1', 'ascii'];
            let recovered = false;
            
            for (const encoding of encodings) {
              try {
                const decoder = new TextDecoder(encoding, { fatal: false });
                const result = decoder.decode(data);
                
                if (result.includes('{') && result.includes('}')) {
                  messageText = result;
                  recovered = true;
                  messageStats.current.recoveredMessages++;
                  console.log(`✅ Recovered via ${encoding} encoding`);
                  break;
                }
              } catch (encError: unknown) {
                continue;
              }
            }
            
            if (!recovered) {
              throw new Error('All recovery strategies failed');
            }
            
          } catch (recoveryError: unknown) {
            throw new Error(`ArrayBuffer recovery failed: ${getErrorMessage(recoveryError)}`);
          }
        }
        
      } else if (data instanceof Blob) {
        messageStats.current.blobMessages++;
        console.warn('⚠️ BLOB detected - major backend issue!');
        
        try {
          messageText = await data.text();
          messageStats.current.successfulConversions++;
          console.log('🔄 Blob converted (emergency fallback)');
        } catch (blobError: unknown) {
          throw new Error(`Blob conversion failed: ${getErrorMessage(blobError)}`);
        }
        
      } else {
        console.error('❌ Unknown message type:', {
          type: typeof data,
          constructor: data?.constructor?.name,
          keys: Object.keys(data || {})
        });
        throw new Error(`Unsupported message type: ${typeof data}`);
      }
      
      if (!messageText || typeof messageText !== 'string' || messageText.length === 0) {
        throw new Error('Invalid message text after conversion');
      }
      
      // Parse JSON with enhanced error handling
      let parsed: any;
      try {
        parsed = JSON.parse(messageText);
        
        if (parsed && typeof parsed === 'object') {
          lastValidMessage.current = parsed;
        }
        
      } catch (jsonError: unknown) {
        const errorMessage = getErrorMessage(jsonError);
        console.error('❌ JSON parsing failed:', {
          error: errorMessage,
          messageLength: messageText.length,
          firstChars: messageText.substring(0, 50)
        });
        
        messageStats.current.totallyCorrupted++;
        throw new Error(`JSON parsing failed: ${errorMessage}`);
      }
      
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid parsed object: ${typeof parsed}`);
      }
      
      console.log('✅ Message processed successfully:', {
        type: parsed.type || parsed.event?.type || 'unknown',
        hasSimulationId: !!parsed.simulationId
      });
      
      return parsed;
      
    } catch (error: unknown) {
      messageStats.current.parseErrors++;
      const errorMessage = getErrorMessage(error);
      console.error('💥 Message parsing failed:', {
        error: errorMessage,
        dataType: typeof data
      });
      
      throw new Error(`Message parsing failed: ${errorMessage}`);
    }
  }, []);

  // Optimized message processing with better memory management
  const processMessageQueue = useCallback(() => {
    if (isProcessing.current || messageQueue.current.length === 0) {
      return;
    }
    
    isProcessing.current = true;
    const now = Date.now();
    
    // Remove old messages
    const cutoffTime = now - maxMessageAge;
    messageQueue.current = messageQueue.current.filter(m => m.timestamp > cutoffTime);
    
    // Process messages in larger batches for ultra-fast mode
    const batchSize = 15; // Increased batch size
    const messagesToProcess = messageQueue.current.splice(0, batchSize);
    
    if (messagesToProcess.length > 0) {
      console.log(`📋 Processing batch of ${messagesToProcess.length} messages`);
      
      const messagesByType = new Map<string, QueuedMessage>();
      let tradesProcessed = 0;
      
      messagesToProcess.forEach(item => {
        const type = item.message.event.type;
        
        if (type === 'trade' || type === 'processed_trade') {
          setLastMessage(item.message);
          messageStats.current.processed++;
          tradesProcessed++;
        } else {
          messagesByType.set(type, item);
        }
      });
      
      // Process non-trade messages
      messagesByType.forEach(item => {
        setLastMessage(item.message);
        messageStats.current.processed++;
      });
      
      if (tradesProcessed > 0) {
        console.log(`💰 Processed ${tradesProcessed} trade messages in batch`);
      }
      
      const dropped = messagesToProcess.length - messagesByType.size - tradesProcessed;
      if (dropped > 0) {
        messageStats.current.dropped += dropped;
      }
    }
    
    lastProcessedTime.current = now;
    isProcessing.current = false;
    
    // Continue processing if more messages available
    if (messageQueue.current.length > 0) {
      setTimeout(processMessageQueue, batchProcessingDelay);
    }
  }, []);

  // setPauseState function
  const setPauseState = useCallback((paused: boolean) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: 'setPauseState',
          simulationId,
          isPaused: paused,
          timestamp: Date.now()
        };
        ws.current.send(JSON.stringify(message));
        console.log('✅ Pause state sent:', paused);
      } catch (error: unknown) {
        console.error('❌ Error sending pause state:', getErrorMessage(error));
      }
    }
  }, [simulationId]);

  // FIXED: Enhanced connection function with better error handling and retry logic
  const connect = useCallback(() => {
    try {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      console.log('🔌 WebSocket: Connecting to backend...');
      setConnectionError(null);
      
      // FIXED: Use the correct backend WebSocket URL with fallback
      const wsUrl = getWebSocketUrl();
      
      console.log('🔧 Connecting to backend WebSocket:', wsUrl);
      console.log('🔧 Environment:', process.env.NODE_ENV);
      console.log('🔧 Current hostname:', window.location.hostname);
      
      if (ws.current) {
        try {
          ws.current.close();
        } catch (closeError) {
          console.warn('Warning closing existing WebSocket:', closeError);
        }
        ws.current = null;
      }
      
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = 'arraybuffer';
      
      ws.current.onopen = () => {
        console.log('🎉 WebSocket: Connected to backend successfully!');
        console.log('✅ Backend WebSocket URL was:', wsUrl);
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        // Reset stats
        messageStats.current = {
          received: 0,
          processed: 0,
          dropped: 0,
          textMessages: 0,
          blobMessages: 0,
          arrayBufferMessages: 0,
          parseErrors: 0,
          corruptedMessages: 0,
          successfulConversions: 0,
          recoveredMessages: 0,
          totallyCorrupted: 0
        };
        
        corruptionBuffer.current = [];
        lastValidMessage.current = null;

        // Send subscription message if simulation ID is available
        if (simulationId) {
          setTimeout(() => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              try {
                const subscribeMessage = {
                  type: 'subscribe',
                  simulationId: simulationId,
                  timestamp: Date.now(),
                  clientCapabilities: {
                    corruptionRecovery: true,
                    binaryHandling: true,
                    encodingFallbacks: ['utf-8', 'latin1', 'ascii'],
                    ultraFastMode: true,
                    maxMessageRate: 1000
                  }
                };
                
                ws.current.send(JSON.stringify(subscribeMessage));
                console.log('📡 Enhanced subscription sent to backend for:', simulationId);
              } catch (error: unknown) {
                console.error('❌ Failed to subscribe:', getErrorMessage(error));
              }
            }
          }, 200); // Slightly longer delay for backend readiness
        }
      };

      ws.current.onmessage = async (event) => {
        try {
          messageStats.current.received++;
          
          console.log('📨 Message received from backend:', {
            type: typeof event.data,
            constructor: event.data?.constructor?.name,
            size: event.data?.byteLength || event.data?.length || event.data?.size || 'unknown'
          });
          
          const data = await parseWebSocketMessage(event.data);
          
          // Message deduplication
          const messageId = `${data.simulationId || 'unknown'}-${data.event?.type || data.type}-${data.event?.timestamp || Date.now()}`;
          
          if (lastMessageId.current === messageId) {
            console.log('⏭️ Skipping duplicate message');
            return;
          }
          lastMessageId.current = messageId;
          
          // Handle system messages
          if (data.type) {
            switch (data.type) {
              case 'connection':
              case 'subscription_confirmed':
              case 'pong':
                console.log(`🔧 System message from backend: ${data.type}`);
                return;
              case 'error':
                console.error('❌ Backend WebSocket error:', data.message);
                setConnectionError(data.message || 'Unknown backend error');
                return;
              case 'backend_ready':
                console.log('🎉 Backend confirmed ready for ultra-fast trading');
                return;
              default:
                console.log(`❓ Unknown system message: ${data.type}`);
            }
          }
          
          // Handle simulation messages
          if (data.simulationId && data.event) {
            const message: WebSocketMessage = {
              simulationId: data.simulationId,
              event: {
                type: data.event.type || 'unknown',
                timestamp: data.event.timestamp || Date.now(),
                data: data.event.data || {}
              }
            };
            
            messageQueue.current.push({
              message,
              timestamp: Date.now()
            });
            
            // Enhanced queue management for ultra-fast mode
            if (messageQueue.current.length > maxQueueSize) {
              const removed = messageQueue.current.splice(0, messageQueue.current.length - maxQueueSize);
              messageStats.current.dropped += removed.length;
              console.warn(`📦 Queue overflow: dropped ${removed.length} messages`);
            }
            
            processMessageQueue();
            
          } else {
            console.warn('❓ Unhandled message format from backend:', data);
          }
          
        } catch (error: unknown) {
          console.error('💥 Message processing error:', getErrorMessage(error));
          messageStats.current.parseErrors++;
        }
      };

      ws.current.onerror = (error) => {
        console.error('💥 WebSocket error connecting to backend:', error);
        console.error('🔧 Failed backend WebSocket URL was:', wsUrl);
        setIsConnected(false);
        setConnectionError('Backend connection error - check if backend is running');
      };

      ws.current.onclose = (event) => {
        console.log('🔌 WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasConnectedToBackend: wsUrl.includes('trading-simulator') || wsUrl.includes('localhost')
        });
        
        setIsConnected(false);
        ws.current = null;
        
        if (event.code === 1006) {
          setConnectionError('Backend connection lost unexpectedly');
        } else if (event.code === 1001) {
          setConnectionError('Backend is going away - server restart?');
        } else if (event.code !== 1000) {
          setConnectionError(`Backend connection closed: ${event.code} - ${event.reason || 'Unknown reason'}`);
        } else {
          setConnectionError(null);
        }

        // Enhanced reconnection logic
        if (simulationId && reconnectAttempts.current < maxReconnectAttempts && event.code !== 1000) {
          reconnectAttempts.current++;
          const delay = Math.min(10000, reconnectDelay * Math.pow(1.5, reconnectAttempts.current - 1)); // Cap at 10 seconds
          console.log(`🔄 Reconnecting to backend in ${delay}ms... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError(`Failed to connect to backend after ${maxReconnectAttempts} attempts. Check if backend is running.`);
        }
      };
      
    } catch (error: unknown) {
      console.error('💥 Failed to create WebSocket connection to backend:', getErrorMessage(error));
      setIsConnected(false);
      setConnectionError('Failed to create backend connection - check configuration');
    }
  }, [simulationId, processMessageQueue, parseWebSocketMessage]);

  // Connection effect with simulation ID dependency
  useEffect(() => {
    if (simulationId) {
      console.log('🔄 Starting WebSocket connection to backend for simulation:', simulationId);
      connect();
    } else {
      console.log('⏳ No simulation ID - waiting...');
      
      // Close existing connection if no simulation ID
      if (ws.current) {
        try {
          ws.current.close(1000, 'No simulation ID');
        } catch (error) {
          console.warn('Warning closing WebSocket:', error);
        }
        ws.current = null;
        setIsConnected(false);
      }
    }

    return () => {
      console.log('🧹 WebSocket cleanup for simulation:', simulationId || 'none');
      
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      
      if (ws.current) {
        if (simulationId && ws.current.readyState === WebSocket.OPEN) {
          try {
            ws.current.send(JSON.stringify({
              type: 'unsubscribe',
              simulationId: simulationId,
              timestamp: Date.now()
            }));
          } catch (error: unknown) {
            console.error('❌ Error unsubscribing:', getErrorMessage(error));
          }
        }
        
        try {
          ws.current.close(1000, 'Component unmounted');
        } catch (error) {
          console.warn('Warning during WebSocket cleanup:', error);
        }
        ws.current = null;
      }
      
      messageQueue.current = [];
      setIsConnected(false);
      
      console.log('📊 Final WebSocket stats:', messageStats.current);
    };
  }, [simulationId, connect]);

  // Pause state effect
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      setPauseState(isPaused || false);
    }
  }, [isPaused, simulationId, setPauseState]);

  // Enhanced keepalive ping with backend health check
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          ws.current.send(JSON.stringify({
            type: 'ping',
            timestamp: Date.now(),
            simulationId: simulationId || undefined,
            stats: {
              messagesReceived: messageStats.current.received,
              messagesProcessed: messageStats.current.processed,
              queueSize: messageQueue.current.length
            }
          }));
        } catch (error: unknown) {
          console.error('❌ Ping error:', getErrorMessage(error));
        }
      }
    }, 25000); // 25 second intervals

    return () => clearInterval(pingInterval);
  }, [simulationId]);

  return { 
    isConnected, 
    lastMessage, 
    setPauseState,
    connectionError,
    messageStats: messageStats.current
  };
};