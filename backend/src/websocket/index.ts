// backend/src/websocket/index.ts
import { WebSocket, WebSocketServer } from 'ws';
import { simulationManager } from '../services/simulationManager';
import { BroadcastManager } from '../services/broadcastManager';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

export function setupWebSocketServer(
  wss: WebSocketServer, 
  broadcastManager?: BroadcastManager,
  performanceMonitor?: PerformanceMonitor
) {
  console.log('Setting up WebSocket server...');
  
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('New WebSocket connection established');
    
    // Update connection count for monitoring
    if (performanceMonitor) {
      performanceMonitor.recordWebSocketConnection(wss.clients.size);
    }
    
    // Register the client with simulation manager
    simulationManager.registerClient(ws);
    
    // Register with broadcast manager if available
    if (broadcastManager) {
      broadcastManager.registerClient(ws);
    }
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      timestamp: Date.now(),
      features: {
        compression: false, // Disabled for now
        batchUpdates: true,
        highFrequencyMode: process.env.ENABLE_HFT === 'true'
      }
    }));
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', message.type);
        
        switch (message.type) {
          case 'subscribe':
            // Handle subscription to a specific simulation
            console.log(`Client subscribed to simulation: ${message.simulationId}`);
            
            // The BroadcastManager will also handle this subscription
            // But we can send current state immediately
            const simulation = simulationManager.getSimulation(message.simulationId);
            if (simulation) {
              ws.send(JSON.stringify({
                simulationId: message.simulationId,
                event: {
                  type: 'simulation_state',
                  timestamp: Date.now(),
                  data: {
                    isRunning: simulation.isRunning,
                    isPaused: simulation.isPaused,
                    currentPrice: simulation.currentPrice,
                    priceHistory: simulation.priceHistory,
                    orderBook: simulation.orderBook,
                    activePositions: simulation.activePositions,
                    recentTrades: simulation.recentTrades.slice(0, 50),
                    traderRankings: simulation.traderRankings.slice(0, 20),
                    speed: simulation.parameters.timeCompressionFactor
                  }
                }
              }));
            }
            break;
            
          case 'setPauseState':
            // Handle pause state updates from client
            console.log(`Client set pause state for ${message.simulationId}: ${message.isPaused}`);
            // This is primarily for logging as pause state is handled via REST API
            break;
            
          case 'ping':
            // Respond to ping with pong
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now()
            }));
            break;
            
          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          timestamp: Date.now()
        }));
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      if (performanceMonitor) {
        performanceMonitor.recordWebSocketConnection(wss.clients.size);
      }
      // Cleanup is handled by simulationManager.registerClient and broadcastManager
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  console.log('WebSocket server setup complete');
}

// Helper function to broadcast to all connected clients
export function broadcastToAll(wss: WebSocketServer, message: any) {
  const messageStr = JSON.stringify(message);
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}