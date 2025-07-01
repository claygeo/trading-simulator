// frontend/src/services/websocket.ts - TYPESCRIPT ERRORS FIXED
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

  // FIXED: Enhanced corruption recovery system with proper TypeScript
  const parseWebSocketMessage = useCallback(async (data: any): Promise<any> => {
    let messageText: string = ''; // Initialize to prevent "used before assigned" error
    
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
        
        // ENHANCED RECOVERY STRATEGIES
        try {
          // Strategy 1: Standard UTF-8 decoding
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
            // Strategy 2: Try different encodings
            const encodings = ['utf-8', 'latin1', 'ascii'];
            let recovered = false;
            
            for (const encoding of encodings) {
              try {
                const decoder = new TextDecoder(encoding, { fatal: false });
                const result = decoder.decode(data);
                
                // Check if result looks like JSON
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
              // Strategy 3: Try to extract JSON from binary data
              const bytes = new Uint8Array(data);
              console.log('🔧 Attempting binary JSON extraction...', {
                totalBytes: bytes.length,
                sample: Array.from(bytes.slice(0, 20)).map(b => String.fromCharCode(b)).join('')
              });
              
              // Look for JSON patterns in the binary data
              let jsonStart = -1;
              let jsonEnd = -1;
              
              for (let i = 0; i < bytes.length - 1; i++) {
                if (bytes[i] === 0x7B) { // '{' character
                  jsonStart = i;
                  break;
                }
              }
              
              for (let i = bytes.length - 1; i >= 0; i--) {
                if (bytes[i] === 0x7D) { // '}' character
                  jsonEnd = i;
                  break;
                }
              }
              
              if (jsonStart >= 0 && jsonEnd > jsonStart) {
                const jsonBytes = bytes.slice(jsonStart, jsonEnd + 1);
                const extractedText = Array.from(jsonBytes)
                  .map(byte => String.fromCharCode(byte))
                  .join('');
                
                console.log('🔧 Extracted potential JSON:', {
                  start: jsonStart,
                  end: jsonEnd,
                  length: extractedText.length,
                  preview: extractedText.substring(0, 100)
                });
                
                // Validate extracted JSON
                try {
                  JSON.parse(extractedText);
                  messageText = extractedText;
                  messageStats.current.recoveredMessages++;
                  console.log('✅ Successfully extracted JSON from binary data');
                } catch (jsonTest: unknown) {
                  throw new Error('Extracted text is not valid JSON');
                }
              } else {
                throw new Error('No JSON structure found in binary data');
              }
            }
            
          } catch (recoveryError: unknown) {
            // Strategy 4: Use last valid message structure as template
            if (lastValidMessage.current) {
              console.log('🔄 Attempting template-based recovery...');
              
              try {
                const template = {
                  ...lastValidMessage.current,
                  event: {
                    ...lastValidMessage.current.event,
                    timestamp: Date.now(),
                    data: { corrupted: true, recovered: true }
                  }
                };
                
                messageText = JSON.stringify(template);
                messageStats.current.recoveredMessages++;
                console.log('✅ Used template-based recovery');
              } catch (templateError: unknown) {
                throw new Error('All recovery strategies failed');
              }
            } else {
              throw new Error('No recovery possible - no valid template');
            }
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
      
      // Enhanced validation (messageText is now always initialized)
      if (!messageText || typeof messageText !== 'string' || messageText.length === 0) {
        throw new Error('Invalid message text after conversion');
      }
      
      // Corruption detection
      const corruptionIndicators = [
        /^\uFFFD+$/,
        /[\x00-\x08\x0E-\x1F\x7F-\x9F]{5,}/,
        /^[\u0080-\u00FF]{10,}/
      ];
      
      const isCorrupted = corruptionIndicators.some(pattern => pattern.test(messageText));
      if (isCorrupted) {
        console.warn('⚠️ Corruption detected in message text:', {
          length: messageText.length,
          preview: messageText.substring(0, 50),
          hasReplacementChars: messageText.includes('\uFFFD')
        });
        messageStats.current.corruptedMessages++;
      }
      
      // Parse JSON with enhanced error handling
      let parsed: any;
      try {
        parsed = JSON.parse(messageText);
        
        // Store as last valid message if successful
        if (parsed && typeof parsed === 'object' && !isCorrupted) {
          lastValidMessage.current = parsed;
        }
        
      } catch (jsonError: unknown) {
        const errorMessage = getErrorMessage(jsonError);
        console.error('❌ JSON parsing failed:', {
          error: errorMessage,
          messageLength: messageText.length,
          firstChars: messageText.substring(0, 50),
          lastChars: messageText.length > 50 ? messageText.substring(messageText.length - 50) : ''
        });
        
        // Try JSON repair
        try {
          // Remove null bytes and control characters
          const cleaned = messageText.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
          
          // Try to fix common JSON issues
          let fixed = cleaned
            .replace(/,\s*}/g, '}')  // Remove trailing commas
            .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
            .trim();
          
          // Ensure it starts and ends with braces
          if (!fixed.startsWith('{') && fixed.includes('{')) {
            fixed = fixed.substring(fixed.indexOf('{'));
          }
          if (!fixed.endsWith('}') && fixed.lastIndexOf('}') > 0) {
            fixed = fixed.substring(0, fixed.lastIndexOf('}') + 1);
          }
          
          parsed = JSON.parse(fixed);
          messageStats.current.recoveredMessages++;
          console.log('✅ JSON repaired successfully');
          
        } catch (repairError: unknown) {
          messageStats.current.totallyCorrupted++;
          throw new Error(`JSON parsing and repair failed: ${errorMessage}`);
        }
      }
      
      // Final validation
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid parsed object: ${typeof parsed}`);
      }
      
      console.log('✅ Message processed successfully:', {
        type: parsed.type || parsed.event?.type || 'unknown',
        hasSimulationId: !!parsed.simulationId,
        wasCorrupted: isCorrupted,
        wasRecovered: messageStats.current.recoveredMessages > 0
      });
      
      return parsed;
      
    } catch (error: unknown) {
      messageStats.current.parseErrors++;
      const errorMessage = getErrorMessage(error);
      console.error('💥 Message parsing completely failed:', {
        error: errorMessage,
        dataType: typeof data,
        byteLength: data?.byteLength || data?.length || 'unknown',
        corruptionStats: {
          recovered: messageStats.current.recoveredMessages,
          corrupted: messageStats.current.corruptedMessages,
          totallyCorrupted: messageStats.current.totallyCorrupted
        }
      });
      
      // Log backend issue indicators
      if (data instanceof ArrayBuffer) {
        console.error('🚨 BACKEND ISSUE: Sending corrupted ArrayBuffer frames');
        console.error('💡 Check backend WebSocket.send() calls for compression/encoding issues');
        
        // Store corrupted buffer for analysis
        if (corruptionBuffer.current.length < 5) {
          corruptionBuffer.current.push(data);
        }
      }
      
      throw new Error(`Message parsing failed: ${errorMessage}`);
    }
  }, []);

  // OPTIMIZED: Throttled message processing
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

  // Connection function with corruption monitoring
  const connect = useCallback(() => {
    try {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      console.log('🔌 WebSocket: Connecting with enhanced corruption recovery...');
      setConnectionError(null);
      
      const wsPort = process.env.REACT_APP_WS_PORT || '3001';
      const wsHost = window.location.hostname || 'localhost';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${wsHost}:${wsPort}`;
      
      console.log('🔧 Connecting to:', wsUrl);
      
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = 'arraybuffer'; // Required for mixed content handling
      
      ws.current.onopen = () => {
        console.log('🎉 WebSocket: Connected with corruption recovery active');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        // Reset stats and corruption buffer
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
                console.log('📡 Enhanced subscription sent for:', simulationId);
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
          
          console.log('📨 Raw message received:', {
            type: typeof event.data,
            constructor: event.data?.constructor?.name,
            size: event.data?.byteLength || event.data?.length || event.data?.size || 'unknown'
          });
          
          // Use enhanced parser with recovery
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
                console.log(`🔧 System message: ${data.type}`);
                return;
              case 'error':
                console.error('❌ WebSocket error:', data.message);
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
            console.warn('❓ Unhandled message format:', data);
          }
          
        } catch (error: unknown) {
          console.error('💥 Message processing error:', getErrorMessage(error));
          messageStats.current.parseErrors++;
        }
      };

      ws.current.onerror = (error) => {
        console.error('💥 WebSocket error:', error);
        setIsConnected(false);
        setConnectionError('Connection error');
      };

      ws.current.onclose = (event) => {
        console.log('🔌 WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          corruptionStats: {
            recovered: messageStats.current.recoveredMessages,
            corrupted: messageStats.current.corruptedMessages,
            totallyCorrupted: messageStats.current.totallyCorrupted
          }
        });
        
        setIsConnected(false);
        ws.current = null;
        
        if (event.code === 1006) {
          setConnectionError('Connection lost unexpectedly');
        } else if (event.code !== 1000) {
          setConnectionError(`Connection closed: ${event.code}`);
        } else {
          setConnectionError(null);
        }

        // Reconnection logic
        if (simulationId && reconnectAttempts.current < maxReconnectAttempts && event.code !== 1000) {
          reconnectAttempts.current++;
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current - 1);
          console.log(`🔄 Reconnecting in ${delay}ms... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError(`Failed after ${maxReconnectAttempts} attempts`);
        }
      };
      
    } catch (error: unknown) {
      console.error('💥 Failed to create WebSocket:', getErrorMessage(error));
      setIsConnected(false);
      setConnectionError('Failed to create connection');
    }
  }, [simulationId, processMessageQueue, parseWebSocketMessage]);

  // Connection effect
  useEffect(() => {
    if (simulationId) {
      console.log('🔄 Starting enhanced WebSocket connection for:', simulationId);
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

  // Enhanced performance monitoring
  useEffect(() => {
    const statsInterval = setInterval(() => {
      if (messageStats.current.received > 0) {
        const stats = messageStats.current;
        const efficiency = stats.received > 0 
          ? ((stats.processed / stats.received) * 100).toFixed(1) + '%'
          : '0%';
        
        const corruptionRate = stats.received > 0
          ? ((stats.corruptedMessages / stats.received) * 100).toFixed(1) + '%'
          : '0%';
        
        const recoveryRate = stats.corruptedMessages > 0
          ? ((stats.recoveredMessages / stats.corruptedMessages) * 100).toFixed(1) + '%'
          : '0%';
        
        console.log('📊 Enhanced WebSocket Performance:', {
          connected: isConnected,
          received: stats.received,
          processed: stats.processed,
          efficiency: efficiency,
          
          // Message type breakdown
          textMessages: stats.textMessages,
          arrayBuffers: stats.arrayBufferMessages,
          blobs: stats.blobMessages,
          
          // Corruption analysis
          corruptionRate: corruptionRate,
          recoveryRate: recoveryRate,
          totallyCorrupted: stats.totallyCorrupted,
          
          // Health status
          queueSize: messageQueue.current.length,
          hasValidTemplate: !!lastValidMessage.current
        });
        
        // Alert on critical issues
        if (stats.arrayBufferMessages > stats.textMessages) {
          console.warn('🚨 MORE ARRAYBUFFERS THAN TEXT - Backend sending binary frames!');
        }
        
        if (stats.totallyCorrupted > stats.received * 0.1) {
          console.error('🚨 HIGH CORRUPTION RATE - Backend data severely corrupted!');
        }
        
        if (stats.recoveredMessages > 0) {
          console.info(`✅ Recovery system active: ${stats.recoveredMessages} messages recovered`);
        }
      }
    }, 10000);
    
    return () => clearInterval(statsInterval);
  }, [isConnected]);

  return { 
    isConnected, 
    lastMessage, 
    setPauseState,
    connectionError,
    messageStats: messageStats.current
  };
};