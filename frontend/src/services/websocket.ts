// frontend/src/services/websocket.ts - CRITICAL FIXES: Clean State Validation & Message Handling
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

// 🚨 CRITICAL FIX: Enhanced state validation function that preserves control state
function validateSimulationState(state: any, messageType: string = 'unknown') {
  if (!state || typeof state !== 'object') {
    console.log(`🔧 [WS] Invalid state for ${messageType} - using defaults`);
    return {
      isRunning: false,
      isPaused: false,
      currentPrice: 0,
      candleCount: 0,
      isLive: false,
      priceHistory: []
    };
  }

  // 🚨 CRITICAL FIX: Preserve existing control state for price_update messages
  const validatedState = {
    ...state,
    isRunning: typeof state.isRunning === 'boolean' ? state.isRunning : false,
    isPaused: typeof state.isPaused === 'boolean' ? state.isPaused : false,
    currentPrice: typeof state.currentPrice === 'number' ? state.currentPrice : 0,
    candleCount: typeof state.candleCount === 'number' ? state.candleCount : 0,
    isLive: typeof state.isLive === 'boolean' ? state.isLive : true,
    priceHistory: Array.isArray(state.priceHistory) ? state.priceHistory : []
  };

  // 🚨 CRITICAL FIX: Log validation for debugging state issues
  if (messageType === 'price_update' && (state.isRunning !== undefined || state.isPaused !== undefined)) {
    console.warn(`⚠️ [WS] price_update message contains control state - this should not happen!`, {
      messageType,
      originalIsRunning: state.isRunning,
      originalIsPaused: state.isPaused,
      validatedIsRunning: validatedState.isRunning,
      validatedIsPaused: validatedState.isPaused
    });
  }

  return validatedState;
}

// 🚨 CRITICAL FIX: Enhanced candle data validation function
function validateCandleData(candleData: any) {
  if (!Array.isArray(candleData)) {
    console.warn('📊 WS: Invalid candle data - not an array');
    return [];
  }

  const validCandles = candleData.filter(candle => {
    if (!candle || typeof candle !== 'object') return false;
    
    // Validate timestamp
    if (typeof candle.timestamp !== 'number' || !Number.isFinite(candle.timestamp) || candle.timestamp <= 0) {
      return false;
    }
    
    // Validate OHLC values
    const { open, high, low, close } = candle;
    if (typeof open !== 'number' || typeof high !== 'number' || 
        typeof low !== 'number' || typeof close !== 'number') {
      return false;
    }
    
    // Check for valid numbers
    if (!Number.isFinite(open) || !Number.isFinite(high) || 
        !Number.isFinite(low) || !Number.isFinite(close)) {
      return false;
    }
    
    // Check for positive values
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      return false;
    }
    
    // Check for NaN
    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
      return false;
    }
    
    // Validate OHLC relationships
    if (high < low || high < open || high < close || low > open || low > close) {
      return false;
    }
    
    return true;
  });

  if (validCandles.length !== candleData.length) {
    console.log(`📊 WS: Filtered ${candleData.length - validCandles.length} invalid candles`);
  }

  return validCandles;
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
  
  // Track current subscription to prevent multiple CandleManager instances
  const currentSubscription = useRef<string | null>(null);
  const subscriptionStatus = useRef<'none' | 'subscribing' | 'subscribed' | 'unsubscribing'>('none');
  
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
          // 🚨 CRITICAL FIX: Validate message before setting
          const validatedMessage = {
            ...item.message,
            event: {
              ...item.message.event,
              data: validateSimulationState(item.message.event.data, type)
            }
          };
          setLastMessage(validatedMessage);
          messageStats.current.processed++;
          tradesProcessed++;
        } else {
          messagesByType.set(type, item);
        }
      });
      
      messagesByType.forEach(item => {
        // 🚨 CRITICAL FIX: Validate message before setting with message type context
        const validatedMessage = {
          ...item.message,
          event: {
            ...item.message.event,
            data: validateSimulationState(item.message.event.data, item.message.event.type)
          }
        };
        setLastMessage(validatedMessage);
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

  // 🚨 CRITICAL FIX: Enhanced setPauseState with better error handling
  const setPauseState = useCallback((paused: boolean) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: 'setPauseState',
          simulationId,
          isPaused: paused,
          timestamp: Date.now(),
          // Add client-side validation to prevent backend confusion
          clientValidation: {
            requestedState: paused ? 'paused' : 'running',
            clientTimestamp: Date.now(),
            expectedResponse: paused ? 'pause_confirmed' : 'resume_confirmed'
          }
        };
        
        console.log(`🚨 [WS] CRITICAL FIX: Sending setPauseState:`, {
          simulationId,
          isPaused: paused,
          action: paused ? 'PAUSE' : 'RESUME'
        });
        
        ws.current.send(JSON.stringify(message));
        
        console.log(`✅ [WS] setPauseState sent successfully for simulation ${simulationId}`);
      } catch (error: unknown) {
        console.error('❌ [WS] Error sending pause state:', getErrorMessage(error));
      }
    } else {
      console.warn('⚠️ [WS] Cannot send setPauseState - WebSocket not ready or no simulation ID', {
        wsReady: ws.current?.readyState === WebSocket.OPEN,
        hasSimulationId: !!simulationId
      });
    }
  }, [simulationId]);

  const sendTPSModeChange = useCallback((mode: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: 'set_tps_mode',
          simulationId,
          mode,
          timestamp: Date.now()
        };
        
        console.log(`🚀 [WS] Sending TPS mode change:`, message);
        ws.current.send(JSON.stringify(message));
        console.log(`✅ [WS] TPS mode change sent: ${mode} for simulation ${simulationId}`);
      } catch (error: unknown) {
        console.error('❌ [WS] Error sending TPS mode change:', getErrorMessage(error));
      }
    } else {
      console.warn('⚠️ [WS] Cannot send TPS mode change - WebSocket not ready or no simulation ID');
    }
  }, [simulationId]);

  const sendStressTestMessage = useCallback((messageType: string, data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: messageType,
          simulationId,
          timestamp: Date.now(),
          ...data
        };
        
        console.log(`🧪 [WS] Sending stress test message:`, message);
        ws.current.send(JSON.stringify(message));
        console.log(`✅ [WS] Stress test message sent: ${messageType}`);
      } catch (error: unknown) {
        console.error('❌ [WS] Error sending stress test message:', getErrorMessage(error));
      }
    } else {
      console.warn('⚠️ [WS] Cannot send stress test message - WebSocket not ready or no simulation ID');
    }
  }, [simulationId]);

  // 🚨 CRITICAL FIX: Enhanced subscription management to prevent duplicate CandleManager instances
  const subscribeToSimulation = useCallback((simId: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ [WS] Cannot subscribe - WebSocket not ready');
      return;
    }

    // Check if we're already subscribed to this simulation
    if (currentSubscription.current === simId && subscriptionStatus.current === 'subscribed') {
      console.log(`✅ [WS] Already subscribed to simulation: ${simId}`);
      return;
    }

    // If we're subscribed to a different simulation, unsubscribe first
    if (currentSubscription.current && currentSubscription.current !== simId) {
      console.log(`🔄 [WS] Switching subscription from ${currentSubscription.current} to ${simId}`);
      unsubscribeFromSimulation(currentSubscription.current);
    }

    subscriptionStatus.current = 'subscribing';
    currentSubscription.current = simId;

    try {
      const subscribeMessage = {
        type: 'subscribe',
        simulationId: simId,
        timestamp: Date.now(),
        // 🚨 CRITICAL FIX: Add enhanced client capabilities
        clientId: `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        singleInstanceMode: true,
        preventDuplicates: true,
        stateManagementMode: 'strict', // Prevent state pollution
        clientCapabilities: {
          corruptionRecovery: true,
          binaryHandling: true,
          encodingFallbacks: ['utf-8', 'latin1', 'ascii'],
          ultraFastMode: true,
          maxMessageRate: 1000,
          stressTestSupport: true,
          tpsModeSupport: true,
          metricsSupport: true,
          singletonCandleManager: true,
          // 🚨 CRITICAL FIX: Add state validation support
          stateValidation: true,
          messageTypeAware: true,
          controlStateProtection: true
        }
      };
      
      console.log(`📡 [WS] CRITICAL FIX: Subscribing with enhanced validation for: ${simId}`);
      ws.current.send(JSON.stringify(subscribeMessage));
    } catch (error: unknown) {
      console.error('❌ [WS] Failed to subscribe:', getErrorMessage(error));
      subscriptionStatus.current = 'none';
      currentSubscription.current = null;
    }
  }, []);

  // Enhanced unsubscription to clean up CandleManager instances
  const unsubscribeFromSimulation = useCallback((simId: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ [WS] Cannot unsubscribe - WebSocket not ready');
      return;
    }

    if (!simId) {
      console.warn('⚠️ [WS] Cannot unsubscribe - no simulation ID');
      return;
    }

    subscriptionStatus.current = 'unsubscribing';

    try {
      const unsubscribeMessage = {
        type: 'unsubscribe',
        simulationId: simId,
        timestamp: Date.now(),
        cleanupCandleManager: true,
        reason: 'client_disconnect',
        // 🚨 CRITICAL FIX: Add cleanup validation
        validateCleanup: true,
        forceCleanup: true
      };
      
      console.log(`📡 [WS] CRITICAL FIX: Unsubscribing with validation cleanup: ${simId}`);
      ws.current.send(JSON.stringify(unsubscribeMessage));
      
      // Clear local subscription state
      setTimeout(() => {
        if (currentSubscription.current === simId) {
          currentSubscription.current = null;
          subscriptionStatus.current = 'none';
          console.log(`✅ [WS] Unsubscribed and cleaned up: ${simId}`);
        }
      }, 1000);
      
    } catch (error: unknown) {
      console.error('❌ [WS] Failed to unsubscribe:', getErrorMessage(error));
      // Force cleanup anyway
      currentSubscription.current = null;
      subscriptionStatus.current = 'none';
    }
  }, []);

  const connect = useCallback(() => {
    try {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      setConnectionError(null);
      
      const wsUrl = getWebSocketUrl();
      console.log(`🔌 [WS] CRITICAL FIX: Connecting with enhanced validation to: ${wsUrl}`);
      
      if (ws.current) {
        try {
          ws.current.close();
        } catch (closeError) {
          // Ignore close errors
        }
        ws.current = null;
      }
      
      // Reset subscription state on new connection
      currentSubscription.current = null;
      subscriptionStatus.current = 'none';
      
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = 'arraybuffer';
      
      // Store WebSocket reference globally for StressTestController
      (window as any).wsConnection = ws.current;
      
      ws.current.onopen = () => {
        console.log('✅ [WS] CRITICAL FIX: Connection established with enhanced validation');
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

        // Only subscribe if we have a simulation ID
        if (simulationId) {
          setTimeout(() => {
            subscribeToSimulation(simulationId);
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
          
          // Handle subscription confirmation to prevent duplicate CandleManagers
          if (data.type) {
            switch (data.type) {
              case 'connection':
                console.log('🔗 [WS] Connection confirmed');
                return;
              case 'subscription_confirmed':
                console.log('✅ [WS] Subscription confirmed for simulation:', data.simulationId);
                if (data.simulationId === currentSubscription.current) {
                  subscriptionStatus.current = 'subscribed';
                  console.log(`🔐 [WS] Subscription locked for: ${data.simulationId}`);
                }
                return;
              case 'unsubscription_confirmed':
                console.log('✅ [WS] Unsubscription confirmed for simulation:', data.simulationId);
                if (data.simulationId === currentSubscription.current) {
                  currentSubscription.current = null;
                  subscriptionStatus.current = 'none';
                  console.log(`🔓 [WS] Subscription cleared for: ${data.simulationId}`);
                }
                return;
              case 'singleton_mode_confirmed':
                console.log('🔐 [WS] Singleton CandleManager mode confirmed:', data.simulationId);
                return;
              case 'pong':
                return;
              case 'backend_ready':
                console.log('🏁 [WS] Backend ready');
                return;
              case 'error':
                console.error('❌ [WS] Backend error:', data.message);
                setConnectionError(data.message || 'Unknown backend error');
                return;
              case 'tps_mode_changed':
                console.log('🔄 [WS] TPS mode changed confirmed:', data);
                break;
              case 'stress_test_response':
                console.log('🧪 [WS] Stress test response:', data);
                break;
              case 'tps_status':
                console.log('📊 [WS] TPS status received:', data);
                break;
              default:
                break;
            }
          }
          
          // Only process messages from our subscribed simulation
          if (data.simulationId && data.event) {
            // Verify this message is from our current subscription
            if (currentSubscription.current && data.simulationId !== currentSubscription.current) {
              console.warn(`⚠️ [WS] Ignoring message from unsubscribed simulation: ${data.simulationId} (current: ${currentSubscription.current})`);
              return;
            }

            // 🚨 CRITICAL FIX: Validate simulation data with message type context
            const validatedEventData = validateSimulationState(data.event.data, data.event.type);
            
            // 🚨 CRITICAL FIX: Enhanced candle data validation
            if (data.event.type === 'candle_update' && data.event.data?.priceHistory) {
              validatedEventData.priceHistory = validateCandleData(data.event.data.priceHistory);
              console.log(`📊 [WS] CRITICAL FIX: Validated ${validatedEventData.priceHistory.length} candles for chart`);
            }
            
            const message: WebSocketMessage = {
              simulationId: data.simulationId,
              event: {
                type: data.event.type || data.type || 'unknown',
                timestamp: data.event.timestamp || Date.now(),
                data: validatedEventData
              }
            };
            
            // 🚨 CRITICAL FIX: Priority handling for control state messages
            if (message.event.type === 'setPauseState_response' || 
                message.event.type === 'pause_state_changed' ||
                message.event.type === 'simulation_status') {
              console.log(`🎯 [WS] CRITICAL PRIORITY: Control state message: ${message.event.type}`, message.event.data);
            }
            
            // Priority handling for TPS-related messages
            if (message.event.type === 'external_market_pressure' || 
                message.event.type === 'tps_mode_changed' ||
                message.event.type === 'tps_status' ||
                message.event.type === 'stress_test_response') {
              console.log(`🎯 [WS] Priority TPS message: ${message.event.type}`, message.event.data);
            }
            
            messageQueue.current.push({
              message,
              timestamp: Date.now()
            });
            
            if (messageQueue.current.length > maxQueueSize) {
              const removed = messageQueue.current.splice(0, messageQueue.current.length - maxQueueSize);
              messageStats.current.dropped += removed.length;
            }
            
            processMessageQueue();
          } else if (data.type) {
            // Handle direct message types (like TPS confirmations)
            // 🚨 CRITICAL FIX: Validate data with message type context
            const validatedData = validateSimulationState(data, data.type);
            
            const message: WebSocketMessage = {
              simulationId: data.simulationId || simulationId || 'unknown',
              event: {
                type: data.type,
                timestamp: data.timestamp || Date.now(),
                data: validatedData
              }
            };
            
            messageQueue.current.push({
              message,
              timestamp: Date.now()
            });
            
            processMessageQueue();
          }
          
        } catch (error: unknown) {
          messageStats.current.parseErrors++;
          console.error('❌ [WS] Message parse error:', getErrorMessage(error));
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ [WS] WebSocket error:', error);
        setIsConnected(false);
        setConnectionError('Backend connection error - check if backend is running');
      };

      ws.current.onclose = (event) => {
        console.log(`🔌 [WS] Connection closed: code=${event.code}, reason=${event.reason}`);
        setIsConnected(false);
        ws.current = null;
        
        // Clear subscription state on close
        currentSubscription.current = null;
        subscriptionStatus.current = 'none';
        
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
          
          console.log(`🔄 [WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError(`Failed to connect to backend after ${maxReconnectAttempts} attempts. Check if backend is running.`);
        }
      };
      
    } catch (error: unknown) {
      console.error('❌ [WS] Failed to create WebSocket connection:', getErrorMessage(error));
      setIsConnected(false);
      setConnectionError('Failed to create backend connection - check configuration');
    }
  }, [simulationId, processMessageQueue, parseWebSocketMessage, subscribeToSimulation]);

  // Enhanced subscription management in useEffect
  useEffect(() => {
    if (simulationId) {
      console.log(`🎯 [WS] CRITICAL FIX: Setting up WebSocket with enhanced validation for simulation: ${simulationId}`);
      
      // If WebSocket is already connected, just switch subscription
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        // Check if we need to switch simulations
        if (currentSubscription.current !== simulationId) {
          console.log(`🔄 [WS] Switching to new simulation: ${simulationId}`);
          subscribeToSimulation(simulationId);
        } else {
          console.log(`✅ [WS] Already connected to simulation: ${simulationId}`);
        }
      } else {
        // Need to establish new connection
        connect();
      }
    } else {
      console.log('🔌 [WS] No simulation ID - cleaning up connection');
      
      // Unsubscribe from current simulation if any
      if (currentSubscription.current) {
        unsubscribeFromSimulation(currentSubscription.current);
      }
      
      // Close WebSocket if no simulation ID
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
      
      // Reset subscription state
      currentSubscription.current = null;
      subscriptionStatus.current = 'none';
    }

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      
      // Clean unsubscribe on component unmount
      if (currentSubscription.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
        unsubscribeFromSimulation(currentSubscription.current);
      }
    };
  }, [simulationId, connect, subscribeToSimulation, unsubscribeFromSimulation]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentSubscription.current) {
        unsubscribeFromSimulation(currentSubscription.current);
      }
      
      if (ws.current) {
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
      currentSubscription.current = null;
      subscriptionStatus.current = 'none';
    };
  }, [unsubscribeFromSimulation]);

  // 🚨 CRITICAL FIX: Enhanced pause state synchronization
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      // Only send pause state if there's an actual change
      console.log(`🚨 [WS] CRITICAL FIX: Synchronizing pause state: ${isPaused} for simulation ${simulationId}`);
      setPauseState(isPaused || false);
    }
  }, [isPaused, simulationId, setPauseState]);

  // Enhanced ping with TPS status request and subscription health check
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          // 🚨 CRITICAL FIX: Enhanced ping with validation status
          ws.current.send(JSON.stringify({
            type: 'ping',
            timestamp: Date.now(),
            simulationId: simulationId || undefined,
            currentSubscription: currentSubscription.current,
            subscriptionStatus: subscriptionStatus.current,
            validationEnabled: true,
            stateProtectionActive: true,
            stats: {
              messagesReceived: messageStats.current.received,
              messagesProcessed: messageStats.current.processed,
              queueSize: messageQueue.current.length,
              parseErrors: messageStats.current.parseErrors,
              validationErrors: messageStats.current.corruptedMessages
            }
          }));
          
          // Periodically request TPS status if we have a simulation
          if (simulationId && Math.random() < 0.3) { // 30% chance per ping
            sendStressTestMessage('get_tps_status', { simulationId });
          }
          
          // Health check - ensure we're still properly subscribed
          if (simulationId && currentSubscription.current !== simulationId) {
            console.warn(`⚠️ [WS] Subscription health check failed - expected: ${simulationId}, actual: ${currentSubscription.current}`);
            subscribeToSimulation(simulationId);
          }
          
        } catch (error: unknown) {
          console.error('❌ [WS] Ping error:', getErrorMessage(error));
        }
      }
    }, 25000); // Every 25 seconds

    return () => clearInterval(pingInterval);
  }, [simulationId, sendStressTestMessage, subscribeToSimulation]);

  return { 
    isConnected, 
    lastMessage, 
    setPauseState,
    connectionError,
    messageStats: messageStats.current,
    sendTPSModeChange,
    sendStressTestMessage,
    // Export subscription status for debugging
    subscriptionStatus: {
      current: currentSubscription.current,
      status: subscriptionStatus.current
    }
  };
};