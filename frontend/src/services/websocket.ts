// frontend/src/services/websocket.ts - COMPLETE COMMUNICATION LAYER FIX
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
  duplicatesFiltered: number;
  stateUpdates: number;
  pauseResumeMessages: number;
}

// 🔧 COMMUNICATION FIX: Enhanced connection state management
interface ConnectionState {
  isConnected: boolean;
  connectionAttempts: number;
  lastConnectionTime: number;
  lastDisconnectionTime: number;
  connectionStability: 'unstable' | 'stable' | 'excellent';
  messageLatency: number;
  subscriptionStatus: 'none' | 'subscribing' | 'subscribed' | 'unsubscribing';
  currentSimulation: string | null;
}

// 🔧 COMMUNICATION FIX: State synchronization manager
class WebSocketStateManager {
  private static instance: WebSocketStateManager;
  private stateCache: Map<string, any> = new Map();
  private stateCallbacks: Map<string, Set<Function>> = new Map();
  private pendingStateUpdates: Map<string, any> = new Map();
  private stateValidationEnabled: boolean = true;
  
  private constructor() {
    console.log('🔧 COMMUNICATION FIX: WebSocketStateManager initialized');
  }
  
  static getInstance(): WebSocketStateManager {
    if (!WebSocketStateManager.instance) {
      WebSocketStateManager.instance = new WebSocketStateManager();
    }
    return WebSocketStateManager.instance;
  }
  
  // Register callback for state updates
  registerStateCallback(simulationId: string, callback: Function): void {
    if (!this.stateCallbacks.has(simulationId)) {
      this.stateCallbacks.set(simulationId, new Set());
    }
    this.stateCallbacks.get(simulationId)!.add(callback);
    console.log(`📝 WS STATE: Registered callback for ${simulationId}`);
  }
  
  // Unregister callback
  unregisterStateCallback(simulationId: string, callback: Function): void {
    if (this.stateCallbacks.has(simulationId)) {
      this.stateCallbacks.get(simulationId)!.delete(callback);
    }
    console.log(`🗑️ WS STATE: Unregistered callback for ${simulationId}`);
  }
  
  // Update state with validation
  updateState(simulationId: string, newState: any): boolean {
    if (!this.stateValidationEnabled) {
      this.stateCache.set(simulationId, newState);
      this.notifyCallbacks(simulationId, newState);
      return true;
    }
    
    const currentState = this.stateCache.get(simulationId);
    
    // Validate state transition
    if (currentState && newState) {
      // Check for contradictory states
      if (newState.isRunning === true && newState.isPaused === true) {
        console.error(`🚨 WS STATE: Contradictory state detected for ${simulationId}! Correcting...`);
        newState.isRunning = false; // If paused, it's not running
      }
      
      // Validate logical transitions
      const validTransition = this.validateStateTransition(currentState, newState);
      if (!validTransition.isValid) {
        console.warn(`⚠️ WS STATE: Invalid state transition for ${simulationId}:`, validTransition.reason);
        // Allow the update but log the warning
      }
    }
    
    // Update cache
    this.stateCache.set(simulationId, {
      ...currentState,
      ...newState,
      lastUpdated: Date.now()
    });
    
    // Notify callbacks
    this.notifyCallbacks(simulationId, newState);
    
    console.log(`✅ WS STATE: Updated state for ${simulationId}:`, {
      isRunning: newState.isRunning,
      isPaused: newState.isPaused,
      currentPrice: newState.currentPrice,
      candleCount: newState.priceHistory?.length || newState.candleCount
    });
    
    return true;
  }
  
  // Validate state transition logic
  private validateStateTransition(currentState: any, newState: any): { isValid: boolean; reason?: string } {
    // Allow transitions from any state to reset state
    if (newState.isRunning === false && newState.isPaused === false && 
        newState.candleCount === 0) {
      return { isValid: true }; // Reset state is always valid
    }
    
    // Validate pause transitions
    if (currentState.isRunning === true && currentState.isPaused === false) {
      if (newState.isRunning === false && newState.isPaused === true) {
        return { isValid: true }; // Valid pause transition
      }
    }
    
    // Validate resume transitions
    if (currentState.isRunning === false && currentState.isPaused === true) {
      if (newState.isRunning === true && newState.isPaused === false) {
        return { isValid: true }; // Valid resume transition
      }
    }
    
    // Validate start from stopped state
    if (currentState.isRunning === false && currentState.isPaused === false) {
      if (newState.isRunning === true && newState.isPaused === false) {
        return { isValid: true }; // Valid start transition
      }
    }
    
    return { isValid: true }; // Allow most transitions for now
  }
  
  // Notify registered callbacks
  private notifyCallbacks(simulationId: string, newState: any): void {
    const callbacks = this.stateCallbacks.get(simulationId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(newState);
        } catch (error) {
          console.error(`❌ WS STATE: Callback error for ${simulationId}:`, error);
        }
      });
    }
  }
  
  // Get current state
  getState(simulationId: string): any {
    return this.stateCache.get(simulationId) || null;
  }
  
  // Clear state
  clearState(simulationId: string): void {
    this.stateCache.delete(simulationId);
    this.stateCallbacks.delete(simulationId);
    this.pendingStateUpdates.delete(simulationId);
    console.log(`🧹 WS STATE: Cleared state for ${simulationId}`);
  }
  
  // Get state report
  getStateReport(): any {
    return {
      totalStates: this.stateCache.size,
      totalCallbacks: Array.from(this.stateCallbacks.values()).reduce((sum, set) => sum + set.size, 0),
      pendingUpdates: this.pendingStateUpdates.size,
      validationEnabled: this.stateValidationEnabled,
      states: Array.from(this.stateCache.entries()).map(([id, state]) => ({
        simulationId: id,
        isRunning: state.isRunning,
        isPaused: state.isPaused,
        candleCount: state.candleCount,
        lastUpdated: state.lastUpdated
      }))
    };
  }
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
  
  // 🔧 COMMUNICATION FIX: Enhanced state management
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    connectionAttempts: 0,
    lastConnectionTime: 0,
    lastDisconnectionTime: 0,
    connectionStability: 'unstable',
    messageLatency: 0,
    subscriptionStatus: 'none',
    currentSimulation: null
  });
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const messageQueue = useRef<QueuedMessage[]>([]);
  const isProcessing = useRef(false);
  const lastProcessedTime = useRef(0);
  const lastMessageId = useRef<string>('');
  
  // 🔧 COMMUNICATION FIX: Enhanced subscription tracking
  const currentSubscription = useRef<string | null>(null);
  const subscriptionStatus = useRef<'none' | 'subscribing' | 'subscribed' | 'unsubscribing'>('none');
  const subscriptionCallbacks = useRef<Set<Function>>(new Set());
  
  const corruptionBuffer = useRef<ArrayBuffer[]>([]);
  const lastValidMessage = useRef<any>(null);
  
  // 🔧 COMMUNICATION FIX: State synchronization
  const stateManager = useRef(WebSocketStateManager.getInstance());
  const stateUpdateCallbacks = useRef<Set<Function>>(new Set());
  
  const maxReconnectAttempts = 10; // Increased attempts
  const reconnectDelay = 1500;
  const maxQueueSize = 300; // Increased queue size
  const maxMessageAge = 15000; // Increased message age
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
    totallyCorrupted: 0,
    duplicatesFiltered: 0,
    stateUpdates: 0,
    pauseResumeMessages: 0
  });

  // 🔧 COMMUNICATION FIX: Enhanced message parsing with better error recovery
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

  // 🔧 COMMUNICATION FIX: Enhanced message processing with state validation
  const processMessageQueue = useCallback(() => {
    if (isProcessing.current || messageQueue.current.length === 0) {
      return;
    }
    
    isProcessing.current = true;
    const now = Date.now();
    
    const cutoffTime = now - maxMessageAge;
    messageQueue.current = messageQueue.current.filter(m => m.timestamp > cutoffTime);
    
    const batchSize = 20; // Increased batch size
    const messagesToProcess = messageQueue.current.splice(0, batchSize);
    
    if (messagesToProcess.length > 0) {
      const messagesByType = new Map<string, QueuedMessage>();
      let tradesProcessed = 0;
      let stateUpdatesProcessed = 0;
      
      messagesToProcess.forEach(item => {
        const type = item.message.event.type;
        
        if (type === 'trade' || type === 'processed_trade') {
          setLastMessage(item.message);
          messageStats.current.processed++;
          tradesProcessed++;
        } else if (type === 'simulation_state' || type === 'price_update' || 
                   type === 'candle_update' || type === 'simulation_paused' || 
                   type === 'simulation_resumed' || type === 'simulation_reset') {
          // 🔧 COMMUNICATION FIX: Handle state update messages
          messagesByType.set(type, item);
          messageStats.current.stateUpdates++;
          stateUpdatesProcessed++;
        } else if (type === 'simulation_paused' || type === 'simulation_resumed') {
          messagesByType.set(type, item);
          messageStats.current.pauseResumeMessages++;
        } else {
          messagesByType.set(type, item);
        }
      });
      
      // 🔧 COMMUNICATION FIX: Process state updates with validation
      messagesByType.forEach(item => {
        const message = item.message;
        
        // Update state manager if this is a state-related message
        if (message.simulationId && message.event.data) {
          const eventType = message.event.type;
          
          if (eventType === 'simulation_paused') {
            stateManager.current.updateState(message.simulationId, {
              isRunning: false,
              isPaused: true,
              lastPauseTime: message.event.timestamp
            });
          } else if (eventType === 'simulation_resumed') {
            stateManager.current.updateState(message.simulationId, {
              isRunning: true,
              isPaused: false,
              lastResumeTime: message.event.timestamp
            });
          } else if (eventType === 'simulation_reset') {
            stateManager.current.updateState(message.simulationId, {
              isRunning: false,
              isPaused: false,
              priceHistory: [],
              candleCount: 0,
              resetTime: message.event.timestamp
            });
          } else if (eventType === 'price_update' || eventType === 'candle_update') {
            stateManager.current.updateState(message.simulationId, {
              currentPrice: message.event.data.price || message.event.data.currentPrice,
              priceHistory: message.event.data.priceHistory,
              candleCount: message.event.data.candleCount,
              isLive: message.event.data.isLive
            });
          }
        }
        
        setLastMessage(message);
        messageStats.current.processed++;
      });
      
      const dropped = messagesToProcess.length - messagesByType.size - tradesProcessed;
      if (dropped > 0) {
        messageStats.current.dropped += dropped;
      }
      
      console.log(`📊 WS PROCESSING: Processed ${messagesToProcess.length} messages (${tradesProcessed} trades, ${stateUpdatesProcessed} state updates)`);
    }
    
    lastProcessedTime.current = now;
    isProcessing.current = false;
    
    if (messageQueue.current.length > 0) {
      setTimeout(processMessageQueue, batchProcessingDelay);
    }
  }, []);

  // 🔧 COMMUNICATION FIX: Enhanced pause state handling with validation
  const setPauseState = useCallback((paused: boolean) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        console.log(`⏸️ WS COMMUNICATION: Setting pause state to ${paused} for ${simulationId}`);
        
        // Validate current state before sending pause command
        const currentState = stateManager.current.getState(simulationId);
        if (currentState) {
          if (paused && (!currentState.isRunning || currentState.isPaused)) {
            console.warn(`⚠️ WS COMMUNICATION: Cannot pause - invalid state (running: ${currentState.isRunning}, paused: ${currentState.isPaused})`);
            return;
          }
          
          if (!paused && !currentState.isPaused) {
            console.warn(`⚠️ WS COMMUNICATION: Cannot resume - not paused (paused: ${currentState.isPaused})`);
            return;
          }
        }
        
        const message = {
          type: 'setPauseState',
          simulationId,
          isPaused: paused,
          data: {
            paused: paused,
            requestedBy: 'user_interface',
            timestamp: Date.now()
          },
          timestamp: Date.now()
        };
        
        ws.current.send(JSON.stringify(message));
        console.log(`✅ WS COMMUNICATION: Pause state message sent for ${simulationId}`);
        
      } catch (error: unknown) {
        console.error('❌ WS COMMUNICATION: Error sending pause state:', getErrorMessage(error));
      }
    } else {
      console.warn('⚠️ WS COMMUNICATION: Cannot send pause state - WebSocket not ready or no simulation ID');
    }
  }, [simulationId]);

  // 🔧 COMMUNICATION FIX: Enhanced TPS mode change with validation
  const sendTPSModeChange = useCallback((mode: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: 'set_tps_mode',
          simulationId,
          mode,
          data: {
            mode: mode,
            requestedBy: 'user_interface',
            timestamp: Date.now()
          },
          timestamp: Date.now()
        };
        
        console.log(`🚀 WS COMMUNICATION: Sending TPS mode change:`, message);
        ws.current.send(JSON.stringify(message));
        console.log(`✅ WS COMMUNICATION: TPS mode change sent: ${mode} for simulation ${simulationId}`);
      } catch (error: unknown) {
        console.error('❌ WS COMMUNICATION: Error sending TPS mode change:', getErrorMessage(error));
      }
    } else {
      console.warn('⚠️ WS COMMUNICATION: Cannot send TPS mode change - WebSocket not ready or no simulation ID');
    }
  }, [simulationId]);

  // 🔧 COMMUNICATION FIX: Enhanced stress test messaging
  const sendStressTestMessage = useCallback((messageType: string, data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      try {
        const message = {
          type: messageType,
          simulationId,
          timestamp: Date.now(),
          data: {
            ...data,
            requestedBy: 'user_interface',
            timestamp: Date.now()
          }
        };
        
        console.log(`🧪 WS COMMUNICATION: Sending stress test message:`, message);
        ws.current.send(JSON.stringify(message));
        console.log(`✅ WS COMMUNICATION: Stress test message sent: ${messageType}`);
      } catch (error: unknown) {
        console.error('❌ WS COMMUNICATION: Error sending stress test message:', getErrorMessage(error));
      }
    } else {
      console.warn('⚠️ WS COMMUNICATION: Cannot send stress test message - WebSocket not ready or no simulation ID');
    }
  }, [simulationId]);

  // 🔧 COMMUNICATION FIX: Enhanced subscription management with state validation
  const subscribeToSimulation = useCallback((simId: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WS COMMUNICATION: Cannot subscribe - WebSocket not ready');
      return;
    }

    // Check if we're already subscribed to this simulation
    if (currentSubscription.current === simId && subscriptionStatus.current === 'subscribed') {
      console.log(`✅ WS COMMUNICATION: Already subscribed to simulation: ${simId}`);
      return;
    }

    // If we're subscribed to a different simulation, unsubscribe first
    if (currentSubscription.current && currentSubscription.current !== simId) {
      console.log(`🔄 WS COMMUNICATION: Switching subscription from ${currentSubscription.current} to ${simId}`);
      unsubscribeFromSimulation(currentSubscription.current);
    }

    subscriptionStatus.current = 'subscribing';
    currentSubscription.current = simId;
    
    // Update connection state
    setConnectionState(prev => ({
      ...prev,
      subscriptionStatus: 'subscribing',
      currentSimulation: simId
    }));

    try {
      const subscribeMessage = {
        type: 'subscribe',
        simulationId: simId,
        timestamp: Date.now(),
        clientId: `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        singleInstanceMode: true,
        preventDuplicates: true,
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
          communicationLayerFix: true,
          stateValidation: true,
          enhancedErrorRecovery: true
        }
      };
      
      console.log(`📡 WS COMMUNICATION: Subscribing to simulation with enhanced coordination: ${simId}`);
      ws.current.send(JSON.stringify(subscribeMessage));
    } catch (error: unknown) {
      console.error('❌ WS COMMUNICATION: Failed to subscribe:', getErrorMessage(error));
      subscriptionStatus.current = 'none';
      currentSubscription.current = null;
      
      setConnectionState(prev => ({
        ...prev,
        subscriptionStatus: 'none',
        currentSimulation: null
      }));
    }
  }, []);

  // 🔧 COMMUNICATION FIX: Enhanced unsubscription with state cleanup
  const unsubscribeFromSimulation = useCallback((simId: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WS COMMUNICATION: Cannot unsubscribe - WebSocket not ready');
      return;
    }

    if (!simId) {
      console.warn('⚠️ WS COMMUNICATION: Cannot unsubscribe - no simulation ID');
      return;
    }

    subscriptionStatus.current = 'unsubscribing';
    
    // Update connection state
    setConnectionState(prev => ({
      ...prev,
      subscriptionStatus: 'unsubscribing'
    }));

    try {
      const unsubscribeMessage = {
        type: 'unsubscribe',
        simulationId: simId,
        timestamp: Date.now(),
        cleanupCandleManager: true,
        cleanupState: true,
        reason: 'client_disconnect'
      };
      
      console.log(`📡 WS COMMUNICATION: Unsubscribing from simulation with cleanup: ${simId}`);
      ws.current.send(JSON.stringify(unsubscribeMessage));
      
      // Clean up local state
      stateManager.current.clearState(simId);
      
      // Clear subscription state after delay
      setTimeout(() => {
        if (currentSubscription.current === simId) {
          currentSubscription.current = null;
          subscriptionStatus.current = 'none';
          
          setConnectionState(prev => ({
            ...prev,
            subscriptionStatus: 'none',
            currentSimulation: null
          }));
          
          console.log(`✅ WS COMMUNICATION: Unsubscribed and cleaned up: ${simId}`);
        }
      }, 1000);
      
    } catch (error: unknown) {
      console.error('❌ WS COMMUNICATION: Failed to unsubscribe:', getErrorMessage(error));
      // Force cleanup anyway
      currentSubscription.current = null;
      subscriptionStatus.current = 'none';
      stateManager.current.clearState(simId);
      
      setConnectionState(prev => ({
        ...prev,
        subscriptionStatus: 'none',
        currentSimulation: null
      }));
    }
  }, []);

  // 🔧 COMMUNICATION FIX: Enhanced connection with state coordination
  const connect = useCallback(() => {
    try {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      setConnectionError(null);
      
      const wsUrl = getWebSocketUrl();
      console.log(`🔌 WS COMMUNICATION: Connecting to: ${wsUrl}`);
      
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
      
      // Update connection state
      setConnectionState(prev => ({
        ...prev,
        connectionAttempts: prev.connectionAttempts + 1,
        subscriptionStatus: 'none',
        currentSimulation: null
      }));
      
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = 'arraybuffer';
      
      // Store WebSocket reference globally
      (window as any).wsConnection = ws.current;
      (window as any).wsStateManager = stateManager.current;
      
      ws.current.onopen = () => {
        console.log('✅ WS COMMUNICATION: Connection established with enhanced coordination');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        const now = Date.now();
        setConnectionState(prev => ({
          ...prev,
          isConnected: true,
          lastConnectionTime: now,
          connectionStability: reconnectAttempts.current === 0 ? 'excellent' : 
                              reconnectAttempts.current < 3 ? 'stable' : 'unstable',
          messageLatency: 0
        }));
        
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
          duplicatesFiltered: 0,
          stateUpdates: 0,
          pauseResumeMessages: 0
        };
        
        corruptionBuffer.current = [];
        lastValidMessage.current = null;

        // Subscribe to simulation if we have one
        if (simulationId) {
          setTimeout(() => {
            subscribeToSimulation(simulationId);
          }, 300); // Slightly increased delay for stability
        }
      };

      // 🔧 COMMUNICATION FIX: Enhanced message handling with state updates
      ws.current.onmessage = async (event) => {
        try {
          messageStats.current.received++;
          const messageReceiveTime = Date.now();
          
          const data = await parseWebSocketMessage(event.data);
          
          // Calculate latency if message has timestamp
          if (data.timestamp) {
            const latency = messageReceiveTime - data.timestamp;
            setConnectionState(prev => ({
              ...prev,
              messageLatency: latency
            }));
          }
          
          const messageId = `${data.simulationId || 'unknown'}-${data.event?.type || data.type}-${data.event?.timestamp || Date.now()}`;
          
          // 🔧 COMMUNICATION FIX: Enhanced duplicate filtering
          if (lastMessageId.current === messageId) {
            messageStats.current.duplicatesFiltered++;
            console.log(`🔄 WS COMMUNICATION: Filtered duplicate message: ${messageId}`);
            return;
          }
          lastMessageId.current = messageId;
          
          // Handle direct message types (like confirmations and responses)
          if (data.type) {
            switch (data.type) {
              case 'connection':
                console.log('🔗 WS COMMUNICATION: Connection confirmed');
                return;
              case 'subscription_confirmed':
                console.log('✅ WS COMMUNICATION: Subscription confirmed for simulation:', data.simulationId);
                if (data.simulationId === currentSubscription.current) {
                  subscriptionStatus.current = 'subscribed';
                  setConnectionState(prev => ({
                    ...prev,
                    subscriptionStatus: 'subscribed'
                  }));
                  console.log(`🔐 WS COMMUNICATION: Subscription locked for: ${data.simulationId}`);
                }
                return;
              case 'unsubscription_confirmed':
                console.log('✅ WS COMMUNICATION: Unsubscription confirmed for simulation:', data.simulationId);
                if (data.simulationId === currentSubscription.current) {
                  currentSubscription.current = null;
                  subscriptionStatus.current = 'none';
                  setConnectionState(prev => ({
                    ...prev,
                    subscriptionStatus: 'none',
                    currentSimulation: null
                  }));
                  console.log(`🔓 WS COMMUNICATION: Subscription cleared for: ${data.simulationId}`);
                }
                return;
              case 'singleton_mode_confirmed':
                console.log('🔐 WS COMMUNICATION: Singleton CandleManager mode confirmed:', data.simulationId);
                return;
              case 'pong':
                return;
              case 'backend_ready':
                console.log('🏁 WS COMMUNICATION: Backend ready with enhanced coordination');
                return;
              case 'error':
                console.error('❌ WS COMMUNICATION: Backend error:', data.message);
                setConnectionError(data.message || 'Unknown backend error');
                return;
              case 'tps_mode_changed':
                console.log('🔄 WS COMMUNICATION: TPS mode changed confirmed:', data);
                break;
              case 'stress_test_response':
                console.log('🧪 WS COMMUNICATION: Stress test response:', data);
                break;
              case 'tps_status':
                console.log('📊 WS COMMUNICATION: TPS status received:', data);
                break;
              case 'welcome':
                console.log('👋 WS COMMUNICATION: Welcome message received');
                return;
              default:
                break;
            }
          }
          
          // 🔧 COMMUNICATION FIX: Process simulation-specific messages with state updates
          if (data.simulationId && data.event) {
            // Verify this message is from our current subscription
            if (currentSubscription.current && data.simulationId !== currentSubscription.current) {
              console.warn(`⚠️ WS COMMUNICATION: Ignoring message from unsubscribed simulation: ${data.simulationId} (current: ${currentSubscription.current})`);
              return;
            }

            const message: WebSocketMessage = {
              simulationId: data.simulationId,
              event: {
                type: data.event.type || data.type || 'unknown',
                timestamp: data.event.timestamp || Date.now(),
                data: data.event.data || data.data || {}
              }
            };
            
            // 🔧 COMMUNICATION FIX: Handle specific message types with state updates
            const eventType = message.event.type;
            if (eventType === 'simulation_paused' || eventType === 'simulation_resumed' || 
                eventType === 'simulation_reset' || eventType === 'price_update' || 
                eventType === 'candle_update') {
              messageStats.current.stateUpdates++;
              console.log(`📊 WS COMMUNICATION: State update message: ${eventType} for ${data.simulationId}`);
            }
            
            // Priority handling for TPS-related messages
            if (eventType === 'external_market_pressure' || 
                eventType === 'tps_mode_changed' ||
                eventType === 'tps_status' ||
                eventType === 'stress_test_response') {
              console.log(`🎯 WS COMMUNICATION: Priority TPS message: ${eventType}`, message.event.data);
            }
            
            messageQueue.current.push({
              message,
              timestamp: Date.now()
            });
            
            if (messageQueue.current.length > maxQueueSize) {
              const removed = messageQueue.current.splice(0, messageQueue.current.length - maxQueueSize);
              messageStats.current.dropped += removed.length;
              console.warn(`⚠️ WS COMMUNICATION: Dropped ${removed.length} messages due to queue overflow`);
            }
            
            processMessageQueue();
            
          } else if (data.type) {
            // Handle direct message types (like TPS confirmations)
            const message: WebSocketMessage = {
              simulationId: data.simulationId || simulationId || 'unknown',
              event: {
                type: data.type,
                timestamp: data.timestamp || Date.now(),
                data: data
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
          console.error('❌ WS COMMUNICATION: Message parse error:', getErrorMessage(error));
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ WS COMMUNICATION: WebSocket error:', error);
        setIsConnected(false);
        setConnectionError('Backend connection error - check if backend is running');
        
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          connectionStability: 'unstable'
        }));
      };

      ws.current.onclose = (event) => {
        console.log(`🔌 WS COMMUNICATION: Connection closed: code=${event.code}, reason=${event.reason}`);
        setIsConnected(false);
        ws.current = null;
        
        const now = Date.now();
        
        // Clear subscription state on close
        currentSubscription.current = null;
        subscriptionStatus.current = 'none';
        
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          lastDisconnectionTime: now,
          subscriptionStatus: 'none',
          currentSimulation: null,
          connectionStability: 'unstable'
        }));
        
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
          const delay = Math.min(12000, reconnectDelay * Math.pow(1.5, reconnectAttempts.current - 1));
          
          console.log(`🔄 WS COMMUNICATION: Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError(`Failed to connect to backend after ${maxReconnectAttempts} attempts. Check if backend is running.`);
        }
      };
      
    } catch (error: unknown) {
      console.error('❌ WS COMMUNICATION: Failed to create WebSocket connection:', getErrorMessage(error));
      setIsConnected(false);
      setConnectionError('Failed to create backend connection - check configuration');
      
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        connectionStability: 'unstable'
      }));
    }
  }, [simulationId, processMessageQueue, parseWebSocketMessage, subscribeToSimulation]);

  // 🔧 COMMUNICATION FIX: Enhanced subscription management in useEffect
  useEffect(() => {
    if (simulationId) {
      console.log(`🎯 WS COMMUNICATION: Setting up WebSocket for simulation: ${simulationId}`);
      
      // Register state callback for this simulation
      const stateCallback = (newState: any) => {
        console.log(`📊 WS COMMUNICATION: State update callback for ${simulationId}:`, newState);
        // Notify any registered callbacks
        stateUpdateCallbacks.current.forEach(callback => {
          try {
            callback(newState);
          } catch (error) {
            console.error('❌ WS COMMUNICATION: State callback error:', error);
          }
        });
      };
      
      stateManager.current.registerStateCallback(simulationId, stateCallback);
      
      // If WebSocket is already connected, just switch subscription
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        // Check if we need to switch simulations
        if (currentSubscription.current !== simulationId) {
          console.log(`🔄 WS COMMUNICATION: Switching to new simulation: ${simulationId}`);
          subscribeToSimulation(simulationId);
        } else {
          console.log(`✅ WS COMMUNICATION: Already connected to simulation: ${simulationId}`);
        }
      } else {
        // Need to establish new connection
        connect();
      }
      
      return () => {
        stateManager.current.unregisterStateCallback(simulationId, stateCallback);
      };
    } else {
      console.log('🔌 WS COMMUNICATION: No simulation ID - cleaning up connection');
      
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
      
      // Reset subscription and connection state
      currentSubscription.current = null;
      subscriptionStatus.current = 'none';
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        subscriptionStatus: 'none',
        currentSimulation: null
      }));
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
      
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        subscriptionStatus: 'none',
        currentSimulation: null
      }));
    };
  }, [unsubscribeFromSimulation]);

  // 🔧 COMMUNICATION FIX: Enhanced pause state effect with validation
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && simulationId) {
      // Get current state before sending pause command
      const currentState = stateManager.current.getState(simulationId);
      const shouldSendPause = isPaused || false;
      
      // Validate state before sending pause command
      if (currentState) {
        if (shouldSendPause && (!currentState.isRunning || currentState.isPaused)) {
          console.log(`⚠️ WS COMMUNICATION: Skipping pause command - invalid state (running: ${currentState.isRunning}, paused: ${currentState.isPaused})`);
          return;
        }
        
        if (!shouldSendPause && !currentState.isPaused) {
          console.log(`⚠️ WS COMMUNICATION: Skipping resume command - not paused (paused: ${currentState.isPaused})`);
          return;
        }
      }
      
      setPauseState(shouldSendPause);
    }
  }, [isPaused, simulationId, setPauseState]);

  // 🔧 COMMUNICATION FIX: Enhanced ping with state synchronization and health checks
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          const pingMessage = {
            type: 'ping',
            timestamp: Date.now(),
            simulationId: simulationId || undefined,
            currentSubscription: currentSubscription.current,
            subscriptionStatus: subscriptionStatus.current,
            stats: {
              messagesReceived: messageStats.current.received,
              messagesProcessed: messageStats.current.processed,
              queueSize: messageQueue.current.length,
              stateUpdates: messageStats.current.stateUpdates,
              pauseResumeMessages: messageStats.current.pauseResumeMessages
            },
            clientInfo: {
              communicationLayerFix: true,
              stateValidation: true,
              enhancedErrorRecovery: true,
              connectionStability: connectionState.connectionStability,
              messageLatency: connectionState.messageLatency
            }
          };
          
          // Send ping with enhanced information
          ws.current.send(JSON.stringify(pingMessage));
          
          // Periodically request TPS status if we have a simulation
          if (simulationId && Math.random() < 0.3) { // 30% chance per ping
            sendStressTestMessage('get_tps_status', { simulationId });
          }
          
          // Health check - ensure we're still properly subscribed
          if (simulationId && currentSubscription.current !== simulationId) {
            console.warn(`⚠️ WS COMMUNICATION: Subscription health check failed - expected: ${simulationId}, actual: ${currentSubscription.current}`);
            subscribeToSimulation(simulationId);
          }
          
          // Update connection stability based on message processing
          const processingRatio = messageStats.current.received > 0 ? 
            messageStats.current.processed / messageStats.current.received : 1;
          
          setConnectionState(prev => ({
            ...prev,
            connectionStability: processingRatio > 0.95 ? 'excellent' :
                                processingRatio > 0.85 ? 'stable' : 'unstable'
          }));
          
        } catch (error: unknown) {
          console.error('❌ WS COMMUNICATION: Ping error:', getErrorMessage(error));
        }
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(pingInterval);
  }, [simulationId, sendStressTestMessage, subscribeToSimulation, connectionState.connectionStability, connectionState.messageLatency]);

  // 🔧 COMMUNICATION FIX: Add method to register state update callbacks
  const registerStateUpdateCallback = useCallback((callback: Function) => {
    stateUpdateCallbacks.current.add(callback);
    console.log('📝 WS COMMUNICATION: State update callback registered');
    
    return () => {
      stateUpdateCallbacks.current.delete(callback);
      console.log('🗑️ WS COMMUNICATION: State update callback unregistered');
    };
  }, []);

  // 🔧 COMMUNICATION FIX: Add method to get current state
  const getCurrentState = useCallback((simId?: string) => {
    const targetId = simId || simulationId;
    if (targetId) {
      return stateManager.current.getState(targetId);
    }
    return null;
  }, [simulationId]);

  // 🔧 COMMUNICATION FIX: Add method to force state refresh
  const refreshSimulationState = useCallback(async (simId?: string) => {
    const targetId = simId || simulationId;
    if (targetId && ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        const message = {
          type: 'get_status',
          simulationId: targetId,
          timestamp: Date.now(),
          forceRefresh: true
        };
        
        ws.current.send(JSON.stringify(message));
        console.log(`🔄 WS COMMUNICATION: Requested state refresh for ${targetId}`);
      } catch (error) {
        console.error('❌ WS COMMUNICATION: Error requesting state refresh:', error);
      }
    }
  }, [simulationId]);

  return { 
    isConnected, 
    lastMessage, 
    setPauseState,
    connectionError,
    messageStats: messageStats.current,
    sendTPSModeChange,
    sendStressTestMessage,
    
    // 🔧 COMMUNICATION FIX: Enhanced return values
    connectionState,
    subscriptionStatus: {
      current: currentSubscription.current,
      status: subscriptionStatus.current
    },
    stateManager: {
      registerCallback: registerStateUpdateCallback,
      getCurrentState,
      refreshState: refreshSimulationState,
      getStateReport: () => stateManager.current.getStateReport()
    }
  };