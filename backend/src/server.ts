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
import { TransactionQueue } from './services/transactionQueue';
import { BroadcastManager } from './services/broadcastManager';
import { PerformanceMonitor } from './monitoring/performanceMonitor';
import { setupWebSocketServer } from './websocket';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize performance optimizations
let transactionQueue: TransactionQueue;
let broadcastManager: BroadcastManager;
const performanceMonitor = new PerformanceMonitor();

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

// Performance monitoring endpoint
app.get('/api/metrics', (req, res) => {
  const format = req.query.format as string || 'json';
  const metrics = performanceMonitor.exportMetrics(format as 'prometheus' | 'json');
  
  if (format === 'prometheus') {
    res.set('Content-Type', 'text/plain');
  } else {
    res.set('Content-Type', 'application/json');
  }
  
  res.send(metrics);
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const queueStats = transactionQueue ? await transactionQueue.getQueueStats() : null;
    const broadcastStats = broadcastManager ? broadcastManager.getStats() : null;
    
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      services: {
        queue: queueStats,
        broadcast: broadcastStats,
        performance: performanceMonitor.getMetrics()
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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

// Initialize performance-optimized services
async function initializeServices() {
  try {
    // Initialize transaction queue if Redis is available
    if (process.env.ENABLE_REDIS === 'true') {
      console.log('Initializing transaction queue...');
      transactionQueue = new TransactionQueue();
      simulationManager.setTransactionQueue(transactionQueue);
    }
    
    // Initialize broadcast manager FIRST
    console.log('Initializing broadcast manager...');
    broadcastManager = new BroadcastManager(wss);
    
    // Connect broadcast manager to simulation manager
    simulationManager.setBroadcastManager(broadcastManager);
    
    // Now setup WebSocket server with broadcast manager
    setupWebSocketServer(wss, broadcastManager, performanceMonitor);
    
    // Start performance monitoring
    performanceMonitor.startMonitoring(1000);
    
    console.log('Performance optimizations initialized');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    // Continue without optimizations
  }
}

// Helper function to broadcast to all connected clients
export function broadcastToAll(message: any) {
  if (broadcastManager) {
    broadcastManager.broadcastToAll(message);
  } else {
    // Fallback to direct broadcast
    const messageStr = JSON.stringify(message);
    
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }
}

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize services after server starts
  await initializeServices();
});

// Handle graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  // Shutdown services
  if (broadcastManager) {
    broadcastManager.shutdown();
  }
  
  if (transactionQueue) {
    await transactionQueue.shutdown();
  }
  
  performanceMonitor.stopMonitoring();
  simulationManager.cleanup();
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

export default app;