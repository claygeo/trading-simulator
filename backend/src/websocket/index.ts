// backend/src/websocket/index.ts - FIXED: Race Condition Prevention & Complete setPauseState Handler + ATTEMPTS VARIABLE FIX
import { WebSocket, WebSocketServer } from 'ws';
import { BroadcastManager } from '../services/broadcastManager';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

// Extended message types
interface WebSocketMessage {
  type: string;
  simulationId?: string;
  mode?: string; // For TPS mode changes
  isPaused?: boolean; // For pause state changes
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

// 🚨 CRITICAL FIX: Enhanced client state tracking for race condition prevention
interface ClientState {
  id: string;
  currentSimulation: string | null;
  subscriptionStatus: 'none' | 'subscribing' | 'subscribed' | 'unsubscribing';
  lastMessageTime: number;
  messageCount: number;
  pauseStateRequests: Map<string, { timestamp: number; isPaused: boolean }>;
  pendingOperations: Set<string>;
}

// Track client subscriptions with enhanced metadata
const clientSubscriptions = new WeakMap<WebSocket, Set<ClientSubscription>>();
const clientIds = new WeakMap<WebSocket, string>();
const clientRetryTimers = new WeakMap<WebSocket, Map<string, NodeJS.Timeout>>();

// 🚨 CRITICAL FIX: Enhanced client state tracking
const clientStates = new WeakMap<WebSocket, ClientState>();
const simulationClientMapping = new Map<string, Set<WebSocket>>();

let clientCounter = 0;

// 🚨 CRITICAL FIX: Global operation locks to prevent race conditions
const globalOperationLocks = new Map<string, Set<string>>(); // simulationId -> Set of operation types

// CRITICAL FIX: Accept simulationManager as parameter instead of importing
export function setupWebSocketServer(
  wss: WebSocketServer, 
  simulationManager: any, // Pass the instance from server.ts
  broadcastManager?: BroadcastManager,
  performanceMonitor?: PerformanceMonitor
) {
  console.log('🔧 Setting up WebSocket server with RACE CONDITION PREVENTION and enhanced pause handling...');
  
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
  }, 30000); // Every 30 seconds
  
  wss.on('connection', (ws: WebSocket, req) => {
    const clientId = `client-${++clientCounter}`;
    clientIds.set(ws, clientId);
    
    // 🚨 CRITICAL FIX: Initialize enhanced client state
    const clientState: ClientState = {
      id: clientId,
      currentSimulation: null,
      subscriptionStatus: 'none',
      lastMessageTime: Date.now(),
      messageCount: 0,
      pauseStateRequests: new Map(),
      pendingOperations: new Set()
    };
    clientStates.set(ws, clientState);
    
    console.log(`New WebSocket connection established: ${clientId}`);
    console.log(`Total clients: ${wss.clients.size}`);
    
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
      console.error('Error registering client with simulation manager:', error);
    }
    
    // Register with broadcast manager if available
    if (broadcastManager) {
      try {
        broadcastManager.registerClient(ws);
      } catch (error) {
        console.error('Error registering client with broadcast manager:', error);
      }
    }
    
    // Send enhanced welcome message with EXPLICIT TEXT FRAME
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
          tpsModeSupport: true,      // TPS mode support
          stressTestSupport: true,   // Stress test support
          initialCandleJumpPrevention: true, // Fixed initial candle jump
          pauseResumeSupport: true,  // 🚨 CRITICAL FIX: Enhanced pause/resume support
          enhancedStateManagement: true // NEW: Enhanced state management
        },
        version: '2.5.1' // Version bump for attempts variable fix
      }), { binary: false, compress: false, fin: true });
    } catch (error) {
      console.error('Error sending welcome message:', error);
    }
    
    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        const clientState = clientStates.get(ws);
        
        if (clientState) {
          clientState.lastMessageTime = Date.now();
          clientState.messageCount++;
        }
        
        console.log(`${clientId} message:`, message.type, message.simulationId || '', message.mode || '', message.isPaused !== undefined ? `paused=${message.isPaused}` : '');
        
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
            
          // 🚨 CRITICAL FIX: Enhanced pause state handling with race condition prevention
          case 'setPauseState':
            handlePauseStateChangeWithRaceConditionPrevention(ws, message, clientId, simulationManager);
            break;
            
          case 'setPreferences':
            handlePreferencesUpdate(ws, message);
            break;
            
          // TPS mode changes
          case 'set_tps_mode':
            handleTPSModeChange(ws, message, clientId, simulationManager);
            break;
            
          // Stress test commands
          case 'trigger_liquidation_cascade':
            handleLiquidationCascade(ws, message, clientId, simulationManager);
            break;
            
          case 'get_tps_status':
            handleTPSStatusRequest(ws, message, clientId, simulationManager);
            break;
            
          case 'get_stress_capabilities':
            handleStressCapabilitiesRequest(ws, message, clientId, simulationManager);
            break;
            
          case 'ping':
            // Respond to ping with pong - EXPLICIT TEXT FRAME
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now(),
              latency: message.timestamp ? Date.now() - message.timestamp : undefined,
              clientState: clientState ? {
                currentSimulation: clientState.currentSimulation,
                subscriptionStatus: clientState.subscriptionStatus,
                messageCount: clientState.messageCount,
                pendingOperations: Array.from(clientState.pendingOperations)
              } : null
            }), { binary: false, compress: false, fin: true });
            break;
            
          case 'debug':
            // Send debug info
            handleDebugRequest(ws, clientId, broadcastManager);
            break;
            
          default:
            console.log(`Unknown message type from ${clientId}:`, message.type);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${message.type}`,
              timestamp: Date.now()
            }), { binary: false, compress: false, fin: true });
        }
      } catch (error) {
        console.error(`Error parsing WebSocket message from ${clientId}:`, error);
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
      
      console.log(`WebSocket connection closed: ${clientId}, code: ${code}, reason: ${reason}`);
      console.log(`Remaining clients: ${wss.clients.size - 1}`);
      
      // 🚨 CRITICAL FIX: Enhanced cleanup with race condition prevention
      if (clientState) {
        // Clear any pending operations for this client
        clientState.pendingOperations.forEach(operationId => {
          console.log(`🧹 CLEANUP: Clearing pending operation ${operationId} for disconnected client ${clientId}`);
        });
        
        // Remove from simulation mapping
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
      console.error(`WebSocket error for ${clientId}:`, error);
    });
  });
  
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });
  
  console.log('✅ WebSocket server setup complete with RACE CONDITION PREVENTION and enhanced pause handling');
}

// 🚨 CRITICAL FIX: Enhanced pause state change handler with race condition prevention
async function handlePauseStateChangeWithRaceConditionPrevention(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId, isPaused } = message;
  
  if (!simulationId) {
    ws.send(JSON.stringify({
      type: 'setPauseState_response',
      timestamp: Date.now(),
      success: false,
      error: 'simulationId required for pause state change'
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  if (isPaused === undefined) {
    ws.send(JSON.stringify({
      type: 'setPauseState_response',
      timestamp: Date.now(),
      success: false,
      error: 'isPaused boolean value required for pause state change'
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  const clientState = clientStates.get(ws);
  if (!clientState) {
    console.error(`❌ [PAUSE STATE] No client state found for ${clientId}`);
    return;
  }
  
  // 🚨 CRITICAL FIX: Race condition prevention - check for pending operations
  const operationId = `pause_${simulationId}_${Date.now()}`;
  
  // Check if there's already a pending pause operation for this simulation
  if (!globalOperationLocks.has(simulationId)) {
    globalOperationLocks.set(simulationId, new Set());
  }
  
  const simulationLocks = globalOperationLocks.get(simulationId)!;
  
  // 🚨 CRITICAL FIX: Check for DUPLICATE PAUSE REQUESTS from same client
  const existingRequest = clientState.pauseStateRequests.get(simulationId);
  if (existingRequest && Date.now() - existingRequest.timestamp < 1000) {
    console.warn(`⚠️ [PAUSE STATE] Duplicate request prevented: ${clientId} already requested pause state for ${simulationId} within 1 second`);
    ws.send(JSON.stringify({
      type: 'setPauseState_response',
      timestamp: Date.now(),
      simulationId: simulationId,
      success: false,
      error: 'Duplicate pause state request - please wait before retrying',
      data: null
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  // Check for conflicting operations
  const hasPendingPause = Array.from(simulationLocks).some(lock => lock.startsWith('pause_'));
  if (hasPendingPause) {
    console.warn(`⚠️ [PAUSE STATE] Race condition prevented: existing pause operation for ${simulationId}`);
    ws.send(JSON.stringify({
      type: 'setPauseState_response',
      timestamp: Date.now(),
      simulationId: simulationId,
      success: false,
      error: 'Another pause state change is already in progress',
      data: null
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  // 🚨 CRITICAL FIX: Lock this operation
  simulationLocks.add(operationId);
  clientState.pendingOperations.add(operationId);
  
  // Track this pause request
  clientState.pauseStateRequests.set(simulationId, {
    timestamp: Date.now(),
    isPaused: isPaused
  });
  
  console.log(`⏸️▶️ [PAUSE STATE] ${clientId} requesting pause state change for ${simulationId}: isPaused=${isPaused} (operation: ${operationId})`);
  
  try {
    // Get the simulation to check current state
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      console.error(`❌ [PAUSE STATE] Simulation ${simulationId} not found for pause state change`);
      ws.send(JSON.stringify({
        type: 'setPauseState_response',
        timestamp: Date.now(),
        simulationId: simulationId,
        success: false,
        error: `Simulation ${simulationId} not found`,
        data: null
      }), { binary: false, compress: false, fin: true });
      return;
    }
    
    console.log(`🔍 [PAUSE STATE] Current simulation state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
    
    let result: { success: boolean; error?: string; action?: string; newState?: any };
    
    // 🚨 CRITICAL FIX: Enhanced pause/resume logic with race condition awareness
    if (isPaused) {
      // Client wants to pause the simulation
      if (!simulation.isRunning) {
        result = {
          success: false,
          error: `Cannot pause simulation ${simulationId} because it is not running (isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused})`
        };
      } else if (simulation.isPaused) {
        result = {
          success: false,
          error: `Simulation ${simulationId} is already paused (isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused})`
        };
      } else {
        // Simulation is running and not paused - can pause it
        try {
          console.log(`⏸️ [PAUSE STATE] Executing pause for ${simulationId}`);
          await simulationManager.pauseSimulation(simulationId);
          
          // Get updated state
          const updatedSimulation = simulationManager.getSimulation(simulationId);
          
          result = {
            success: true,
            action: 'paused',
            newState: {
              isRunning: updatedSimulation?.isRunning || false,
              isPaused: updatedSimulation?.isPaused || true
            }
          };
          console.log(`✅ [PAUSE STATE] Successfully paused simulation ${simulationId}`);
        } catch (error) {
          result = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error pausing simulation'
          };
          console.error(`❌ [PAUSE STATE] Error pausing simulation ${simulationId}:`, error);
        }
      }
    } else {
      // Client wants to resume/start the simulation
      if (!simulation.isRunning) {
        // Simulation is not running - start it
        try {
          console.log(`🚀 [PAUSE STATE] Executing start for ${simulationId}`);
          await simulationManager.startSimulation(simulationId);
          
          // Get updated state
          const updatedSimulation = simulationManager.getSimulation(simulationId);
          
          result = {
            success: true,
            action: 'started',
            newState: {
              isRunning: updatedSimulation?.isRunning || true,
              isPaused: updatedSimulation?.isPaused || false
            }
          };
          console.log(`✅ [PAUSE STATE] Successfully started simulation ${simulationId}`);
        } catch (error) {
          result = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error starting simulation'
          };
          console.error(`❌ [PAUSE STATE] Error starting simulation ${simulationId}:`, error);
        }
      } else if (simulation.isPaused) {
        // Simulation is running but paused - resume it
        try {
          console.log(`▶️ [PAUSE STATE] Executing resume for ${simulationId}`);
          await simulationManager.resumeSimulation(simulationId);
          
          // Get updated state
          const updatedSimulation = simulationManager.getSimulation(simulationId);
          
          result = {
            success: true,
            action: 'resumed',
            newState: {
              isRunning: updatedSimulation?.isRunning || true,
              isPaused: updatedSimulation?.isPaused || false
            }
          };
          console.log(`✅ [PAUSE STATE] Successfully resumed simulation ${simulationId}`);
        } catch (error) {
          result = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error resuming simulation'
          };
          console.error(`❌ [PAUSE STATE] Error resuming simulation ${simulationId}:`, error);
        }
      } else {
        // Simulation is already running and not paused
        result = {
          success: false,
          error: `Simulation ${simulationId} is already running and not paused (isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused})`
        };
      }
    }
    
    // 🚨 CRITICAL FIX: Send SINGLE response back to client (prevent duplicates)
    if (result.success) {
      // Send success response with updated state
      ws.send(JSON.stringify({
        type: 'setPauseState_response',
        simulationId: simulationId,
        timestamp: Date.now(),
        success: true,
        action: result.action,
        data: result.newState,
        message: `Simulation ${result.action} successfully`
      }), { binary: false, compress: false, fin: true });
      
      console.log(`📡 [PAUSE STATE] Sent success response to ${clientId}: action=${result.action}, newState=${JSON.stringify(result.newState)}`);
      
      // 🚨 CRITICAL FIX: Broadcast state change to OTHER clients for this simulation (not sender)
      const simulationClients = simulationClientMapping.get(simulationId);
      if (simulationClients && simulationClients.size > 1) {
        const stateChangeEvent = {
          type: 'pause_state_changed',
          simulationId: simulationId,
          timestamp: Date.now(),
          success: true,
          action: result.action,
          newState: result.newState,
          triggeredBy: clientId
        };
        
        let broadcastCount = 0;
        simulationClients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            try {
              client.send(JSON.stringify(stateChangeEvent), { binary: false, compress: false, fin: true });
              broadcastCount++;
            } catch (broadcastError) {
              console.error(`❌ [PAUSE STATE] Error broadcasting to client:`, broadcastError);
            }
          }
        });
        
        console.log(`📡 [PAUSE STATE] Broadcasted state change to ${broadcastCount} other clients`);
      }
      
    } else {
      // Send error response
      ws.send(JSON.stringify({
        type: 'setPauseState_response',
        simulationId: simulationId,
        timestamp: Date.now(),
        success: false,
        error: result.error || 'Unknown error changing pause state',
        data: null
      }), { binary: false, compress: false, fin: true });
      
      console.error(`❌ [PAUSE STATE] Sent error response to ${clientId}: ${result.error}`);
    }
    
  } catch (error) {
    console.error(`❌ [PAUSE STATE] Unexpected error handling pause state change:`, error);
    ws.send(JSON.stringify({
      type: 'setPauseState_response',
      simulationId: simulationId,
      timestamp: Date.now(),
      success: false,
      error: 'Internal error handling pause state change',
      data: null
    }), { binary: false, compress: false, fin: true });
  } finally {
    // 🚨 CRITICAL FIX: Always clean up locks and pending operations
    simulationLocks.delete(operationId);
    clientState.pendingOperations.delete(operationId);
    
    // Clean up empty lock sets
    if (simulationLocks.size === 0) {
      globalOperationLocks.delete(simulationId);
    }
    
    console.log(`🔓 [PAUSE STATE] Released operation lock ${operationId} for ${simulationId}`);
  }
}

// FIXED: Handle TPS mode changes with proper error handling
async function handleTPSModeChange(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId, mode } = message;
  
  if (!simulationId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for TPS mode change',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  if (!mode) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'mode required for TPS mode change',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  console.log(`🚀 [TPS] ${clientId} requesting TPS mode change to ${mode} for simulation ${simulationId}`);
  
  try {
    // Get the simulation
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      console.error(`❌ [TPS] Simulation ${simulationId} not found for TPS mode change`);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Simulation ${simulationId} not found`,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
      return;
    }
    
    // Validate mode
    const validModes = ['NORMAL', 'BURST', 'STRESS', 'HFT'];
    if (!validModes.includes(mode)) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Invalid TPS mode. Valid modes: ${validModes.join(', ')}`,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
      return;
    }
    
    // FIXED: Use the async setTPSMode method correctly
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
      
      // FIXED: Broadcast the mode change to all subscribed clients properly
      broadcastTPSModeChange(simulationId, mode, result.metrics, simulationManager);
      
    } else {
      console.error(`❌ [TPS] Failed to change TPS mode: ${result.error}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: result.error || 'Failed to change TPS mode',
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
    }
    
  } catch (error) {
    console.error(`❌ [TPS] Error changing TPS mode:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Internal error changing TPS mode',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
  }
}

// FIXED: Handle liquidation cascade trigger with better error handling
async function handleLiquidationCascade(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for liquidation cascade',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  console.log(`💥 [LIQUIDATION] ${clientId} triggering liquidation cascade for simulation ${simulationId}`);
  
  try {
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Simulation ${simulationId} not found`,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
      return;
    }
    
    // Check if simulation is in appropriate mode
    const currentMode = simulation.currentTPSMode || 'NORMAL';
    if (currentMode !== 'STRESS' && currentMode !== 'HFT') {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Liquidation cascade requires STRESS or HFT mode, current mode is ${currentMode}`,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
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
        data: {
          ordersGenerated: result.ordersGenerated,
          estimatedImpact: result.estimatedImpact,
          cascadeSize: result.cascadeSize
        }
      }), { binary: false, compress: false, fin: true });
      
    } else {
      console.error(`❌ [LIQUIDATION] Failed to trigger liquidation cascade: ${result.error}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: result.error || 'Failed to trigger liquidation cascade',
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
    }
    
  } catch (error) {
    console.error(`❌ [LIQUIDATION] Error triggering liquidation cascade:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Internal error triggering liquidation cascade',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
  }
}

// FIXED: Handle TPS status requests with better data
async function handleTPSStatusRequest(
  ws: WebSocket,
  message: WebSocketMessage,
  clientId: string,
  simulationManager: any
) {
  const { simulationId } = message;
  
  if (!simulationId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for TPS status request',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  try {
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Simulation ${simulationId} not found`,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
      return;
    }
    
    const currentMode = simulation.currentTPSMode || 'NORMAL';
    const targetTPS = getTargetTPSForMode(currentMode);
    
    // FIXED: Get live metrics from simulation
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
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Internal error getting TPS status',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
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
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for stress capabilities request',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  try {
    const simulation = simulationManager.getSimulation(simulationId);
    
    if (!simulation) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Simulation ${simulationId} not found`,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
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
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Internal error getting stress capabilities',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
  }
}

// FIXED: Broadcast TPS mode change to all clients properly
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

// 🚨 CRITICAL FIX: Enhanced subscription with race condition prevention and ATTEMPTS VARIABLE FIX
async function handleSubscriptionWithRetry(
  ws: WebSocket, 
  message: WebSocketMessage, 
  clientId: string,
  simulationManager: any // Use the passed instance
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
  
  // 🚨 CRITICAL FIX: Race condition prevention
  if (clientState.subscriptionStatus === 'subscribing') {
    console.warn(`⚠️ [WS SUB] Race condition prevented: ${clientId} already subscribing to ${simulationId}`);
    return;
  }
  
  clientState.subscriptionStatus = 'subscribing';
  
  console.log(`🔔 [WS SUB] ${clientId} attempting to subscribe to simulation: ${simulationId}`);
  
  // STEP 1: Check if simulation exists in the CORRECT instance
  console.log(`🔍 [WS SUB] Checking simulation ${simulationId} in SHARED SimulationManager...`);
  const simulation = simulationManager.getSimulation(simulationId);
  
  if (!simulation) {
    console.error(`❌ [WS SUB] Simulation ${simulationId} not found in SHARED SimulationManager for ${clientId}`);
    
    // Debug: List all available simulations
    const allSimulations = simulationManager.getAllSimulations();
    console.log(`🔍 [WS SUB] Available simulations in manager:`, allSimulations.map(s => s.id));
    
    clientState.subscriptionStatus = 'none';
    
    ws.send(JSON.stringify({
      type: 'error',
      message: `Simulation ${simulationId} not found`,
      availableSimulations: allSimulations.map(s => s.id),
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  console.log(`✅ [WS SUB] FOUND simulation ${simulationId} in SHARED SimulationManager!`);
  
  // STEP 2: Check if simulation is ready for subscriptions
  const isReady = simulationManager.isSimulationReady(simulationId);
  
  if (!isReady) {
    console.log(`⏳ [WS SUB] Simulation ${simulationId} not ready yet, will retry for ${clientId}`);
    
    // 🚨 CRITICAL FIX: Properly get attempts count without undefined variable error
    const subscriptions = clientSubscriptions.get(ws);
    let currentAttempts = 1;
    
    if (subscriptions) {
      const existingSubscription = Array.from(subscriptions).find(sub => sub.simulationId === simulationId);
      if (existingSubscription) {
        existingSubscription.subscriptionAttempts++;
        currentAttempts = existingSubscription.subscriptionAttempts;
        
        // Limit retry attempts
        if (currentAttempts > 10) {
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
        currentAttempts = 1;
      }
    }
    
    // Set up retry timer
    const retryTimers = clientRetryTimers.get(ws);
    if (retryTimers) {
      // Clear existing timer for this simulation
      const existingTimer = retryTimers.get(simulationId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // Set new retry timer with exponential backoff
      const retryDelay = Math.min(5000, 500 * Math.pow(2, currentAttempts - 1)); // Cap at 5 seconds
      
      console.log(`⏰ [WS SUB] Scheduling retry for ${simulationId} in ${retryDelay}ms (attempt ${currentAttempts})`);
      
      const retryTimer = setTimeout(() => {
        console.log(`🔄 [WS SUB] Retrying subscription for ${simulationId} (attempt ${currentAttempts + 1})`);
        handleSubscriptionWithRetry(ws, message, clientId, simulationManager);
      }, retryDelay);
      
      retryTimers.set(simulationId, retryTimer);
    }
    
    // Send pending status to client
    ws.send(JSON.stringify({
      type: 'subscription_pending',
      simulationId: simulationId,
      message: 'Simulation still registering, will retry automatically',
      retryAttempt: currentAttempts,
      retryDelay: retryDelay,
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    
    return;
  }
  
  // STEP 3: Simulation is ready - proceed with subscription
  console.log(`✅ [WS SUB] Simulation ${simulationId} is ready, proceeding with subscription for ${clientId}`);
  
  // 🚨 CRITICAL FIX: Update client state and mapping
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
  
  console.log(`📡 [WS SUB] Sending initial state for simulation ${simulationId} to ${clientId} - WITH CANDLE JUMP PREVENTION`);
  
  // FIXED: Get live TPS metrics for initial state
  const liveMetrics = simulationManager.getLiveTPSMetrics(simulationId);
  
  // 🔧 CRITICAL FIX: Enhanced simulation state WITHOUT candle data if simulation is not running
  const isSimulationActuallyRunning = simulation.isRunning && !simulation.isPaused;
  
  const enhancedState = {
    isRunning: simulation.isRunning,
    isPaused: simulation.isPaused,
    currentPrice: simulation.currentPrice,
    // 🔧 CRITICAL FIX: Only include price history if simulation is actually running
    priceHistory: isSimulationActuallyRunning ? simulation.priceHistory : [],
    orderBook: simulation.orderBook,
    activePositions: simulation.activePositions,
    // 🔧 CRITICAL FIX: Only include recent trades if simulation is actually running
    recentTrades: isSimulationActuallyRunning ? simulation.recentTrades.slice(0, 200) : [],
    traderRankings: simulation.traderRankings.slice(0, 20),
    speed: simulation.parameters.timeCompressionFactor,
    marketConditions: simulation.marketConditions,
    parameters: {
      initialPrice: simulation.parameters.initialPrice,
      volatilityFactor: simulation.parameters.volatilityFactor,
      timeCompressionFactor: simulation.parameters.timeCompressionFactor
    },
    externalMarketMetrics: liveMetrics || simulation.externalMarketMetrics,
    registrationStatus: 'ready',
    // 🔧 CRITICAL FIX: Use actual running state instead of candle count
    cleanStart: !isSimulationActuallyRunning || (simulation.priceHistory?.length || 0) === 0,
    candleCount: isSimulationActuallyRunning ? (simulation.priceHistory?.length || 0) : 0,
    // TPS mode information
    currentTPSMode: simulation.currentTPSMode || 'NORMAL',
    tpsSupport: true,
    stressTestCapabilities: {
      supportedModes: ['NORMAL', 'BURST', 'STRESS', 'HFT'],
      liquidationCascade: true,
      mevBotSimulation: true
    },
    // 🔧 CRITICAL FIX: Add flag to indicate if this is a fresh connection
    initialCandleJumpPrevented: true,
    actuallyRunning: isSimulationActuallyRunning,
    // 🚨 CRITICAL FIX: Enhanced pause state information with race condition prevention
    canStart: !simulation.isRunning || simulation.isPaused,
    canPause: simulation.isRunning && !simulation.isPaused,
    canResume: simulation.isRunning && simulation.isPaused,
    canStop: simulation.isRunning,
    raceConditionPrevention: true
  };
  
  ws.send(JSON.stringify({
    simulationId: simulationId,
    event: {
      type: 'simulation_state',
      timestamp: Date.now(),
      data: enhancedState
    }
  }), { binary: false, compress: false, fin: true });
  
  // Send confirmation - EXPLICIT TEXT FRAME
  ws.send(JSON.stringify({
    type: 'subscription_confirmed',
    simulationId: simulationId,
    timestamp: Date.now(),
    preferences: preferences,
    registrationStatus: 'ready',
    tpsSupport: true,
    currentTPSMode: enhancedState.currentTPSMode,
    // 🔧 CRITICAL FIX: Enhanced confirmation message
    initialCandleJumpPrevented: true,
    actuallyRunning: isSimulationActuallyRunning,
    candleDataIncluded: isSimulationActuallyRunning,
    pauseResumeSupport: true, // 🚨 CRITICAL FIX: Indicate pause/resume support
    raceConditionPrevention: true, // NEW: Indicate race condition prevention
    attemptsVariableFixed: true, // 🚨 NEW: Indicate attempts variable is fixed
    message: `Successfully subscribed to simulation ${simulationId} using SHARED SimulationManager with enhanced pause/resume support and race condition prevention`
  }), { binary: false, compress: false, fin: true });
  
  console.log(`🎉 [WS SUB] SUBSCRIPTION SUCCESS! ${clientId} subscribed to ${simulationId} using SHARED manager, trades: ${enhancedState.recentTrades.length}, candles: ${enhancedState.candleCount}, TPS mode: ${enhancedState.currentTPSMode}, actuallyRunning: ${isSimulationActuallyRunning}, pauseResumeEnabled: true, raceConditionPrevention: true, attemptsVariableFixed: true`);
}

// Handle subscription with preferences (original function, modified to be race-condition aware)
function handleSubscription(ws: WebSocket, message: WebSocketMessage, clientId: string, simulationManager: any) {
  // Redirect to the new retry-enabled function
  handleSubscriptionWithRetry(ws, message, clientId, simulationManager);
}

// Handle unsubscription
function handleUnsubscription(ws: WebSocket, message: WebSocketMessage, clientId: string) {
  const { simulationId } = message;
  
  if (!simulationId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for unsubscription',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
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
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for market analysis request',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  const simulation = simulationManager.getSimulation(simulationId);
  if (!simulation) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Simulation ${simulationId} not found`,
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  // FIXED: Get live TPS metrics for market analysis
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
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId and preferences required',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
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
function handleDebugRequest(ws: WebSocket, clientId: string, broadcastManager?: BroadcastManager) {
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
      pauseStateRequests: Array.from(clientState.pauseStateRequests.entries())
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
      pauseResumeSupport: true, // 🚨 CRITICAL FIX: Include pause/resume support in debug info
      enhancedStateManagement: true,
      attemptsVariableFixed: true // 🚨 NEW: Include attempts variable fix status
    }
  };
  
  if (broadcastManager) {
    debugInfo.serverStats = {
      ...debugInfo.serverStats,
      ...broadcastManager.getStats()
    };
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
    console.log(`Broadcast ${event.type} to ${sentCount} clients for simulation ${simulationId} (skipped ${skippedCount} pending)`);
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
  
  console.log(`Broadcast to all: sent to ${sentCount} clients`);
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
  attemptsVariableFixed: boolean;
} {
  const stats = {
    totalConnections: wss.clients.size,
    totalSubscriptions: 0,
    pendingSubscriptions: 0,
    subscriptionsBySimulation: new Map<string, { confirmed: number; pending: number }>(),
    raceConditionPrevention: true,
    globalOperationLocks: globalOperationLocks.size,
    attemptsVariableFixed: true // 🚨 NEW: Indicate attempts variable is fixed
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