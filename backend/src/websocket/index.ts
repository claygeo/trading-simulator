// backend/src/websocket/index.ts - COMPLETE FIXED VERSION
import { WebSocket, WebSocketServer } from 'ws';
// REMOVED: import { simulationManager } from '../services/simulation';
import { BroadcastManager } from '../services/broadcastManager';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

// Extended message types
interface WebSocketMessage {
  type: string;
  simulationId?: string;
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

// Track client subscriptions with enhanced metadata
const clientSubscriptions = new WeakMap<WebSocket, Set<ClientSubscription>>();
const clientIds = new WeakMap<WebSocket, string>();
const clientRetryTimers = new WeakMap<WebSocket, Map<string, NodeJS.Timeout>>();

let clientCounter = 0;

// CRITICAL FIX: Accept simulationManager as parameter instead of importing
export function setupWebSocketServer(
  wss: WebSocketServer, 
  simulationManager: any, // FIXED: Pass the instance from server.ts
  broadcastManager?: BroadcastManager,
  performanceMonitor?: PerformanceMonitor
) {
  console.log('🔧 Setting up WebSocket server with SHARED SimulationManager instance...');
  
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
          raceConditionPrevention: true
        },
        version: '2.1.0'
      }), { binary: false, compress: false, fin: true });
    } catch (error) {
      console.error('Error sending welcome message:', error);
    }
    
    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log(`${clientId} message:`, message.type, message.simulationId || '');
        
        switch (message.type) {
          case 'subscribe':
            // CRITICAL FIX: Use the passed simulationManager instance
            handleSubscriptionWithRetry(ws, message, clientId, simulationManager);
            break;
            
          case 'unsubscribe':
            handleUnsubscription(ws, message, clientId);
            break;
            
          case 'requestMarketAnalysis':
            handleMarketAnalysisRequest(ws, message, simulationManager);
            break;
            
          case 'setPauseState':
            console.log(`${clientId} set pause state for ${message.simulationId}: ${message.isPaused}`);
            break;
            
          case 'setPreferences':
            handlePreferencesUpdate(ws, message);
            break;
            
          case 'ping':
            // Respond to ping with pong - EXPLICIT TEXT FRAME
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now(),
              latency: message.timestamp ? Date.now() - message.timestamp : undefined
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
      console.log(`WebSocket connection closed: ${clientId}, code: ${code}, reason: ${reason}`);
      console.log(`Remaining clients: ${wss.clients.size - 1}`);
      
      // Clean up subscriptions and timers
      clientSubscriptions.delete(ws);
      clientIds.delete(ws);
      
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
  
  console.log('✅ WebSocket server setup complete with SHARED SimulationManager instance');
}

// CRITICAL FIX: Enhanced subscription with the SAME simulationManager instance
async function handleSubscriptionWithRetry(
  ws: WebSocket, 
  message: WebSocketMessage, 
  clientId: string,
  simulationManager: any // FIXED: Use the passed instance
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
  
  console.log(`🔔 [WS SUB] ${clientId} attempting to subscribe to simulation: ${simulationId}`);
  
  // STEP 1: Check if simulation exists in the CORRECT instance
  console.log(`🔍 [WS SUB] Checking simulation ${simulationId} in SHARED SimulationManager...`);
  const simulation = simulationManager.getSimulation(simulationId);
  
  if (!simulation) {
    console.error(`❌ [WS SUB] Simulation ${simulationId} not found in SHARED SimulationManager for ${clientId}`);
    
    // Debug: List all available simulations
    const allSimulations = simulationManager.getAllSimulations();
    console.log(`🔍 [WS SUB] Available simulations in manager:`, allSimulations.map(s => s.id));
    
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
    
    // Track subscription attempt
    const subscriptions = clientSubscriptions.get(ws);
    if (subscriptions) {
      const existingSubscription = Array.from(subscriptions).find(sub => sub.simulationId === simulationId);
      if (existingSubscription) {
        existingSubscription.subscriptionAttempts++;
        
        // Limit retry attempts
        if (existingSubscription.subscriptionAttempts > 10) {
          console.error(`❌ [WS SUB] Max retry attempts reached for ${simulationId} and ${clientId}`);
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
      const attempts = Array.from(subscriptions || []).find(s => s.simulationId === simulationId)?.subscriptionAttempts || 1;
      const retryDelay = Math.min(5000, 500 * Math.pow(2, attempts - 1)); // Cap at 5 seconds
      
      console.log(`⏰ [WS SUB] Scheduling retry for ${simulationId} in ${retryDelay}ms (attempt ${attempts})`);
      
      const retryTimer = setTimeout(() => {
        console.log(`🔄 [WS SUB] Retrying subscription for ${simulationId} (attempt ${attempts + 1})`);
        handleSubscriptionWithRetry(ws, message, clientId, simulationManager);
      }, retryDelay);
      
      retryTimers.set(simulationId, retryTimer);
    }
    
    // Send pending status to client
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
  
  // STEP 3: Simulation is ready - proceed with subscription
  console.log(`✅ [WS SUB] Simulation ${simulationId} is ready, proceeding with subscription for ${clientId}`);
  
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
  
  // Prepare enhanced simulation state
  const enhancedState = {
    isRunning: simulation.isRunning,
    isPaused: simulation.isPaused,
    currentPrice: simulation.currentPrice,
    priceHistory: simulation.priceHistory,
    orderBook: simulation.orderBook,
    activePositions: simulation.activePositions,
    recentTrades: simulation.recentTrades.slice(0, 200),
    traderRankings: simulation.traderRankings.slice(0, 20),
    speed: simulation.parameters.timeCompressionFactor,
    marketConditions: simulation.marketConditions,
    parameters: {
      initialPrice: simulation.parameters.initialPrice,
      volatilityFactor: simulation.parameters.volatilityFactor,
      timeCompressionFactor: simulation.parameters.timeCompressionFactor
    },
    externalMarketMetrics: simulation.externalMarketMetrics,
    registrationStatus: 'ready',
    cleanStart: simulation.priceHistory.length === 0,
    candleCount: simulation.priceHistory.length
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
    message: 'Successfully subscribed to ready simulation using SHARED SimulationManager'
  }), { binary: false, compress: false, fin: true });
  
  console.log(`🎉 [WS SUB] SUBSCRIPTION SUCCESS! ${clientId} subscribed to ${simulationId} using SHARED manager, trades: ${enhancedState.recentTrades.length}, candles: ${enhancedState.candleCount}`);
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
  
  ws.send(JSON.stringify({
    simulationId: simulationId,
    event: {
      type: 'market_analysis',
      timestamp: Date.now(),
      data: {
        currentPrice: simulation.currentPrice,
        marketConditions: simulation.marketConditions,
        priceHistory: simulation.priceHistory.slice(-50),
        activeScenario: (simulation as any).activeScenario || null
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
    serverStats: {
      totalClients: ws.readyState === WebSocket.OPEN ? 
        Array.from((ws as any)._server?.clients || []).length : 0,
      raceConditionPrevention: true,
      sharedSimulationManager: true
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
  
  if (event.type === 'trade' || event.type === 'price_update') {
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
} {
  const stats = {
    totalConnections: wss.clients.size,
    totalSubscriptions: 0,
    pendingSubscriptions: 0,
    subscriptionsBySimulation: new Map<string, { confirmed: number; pending: number }>()
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