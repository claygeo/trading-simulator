// backend/src/websocket/index.ts - COMPLETE FIX: WebSocket Message Handling & State Coordination
import { WebSocket, WebSocketServer } from 'ws';
import { BroadcastManager } from '../services/broadcastManager';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

// Extended message types
interface WebSocketMessage {
  type: string;
  simulationId?: string;
  mode?: string;
  isPaused?: boolean;
  action?: string;
  [key: string]: any;
}

// Client subscription tracking
interface ClientSubscription {
  simulationId: string;
  subscribedAt: number;
  subscriptionAttempts: number;
  preferences?: {
    includeMarketAnalysis?: boolean;
    includeTimeframeChanges?: boolean;
  };
}

// Enhanced client state tracking for race condition prevention
interface ClientState {
  id: string;
  currentSimulation: string | null;
  subscriptionStatus: 'none' | 'subscribing' | 'subscribed' | 'unsubscribing';
  lastMessageTime: number;
  messageCount: number;
  lastStateChangeRequest: { timestamp: number; action: string } | null;
  pendingOperations: Set<string>;
}

// Track client subscriptions with enhanced metadata
const clientSubscriptions = new WeakMap<WebSocket, Set<ClientSubscription>>();
const clientIds = new WeakMap<WebSocket, string>();
const clientRetryTimers = new WeakMap<WebSocket, Map<string, NodeJS.Timeout>>();

// Enhanced client state tracking
const clientStates = new WeakMap<WebSocket, ClientState>();
const simulationClientMapping = new Map<string, Set<WebSocket>>();

let clientCounter = 0;

// Global operation locks to prevent race conditions
const globalOperationLocks = new Map<string, Set<string>>();

export function setupWebSocketServer(
  wss: WebSocketServer, 
  simulationManager: any,
  broadcastManager?: BroadcastManager,
  performanceMonitor?: PerformanceMonitor
) {
  console.log('🔧 Setting up WebSocket server with COMPLETE state coordination fixes...');
  
  // Log server status
  setInterval(() => {
    console.log(`WebSocket Server Status - Clients: ${wss.clients.size}`);
    if (broadcastManager) {
      const stats = broadcastManager.getStats();
      console.log('Broadcast Stats:', {
        activeSubscriptions: stats.activeSubscriptions,
        messagesSent: stats.messagesSent,
        queueDepth: stats.averageQueueDepth
      });
    }
  }, 30000);
  
  wss.on('connection', (ws: WebSocket, req) => {
    const clientId = `client-${++clientCounter}`;
    clientIds.set(ws, clientId);
    
    // Initialize enhanced client state
    const clientState: ClientState = {
      id: clientId,
      currentSimulation: null,
      subscriptionStatus: 'none',
      lastMessageTime: Date.now(),
      messageCount: 0,
      lastStateChangeRequest: null,
      pendingOperations: new Set()
    };
    clientStates.set(ws, clientState);
    
    console.log(`✅ [WS CONN] New WebSocket connection: ${clientId}`);
    console.log(`📊 [WS CONN] Total clients: ${wss.clients.size}`);
    
    // Initialize client subscriptions and retry timers
    clientSubscriptions.set(ws, new Set());
    clientRetryTimers.set(ws, new Map());
    
    // Update connection count for monitoring
    if (performanceMonitor) {
      performanceMonitor.recordWebSocketConnection(wss.clients.size);
    }
    
    // Register the client with simulation manager
    try {
      simulationManager.registerClient(ws);
    } catch (error) {
      console.error('❌ [WS CONN] Error registering client with simulation manager:', error);
    }
    
    // Register with broadcast manager if available
    if (broadcastManager) {
      try {
        broadcastManager.registerClient(ws);
      } catch (error) {
        console.error('❌ [WS CONN] Error registering client with broadcast manager:', error);
      }
    }
    
    // Send enhanced welcome message
    try {
      ws.send(JSON.stringify({
        type: 'connection',
        status: 'connected',
        clientId: clientId,
        timestamp: Date.now(),
        features: {
          compression: false,
          batchUpdates: true,
          highFrequencyMode: process.env.ENABLE_HFT === 'true',
          marketAnalysis: true,
          dynamicTimeframes: true,
          realtimeAdaptation: true,
          raceConditionPrevention: true,
          tpsModeSupport: true,
          stressTestSupport: true,
          initialCandleJumpPrevention: true,
          pauseResumeSupport: true,
          enhancedStateManagement: true,
          completeStateCoordination: true, // NEW: Indicates complete fixes
          pauseStopResetFixed: true // NEW: Indicates pause/stop/reset fixes
        },
        version: '3.0.0' // Version bump for complete fixes
      }), { binary: false, compress: false, fin: true });
    } catch (error) {
      console.error('❌ [WS CONN] Error sending welcome message:', error);
    }
    
    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        const clientState = clientStates.get(ws);
        
        if (clientState) {
          clientState.lastMessageTime = Date.now();
          clientState.messageCount++;
        }
        
        console.log(`📨 [WS MSG] ${clientId} message:`, message.type, message.simulationId || '', message.action || '', message.mode || '');
        
        switch (message.type) {
          case 'subscribe':
            handleSubscriptionWithRetry(ws, message, clientId, simulationManager);
            break;
            
          case 'unsubscribe':
            handleUnsubscription(ws, message, clientId);
            break;
            
          case 'requestMarketAnalysis':
            handleMarketAnalysisRequest(ws, message, simulationManager);
            break;
            
          case 'setPauseState':
            handleStateChangeWithCoordination(ws, message, clientId, simulationManager);
            break;
            
          case 'start_simulation':
            handleStartSimulation(ws, message, clientId, simulationManager);
            break;
            
          case 'pause_simulation':
            handlePauseSimulation(ws, message, clientId, simulationManager);
            break;
            
          case 'resume_simulation':
            handleResumeSimulation(ws, message, clientId, simulationManager);
            break;
            
          case 'stop_simulation':
            handleStopSimulation(ws, message, clientId, simulationManager);
            break;
            
          case 'reset_simulation':
            handleResetSimulation(ws, message, clientId, simulationManager);
            break;
            
          case 'setPreferences':
            handlePreferencesUpdate(ws, message);
            break;
            
          case 'set_tps_mode':
            handleTPSModeChange(ws, message, clientId, simulationManager);
            break;
            
          case 'trigger_liquidation_cascade':
            handleLiquidationCascade(ws, message, clientId, simulationManager);
            break;
            
          case 'get_tps_status':
            handleTPSStatusRequest(ws, message, clientId, simulationManager);
            break;
            
          case 'get_stress_capabilities':
            handleStressCapabilitiesRequest(ws, message, clientId, simulationManager);
            break;
            
          case 'get_simulation_state':
            handleGetSimulationState(ws, message, clientId, simulationManager);
            break;
            
          case 'ping':
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now(),
              latency: message.timestamp ? Date.now() - message.timestamp : undefined,
              clientState: clientState ? {
                currentSimulation: clientState.currentSimulation,
                subscriptionStatus: clientState.subscriptionStatus,
                messageCount: clientState.messageCount,
                pendingOperations: Array.from(clientState.pendingOperations),
                lastStateChangeRequest: clientState.lastStateChangeRequest
              } : null
            }), { binary: false, compress: false, fin: true });
            break;
            
          case 'debug':
            handleDebugRequest(ws, clientId, broadcastManager, simulationManager);
            break;
            
          default:
            console.log(`❓ [WS MSG] Unknown message type from ${clientId}:`, message.type);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${message.type}`,
              timestamp: Date.now()
            }), { binary: false, compress: false, fin: true });
        }
      } catch (error) {
        console.error(`❌ [WS MSG] Error parsing WebSocket message from ${clientId}:`, error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          timestamp: Date.now()
        }), { binary: false, compress: false, fin: true });
      }
    });
    
    ws.on('close', (code, reason) => {
      const clientId = clientIds.get(ws) || 'unknown';
      const clientState = clientStates.get(ws);
      
      console.log(`❌ [WS CLOSE] WebSocket connection closed: ${clientId}, code: ${code}, reason: ${reason}`);
      console.log(`📊 [WS CLOSE] Remaining clients: ${wss.clients.size - 1}`);
      
      // Enhanced cleanup with race condition prevention
      if (clientState) {
        clientState.pendingOperations.forEach(operationId => {
          console.log(`🧹 [WS CLOSE] Clearing pending operation ${operationId} for disconnected client ${clientId}`);
        });
        
        if (clientState.currentSimulation) {
          const simulationClients = simulationClientMapping.get(clientState.currentSimulation);
          if (simulationClients) {
            simulationClients.delete(ws);
            if (simulationClients.size === 0) {
              simulationClientMapping.delete(clientState.currentSimulation);
            }
          }
        }
      }
      
      // Clean up subscriptions and timers
      clientSubscriptions.delete(ws);
      clientIds.delete(ws);
      clientStates.delete(ws);
      
      // Clear any retry timers
      const retryTimers = clientRetryTimers.get(ws);
      if (retryTimers) {
        retryTimers.forEach(timer => clearTimeout(timer));
        clientRetryTimers.delete(ws);
      }
      
      if (performanceMonitor) {
        performanceMonitor.recordWebSocketConnection(wss.clients.size - 1);
      }
    });
    
    ws.on('error', (error) => {
      const clientId = clientIds.get(ws) || 'unknown';
      console.error(`❌ [WS ERROR] WebSocket error for ${clientId}:`, error);
    });
  });
  
  wss.on('error', (error) => {
    console.error('❌ [WS ERROR] WebSocket server error:', error);
  });
  
  console.log('✅ [WS SETUP] WebSocket server setup complete with COMPLETE state coordination and pause/stop/reset fixes');
}

// 🚨 CRITICAL FIX: Enhanced subscription with comprehensive validation
async function handleSubscriptionWithRetry(
  ws: WebSocket, 
  message: WebSocketMessage, 
  clientId: string,
  simulationManager: any
) {
  const { simulationId, preferences } = message;
  
  if (!simulationId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for subscription',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  const clientState = clientStates.get(ws);
  if (!clientState) {
    console.error(`❌ [WS SUB] No client state found for ${clientId}`);
    return;
  }
  
  // Race condition prevention
  if (clientState.subscriptionStatus === 'subscribing') {
    console.warn(`⚠️ [WS SUB] Race condition prevented: ${clientId} already subscribing to ${simulationId}`);
    return;
  }
  
  clientState.subscriptionStatus = 'subscribing';
  
  console.log(`🔔 [WS SUB] ${clientId} attempting to subscribe to simulation: ${simulationId}`);
  
  // Enhanced simulation validation with trader count checking
  console.log(`🔍 [WS SUB] Checking simulation ${simulationId} in SimulationManager...`);
  const simulation = simulationManager.getSimulation(simulationId);
  
  if (!simulation) {
    console.error(`❌ [WS SUB] Simulation ${simulationId} not found in SimulationManager`);
    
    const allSimulations = simulationManager.getAllSimulations();
    console.log(`🔍 [WS SUB] Available simulations:`, allSimulations.map(s => s.id));
    
    clientState.subscriptionStatus = 'none';
    
    ws.send(JSON.stringify({
      type: 'error',
      message: `Simulation ${simulationId} not found`,
      availableSimulations: allSimulations.map(s => s.id),
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  // Validate trader count before allowing subscription
  const traderCount = simulation.traders ? simulation.traders.length : 0;
  console.log(`🔥 [WS SUB] Simulation ${simulationId} found with ${traderCount} traders`);
  
  if (traderCount === 0) {
    console.error(`❌ [WS SUB] Simulation ${simulationId} has NO TRADERS - rejecting subscription`);
    
    clientState.subscriptionStatus = 'none';
    
    ws.send(JSON.stringify({
      type: 'error',
      message: `Simulation ${simulationId} has no traders loaded - still initializing`,
      traderCount: traderCount,
      expectedTraders: 118,
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  if (traderCount < 118) {
    console.warn(`⚠️ [WS SUB] Simulation ${simulationId} has incomplete trader data: ${traderCount}/118`);
    
    // Allow subscription but warn about incomplete data
    ws.send(JSON.stringify({
      type: 'warning',
      message: `Simulation ${simulationId} has incomplete trader data`,
      traderCount: traderCount,
      expectedTraders: 118,
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
  }
  
  console.log(`✅ [WS SUB] Simulation ${simulationId} validated with ${traderCount} traders`);
  
  // Check if simulation is ready for subscriptions
  const isReady = simulationManager.isSimulationReady(simulationId);
  
  if (!isReady) {
    console.log(`⏳ [WS SUB] Simulation ${simulationId} not ready yet, will retry for ${clientId}`);
    
    let attempts = 1;
    
    // Track subscription attempt
    const subscriptions = clientSubscriptions.get(ws);
    if (subscriptions) {
      const existingSubscription = Array.from(subscriptions).find(sub => sub.simulationId === simulationId);
      
      if (existingSubscription) {
        existingSubscription.subscriptionAttempts++;
        attempts = existingSubscription.subscriptionAttempts;
        
        // Limit retry attempts
        if (attempts > 10) {
          console.error(`❌ [WS SUB] Max retry attempts reached for ${simulationId} and ${clientId}`);
          clientState.subscriptionStatus = 'none';
          ws.send(JSON.stringify({
            type: 'error',
            message: `Simulation ${simulationId} failed to become ready after multiple attempts`,
            timestamp: Date.now()
          }), { binary: false, compress: false, fin: true });
          return;
        }
      } else {
        subscriptions.add({
          simulationId,
          subscribedAt: Date.now(),
          subscriptionAttempts: 1,
          preferences: preferences || {
            includeMarketAnalysis: true,
            includeTimeframeChanges: true
          }
        });
        attempts = 1;
      }
    }
    
    const retryDelay = Math.min(5000, 500 * Math.pow(2, attempts - 1));
    
    // Set up retry timer
    const retryTimers = clientRetryTimers.get(ws);
    if (retryTimers) {
      // Clear existing timer for this simulation
      const existingTimer = retryTimers.get(simulationId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      console.log(`⏰ [WS SUB] Scheduling retry for ${simulationId} in ${retryDelay}ms (attempt ${attempts})`);
      
      const retryTimer = setTimeout(() => {
        console.log(`🔄 [WS SUB] Retrying subscription for ${simulationId} (attempt ${attempts + 1})`);
        handleSubscriptionWithRetry(ws, message, clientId, simulationManager);
      }, retryDelay);
      
      retryTimers.set(simulationId, retryTimer);
    }
    
    // Send pending status
    ws.send(JSON.stringify({
      type: 'subscription_pending',
      simulationId: simulationId,
      message: 'Simulation still registering, will retry automatically',
      retryAttempt: attempts,
      retryDelay: retryDelay,
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    
    return;
  }
  
  // Simulation is ready - proceed with subscription
  console.log(`✅ [WS SUB] Simulation ${simulationId} is ready, proceeding with subscription for ${clientId}`);
  
  // Update client state and mapping
  clientState.currentSimulation = simulationId;
  clientState.subscriptionStatus = 'subscribed';
  
  // Add to simulation mapping
  if (!simulationClientMapping.has(simulationId)) {
    simulationClientMapping.set(simulationId, new Set());
  }
  simulationClientMapping.get(simulationId)!.add(ws);
  
  // Track subscription
  const subscriptions = clientSubscriptions.get(ws);
  if (subscriptions) {
    // Remove any existing subscription for this simulation
    const existingSubscriptions = Array.from(subscriptions).filter(sub => sub.simulationId === simulationId);
    existingSubscriptions.forEach(sub => subscriptions.delete(sub));
    
    // Add new subscription
    subscriptions.add({
      simulationId,
      subscribedAt: Date.now(),
      subscriptionAttempts: 1,
      preferences: preferences || {
        includeMarketAnalysis: true,
        includeTimeframeChanges: true
      }
    });
  }
  
  // Clear any retry timers for this simulation
  const retryTimers = clientRetryTimers.get(ws);
  if (retryTimers && retryTimers.has(simulationId)) {
    clearTimeout(retryTimers.get(simulationId)!);
    retryTimers.delete(simulationId);
    console.log(`🧹 [WS SUB] Cleared retry timer for ${simulationId}`);
  }
  
  console.log(`📡 [WS SUB] Sending initial state for simulation ${simulationId} to ${clientId}`);
  
  // Get simulation state to check current status
  const simulationState = simulationManager.getSimulationState(simulationId);
  const liveMetrics = simulationManager.getLiveTPSMetrics(simulationId);
  
  // Enhanced simulation state
  const enhancedState = {
    isRunning: simulation.isRunning,
    isPaused: simulation.isPaused,
    runState: simulationState.runState || 'stopped',
    currentPrice: simulation.currentPrice,
    priceHistory: simulation.priceHistory || [],
    orderBook: simulation.orderBook,
    activePositions: simulation.activePositions,
    recentTrades: simulation.recentTrades ? simulation.recentTrades.slice(0, 200) : [],
    traderRankings: simulation.traderRankings ? simulation.traderRankings.slice(0, 20) : [],
    speed: simulation.parameters.timeCompressionFactor,
    marketConditions: simulation.marketConditions,
    parameters: {
      initialPrice: simulation.parameters.initialPrice,
      volatilityFactor: simulation.parameters.volatilityFactor,
      timeCompressionFactor: simulation.parameters.timeCompressionFactor
    },
    externalMarketMetrics: liveMetrics || simulation.externalMarketMetrics,
    registrationStatus: 'ready',
    currentTPSMode: simulation.currentTPSMode || 'NORMAL',
    tpsSupport: true,
    stressTestCapabilities: {
      supportedModes: ['NORMAL', 'BURST', 'STRESS', 'HFT'],
      liquidationCascade: true,
      mevBotSimulation: true
    },
    traderCount: traderCount,
    traderValidationPassed: true,
    // Enhanced state management info
    canStart: simulationState.canStart,
    canPause: simulationState.canPause,
    canResume: simulationState.canResume,
    canStop: simulationState.canStop,
    isTransitioning: simulationState.isTransitioning || false,
    validationIssues: simulationState.validationIssues || [],
    completeStateCoordination: true,
    pauseStopResetFixed: true
  };
  
  ws.send(JSON.stringify({
    simulationId: simulationId,
    event: {
      type: 'simulation_state',
      timestamp: Date.now(),
      data: enhancedState
    }
  }), { binary: false, compress: false, fin: true });
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'subscription_confirmed',
    simulationId: simulationId,
    timestamp: Date.now(),
    preferences: preferences,
    registrationStatus: 'ready',
    tpsSupport: true,
    currentTPSMode: enhancedState.currentTPSMode,
    pauseResumeSupport: true,
    raceConditionPrevention: true,
    traderCount: traderCount,
    traderValidationPassed: true,
    enhancedSubscriptionValidation: true,
    completeStateCoordination: true,
    pauseStopResetFixed: true,
    message: `Successfully subscribed to simulation ${simulationId} with complete state coordination`
  }), { binary: false, compress: false, fin: true });
  
  console.log(`🎉 [WS SUB] SUBSCRIPTION SUCCESS! ${clientId} subscribed to ${simulationId}, traders: ${traderCount}, validation: PASSED, fixes: COMPLETE`);
}

// 🚨 CRITICAL FIX: Individual State Change Handlers with Complete Coordination

// Start Simulation Handler
async function handleStartSimulation(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for start simulation', 'start_simulation_response');
    return;
  }
  
  console.log(`🚀 [START] ${clientId} requesting to start simulation ${simulationId}`);
  
  await executeStateChangeWithCoordination(ws, simulationId, 'start', clientId, simulationManager, async () => {
    await simulationManager.startSimulation(simulationId);
    return { action: 'started', newState: { isRunning: true, isPaused: false } };
  });
}

// Pause Simulation Handler
async function handlePauseSimulation(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for pause simulation', 'pause_simulation_response');
    return;
  }
  
  console.log(`⏸️ [PAUSE] ${clientId} requesting to pause simulation ${simulationId}`);
  
  await executeStateChangeWithCoordination(ws, simulationId, 'pause', clientId, simulationManager, async () => {
    await simulationManager.pauseSimulation(simulationId);
    return { action: 'paused', newState: { isRunning: true, isPaused: true } };
  });
}

// Resume Simulation Handler
async function handleResumeSimulation(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for resume simulation', 'resume_simulation_response');
    return;
  }
  
  console.log(`▶️ [RESUME] ${clientId} requesting to resume simulation ${simulationId}`);
  
  await executeStateChangeWithCoordination(ws, simulationId, 'resume', clientId, simulationManager, async () => {
    await simulationManager.resumeSimulation(simulationId);
    return { action: 'resumed', newState: { isRunning: true, isPaused: false } };
  });
}

// Stop Simulation Handler
async function handleStopSimulation(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for stop simulation', 'stop_simulation_response');
    return;
  }
  
  console.log(`⏹️ [STOP] ${clientId} requesting to stop simulation ${simulationId}`);
  
  await executeStateChangeWithCoordination(ws, simulationId, 'stop', clientId, simulationManager, async () => {
    await simulationManager.stopSimulation(simulationId);
    return { action: 'stopped', newState: { isRunning: false, isPaused: false } };
  });
}

// Reset Simulation Handler
async function handleResetSimulation(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for reset simulation', 'reset_simulation_response');
    return;
  }
  
  console.log(`🔄 [RESET] ${clientId} requesting to reset simulation ${simulationId}`);
  
  await executeStateChangeWithCoordination(ws, simulationId, 'reset', clientId, simulationManager, async () => {
    await simulationManager.resetSimulation(simulationId);
    return { action: 'reset', newState: { isRunning: false, isPaused: false } };
  });
}

// 🚨 CRITICAL FIX: Centralized State Change Execution with Complete Coordination
async function executeStateChangeWithCoordination(
  ws: WebSocket,
  simulationId: string,
  action: string,
  clientId: string,
  simulationManager: any,
  operationFn: () => Promise<{ action: string; newState: any }>
): Promise<void> {
  const clientState = clientStates.get(ws);
  if (!clientState) {
    console.error(`❌ [${action.toUpperCase()}] No client state found for ${clientId}`);
    return;
  }
  
  // Check for recent duplicate requests
  if (clientState.lastStateChangeRequest) {
    const timeSinceLastRequest = Date.now() - clientState.lastStateChangeRequest.timestamp;
    if (timeSinceLastRequest < 1000 && clientState.lastStateChangeRequest.action === action) {
      console.warn(`⚠️ [${action.toUpperCase()}] Duplicate request prevented: ${clientId} already requested ${action} within 1 second`);
      sendErrorResponse(ws, `Duplicate ${action} request - please wait before retrying`, `${action}_simulation_response`);
      return;
    }
  }
  
  // Race condition prevention
  const operationId = `${action}_${simulationId}_${Date.now()}`;
  
  if (!globalOperationLocks.has(simulationId)) {
    globalOperationLocks.set(simulationId, new Set());
  }
  
  const simulationLocks = globalOperationLocks.get(simulationId)!;
  
  // Check for conflicting operations
  const hasConflictingOperation = Array.from(simulationLocks).some(lock => 
    lock.includes('start_') || lock.includes('pause_') || lock.includes('resume_') || 
    lock.includes('stop_') || lock.includes('reset_')
  );
  
  if (hasConflictingOperation) {
    console.warn(`⚠️ [${action.toUpperCase()}] Race condition prevented: conflicting operation for ${simulationId}`);
    sendErrorResponse(ws, `Another operation is already in progress for this simulation`, `${action}_simulation_response`);
    return;
  }
  
  // Lock this operation
  simulationLocks.add(operationId);
  clientState.pendingOperations.add(operationId);
  clientState.lastStateChangeRequest = { timestamp: Date.now(), action: action };
  
  console.log(`🔒 [${action.toUpperCase()}] Locked operation ${operationId} for ${simulationId}`);
  
  try {
    // Get simulation state before operation
    const preState = simulationManager.getSimulationState(simulationId);
    console.log(`🔍 [${action.toUpperCase()}] Pre-operation state: ${preState.runState}, canStart: ${preState.canStart}, canPause: ${preState.canPause}, canResume: ${preState.canResume}, canStop: ${preState.canStop}`);
    
    // Validate operation is allowed
    const canPerformOperation = validateStateChangePermission(action, preState);
    if (!canPerformOperation.allowed) {
      throw new Error(canPerformOperation.reason);
    }
    
    // Execute the operation
    const result = await operationFn();
    
    // Get simulation state after operation
    const postState = simulationManager.getSimulationState(simulationId);
    console.log(`🔍 [${action.toUpperCase()}] Post-operation state: ${postState.runState}, isRunning: ${postState.isRunning}, isPaused: ${postState.isPaused}`);
    
    // Send success response to requesting client
    ws.send(JSON.stringify({
      type: `${action}_simulation_response`,
      simulationId: simulationId,
      timestamp: Date.now(),
      success: true,
      action: result.action,
      data: {
        ...result.newState,
        runState: postState.runState,
        canStart: postState.canStart,
        canPause: postState.canPause,
        canResume: postState.canResume,
        canStop: postState.canStop,
        isTransitioning: postState.isTransitioning
      },
      message: `Simulation ${result.action} successfully`,
      completeStateCoordination: true,
      pauseStopResetFixed: true
    }), { binary: false, compress: false, fin: true });
    
    console.log(`📡 [${action.toUpperCase()}] Sent success response to ${clientId}: ${result.action}`);
    
    // Broadcast state change to OTHER clients for this simulation
    broadcastStateChangeToOtherClients(simulationId, ws, result.action, postState, clientId);
    
  } catch (error) {
    console.error(`❌ [${action.toUpperCase()}] Error executing operation:`, error);
    
    // Send error response
    sendErrorResponse(
      ws, 
      error instanceof Error ? error.message : `Unknown error during ${action}`,
      `${action}_simulation_response`
    );
    
  } finally {
    // Always clean up locks and pending operations
    simulationLocks.delete(operationId);
    clientState.pendingOperations.delete(operationId);
    
    // Clean up empty lock sets
    if (simulationLocks.size === 0) {
      globalOperationLocks.delete(simulationId);
    }
    
    console.log(`🔓 [${action.toUpperCase()}] Released operation lock ${operationId} for ${simulationId}`);
  }
}

// Validate if a state change operation is allowed
function validateStateChangePermission(action: string, currentState: any): { allowed: boolean; reason?: string } {
  switch (action) {
    case 'start':
      if (!currentState.canStart) {
        return { allowed: false, reason: `Cannot start simulation - current state: ${currentState.runState}` };
      }
      break;
    case 'pause':
      if (!currentState.canPause) {
        return { allowed: false, reason: `Cannot pause simulation - current state: ${currentState.runState}` };
      }
      break;
    case 'resume':
      if (!currentState.canResume) {
        return { allowed: false, reason: `Cannot resume simulation - current state: ${currentState.runState}` };
      }
      break;
    case 'stop':
      if (!currentState.canStop) {
        return { allowed: false, reason: `Cannot stop simulation - current state: ${currentState.runState}` };
      }
      break;
    case 'reset':
      // Reset can be performed in most states
      break;
    default:
      return { allowed: false, reason: `Unknown action: ${action}` };
  }
  
  if (currentState.isTransitioning) {
    return { allowed: false, reason: 'Operation not allowed while state transition is in progress' };
  }
  
  return { allowed: true };
}

// Broadcast state change to other clients
function broadcastStateChangeToOtherClients(
  simulationId: string,
  senderWs: WebSocket,
  action: string,
  newState: any,
  triggeredBy: string
): void {
  const simulationClients = simulationClientMapping.get(simulationId);
  if (simulationClients && simulationClients.size > 1) {
    const stateChangeEvent = {
      type: 'simulation_state_changed',
      simulationId: simulationId,
      timestamp: Date.now(),
      action: action,
      data: {
        runState: newState.runState,
        isRunning: newState.isRunning,
        isPaused: newState.isPaused,
        canStart: newState.canStart,
        canPause: newState.canPause,
        canResume: newState.canResume,
        canStop: newState.canStop,
        isTransitioning: newState.isTransitioning
      },
      triggeredBy: triggeredBy,
      completeStateCoordination: true,
      pauseStopResetFixed: true
    };
    
    let broadcastCount = 0;
    simulationClients.forEach(client => {
      if (client !== senderWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(stateChangeEvent), { binary: false, compress: false, fin: true });
          broadcastCount++;
        } catch (broadcastError) {
          console.error(`❌ [BROADCAST] Error broadcasting to client:`, broadcastError);
        }
      }
    });
    
    console.log(`📡 [BROADCAST] Broadcasted ${action} state change to ${broadcastCount} other clients`);
  }
}

// 🚨 CRITICAL FIX: Legacy setPauseState Handler for Backwards Compatibility
async function handleStateChangeWithCoordination(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId, isPaused, action } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for state change', 'setPauseState_response');
    return;
  }
  
  // Determine action from isPaused flag or explicit action
  let operationAction: string;
  if (action) {
    operationAction = action; // Use explicit action if provided
  } else if (isPaused !== undefined) {
    // Legacy behavior: derive action from isPaused flag
    const currentState = simulationManager.getSimulationState(simulationId);
    if (isPaused) {
      operationAction = 'pause'; // User wants to pause
    } else {
      // User wants to unpause
      if (!currentState.isRunning) {
        operationAction = 'start'; // Not running, so start
      } else {
        operationAction = 'resume'; // Running but paused, so resume
      }
    }
  } else {
    sendErrorResponse(ws, 'isPaused boolean or action required for state change', 'setPauseState_response');
    return;
  }
  
  console.log(`🔄 [STATE CHANGE] ${clientId} requesting ${operationAction} for ${simulationId}`);
  
  await executeStateChangeWithCoordination(ws, simulationId, operationAction, clientId, simulationManager, async () => {
    switch (operationAction) {
      case 'start':
        await simulationManager.startSimulation(simulationId);
        return { action: 'started', newState: { isRunning: true, isPaused: false } };
      case 'pause':
        await simulationManager.pauseSimulation(simulationId);
        return { action: 'paused', newState: { isRunning: true, isPaused: true } };
      case 'resume':
        await simulationManager.resumeSimulation(simulationId);
        return { action: 'resumed', newState: { isRunning: true, isPaused: false } };
      case 'stop':
        await simulationManager.stopSimulation(simulationId);
        return { action: 'stopped', newState: { isRunning: false, isPaused: false } };
      case 'reset':
        await simulationManager.resetSimulation(simulationId);
        return { action: 'reset', newState: { isRunning: false, isPaused: false } };
      default:
        throw new Error(`Unknown operation: ${operationAction}`);
    }
  });
}

// Get Simulation State Handler
async function handleGetSimulationState(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for get simulation state', 'get_simulation_state_response');
    return;
  }
  
  try {
    const simulationState = simulationManager.getSimulationState(simulationId);
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      sendErrorResponse(ws, `Simulation ${simulationId} not found`, 'get_simulation_state_response');
      return;
    }
    
    ws.send(JSON.stringify({
      type: 'get_simulation_state_response',
      simulationId: simulationId,
      timestamp: Date.now(),
      success: true,
      data: {
        ...simulationState,
        currentPrice: simulation.currentPrice,
        traderCount: simulation.traders ? simulation.traders.length : 0,
        currentTPSMode: simulation.currentTPSMode || 'NORMAL'
      }
    }), { binary: false, compress: false, fin: true });
    
  } catch (error) {
    console.error(`❌ [GET STATE] Error getting simulation state:`, error);
    sendErrorResponse(ws, 'Error getting simulation state', 'get_simulation_state_response');
  }
}

// Utility function to send error responses
function sendErrorResponse(ws: WebSocket, errorMessage: string, responseType: string): void {
  ws.send(JSON.stringify({
    type: responseType,
    timestamp: Date.now(),
    success: false,
    error: errorMessage,
    completeStateCoordination: true,
    pauseStopResetFixed: true
  }), { binary: false, compress: false, fin: true });
}

// Handle TPS mode changes with proper error handling
async function handleTPSModeChange(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId, mode } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for TPS mode change', 'tps_mode_change_response');
    return;
  }
  
  if (!mode) {
    sendErrorResponse(ws, 'mode required for TPS mode change', 'tps_mode_change_response');
    return;
  }
  
  console.log(`🚀 [TPS] ${clientId} requesting TPS mode change to ${mode} for simulation ${simulationId}`);
  
  try {
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      console.error(`❌ [TPS] Simulation ${simulationId} not found for TPS mode change`);
      sendErrorResponse(ws, `Simulation ${simulationId} not found`, 'tps_mode_change_response');
      return;
    }
    
    // Validate mode
    const validModes = ['NORMAL', 'BURST', 'STRESS', 'HFT'];
    if (!validModes.includes(mode)) {
      sendErrorResponse(ws, `Invalid TPS mode. Valid modes: ${validModes.join(', ')}`, 'tps_mode_change_response');
      return;
    }
    
    // Use the async setTPSMode method correctly
    const result = await simulationManager.setTPSModeAsync(simulationId, mode);
    
    if (result.success) {
      console.log(`✅ [TPS] Successfully changed TPS mode to ${mode} for simulation ${simulationId}`);
      
      // Send confirmation to requesting client
      ws.send(JSON.stringify({
        type: 'tps_mode_changed',
        simulationId: simulationId,
        mode: mode,
        previousMode: result.previousMode,
        targetTPS: getTargetTPSForMode(mode),
        timestamp: Date.now(),
        message: `TPS mode changed to ${mode}`,
        metrics: result.metrics
      }), { binary: false, compress: false, fin: true });
      
      // Broadcast the mode change to all subscribed clients properly
      broadcastTPSModeChange(simulationId, mode, result.metrics, simulationManager);
      
    } else {
      console.error(`❌ [TPS] Failed to change TPS mode: ${result.error}`);
      sendErrorResponse(ws, result.error || 'Failed to change TPS mode', 'tps_mode_change_response');
    }
    
  } catch (error) {
    console.error(`❌ [TPS] Error changing TPS mode:`, error);
    sendErrorResponse(ws, 'Internal error changing TPS mode', 'tps_mode_change_response');
  }
}

// Handle liquidation cascade trigger with better error handling
async function handleLiquidationCascade(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for liquidation cascade', 'liquidation_cascade_response');
    return;
  }
  
  console.log(`💥 [LIQUIDATION] ${clientId} triggering liquidation cascade for simulation ${simulationId}`);
  
  try {
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      sendErrorResponse(ws, `Simulation ${simulationId} not found`, 'liquidation_cascade_response');
      return;
    }
    
    // Check if simulation is in appropriate mode
    const currentMode = simulation.currentTPSMode || 'NORMAL';
    if (currentMode !== 'STRESS' && currentMode !== 'HFT') {
      sendErrorResponse(ws, `Liquidation cascade requires STRESS or HFT mode, current mode is ${currentMode}`, 'liquidation_cascade_response');
      return;
    }
    
    // Trigger liquidation cascade
    const result = await simulationManager.triggerLiquidationCascade(simulationId);
    
    if (result.success) {
      console.log(`✅ [LIQUIDATION] Liquidation cascade triggered for simulation ${simulationId}`);
      
      ws.send(JSON.stringify({
        type: 'stress_test_response',
        action: 'liquidation_cascade',
        simulationId: simulationId,
        timestamp: Date.now(),
        success: true,
        data: {
          ordersGenerated: result.ordersGenerated,
          estimatedImpact: result.estimatedImpact,
          cascadeSize: result.cascadeSize
        }
      }), { binary: false, compress: false, fin: true });
      
    } else {
      console.error(`❌ [LIQUIDATION] Failed to trigger liquidation cascade: ${result.error}`);
      sendErrorResponse(ws, result.error || 'Failed to trigger liquidation cascade', 'liquidation_cascade_response');
    }
    
  } catch (error) {
    console.error(`❌ [LIQUIDATION] Error triggering liquidation cascade:`, error);
    sendErrorResponse(ws, 'Internal error triggering liquidation cascade', 'liquidation_cascade_response');
  }
}

// Handle TPS status requests with better data
async function handleTPSStatusRequest(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for TPS status request', 'tps_status_response');
    return;
  }
  
  try {
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      sendErrorResponse(ws, `Simulation ${simulationId} not found`, 'tps_status_response');
      return;
    }
    
    const currentMode = simulation.currentTPSMode || 'NORMAL';
    const targetTPS = getTargetTPSForMode(currentMode);
    
    // Get live metrics from simulation
    const liveMetrics = simulationManager.getLiveTPSMetrics(simulationId);
    
    ws.send(JSON.stringify({
      type: 'tps_status',
      simulationId: simulationId,
      timestamp: Date.now(),
      data: {
        currentTPSMode: currentMode,
        targetTPS: targetTPS,
        metrics: liveMetrics || {
          currentTPS: targetTPS,
          actualTPS: 0,
          queueDepth: 0,
          processedOrders: 0,
          rejectedOrders: 0,
          avgProcessingTime: 0,
          dominantTraderType: 'RETAIL_TRADER',
          marketSentiment: 'neutral',
          liquidationRisk: 0
        },
        supportedModes: ['NORMAL', 'BURST', 'STRESS', 'HFT']
      }
    }), { binary: false, compress: false, fin: true });
    
  } catch (error) {
    console.error(`❌ [TPS] Error getting TPS status:`, error);
    sendErrorResponse(ws, 'Internal error getting TPS status', 'tps_status_response');
  }
}

// Handle stress test capabilities requests
async function handleStressCapabilitiesRequest(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for stress capabilities request', 'stress_capabilities_response');
    return;
  }
  
  try {
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      sendErrorResponse(ws, `Simulation ${simulationId} not found`, 'stress_capabilities_response');
      return;
    }
    
    const currentMode = simulation.currentTPSMode || 'NORMAL';
    
    ws.send(JSON.stringify({
      type: 'stress_capabilities',
      simulationId: simulationId,
      timestamp: Date.now(),
      data: {
        currentTPSMode: currentMode,
        capabilities: {
          liquidationCascade: currentMode === 'STRESS' || currentMode === 'HFT',
          mevBotSimulation: currentMode === 'HFT',
          panicSelling: currentMode === 'STRESS',
          highFrequencyTrading: currentMode === 'HFT',
          marketMaking: true,
          arbitrageSimulation: currentMode !== 'NORMAL'
        },
        supportedModes: ['NORMAL', 'BURST', 'STRESS', 'HFT'],
        modeDescriptions: {
          NORMAL: 'Market makers & retail traders (25 TPS)',
          BURST: 'Increased retail & arbitrage activity (150 TPS)',
          STRESS: 'Panic sellers & MEV bots (1.5K TPS)',
          HFT: 'MEV bots, whales & arbitrage bots (15K TPS)'
        }
      }
    }), { binary: false, compress: false, fin: true });
    
  } catch (error) {
    console.error(`❌ [STRESS] Error getting stress capabilities:`, error);
    sendErrorResponse(ws, 'Internal error getting stress capabilities', 'stress_capabilities_response');
  }
}

// Broadcast TPS mode change to all clients properly
function broadcastTPSModeChange(simulationId: string, mode: string, metrics?: any, simulationManager?: any) {
  // Get all connected clients subscribed to this simulation
  if (simulationManager && simulationManager.broadcastService) {
    simulationManager.broadcastService.broadcastEvent(simulationId, {
      type: 'tps_mode_changed',
      timestamp: Date.now(),
      data: {
        simulationId: simulationId,
        newMode: mode,
        targetTPS: getTargetTPSForMode(mode),
        metrics: metrics
      }
    });
  }
  
  console.log(`📡 [TPS BROADCAST] Broadcasted TPS mode change to ${mode} for simulation ${simulationId}`, metrics);
}

// Helper function to get target TPS for mode
function getTargetTPSForMode(mode: string): number {
  switch (mode) {
    case 'NORMAL': return 25;
    case 'BURST': return 150;
    case 'STRESS': return 1500;
    case 'HFT': return 15000;
    default: return 25;
  }
}

// Handle unsubscription
function handleUnsubscription(ws: WebSocket, message: WebSocketMessage, clientId: string) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for unsubscription', 'unsubscription_response');
    return;
  }
  
  const clientState = clientStates.get(ws);
  if (clientState) {
    clientState.subscriptionStatus = 'unsubscribing';
    
    // Remove from simulation mapping
    const simulationClients = simulationClientMapping.get(simulationId);
    if (simulationClients) {
      simulationClients.delete(ws);
      if (simulationClients.size === 0) {
        simulationClientMapping.delete(simulationId);
      }
    }
    
    if (clientState.currentSimulation === simulationId) {
      clientState.currentSimulation = null;
    }
    
    clientState.subscriptionStatus = 'none';
  }
  
  const subscriptions = clientSubscriptions.get(ws);
  if (subscriptions) {
    // Remove specific subscription
    const toRemove = Array.from(subscriptions).find(sub => sub.simulationId === simulationId);
    if (toRemove) {
      subscriptions.delete(toRemove);
      console.log(`${clientId} unsubscribed from simulation: ${simulationId}`);
      
      // Clear any retry timers
      const retryTimers = clientRetryTimers.get(ws);
      if (retryTimers && retryTimers.has(simulationId)) {
        clearTimeout(retryTimers.get(simulationId)!);
        retryTimers.delete(simulationId);
        console.log(`🧹 [WS UNSUB] Cleared retry timer for ${simulationId}`);
      }
      
      ws.send(JSON.stringify({
        type: 'unsubscription_confirmed',
        simulationId: simulationId,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
    }
  }
}

// Handle explicit market analysis requests
function handleMarketAnalysisRequest(ws: WebSocket, message: WebSocketMessage, simulationManager: any) {
  const { simulationId } = message;
  
  if (!simulationId) {
    sendErrorResponse(ws, 'simulationId required for market analysis request', 'market_analysis_response');
    return;
  }
  
  const simulation = simulationManager.getSimulation(simulationId);
  if (!simulation) {
    sendErrorResponse(ws, `Simulation ${simulationId} not found`, 'market_analysis_response');
    return;
  }
  
  // Get live TPS metrics for market analysis
  const liveMetrics = simulationManager.getLiveTPSMetrics(simulationId);
  
  ws.send(JSON.stringify({
    simulationId: simulationId,
    event: {
      type: 'market_analysis',
      timestamp: Date.now(),
      data: {
        currentPrice: simulation.currentPrice,
        marketConditions: simulation.marketConditions,
        priceHistory: simulation.priceHistory.slice(-50),
        activeScenario: (simulation as any).activeScenario || null,
        // TPS metrics
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        tpsMetrics: liveMetrics || simulation.externalMarketMetrics
      }
    }
  }), { binary: false, compress: false, fin: true });
}

// Handle preferences update
function handlePreferencesUpdate(ws: WebSocket, message: WebSocketMessage) {
  const { simulationId, preferences } = message;
  
  if (!simulationId || !preferences) {
    sendErrorResponse(ws, 'simulationId and preferences required', 'preferences_update_response');
    return;
  }
  
  const subscriptions = clientSubscriptions.get(ws);
  if (subscriptions) {
    const subscription = Array.from(subscriptions).find(sub => sub.simulationId === simulationId);
    if (subscription) {
      subscription.preferences = { ...subscription.preferences, ...preferences };
      console.log(`Updated preferences for simulation ${simulationId}:`, subscription.preferences);
      
      ws.send(JSON.stringify({
        type: 'preferences_updated',
        simulationId: simulationId,
        preferences: subscription.preferences,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
    }
  }
}

// Handle debug requests
function handleDebugRequest(ws: WebSocket, clientId: string, broadcastManager?: BroadcastManager, simulationManager?: any) {
  const subscriptions = clientSubscriptions.get(ws);
  const retryTimers = clientRetryTimers.get(ws);
  const clientState = clientStates.get(ws);
  
  const debugInfo = {
    type: 'debug_info',
    clientId: clientId,
    timestamp: Date.now(),
    subscriptions: subscriptions ? Array.from(subscriptions).map(s => ({
      simulationId: s.simulationId,
      subscribedAt: s.subscribedAt,
      subscriptionAttempts: s.subscriptionAttempts,
      preferences: s.preferences
    })) : [],
    retryTimers: retryTimers ? Array.from(retryTimers.keys()) : [],
    clientState: clientState ? {
      currentSimulation: clientState.currentSimulation,
      subscriptionStatus: clientState.subscriptionStatus,
      messageCount: clientState.messageCount,
      pendingOperations: Array.from(clientState.pendingOperations),
      lastStateChangeRequest: clientState.lastStateChangeRequest
    } : null,
    serverStats: {
      totalClients: ws.readyState === WebSocket.OPEN ? 
        Array.from((ws as any)._server?.clients || []).length : 0,
      simulationClientMapping: Array.from(simulationClientMapping.entries()).map(([simId, clients]) => ({
        simulationId: simId,
        clientCount: clients.size
      })),
      globalOperationLocks: Array.from(globalOperationLocks.entries()).map(([simId, locks]) => ({
        simulationId: simId,
        locks: Array.from(locks)
      })),
      raceConditionPrevention: true,
      sharedSimulationManager: true,
      tpsSupport: true,
      stressTestSupport: true,
      initialCandleJumpPrevention: true,
      pauseResumeSupport: true,
      enhancedStateManagement: true,
      completeStateCoordination: true,
      pauseStopResetFixed: true
    }
  };
  
  if (broadcastManager) {
    debugInfo.serverStats = {
      ...debugInfo.serverStats,
      ...broadcastManager.getStats()
    };
  }
  
  if (simulationManager) {
    try {
      const allSimulations = simulationManager.getAllSimulations();
      debugInfo.serverStats = {
        ...debugInfo.serverStats,
        simulationCount: allSimulations.length,
        simulationStates: allSimulations.map(sim => ({
          id: sim.id,
          state: simulationManager.getSimulationState(sim.id)
        }))
      };
    } catch (error) {
      console.error('Error getting simulation debug info:', error);
    }
  }
  
  ws.send(JSON.stringify(debugInfo), { binary: false, compress: false, fin: true });
}

// Enhanced broadcast function that respects client preferences and handles race conditions
export function broadcastToSubscribers(
  wss: WebSocketServer, 
  simulationId: string, 
  event: any,
  filterFn?: (client: WebSocket) => boolean
) {
  const message = {
    simulationId,
    event: {
      ...event,
      timestamp: event.timestamp || Date.now()
    }
  };
  
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  let skippedCount = 0;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // Check if client is subscribed to this simulation
      const subscriptions = clientSubscriptions.get(client);
      if (subscriptions) {
        const subscription = Array.from(subscriptions).find(sub => sub.simulationId === simulationId);
        
        if (subscription) {
          // Only send to clients that have confirmed subscriptions (not pending)
          if (subscription.subscriptionAttempts <= 1) {
            // Apply preferences filtering
            let shouldSend = true;
            
            // Filter market analysis if not requested
            if (event.type === 'price_update' && 
                event.data?.marketAnalysis && 
                subscription.preferences?.includeMarketAnalysis === false) {
              // Remove market analysis from the event
              const filteredEvent = {
                ...message,
                event: {
                  ...message.event,
                  data: {
                    ...message.event.data,
                    marketAnalysis: undefined
                  }
                }
              };
              client.send(JSON.stringify(filteredEvent), { binary: false, compress: false, fin: true });
              shouldSend = false;
            }
            
            // Filter timeframe changes if not requested
            if (event.type === 'timeframe_change' && 
                subscription.preferences?.includeTimeframeChanges === false) {
              shouldSend = false;
            }
            
            // Apply custom filter if provided
            if (shouldSend && filterFn && !filterFn(client)) {
              shouldSend = false;
            }
            
            if (shouldSend) {
              client.send(messageStr, { binary: false, compress: false, fin: true });
              sentCount++;
            }
          } else {
            skippedCount++;
          }
        }
      }
    }
  });
  
  if (event.type === 'trade' || event.type === 'price_update' || event.type === 'external_market_pressure') {
    console.log(`📡 [WS BROADCAST] ${event.type} to ${sentCount} clients for ${simulationId} (skipped ${skippedCount} pending)`);
  }
}

// Helper function to broadcast to all connected clients
export function broadcastToAll(wss: WebSocketServer, message: any) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr, { binary: false, compress: false, fin: true });
      sentCount++;
    }
  });
  
  console.log(`📡 [WS BROADCAST ALL] Sent to ${sentCount} clients`);
}

// Export additional utilities
export function getSubscribedClients(wss: WebSocketServer, simulationId: string): WebSocket[] {
  const subscribedClients: WebSocket[] = [];
  
  wss.clients.forEach((client) => {
    const subscriptions = clientSubscriptions.get(client);
    if (subscriptions) {
      const hasSubscription = Array.from(subscriptions).some(sub => 
        sub.simulationId === simulationId && sub.subscriptionAttempts <= 1
      );
      if (hasSubscription) {
        subscribedClients.push(client);
      }
    }
  });
  
  return subscribedClients;
}

// Get subscription statistics with race condition info
export function getSubscriptionStats(wss: WebSocketServer): {
  totalConnections: number;
  totalSubscriptions: number;
  pendingSubscriptions: number;
  subscriptionsBySimulation: Map<string, { confirmed: number; pending: number }>;
  raceConditionPrevention: boolean;
  globalOperationLocks: number;
  completeStateCoordination: boolean;
  pauseStopResetFixed: boolean;
} {
  const stats = {
    totalConnections: wss.clients.size,
    totalSubscriptions: 0,
    pendingSubscriptions: 0,
    subscriptionsBySimulation: new Map<string, { confirmed: number; pending: number }>(),
    raceConditionPrevention: true,
    globalOperationLocks: globalOperationLocks.size,
    completeStateCoordination: true,
    pauseStopResetFixed: true
  };
  
  wss.clients.forEach((client) => {
    const subscriptions = clientSubscriptions.get(client);
    if (subscriptions) {
      subscriptions.forEach(sub => {
        stats.totalSubscriptions++;
        
        if (sub.subscriptionAttempts > 1) {
          stats.pendingSubscriptions++;
        }
        
        const current = stats.subscriptionsBySimulation.get(sub.simulationId) || { confirmed: 0, pending: 0 };
        
        if (sub.subscriptionAttempts <= 1) {
          current.confirmed++;
        } else {
          current.pending++;
        }
        
        stats.subscriptionsBySimulation.set(sub.simulationId, current);
      });
    }
  });
  
  return stats;
}