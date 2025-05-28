// backend/src/websocket/index.ts
import { WebSocket, WebSocketServer } from 'ws';
import { simulationManager } from '../services/simulationManager';

export function setupWebSocketServer(wss: WebSocketServer) {
  console.log('Setting up WebSocket server...');
  
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('New WebSocket connection established');
    
    // Register the client with simulation manager
    simulationManager.registerClient(ws);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      timestamp: Date.now()
    }));
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', message.type);
        
        switch (message.type) {
          case 'subscribe':
            // Handle subscription to a specific simulation
            console.log(`Client subscribed to simulation: ${message.simulationId}`);
            // You could maintain a mapping of clients to simulations here
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
      // Cleanup is handled by simulationManager.registerClient
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