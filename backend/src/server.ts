// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import apiRoutes from './api/routes';
import { simulationManager } from './services/simulationManager';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Allow audio files from wikimedia
      "media-src": ["'self'", "https://upload.wikimedia.org"]
    }
  }
}));
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../public')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });
}

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Set up WebSocket handlers
wss.on('connection', (ws: WebSocket, req) => {
  console.log('Client connected to WebSocket');
  
  // Register the client with the simulation manager
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
          // Send current simulation state if it exists
          const simulation = simulationManager.getSimulation(message.simulationId);
          if (simulation) {
            ws.send(JSON.stringify({
              type: 'simulation_state',
              simulationId: message.simulationId,
              data: {
                isRunning: simulation.isRunning,
                isPaused: simulation.isPaused,
                currentPrice: simulation.currentPrice,
                speed: simulation.parameters.timeCompressionFactor
              },
              timestamp: Date.now()
            }));
          }
          break;
          
        case 'setPauseState':
          // Handle pause state updates from client
          console.log(`Client set pause state for ${message.simulationId}: ${message.isPaused}`);
          // Note: Actual pause/resume is handled via REST API endpoints
          // This message is mainly for logging and coordination
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
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
            timestamp: Date.now()
          }));
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
    console.log('Client disconnected from WebSocket');
    // Cleanup is handled automatically by simulationManager.registerClient
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Helper function to broadcast to all connected clients
export function broadcastToAll(message: any) {
  const messageStr = JSON.stringify(message);
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;