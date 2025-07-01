// backend/src/websocket/index.ts - FULLY FIXED TEXT FRAME ONLY
import { WebSocket, WebSocketServer } from 'ws';
import { simulationManager } from '../services/simulation';
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
  preferences?: {
    includeMarketAnalysis?: boolean;
    includeTimeframeChanges?: boolean;
  };
}

// Track client subscriptions
const clientSubscriptions = new WeakMap<WebSocket, Set<ClientSubscription>>();
const clientIds = new WeakMap<WebSocket, string>();

let clientCounter = 0;

export function setupWebSocketServer(
  wss: WebSocketServer, 
  broadcastManager?: BroadcastManager,
  performanceMonitor?: PerformanceMonitor
) {
  console.log('Setting up WebSocket server with enhanced debugging...');
  
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
    
    // Initialize client subscriptions
    clientSubscriptions.set(ws, new Set());
    
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
          realtimeAdaptation: true
        },
        version: '2.0.0'
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
            handleSubscription(ws, message, clientId);
            break;
            
          case 'unsubscribe':
            handleUnsubscription(ws, message, clientId);
            break;
            
          case 'requestMarketAnalysis':
            handleMarketAnalysisRequest(ws, message);
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
      
      // Clean up subscriptions
      clientSubscriptions.delete(ws);
      clientIds.delete(ws);
      
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
  
  console.log('WebSocket server setup complete');
}

// Handle subscription with preferences
function handleSubscription(ws: WebSocket, message: WebSocketMessage, clientId: string) {
  const { simulationId, preferences } = message;
  
  if (!simulationId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'simulationId required for subscription',
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
    return;
  }
  
  console.log(`${clientId} subscribing to simulation: ${simulationId}`);
  
  // Track subscription
  const subscriptions = clientSubscriptions.get(ws);
  if (subscriptions) {
    subscriptions.add({
      simulationId,
      subscribedAt: Date.now(),
      preferences: preferences || {
        includeMarketAnalysis: true,
        includeTimeframeChanges: true
      }
    });
  }
  
  // Get simulation and send current state
  const simulation = simulationManager.getSimulation(simulationId);
  if (simulation) {
    console.log(`Sending initial state for simulation ${simulationId} to ${clientId}`);
    
    // Prepare enhanced simulation state
    const enhancedState = {
      isRunning: simulation.isRunning,
      isPaused: simulation.isPaused,
      currentPrice: simulation.currentPrice,
      priceHistory: simulation.priceHistory,
      orderBook: simulation.orderBook,
      activePositions: simulation.activePositions,
      recentTrades: simulation.recentTrades.slice(0, 200), // Send more trades initially
      traderRankings: simulation.traderRankings.slice(0, 20),
      speed: simulation.parameters.timeCompressionFactor,
      marketConditions: simulation.marketConditions,
      parameters: {
        initialPrice: simulation.parameters.initialPrice,
        volatilityFactor: simulation.parameters.volatilityFactor,
        timeCompressionFactor: simulation.parameters.timeCompressionFactor
      },
      externalMarketMetrics: simulation.externalMarketMetrics
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
      preferences: preferences
    }), { binary: false, compress: false, fin: true });
    
    console.log(`Initial state sent to ${clientId}, trades: ${enhancedState.recentTrades.length}`);
  } else {
    console.error(`Simulation ${simulationId} not found for ${clientId}`);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Simulation ${simulationId} not found`,
      timestamp: Date.now()
    }), { binary: false, compress: false, fin: true });
  }
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
      
      ws.send(JSON.stringify({
        type: 'unsubscription_confirmed',
        simulationId: simulationId,
        timestamp: Date.now()
      }), { binary: false, compress: false, fin: true });
    }
  }
}

// Handle explicit market analysis requests
function handleMarketAnalysisRequest(ws: WebSocket, message: WebSocketMessage) {
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
  const debugInfo = {
    type: 'debug_info',
    clientId: clientId,
    timestamp: Date.now(),
    subscriptions: subscriptions ? Array.from(subscriptions).map(s => ({
      simulationId: s.simulationId,
      subscribedAt: s.subscribedAt,
      preferences: s.preferences
    })) : [],
    serverStats: {
      totalClients: ws.readyState === WebSocket.OPEN ? 
        Array.from((ws as any)._server?.clients || []).length : 0
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

// Enhanced broadcast function that respects client preferences
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
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // Check if client is subscribed to this simulation
      const subscriptions = clientSubscriptions.get(client);
      if (subscriptions) {
        const subscription = Array.from(subscriptions).find(sub => sub.simulationId === simulationId);
        
        if (subscription) {
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
            // FIXED: Use explicit text frame with all options
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
            // FIXED: Use explicit text frame with all options
            client.send(messageStr, { binary: false, compress: false, fin: true });
            sentCount++;
          }
        }
      }
    }
  });
  
  if (event.type === 'trade' || event.type === 'price_update') {
    console.log(`Broadcast ${event.type} to ${sentCount} clients for simulation ${simulationId}`);
  }
}

// Helper function to broadcast to all connected clients
export function broadcastToAll(wss: WebSocketServer, message: any) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // FIXED: Use explicit text frame with all options
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
      const hasSubscription = Array.from(subscriptions).some(sub => sub.simulationId === simulationId);
      if (hasSubscription) {
        subscribedClients.push(client);
      }
    }
  });
  
  return subscribedClients;
}

// Get subscription statistics
export function getSubscriptionStats(wss: WebSocketServer): {
  totalConnections: number;
  totalSubscriptions: number;
  subscriptionsBySimulation: Map<string, number>;
} {
  const stats = {
    totalConnections: wss.clients.size,
    totalSubscriptions: 0,
    subscriptionsBySimulation: new Map<string, number>()
  };
  
  wss.clients.forEach((client) => {
    const subscriptions = clientSubscriptions.get(client);
    if (subscriptions) {
      subscriptions.forEach(sub => {
        stats.totalSubscriptions++;
        const current = stats.subscriptionsBySimulation.get(sub.simulationId) || 0;
        stats.subscriptionsBySimulation.set(sub.simulationId, current + 1);
      });
    }
  });
  
  return stats;
}