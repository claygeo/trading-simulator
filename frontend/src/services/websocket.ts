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

const getWebSocketUrl = (): string => {
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1';

  if (isDevelopment) {
    const wsPort = process.env.REACT_APP_WS_PORT || '3001';
    const wsHost = process.env.REACT_APP_WS_HOST || 'localhost';
    return `ws://${wsHost}:${wsPort}`;
  } else {
    let backendWsUrl = process.env.REACT_APP_BACKEND_WS_URL;
    
    if (!backendWsUrl && process.env.REACT_APP_BACKEND_URL) {
      backendWsUrl = process.env.REACT_APP_BACKEND_URL
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:');
    }
    
    if (!backendWsUrl) {
      backendWsUrl = 'wss://trading-simulator-iw7q.onrender.com';
    }
    
    return backendWsUrl;
  }
};

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
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const messageQueue = useRef<QueuedMessage[]>([]);
  const isProcessing = useRef(false);
  const lastProcessedTime = useRef(0);
  const lastMessageId = useRef<string>('');
  
  const corruptionBuffer = useRef<ArrayBuffer[]>([]);
  const lastValidMessage = useRef<any>(null);
  
  const maxReconnectAttempts = 8;
  const reconnectDelay = 1500;
  const maxQueueSize = 200;
  const maxMessageAge = 10000;
  const batchProcessingDelay = 16;
  
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

  const parseWebSocketMessage = useCallback(async (data: any): Promise<any> => {
    let messageText: string = '';
    
    try {
      if (typeof data === 'string') {
        messageStats.current.textMessages++;
        messageText = data;
        
      } else if (data instanceof ArrayBuffer) {
        messageStats.current.arrayBufferMessages++;
        
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          messageText = decoder.decode(data);
          messageStats.current.successfulConversions++;
          
        } catch (utf8Error: unknown) {
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
        
        try {
          messageText = await data.text();
          messageStats.current.successfulConversions++;
        } catch (blobError: unknown) {
          throw new Error(`Blob conversion failed: ${getErrorMessage(blobError)}`);
        }
        
      } else {
        throw new Error(`Unsupported message type: ${typeof data}`);
      }
      
      if (!messageText || typeof messageText !== 'string' || messageText.length === 0) {
        throw new Error('Invalid message text after conversion');
      }
      
      let parsed: any;
      try {
        parsed = JSON.parse(messageText);
        
        if (parsed && typeof parsed === 'object') {
          lastValidMessage.current = parsed;
        }
        
      } catch (jsonError: unknown) {
        const errorMessage = getErrorMessage(jsonError);
        messageStats.current.totallyCorrupted++;
        throw new Error(`JSON parsing failed: ${errorMessage}`);
      }
      
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid parsed object: ${typeof parsed}`);
      }
      
      return parsed;
      
    } catch (error: unknown) {
      messageStats.current.parseErrors++;
      throw new Error(`Message parsing failed: ${getErrorMessage(error)}`);
    }
  }, []);

  const processMessageQueue = useCallback(() => {
    if (isProcessing.current || messageQueue.current.length === 0) {
      return;
    }
    
    isProcessing.current = true;
    const now = Date.now();
    
    const cutoffTime = now - maxMessageAge;
    messageQueue.current = messageQueue.current.filter(m => m.timestamp > cutoffTime);
    
    const batchSize = 15;
    const messagesToProcess = messageQueue.current.splice(0, batchSize);
    
    if (messagesToProcess.length > 0) {
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
      
      messagesByType.forEach(item => {
        setLastMessage(item.message);
        messageStats.current.processed++;
      });
      
      const dropped = messagesToProcess.length - messagesByType.size - tradesProcessed;
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
      } catch (error: unknown) {
        console.error('Error sending pause state:', getErrorMessage(error));
      }
    }
  }, [simulationId]);

  // NEW: Function to send TPS mode changes
  const sendTPSModeChange = useCallback((mode: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: 'set_tps_mode',
          simulationId,
          mode,
          timestamp: Date.now()
        };
        ws.current.send(JSON.stringify(message));
        console.log(`TPS mode change sent: ${mode} for simulation ${simulationId}`);
      } catch (error: unknown) {
        console.error('Error sending TPS mode change:', getErrorMessage(error));
      }
    }
  }, [simulationId]);

  // NEW: Function to send custom stress test messages
  const sendStressTestMessage = useCallback((messageType: string, data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: messageType,
          simulationId,
          timestamp: Date.now(),
          ...data
        };
        ws.current.send(JSON.stringify(message));
        console.log(`Stress test message sent: ${messageType}`);
      } catch (error: unknown) {
        console.error('Error sending stress test message:', getErrorMessage(error));
      }
    }
  }, [simulationId]);

  const connect = useCallback(() => {
    try {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      setConnectionError(null);
      
      const wsUrl = getWebSocketUrl();
      
      if (ws.current) {
        try {
          ws.current.close();
        } catch (closeError) {
          // Ignore close errors
        }
        ws.current = null;
      }
      
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = 'arraybuffer';
      
      // CRITICAL: Store WebSocket reference globally for StressTestController
      (window as any).wsConnection = ws.current;
      
      ws.current.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
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
                    encodingFallbacks: ['utf-8', 'latin1', 'ascii'],
                    ultraFastMode: true,
                    maxMessageRate: 1000,
                    stressTestSupport: true, // NEW: Indicate stress test support
                    tpsModeSupport: true     // NEW: Indicate TPS mode support
                  }
                };
                
                ws.current.send(JSON.stringify(subscribeMessage));
              } catch (error: unknown) {
                console.error('Failed to subscribe:', getErrorMessage(error));
              }
            }
          }, 200);
        }
      };

      ws.current.onmessage = async (event) => {
        try {
          messageStats.current.received++;
          
          const data = await parseWebSocketMessage(event.data);
          
          const messageId = `${data.simulationId || 'unknown'}-${data.event?.type || data.type}-${data.event?.timestamp || Date.now()}`;
          
          if (lastMessageId.current === messageId) {
            return;
          }
          lastMessageId.current = messageId;
          
          if (data.type) {
            switch (data.type) {
              case 'connection':
              case 'subscription_confirmed':
              case 'pong':
              case 'backend_ready':
                return;
              case 'error':
                console.error('Backend WebSocket error:', data.message);
                setConnectionError(data.message || 'Unknown backend error');
                return;
              // NEW: Handle TPS mode confirmation
              case 'tps_mode_changed':
                console.log('TPS mode changed:', data.mode);
                return;
              // NEW: Handle stress test responses
              case 'stress_test_response':
                console.log('Stress test response:', data);
                return;
            }
          }
          
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
          }
          
        } catch (error: unknown) {
          messageStats.current.parseErrors++;
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        setConnectionError('Backend connection error - check if backend is running');
      };

      ws.current.onclose = (event) => {
        setIsConnected(false);
        ws.current = null;
        
        // Clear global reference
        (window as any).wsConnection = null;
        
        if (event.code === 1006) {
          setConnectionError('Backend connection lost unexpectedly');
        } else if (event.code === 1001) {
          setConnectionError('Backend is going away - server restart?');
        } else if (event.code !== 1000) {
          setConnectionError(`Backend connection closed: ${event.code} - ${event.reason || 'Unknown reason'}`);
        } else {
          setConnectionError(null);
        }

        if (simulationId && reconnectAttempts.current < maxReconnectAttempts && event.code !== 1000) {
          reconnectAttempts.current++;
          const delay = Math.min(10000, reconnectDelay * Math.pow(1.5, reconnectAttempts.current - 1));
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError(`Failed to connect to backend after ${maxReconnectAttempts} attempts. Check if backend is running.`);
        }
      };
      
    } catch (error: unknown) {
      console.error('Failed to create WebSocket connection:', getErrorMessage(error));
      setIsConnected(false);
      setConnectionError('Failed to create backend connection - check configuration');
    }
  }, [simulationId, processMessageQueue, parseWebSocketMessage]);

  useEffect(() => {
    if (simulationId) {
      connect();
    } else {
      if (ws.current) {
        try {
          ws.current.close(1000, 'No simulation ID');
        } catch (error) {
          // Ignore close errors
        }
        ws.current = null;
        setIsConnected(false);
        
        // Clear global reference
        (window as any).wsConnection = null;
      }
    }

    return () => {
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
            console.error('Error unsubscribing:', getErrorMessage(error));
          }
        }
        
        try {
          ws.current.close(1000, 'Component unmounted');
        } catch (error) {
          // Ignore close errors
        }
        ws.current = null;
        
        // Clear global reference
        (window as any).wsConnection = null;
      }
      
      messageQueue.current = [];
      setIsConnected(false);
    };
  }, [simulationId, connect]);

  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      setPauseState(isPaused || false);
    }
  }, [isPaused, simulationId, setPauseState]);

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
          console.error('Ping error:', getErrorMessage(error));
        }
      }
    }, 25000);

    return () => clearInterval(pingInterval);
  }, [simulationId]);

  return { 
    isConnected, 
    lastMessage, 
    setPauseState,
    connectionError,
    messageStats: messageStats.current,
    // NEW: Export stress test functions
    sendTPSModeChange,
    sendStressTestMessage
  };
};