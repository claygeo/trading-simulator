// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
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

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  // Register the client with the simulation manager
  simulationManager.registerClient(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data);
      
      // Handle client messages if needed
    } catch (error) {
      console.error('Invalid message format:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;