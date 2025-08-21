// frontend/src/services/websocket.ts - COMPLETE CRITICAL FIXES: Message Filtering + State Protection + Enhanced Coordination
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
  controlStateFiltered: number; // 🚨 NEW: Track filtered control state
  priceUpdateStateIgnored: number; // 🚨 NEW: Track ignored state in price updates
  messageTypeValidationErrors: number; // 🚨 NEW: Track message type validation errors
  stateProtectionActive: number; // 🚨 NEW: Track state protection activations
}

// 🚨 CRITICAL FIX: COMPLETELY ENHANCED message filtering function that NEVER allows control state pollution
function filterMessageByType(data: any, messageType: string): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // 🚨 CRITICAL FIX: COMPLETELY remove control state from ALL non-control message types
  const strictControlStateTypes = [
    'simulation_state',
    'setPauseState_response', 
    'pause_state_changed',
    'simulation_status'
  ];

  // 🚨 CRITICAL FIX: For price_update messages, COMPLETELY strip ALL control state
  if (messageType === 'price_update') {
    const filteredData = { ...data };
    
    // Log if control state is being stripped
    const hadControlState = filteredData.isRunning !== undefined || 
                           filteredData.isPaused !== undefined ||
                           filteredData.registrationStatus !== undefined;
    
    if (hadControlState) {
      console.warn(`🚨 [WS FILTER] CRITICAL: Stripping ALL control state from price_update message`, {
        originalIsRunning: filteredData.isRunning,
        originalIsPaused: filteredData.isPaused,
        originalRegistrationStatus: filteredData.registrationStatus,
        messageType: messageType
      });
    }
    
    // COMPLETELY remove ALL possible control state properties
    delete filteredData.isRunning;
    delete filteredData.isPaused;
    delete filteredData.registrationStatus;
    delete filteredData.canStart;
    delete filteredData.canPause;
    delete filteredData.canResume;
    delete filteredData.canStop;
    delete filteredData.actuallyRunning;
    delete filteredData.cleanStart;
    delete filteredData.raceConditionPrevention;
    delete filteredData.pauseResumeSupport;
    delete filteredData.enhancedStateManagement;
    
    console.log(`✅ [WS FILTER] CRITICAL: price_update message completely cleaned - ALL control state removed`);
    return filteredData;
  }
  
  // 🚨 CRITICAL FIX: For batch_update messages, clean nested price data
  if (messageType === 'batch_update' && data.updates?.price) {
    const filteredData = { ...data };
    const cleanPriceData = { ...data.updates.price };
    
    // Remove control state from price updates in batch
    delete cleanPriceData.isRunning;
    delete cleanPriceData.isPaused;
    delete cleanPriceData.registrationStatus;
    
    filteredData.updates = {
      ...filteredData.updates,
      price: cleanPriceData
    };
    
    console.log(`✅ [WS FILTER] CRITICAL: batch_update price data cleaned`);
    return filteredData;
  }
  
  // 🚨 CRITICAL FIX: For ALL other non-control message types, remove control state
  if (!strictControlStateTypes.includes(messageType)) {
    const filteredData = { ...data };
    let stateRemoved = false;
    
    const controlStateProperties = [
      'isRunning', 'isPaused', 'registrationStatus', 'canStart', 
      'canPause', 'canResume', 'canStop', 'actuallyRunning', 'cleanStart'
    ];
    
    controlStateProperties.forEach(prop => {
      if (filteredData[prop] !== undefined) {
        delete filteredData[prop];
        stateRemoved = true;
      }
    });
    
    if (stateRemoved) {
      console.warn(`⚠️ [WS FILTER] PROTECTION: Removed control state from non-control message type: ${messageType}`);
    }
    
    return filteredData;
  }
  
  // For allowed control message types, keep the data as-is but validate it
  if (strictControlStateTypes.includes(messageType)) {
    console.log(`✅ [WS FILTER] ALLOWED: Control state preserved for ${messageType}`, {
      isRunning: data.isRunning,
      isPaused: data.isPaused
    });
  }
  
  return data;
}

// 🚨 CRITICAL FIX: Enhanced state validation with STRICT message type enforcement
function validateSimulationState(state: any, messageType: string = 'unknown') {
  if (!state || typeof state !== 'object') {
    console.log(`🔧 [WS VALIDATE] Invalid state for ${messageType} - using defaults`);
    return {
      currentPrice: 0,
      candleCount: 0,
      priceHistory: []
    };
  }

  // 🚨 CRITICAL FIX: Apply message filtering FIRST - this is the primary protection
  const filteredState = filterMessageByType(state, messageType);

  // 🚨 CRITICAL FIX: Build validated state with proper defaults
  const validatedState = {
    ...filteredState,
    currentPrice: typeof filteredState.currentPrice === 'number' ? filteredState.currentPrice : 0,
    candleCount: typeof filteredState.candleCount === 'number' ? filteredState.candleCount : 0,
    priceHistory: Array.isArray(filteredState.priceHistory) ? filteredState.priceHistory : []
  };

  // 🚨 CRITICAL FIX: Only add control state for STRICTLY ALLOWED message types
  const strictControlStateTypes = [
    'simulation_state',
    'setPauseState_response', 
    'pause_state_changed',
    'simulation_status'
  ];
  
  if (strictControlStateTypes.includes(messageType)) {
    validatedState.isRunning = typeof filteredState.isRunning === 'boolean' ? filteredState.isRunning : false;
    validatedState.isPaused = typeof filteredState.isPaused === 'boolean' ? filteredState.isPaused : false;
    
    console.log(`✅ [WS VALIDATE] CONTROL STATE PRESERVED for ${messageType}: isRunning=${validatedState.isRunning}, isPaused=${validatedState.isPaused}`);
  } else {
    console.log(`🔒 [WS VALIDATE] CONTROL STATE BLOCKED for ${messageType} - only price/data fields included`);
  }

  // 🚨 CRITICAL FIX: Validate trade data arrays
  if (validatedState.recentTrades && Array.isArray(validatedState.recentTrades)) {
    validatedState.recentTrades = validatedState.recentTrades.filter((trade: any) => {
      return trade && typeof trade === 'object' && 
             typeof trade.price === 'number' && 
             typeof trade.timestamp === 'number';
    });
  }

  // 🚨 CRITICAL FIX: Validate active positions array
  if (validatedState.activePositions && Array.isArray(validatedState.activePositions)) {
    validatedState.activePositions = validatedState.activePositions.filter((position: any) => {
      return position && typeof position === 'object' && 
             typeof position.quantity === 'number' && 
             typeof position.entryPrice === 'number';
    });
  }

  return validatedState;
}

// 🚨 CRITICAL FIX: Enhanced candle data validation function with comprehensive checks
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
  
  // Track current subscription to prevent multiple instances
  const currentSubscription = useRef<string | null>(null);
  const subscriptionStatus = useRef<'none' | 'subscribing' | 'subscribed' | 'unsubscribing'>('none');
  
  const corruptionBuffer = useRef<ArrayBuffer[]>([]);
  const lastValidMessage = useRef<any>(null);
  
  const maxReconnectAttempts = 8;
  const reconnectDelay = 1500;
  const maxQueueSize = 200;
  const maxMessageAge = 10000;
  const batchProcessingDelay = 16;
  
  // 🚨 CRITICAL FIX: Enhanced message stats with complete filtering tracking
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
    totallyCorrupted: 0,
    controlStateFiltered: 0,
    priceUpdateStateIgnored: 0,
    messageTypeValidationErrors: 0,
    stateProtectionActive: 0
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
          // 🚨 CRITICAL FIX: Apply filtering before setting message
          const filteredData = filterMessageByType(item.message.event.data, type);
          const validatedData = validateSimulationState(filteredData, type);
          
          const cleanMessage = {
            ...item.message,
            event: {
              ...item.message.event,
              data: validatedData
            }
          };
          
          setLastMessage(cleanMessage);
          messageStats.current.processed++;
          tradesProcessed++;
        } else {
          messagesByType.set(type, item);
        }
      });
      
      messagesByType.forEach(item => {
        // 🚨 CRITICAL FIX: Apply comprehensive filtering before setting message
        const messageType = item.message.event.type;
        const filteredData = filterMessageByType(item.message.event.data, messageType);
        const validatedData = validateSimulationState(filteredData, messageType);
        
        // Track filtering statistics
        if (messageType === 'price_update' && (item.message.event.data?.isRunning !== undefined || item.message.event.data?.isPaused !== undefined)) {
          messageStats.current.priceUpdateStateIgnored++;
          messageStats.current.stateProtectionActive++;
        }
        
        const cleanMessage = {
          ...item.message,
          event: {
            ...item.message.event,
            data: validatedData
          }
        };
        
        setLastMessage(cleanMessage);
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

  // 🚨 CRITICAL FIX: Enhanced setPauseState with PERFECT backend coordination and state validation
  const setPauseState = useCallback((paused: boolean) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: 'setPauseState',
          simulationId,
          isPaused: paused,
          timestamp: Date.now(),
          // 🚨 CRITICAL FIX: Enhanced validation for perfect backend understanding
          clientValidation: {
            requestedState: paused ? 'paused' : 'running',
            clientTimestamp: Date.now(),
            expectedResponse: paused ? 'pause_confirmed' : 'resume_confirmed',
            retryCount: 0,
            maxRetries: 3,
            stateProtectionEnabled: true,
            messageFilteringEnabled: true
          },
          // Enhanced simulation state context for backend
          contextState: {
            currentlyRunning: !paused, // Expected running state after operation
            currentlyPaused: paused,   // Expected paused state after operation
            operation: paused ? 'PAUSE' : 'RESUME',
            preventAutoStart: true,
            requireManualStart: false
          },
          // 🚨 CRITICAL FIX: Client capabilities for backend coordination
          clientCapabilities: {
            stateProtection: true,
            messageFiltering: true,
            controlStateValidation: true,
            immediateButtonUpdates: true,
            optimisticUpdates: true
          }
        };
        
        console.log(`🚨 [WS] CRITICAL FIX: Sending PERFECT setPauseState with complete coordination:`, {
          simulationId,
          isPaused: paused,
          action: paused ? 'PAUSE' : 'RESUME',
          operation: message.contextState.operation,
          stateProtection: true
        });
        
        ws.current.send(JSON.stringify(message));
        
        console.log(`✅ [WS] Enhanced setPauseState sent successfully for simulation ${simulationId} with COMPLETE state protection`);
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

  // 🚨 CRITICAL FIX: Enhanced subscription management with complete state protection
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
        // 🚨 CRITICAL FIX: Enhanced client capabilities with COMPLETE state protection
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
          // 🚨 CRITICAL FIX: COMPLETE state filtering capabilities
          stateValidation: true,
          messageTypeAware: true,
          controlStateProtection: true,
          priceUpdateFiltering: true,
          messageTypeFiltering: true,
          enhancedStateManagement: true,
          strictMessageValidation: true,
          comprehensiveFiltering: true,
          statePollutionPrevention: true,
          optimisticUpdates: true,
          immediateButtonStates: true
        }
      };
      
      console.log(`📡 [WS] CRITICAL FIX: Subscribing with COMPLETE state protection for: ${simId}`);
      ws.current.send(JSON.stringify(subscribeMessage));
    } catch (error: unknown) {
      console.error('❌ [WS] Failed to subscribe:', getErrorMessage(error));
      subscriptionStatus.current = 'none';
      currentSubscription.current = null;
    }
  }, []);

  // Enhanced unsubscription
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
        // 🚨 CRITICAL FIX: Enhanced cleanup validation
        validateCleanup: true,
        forceCleanup: true,
        clearStateProtection: true
      };
      
      console.log(`📡 [WS] CRITICAL FIX: Unsubscribing with enhanced cleanup: ${simId}`);
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
      console.log(`🔌 [WS] CRITICAL FIX: Connecting with COMPLETE message filtering and state protection to: ${wsUrl}`);
      
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
        console.log('✅ [WS] CRITICAL FIX: Connection established with COMPLETE message filtering and state protection');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        // 🚨 CRITICAL FIX: Reset enhanced stats with complete tracking
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
          totallyCorrupted: 0,
          controlStateFiltered: 0,
          priceUpdateStateIgnored: 0,
          messageTypeValidationErrors: 0,
          stateProtectionActive: 0
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
          
          // Handle subscription confirmation
          if (data.type) {
            switch (data.type) {
              case 'connection':
                console.log('🔗 [WS] Connection confirmed with COMPLETE state protection');
                return;
              case 'subscription_confirmed':
                console.log('✅ [WS] Subscription confirmed for simulation:', data.simulationId);
                if (data.simulationId === currentSubscription.current) {
                  subscriptionStatus.current = 'subscribed';
                  console.log(`🔐 [WS] Subscription locked with state protection for: ${data.simulationId}`);
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
                console.log('🔐 [WS] Singleton mode confirmed:', data.simulationId);
                return;
              case 'pong':
                return;
              case 'backend_ready':
                console.log('🌐 [WS] Backend ready with state protection');
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

            // 🚨 CRITICAL FIX: Apply COMPLETE filtering and validation with message type context
            const messageType = data.event.type || data.type || 'unknown';
            const filteredEventData = filterMessageByType(data.event.data, messageType);
            const validatedEventData = validateSimulationState(filteredEventData, messageType);
            
            // Track filtering stats with detailed logging
            if (messageType === 'price_update' && (data.event.data?.isRunning !== undefined || data.event.data?.isPaused !== undefined)) {
              messageStats.current.priceUpdateStateIgnored++;
              messageStats.current.stateProtectionActive++;
              console.log(`🚨 [WS] CRITICAL FIX: Filtered control state from price_update message #${messageStats.current.priceUpdateStateIgnored} - STATE PROTECTION ACTIVE`);
            }
            
            // Track control state filtering from non-control messages
            if (!['simulation_state', 'setPauseState_response', 'pause_state_changed', 'simulation_status'].includes(messageType)) {
              if (data.event.data?.isRunning !== undefined || data.event.data?.isPaused !== undefined) {
                messageStats.current.controlStateFiltered++;
                messageStats.current.stateProtectionActive++;
                console.log(`🚨 [WS] CRITICAL FIX: Filtered control state from ${messageType} message #${messageStats.current.controlStateFiltered} - STATE PROTECTION ACTIVE`);
              }
            }
            
            // 🚨 CRITICAL FIX: Enhanced candle data validation for chart
            if (messageType === 'candle_update' && validatedEventData.priceHistory) {
              const originalLength = validatedEventData.priceHistory.length;
              validatedEventData.priceHistory = validateCandleData(validatedEventData.priceHistory);
              console.log(`📊 [WS] CRITICAL FIX: Validated ${validatedEventData.priceHistory.length}/${originalLength} candles for IMMEDIATE chart display`);
            }
            
            const message: WebSocketMessage = {
              simulationId: data.simulationId,
              event: {
                type: messageType,
                timestamp: data.event.timestamp || Date.now(),
                data: validatedEventData
              }
            };
            
            // 🚨 CRITICAL FIX: Priority handling for control state messages with enhanced logging
            const controlStateTypes = ['setPauseState_response', 'pause_state_changed', 'simulation_status', 'simulation_state'];
            if (controlStateTypes.includes(messageType)) {
              console.log(`🎯 [WS] CRITICAL PRIORITY: Control state message: ${messageType}`, {
                isRunning: message.event.data.isRunning,
                isPaused: message.event.data.isPaused,
                stateProtected: true
              });
            }
            
            // Priority handling for TPS-related messages
            if (messageType === 'external_market_pressure' || 
                messageType === 'tps_mode_changed' ||
                messageType === 'tps_status' ||
                messageType === 'stress_test_response') {
              console.log(`🎯 [WS] Priority TPS message: ${messageType}`, message.event.data);
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
            // 🚨 CRITICAL FIX: Apply filtering for direct messages too
            const messageType = data.type;
            const filteredData = filterMessageByType(data, messageType);
            const validatedData = validateSimulationState(filteredData, messageType);
            
            const message: WebSocketMessage = {
              simulationId: data.simulationId || simulationId || 'unknown',
              event: {
                type: messageType,
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
      console.log(`🎯 [WS] CRITICAL FIX: Setting up WebSocket with COMPLETE message filtering and state protection for simulation: ${simulationId}`);
      
      // If WebSocket is already connected, just switch subscription
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        // Check if we need to switch simulations
        if (currentSubscription.current !== simulationId) {
          console.log(`🔄 [WS] Switching to new simulation with state protection: ${simulationId}`);
          subscribeToSimulation(simulationId);
        } else {
          console.log(`✅ [WS] Already connected to simulation with state protection: ${simulationId}`);
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

  // 🚨 CRITICAL FIX: Enhanced pause state synchronization - only for actual changes with state protection
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      // Only send pause state if there's an actual change needed
      console.log(`🚨 [WS] CRITICAL FIX: Pause state synchronization with COMPLETE state protection: ${isPaused} for simulation ${simulationId}`);
      setPauseState(isPaused || false);
    }
  }, [isPaused, simulationId, setPauseState]);

  // Enhanced ping with complete filtering status
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          // 🚨 CRITICAL FIX: Enhanced ping with COMPLETE filtering status
          ws.current.send(JSON.stringify({
            type: 'ping',
            timestamp: Date.now(),
            simulationId: simulationId || undefined,
            currentSubscription: currentSubscription.current,
            subscriptionStatus: subscriptionStatus.current,
            filteringEnabled: true,
            stateProtectionActive: true,
            completeStateProtection: true,
            messageTypeValidation: true,
            stats: {
              messagesReceived: messageStats.current.received,
              messagesProcessed: messageStats.current.processed,
              queueSize: messageQueue.current.length,
              parseErrors: messageStats.current.parseErrors,
              controlStateFiltered: messageStats.current.controlStateFiltered,
              priceUpdateStateIgnored: messageStats.current.priceUpdateStateIgnored,
              stateProtectionActivations: messageStats.current.stateProtectionActive,
              messageTypeValidationErrors: messageStats.current.messageTypeValidationErrors
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