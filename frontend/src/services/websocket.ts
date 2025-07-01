// frontend/src/services/websocket.ts - FIXED WebSocket URL Configuration
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

// FIXED: Helper function to get the correct WebSocket URL
const getWebSocketUrl = (): string => {
  // Development vs Production environment detection
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1';

  if (isDevelopment) {
    // Development: Connect to local backend
    const wsPort = process.env.REACT_APP_WS_PORT || '3001';
    const wsHost = process.env.REACT_APP_WS_HOST || 'localhost';
    return `ws://${wsHost}:${wsPort}`;
  } else {
    // Production: Use environment variable or fallback to your Render backend
    const backendWsUrl = process.env.REACT_APP_BACKEND_WS_URL || 
                        process.env.REACT_APP_BACKEND_URL?.replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:') ||
                        'wss://trading-simulator-iw7q.onrender.com';
    
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
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000;
  const maxQueueSize = 100;
  const maxMessageAge = 5000;
  const batchProcessingDelay = 16;
  
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

  // Optimized message processing
  const processMessageQueue = useCallback(() => {
    if (isProcessing.current || messageQueue.current.length === 0) {
      return;
    }
    
    isProcessing.current = true;
    const now = Date.now();
    
    // Remove old messages
    const cutoffTime = now - maxMessageAge;
    messageQueue.current = messageQueue.current.filter(m => m.timestamp > cutoffTime);
    
    // Process messages in small batches
    const batchSize = 10;
    const messagesToProcess = messageQueue.current.splice(0, batchSize);
    
    if (messagesToProcess.length > 0) {
      console.log(`📋 Processing batch of ${messagesToProcess.length} messages`);
      
      const messagesByType = new Map<string, QueuedMessage>();
      
      messagesToProcess.forEach(item => {
        const type = item.message.event.type;
        
        if (type === 'trade' || type === 'processed_trade') {
          setLastMessage(item.message);
          messageStats.current.processed++;
        } else {
          messagesByType.set(type, item);
        }
      });
      
      messagesByType.forEach(item => {
        setLastMessage(item.message);
        messageStats.current.processed++;
      });
      
      const dropped = messagesToProcess.length - messagesByType.size;
      if (dropped > 0) {
        messageStats.current.dropped += dropped;
      }
    }
    
    lastProcessedTime.current = now;
    isProcessing.current = false;
    
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
          isPaused: paused
        };
        ws.current.send(JSON.stringify(message));
        console.log('✅ Pause state sent:', paused);
      } catch (error: unknown) {
        console.error('❌ Error sending pause state:', getErrorMessage(error));
      }
    }
  }, [simulationId]);

  // FIXED: Connection function with correct backend URL
  const connect = useCallback(() => {
    try {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      console.log('🔌 WebSocket: Connecting with backend URL configuration...');
      setConnectionError(null);
      
      // FIXED: Use the correct backend WebSocket URL
      const wsUrl = getWebSocketUrl();
      
      console.log('🔧 Connecting to backend WebSocket:', wsUrl);
      console.log('🔧 Environment:', process.env.NODE_ENV);
      console.log('🔧 Current hostname:', window.location.hostname);
      
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = 'arraybuffer';
      
      ws.current.onopen = () => {
        console.log('🎉 WebSocket: Connected to backend successfully!');
        console.log('✅ WebSocket URL was:', wsUrl);
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
                    encodingFallbacks: ['utf-8', 'latin1', 'ascii']
                  }
                };
                
                ws.current.send(JSON.stringify(subscribeMessage));
                console.log('📡 Subscription sent to backend for:', simulationId);
              } catch (error: unknown) {
                console.error('❌ Failed to subscribe:', getErrorMessage(error));
              }
            }
          }, 100);
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
                setConnectionError(data.message || 'Unknown error');
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
            
            if (messageQueue.current.length > maxQueueSize) {
              const removed = messageQueue.current.splice(0, messageQueue.current.length - maxQueueSize);
              messageStats.current.dropped += removed.length;
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
        console.error('🔧 Failed WebSocket URL was:', wsUrl);
        setIsConnected(false);
        setConnectionError('Backend connection error');
      };

      ws.current.onclose = (event) => {
        console.log('🔌 WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasConnectedToBackend: wsUrl.includes('trading-simulator')
        });
        
        setIsConnected(false);
        ws.current = null;
        
        if (event.code === 1006) {
          setConnectionError('Backend connection lost unexpectedly');
        } else if (event.code !== 1000) {
          setConnectionError(`Backend connection closed: ${event.code}`);
        } else {
          setConnectionError(null);
        }

        // Reconnection logic
        if (simulationId && reconnectAttempts.current < maxReconnectAttempts && event.code !== 1000) {
          reconnectAttempts.current++;
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current - 1);
          console.log(`🔄 Reconnecting to backend in ${delay}ms... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError(`Failed to connect to backend after ${maxReconnectAttempts} attempts`);
        }
      };
      
    } catch (error: unknown) {
      console.error('💥 Failed to create WebSocket connection to backend:', getErrorMessage(error));
      setIsConnected(false);
      setConnectionError('Failed to create backend connection');
    }
  }, [simulationId, processMessageQueue, parseWebSocketMessage]);

  // Connection effect
  useEffect(() => {
    if (simulationId) {
      console.log('🔄 Starting WebSocket connection to backend for simulation:', simulationId);
      connect();
    } else {
      console.log('⏳ No simulation ID - waiting...');
    }

    return () => {
      console.log('🧹 WebSocket cleanup');
      
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      
      if (ws.current) {
        if (simulationId && ws.current.readyState === WebSocket.OPEN) {
          try {
            ws.current.send(JSON.stringify({
              type: 'unsubscribe',
              simulationId: simulationId
            }));
          } catch (error: unknown) {
            console.error('❌ Error unsubscribing:', getErrorMessage(error));
          }
        }
        
        ws.current.close(1000, 'Component unmounted');
        ws.current = null;
      }
      
      messageQueue.current = [];
      
      console.log('📊 Final WebSocket stats:', messageStats.current);
    };
  }, [simulationId, connect]);

  // Pause state effect
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      setPauseState(isPaused || false);
    }
  }, [isPaused, simulationId, setPauseState]);

  // Keepalive ping
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          ws.current.send(JSON.stringify({
            type: 'ping',
            timestamp: Date.now()
          }));
        } catch (error: unknown) {
          console.error('❌ Ping error:', getErrorMessage(error));
        }
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, []);

  return { 
    isConnected, 
    lastMessage, 
    setPauseState,
    connectionError,
    messageStats: messageStats.current
  };
};