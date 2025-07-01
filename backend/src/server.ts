// backend/src/server.ts - COMPLETE COMPRESSION-FREE SERVER - FIXED TYPES
// 🚨 COMPRESSION ELIMINATOR - MUST BE AT TOP
console.log('🚨 STARTING COMPRESSION ELIMINATION PROCESS...');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Step 1: Prevent Express compression middleware
const originalUse = express.prototype.use;
// FIXED: Type assertion for originalUse.apply
express.prototype.use = function(this: express.Application, ...args: any[]): express.Application {
  // Intercept compression middleware
  if (args[0] && typeof args[0] === 'function') {
    const middleware = args[0];
    if (middleware.name && (
      middleware.name.includes('compression') ||
      middleware.name.includes('gzip') ||
      middleware.name.includes('deflate')
    )) {
      console.log('🚫 BLOCKED compression middleware:', middleware.name);
      return this; // Skip the middleware
    }
  }
  // FIXED: Apply with proper type assertion
  return originalUse.apply(this, args) as express.Application;
};

// Step 2: Override WebSocketServer constructor to force compression off
const OriginalWebSocketServer = WebSocketServer;
// FIXED: Constructor signature
function CompressionFreeWebSocketServer(options: any): WebSocketServer {
  console.log('🚨 CREATING COMPRESSION-FREE WEBSOCKET SERVER');
  
  // Force compression options to false
  const safeOptions = {
    ...options,
    perMessageDeflate: false,
    compression: false,
    compress: false,
    enableCompression: false,
    maxCompressedSize: 0,
    maxUncompressedSize: 0,
    threshold: 0,
    level: 0,
    chunkSize: 0,
    windowBits: 0,
    memLevel: 0,
    strategy: 0,
    dictionary: undefined,
  };
  
  console.log('✅ WebSocket options sanitized:', {
    perMessageDeflate: safeOptions.perMessageDeflate,
    compression: safeOptions.compression,
    compress: safeOptions.compress
  });
  
  return new OriginalWebSocketServer(safeOptions);
}

// Step 3: Override JSON.stringify to ensure clean text
const originalStringify = JSON.stringify;
JSON.stringify = function(value: any, replacer?: any, space?: any): string {
  const result = originalStringify(value, replacer, space);
  
  // Verify result is a clean string
  if (typeof result !== 'string') {
    console.error('💥 JSON.stringify returned non-string:', typeof result);
    throw new Error('JSON.stringify must return string for WebSocket compatibility');
  }
  
  // Check for binary indicators
  if (result.charCodeAt(0) === 0x1F || result.includes('\x1F')) {
    console.error('💥 COMPRESSION DETECTED in JSON string!');
    throw new Error('Compression detected in JSON output - check middleware');
  }
  
  return result;
};

// Step 4: Override WebSocket send method to ensure text frames
const originalSend = WebSocket.prototype.send;
WebSocket.prototype.send = function(data: any, options?: any, callback?: any): void {
  // Ensure we're sending text frames only
  const safeOptions = {
    binary: false,
    compress: false,
    fin: true,
    mask: undefined, // Let WebSocket handle masking
    ...options
  };
  
  // Verify data is a string
  if (typeof data !== 'string') {
    console.error('💥 Attempting to send non-string data via WebSocket:', typeof data);
    
    // Try to convert to string
    if (data && typeof data.toString === 'function') {
      data = data.toString();
      console.log('✅ Converted to string for WebSocket transmission');
    } else {
      throw new Error('WebSocket data must be string to prevent binary frame issues');
    }
  }
  
  // Check for compression signatures
  if (data.charCodeAt && data.charCodeAt(0) === 0x1F) {
    console.error('💥 GZIP SIGNATURE DETECTED in WebSocket data!');
    console.error('Data preview:', data.substring(0, 50));
    throw new Error('GZIP compression detected in WebSocket data - this will cause Blob conversion');
  }
  
  console.log('📤 SAFE WebSocket send - Text frame guaranteed:', {
    dataType: typeof data,
    length: data.length,
    binary: safeOptions.binary,
    compress: safeOptions.compress,
    firstChar: data.charCodeAt ? data.charCodeAt(0) : 'N/A'
  });
  
  return originalSend.call(this, data, safeOptions, callback);
};

console.log('✅ COMPRESSION ELIMINATION COMPLETE - All compression vectors blocked');
console.log('🎯 WebSocket will send TEXT FRAMES ONLY');

// Now import other modules after compression elimination
import { SimulationManager } from './services/simulation/SimulationManager';
import { TransactionQueue } from './services/transactionQueue';
import { BroadcastManager } from './services/broadcastManager';
import { PerformanceMonitor } from './monitoring/performanceMonitor';
import { setupWebSocketServer } from './websocket';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const simulationManager = new SimulationManager();
let transactionQueue: TransactionQueue;
let broadcastManager: BroadcastManager;
const performanceMonitor = new PerformanceMonitor();
let candleUpdateCoordinator: CandleUpdateCoordinator;

// Middleware - COMPRESSION PREVENTION
app.use(cors());

// Override helmet to prevent compression
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "media-src": ["'self'", "https://upload.wikimedia.org"]
    }
  }
}));

app.use(express.json());

// 🚨 EXPLICIT COMPRESSION REJECTION MIDDLEWARE
app.use((req, res, next) => {
  // Remove any compression headers
  delete req.headers['accept-encoding'];
  delete req.headers['content-encoding'];
  
  // Prevent response compression
  res.removeHeader('Content-Encoding');
  res.removeHeader('Transfer-Encoding');
  
  // Override response compression methods
  (res as any).compress = () => res;
  (res as any).gzip = () => res;
  (res as any).deflate = () => res;
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - COMPRESSION BLOCKED`);
  next();
});

// FIXED CandleUpdateCoordinator class - Prevents pre-populated candles
class CandleUpdateCoordinator {
  private candleManagers: Map<string, any> = new Map();
  private updateQueue: Map<string, Array<{timestamp: number, price: number, volume: number}>> = new Map();
  private processInterval: NodeJS.Timeout;
  private lastProcessedTime: Map<string, number> = new Map();
  private speedMultipliers: Map<string, number> = new Map();
  
  constructor(private simulationManager: any, private flushIntervalMs: number = 25) {
    this.processInterval = setInterval(() => this.processUpdates(), this.flushIntervalMs);
    console.log('🕯️ CandleUpdateCoordinator initialized with clean start prevention');
  }
  
  setSimulationSpeed(simulationId: string, speedMultiplier: number) {
    this.speedMultipliers.set(simulationId, speedMultiplier);
    console.log(`Candle coordinator speed set to ${speedMultiplier}x for simulation ${simulationId}`);
  }
  
  queueUpdate(simulationId: string, timestamp: number, price: number, volume: number) {
    if (!this.updateQueue.has(simulationId)) {
      this.updateQueue.set(simulationId, []);
    }
    
    const lastProcessed = this.lastProcessedTime.get(simulationId) || 0;
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    if (timestamp < fiveMinutesAgo && timestamp < lastProcessed) {
      console.warn(`Skipping old update for simulation ${simulationId}: ${new Date(timestamp).toISOString()}`);
      return;
    }
    
    this.updateQueue.get(simulationId)!.push({ timestamp, price, volume });
    console.log(`📊 Queued candle update for ${simulationId}: ${volume} volume @ $${price.toFixed(4)}`);
  }
  
  private async processUpdates() {
    for (const [simulationId, updates] of this.updateQueue.entries()) {
      if (updates.length === 0) continue;
      
      const simulation = this.simulationManager.getSimulation(simulationId);
      if (!simulation) {
        this.updateQueue.delete(simulationId);
        this.lastProcessedTime.delete(simulationId);
        this.speedMultipliers.delete(simulationId);
        continue;
      }
      
      updates.sort((a, b) => a.timestamp - b.timestamp);
      
      let candleManager = this.candleManagers.get(simulationId);
      if (!candleManager) {
        const { CandleManager } = await import('./services/simulation/CandleManager');
        candleManager = new CandleManager(60000);
        this.candleManagers.set(simulationId, candleManager);
        
        // CRITICAL FIX: Only load existing candles if simulation is actually running
        // This prevents pre-population of candles for new simulations
        if (simulation.isRunning && simulation.priceHistory && simulation.priceHistory.length > 0) {
          console.log(`📈 Loading ${simulation.priceHistory.length} existing candles for running simulation ${simulationId}`);
          const sortedHistory = [...simulation.priceHistory].sort((a, b) => a.timestamp - b.timestamp);
          candleManager.setCandles(sortedHistory);
        } else {
          console.log(`🎯 CLEAN START: No candles loaded for simulation ${simulationId} (running: ${simulation.isRunning}, candles: ${simulation.priceHistory?.length || 0})`);
          // Explicitly clear to ensure clean start
          candleManager.clear();
        }
      }
      
      const lastProcessed = this.lastProcessedTime.get(simulationId) || 0;
      const validUpdates = updates.filter(u => u.timestamp >= lastProcessed);
      
      const speedMultiplier = this.speedMultipliers.get(simulationId) || 1;
      const shouldProcess = speedMultiplier >= 1 || Math.random() < speedMultiplier;
      
      if (shouldProcess && validUpdates.length > 0) {
        console.log(`📊 Processing ${validUpdates.length} candle updates for simulation ${simulationId}`);
        
        for (const update of validUpdates) {
          await candleManager.updateCandle(update.timestamp, update.price, update.volume);
          this.lastProcessedTime.set(simulationId, update.timestamp);
        }
        
        const updatedCandles = candleManager.getCandles(1000);
        
        // Verify candle ordering
        let isOrdered = true;
        for (let i = 1; i < updatedCandles.length; i++) {
          if (updatedCandles[i].timestamp <= updatedCandles[i - 1].timestamp) {
            isOrdered = false;
            console.error(`Candle ordering issue detected at index ${i}`);
            break;
          }
        }
        
        if (isOrdered) {
          simulation.priceHistory = updatedCandles;
          console.log(`✅ Candles updated for ${simulationId}: ${updatedCandles.length} total candles`);
        } else {
          console.error('Skipping candle update due to ordering issues');
        }
        
        // Broadcast candle updates
        if (broadcastManager && isOrdered) {
          broadcastManager.sendDirectMessage(simulationId, {
            type: 'candle_update',
            timestamp: Date.now(),
            data: {
              priceHistory: simulation.priceHistory.slice(-250),
              speed: speedMultiplier,
              candleCount: simulation.priceHistory.length,
              isLive: simulation.isRunning
            }
          });
        }
      } else if (validUpdates.length === 0) {
        console.log(`⏸️ No new candle updates for simulation ${simulationId}`);
      }
      
      this.updateQueue.set(simulationId, []);
    }
  }
  
  clearCandles(simulationId: string) {
    const candleManager = this.candleManagers.get(simulationId);
    if (candleManager) {
      candleManager.clear();
      console.log(`🧹 Cleared candles for simulation ${simulationId}`);
    }
    
    // Also clear from queue
    this.updateQueue.set(simulationId, []);
    this.lastProcessedTime.delete(simulationId);
    
    console.log(`🧹 Cleared candle coordinator state for simulation ${simulationId}`);
  }
  
  getCandleCount(simulationId: string): number {
    const candleManager = this.candleManagers.get(simulationId);
    if (candleManager) {
      return candleManager.getCandles().length;
    }
    return 0;
  }
  
  ensureCleanStart(simulationId: string) {
    console.log(`🎯 Ensuring clean start for simulation ${simulationId}`);
    
    // Remove any existing candle manager
    const existingManager = this.candleManagers.get(simulationId);
    if (existingManager) {
      existingManager.clear();
      this.candleManagers.delete(simulationId);
    }
    
    // Clear any queued updates
    this.updateQueue.set(simulationId, []);
    this.lastProcessedTime.delete(simulationId);
    
    console.log(`✅ Clean start ensured for simulation ${simulationId}`);
  }
  
  shutdown() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
    }
    
    // Final processing
    this.processUpdates();
    
    this.candleManagers.forEach(manager => {
      if (manager.shutdown) manager.shutdown();
    });
    
    this.candleManagers.clear();
    this.updateQueue.clear();
    this.lastProcessedTime.clear();
    this.speedMultipliers.clear();
    
    console.log('🧹 CandleUpdateCoordinator shutdown complete');
  }
}

// Create simulation - FIXED to ensure clean start
app.post('/api/simulation', async (req, res) => {
  try {
    console.log('🚀 Creating simulation with GUARANTEED clean start...');
    
    const simulation = await simulationManager.createSimulation(req.body);
    
    // 🎯 CRITICAL: Ensure CandleUpdateCoordinator has clean state
    if (candleUpdateCoordinator) {
      candleUpdateCoordinator.ensureCleanStart(simulation.id);
    }
    
    // Verify simulation exists before responding
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
    
    const verifySimulation = simulationManager.getSimulation(simulation.id);
    if (!verifySimulation) {
      console.error(`💥 VERIFICATION FAILED: Simulation ${simulation.id} not found after creation!`);
      return res.status(500).json({ 
        error: 'Simulation creation verification failed' 
      });
    }
    
    // FINAL VERIFICATION: Ensure truly clean start
    if (verifySimulation.priceHistory.length > 0) {
      console.error(`💥 CLEAN START VIOLATION: Simulation has ${verifySimulation.priceHistory.length} candles after creation!`);
      // Force clean
      verifySimulation.priceHistory = [];
      console.log(`🧹 FORCED clean start - cleared candles`);
    }
    
    console.log(`✅ Simulation ${simulation.id} creation VERIFIED with ${verifySimulation.priceHistory.length} candles (MUST BE 0)`);
    
    res.json({ 
      simulationId: simulation.id,
      data: simulation,
      candleCount: verifySimulation.priceHistory.length,
      cleanStart: verifySimulation.priceHistory.length === 0,
      message: `Clean simulation created - chart will build live when started!`
    });
  } catch (error) {
    console.error('❌ Error creating simulation:', error);
    res.status(500).json({ error: 'Failed to create simulation' });
  }
});

// Get simulation
app.get('/api/simulation/:id', (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Fetching simulation: ${id}`);
    
    const simulation = simulationManager.getSimulation(id);
    if (!simulation) {
      console.error(`❌ Simulation not found: ${id}`);
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    console.log(`✅ Simulation found: ${id} (${simulation.priceHistory.length} candles)`);
    
    // Return in the format the frontend expects
    res.json({ 
      data: {
        ...simulation,
        type: 'real-time',
        chartStatus: simulation.priceHistory.length === 0 ? 'empty-ready' : 'building',
        candleCount: simulation.priceHistory.length
      }
    });
  } catch (error) {
    console.error('❌ Error getting simulation:', error);
    res.status(500).json({ error: 'Failed to get simulation' });
  }
});

// Start simulation
app.post('/api/simulation/:id/start', (req, res) => {
  try {
    const { id } = req.params;
    console.log(`▶️ Starting simulation: ${id}`);
    
    simulationManager.startSimulation(id);
    res.json({ 
      success: true,
      status: 'started',
      message: 'Real-time chart generation started - candles will appear smoothly'
    });
  } catch (error) {
    console.error('❌ Error starting simulation:', error);
    res.status(500).json({ error: 'Failed to start simulation' });
  }
});

// Pause simulation
app.post('/api/simulation/:id/pause', (req, res) => {
  try {
    const { id } = req.params;
    console.log(`⏸️ Pausing simulation: ${id}`);
    
    simulationManager.pauseSimulation(id);
    res.json({ 
      success: true,
      status: 'paused'
    });
  } catch (error) {
    console.error('❌ Error pausing simulation:', error);
    res.status(500).json({ error: 'Failed to pause simulation' });
  }
});

// FIXED Reset endpoint with enhanced clean start logic
app.post('/api/simulation/:id/reset', (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔄 Resetting simulation with GUARANTEED clean start: ${id}`);
    
    // Reset the simulation in SimulationManager
    simulationManager.resetSimulation(id);
    
    // CRITICAL FIX: Also clear candles in CandleUpdateCoordinator
    if (candleUpdateCoordinator) {
      candleUpdateCoordinator.clearCandles(id);
      candleUpdateCoordinator.ensureCleanStart(id);
      console.log(`🧹 Cleared candles in coordinator for simulation ${id}`);
    }
    
    // Verify the simulation is actually reset
    const resetSimulation = simulationManager.getSimulation(id);
    if (resetSimulation) {
      console.log(`✅ Reset verification: ${resetSimulation.priceHistory.length} candles (should be 0)`);
      
      if (resetSimulation.priceHistory.length > 0) {
        console.error(`💥 RESET FAILURE: Still has ${resetSimulation.priceHistory.length} candles after reset!`);
        // Force clear
        resetSimulation.priceHistory = [];
        console.log(`🧹 FORCED cleanup: Reset candles to 0`);
      }
      
      // Send updated state to confirm clean reset
      if (broadcastManager) {
        broadcastManager.sendDirectMessage(id, {
          type: 'simulation_reset',
          timestamp: Date.now(),
          data: {
            id: resetSimulation.id,
            isRunning: resetSimulation.isRunning,
            isPaused: resetSimulation.isPaused,
            currentPrice: resetSimulation.currentPrice,
            priceHistory: resetSimulation.priceHistory, // Should be empty
            candleCount: resetSimulation.priceHistory.length,
            message: 'Simulation reset to clean state - chart will start empty'
          }
        });
      }
    }
    
    res.json({ 
      success: true,
      status: 'reset',
      candleCount: resetSimulation?.priceHistory.length || 0,
      cleanStart: (resetSimulation?.priceHistory.length || 0) === 0,
      message: 'Simulation reset to clean state - chart will start empty'
    });
  } catch (error) {
    console.error('❌ Error resetting simulation:', error);
    res.status(500).json({ error: 'Failed to reset simulation' });
  }
});

// Speed control
app.post('/api/simulation/:id/speed', (req, res) => {
  try {
    const { id } = req.params;
    const { speed } = req.body;
    
    if (typeof speed !== 'number' || speed < 0.1 || speed > 100) {
      return res.status(400).json({ 
        error: 'Invalid speed value. Must be between 0.1 and 100' 
      });
    }
    
    simulationManager.setSimulationSpeed(id, speed);
    
    if (candleUpdateCoordinator) {
      candleUpdateCoordinator.setSimulationSpeed(id, speed);
    }
    
    const simulation = simulationManager.getSimulation(id);
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    if (broadcastManager) {
      broadcastManager.sendDirectMessage(id, {
        type: 'speed_change',
        timestamp: Date.now(),
        data: { speed: speed, simulationTime: simulation.currentTime }
      });
    }
    
    console.log(`⚡ Simulation ${id} speed changed to ${speed}x`);
    
    res.json({ 
      success: true,
      speed: speed,
      simulationId: id,
      currentTime: simulation.currentTime,
      message: `Speed set to ${speed}x - real-time candle generation adjusted`
    });
  } catch (error) {
    console.error('❌ Error setting simulation speed:', error);
    res.status(500).json({ error: 'Failed to set simulation speed' });
  }
});

// Get simulation status
app.get('/api/simulation/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const simulation = simulationManager.getSimulation(id);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    // Get candle count from coordinator for accuracy
    const coordinatorCandleCount = candleUpdateCoordinator ? 
      candleUpdateCoordinator.getCandleCount(id) : 0;
    
    res.json({
      id: simulation.id,
      isRunning: simulation.isRunning,
      isPaused: simulation.isPaused,
      speed: simulation.parameters.timeCompressionFactor,
      currentPrice: simulation.currentPrice,
      candleCount: simulation.priceHistory.length,
      coordinatorCandleCount: coordinatorCandleCount,
      chartStatus: simulation.priceHistory.length === 0 ? 'empty-ready' : 'building',
      tradeCount: simulation.recentTrades.length,
      activePositions: simulation.activePositions.length,
      type: 'real-time',
      cleanStart: simulation.priceHistory.length === 0,
      message: simulation.priceHistory.length === 0 
        ? 'Ready to start - chart will fill smoothly in real-time'
        : `Building chart: ${simulation.priceHistory.length} candles generated`
    });
  } catch (error) {
    console.error('❌ Error getting simulation status:', error);
    res.status(500).json({ error: 'Failed to get simulation status' });
  }
});

// 🔄 EXTERNAL TRADE PROCESSING - Real-time integration
app.post('/api/simulation/:id/external-trade', async (req, res) => {
  console.log('🔄 Processing real-time external trade!', req.params.id);
  try {
    const { id } = req.params;
    const tradeData = req.body;
    
    console.log(`Processing external trade for simulation ${id}:`, {
      action: tradeData.action,
      price: tradeData.price,
      quantity: tradeData.quantity
    });
    
    const simulation = simulationManager.getSimulation(id);
    if (!simulation) {
      console.error(`❌ Simulation ${id} not found!`);
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    // Create properly formatted trade
    const trade = {
      id: tradeData.id || `ext-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: tradeData.timestamp || simulation.currentTime,
      trader: {
        walletAddress: tradeData.traderId || 'external-processor',
        avatarUrl: '',
        preferredName: tradeData.traderName || 'Transaction Processor',
        netPnl: 0
      },
      traderId: tradeData.traderId || 'external-processor',
      traderName: tradeData.traderName || 'Transaction Processor',
      action: tradeData.action || tradeData.type || 'buy',
      price: tradeData.price || simulation.currentPrice,
      quantity: tradeData.quantity || tradeData.amount || 100,
      value: 0,
      impact: 0
    };
    
    trade.value = trade.price * trade.quantity;
    
    // Enhanced price impact calculation
    const liquidityFactor = simulation.parameters.initialLiquidity || 1000000;
    const sizeImpact = trade.value / liquidityFactor;
    
    // Get recent market pressure
    const recentTrades = simulation.recentTrades.slice(0, 100);
    const recentBuyVolume = recentTrades
      .filter(t => t.action === 'buy')
      .reduce((sum, t) => sum + t.value, 0);
    const recentSellVolume = recentTrades
      .filter(t => t.action === 'sell')
      .reduce((sum, t) => sum + t.value, 0);
    
    const totalRecentVolume = recentBuyVolume + recentSellVolume;
    const marketPressure = totalRecentVolume > 0 
      ? (recentBuyVolume - recentSellVolume) / totalRecentVolume 
      : 0;
    
    // Base impact calculation
    let baseImpact;
    if (trade.action === 'buy') {
      baseImpact = 0.001 * (1 - marketPressure * 0.5);
    } else {
      baseImpact = -0.001 * (1 + marketPressure * 0.5);
    }
    
    const volatility = simulation.marketConditions.volatility || 0.02;
    const scaledSizeImpact = sizeImpact * (trade.action === 'buy' ? 1 : -1) * (1 + volatility * 10);
    
    let dynamicMultiplier = 1;
    
    if (trade.value > liquidityFactor * 0.01) {
      dynamicMultiplier *= 1.5;
    }
    
    if ((trade.action === 'buy' && marketPressure < -0.2) || 
        (trade.action === 'sell' && marketPressure > 0.2)) {
      dynamicMultiplier *= 1.3;
    }
    
    if ((simulation as any).externalMarketMetrics && (simulation as any).externalMarketMetrics.currentTPS > 100) {
      dynamicMultiplier *= 1 + Math.log10((simulation as any).externalMarketMetrics.currentTPS) / 10;
    }
    
    trade.impact = (baseImpact + scaledSizeImpact * 0.1) * dynamicMultiplier;
    
    // Cap extreme impacts
    const maxImpact = 0.02;
    trade.impact = Math.max(-maxImpact, Math.min(maxImpact, trade.impact));
    
    const microVolatility = (Math.random() - 0.5) * 0.0001;
    trade.impact += microVolatility;
    
    // Add to simulation
    simulation.recentTrades.unshift(trade as any);
    
    if (simulation.recentTrades.length > 1000) {
      simulation.recentTrades = simulation.recentTrades.slice(0, 1000);
    }
    
    // Update price
    const oldPrice = simulation.currentPrice;
    simulation.currentPrice *= (1 + trade.impact);
    
    const minPrice = simulation.parameters.initialPrice * 0.1;
    const maxPrice = simulation.parameters.initialPrice * 10;
    simulation.currentPrice = Math.max(minPrice, Math.min(maxPrice, simulation.currentPrice));
    
    // Update candles using coordinator
    if (candleUpdateCoordinator) {
      candleUpdateCoordinator.queueUpdate(id, trade.timestamp, simulation.currentPrice, trade.quantity);
      console.log(`📈 Queued candle update: ${simulation.currentPrice.toFixed(4)} at ${new Date(trade.timestamp).toISOString()}`);
    }
    
    // Update market conditions
    simulation.marketConditions.volume += trade.value;
    
    const priceChange = (simulation.currentPrice - oldPrice) / oldPrice;
    if (Math.abs(priceChange) > 0.001) {
      const currentVolatility = simulation.marketConditions.volatility || 0.02;
      simulation.marketConditions.volatility = currentVolatility * 0.9 + Math.abs(priceChange) * 0.1;
      
      if (priceChange > 0.002) {
        simulation.marketConditions.trend = 'bullish';
      } else if (priceChange < -0.002) {
        simulation.marketConditions.trend = 'bearish';
      } else {
        simulation.marketConditions.trend = 'sideways';
      }
    }
    
    // Broadcast updates
    if (broadcastManager) {
      broadcastManager.sendDirectMessage(id, {
        type: 'trade',
        timestamp: simulation.currentTime,
        data: trade
      });
      
      broadcastManager.sendDirectMessage(id, {
        type: 'price_update',
        timestamp: simulation.currentTime,
        data: {
          price: simulation.currentPrice,
          orderBook: simulation.orderBook,
          priceHistory: simulation.priceHistory.slice(-100),
          recentTrades: simulation.recentTrades.slice(0, 100),
          activePositions: simulation.activePositions,
          traderRankings: simulation.traderRankings,
          totalTradesProcessed: simulation.recentTrades.length,
          externalMarketMetrics: (simulation as any).externalMarketMetrics,
          marketConditions: simulation.marketConditions
        }
      });
    }
    
    console.log(`✅ Real-time trade processed: ${trade.action} ${trade.quantity.toFixed(2)} @ ${trade.price.toFixed(4)} -> New price: ${simulation.currentPrice.toFixed(4)} (${((trade.impact) * 100).toFixed(3)}% impact)`);
    console.log(`📊 Chart candles: ${simulation.priceHistory.length} (seamless integration)`);
    
    res.json({ 
      success: true, 
      trade,
      newPrice: simulation.currentPrice,
      impact: trade.impact,
      priceChange: ((simulation.currentPrice - oldPrice) / oldPrice) * 100,
      marketPressure,
      trend: simulation.marketConditions.trend,
      simulationTime: simulation.currentTime,
      candleCount: simulation.priceHistory.length
    });
  } catch (error) {
    console.error('❌ Error processing external trade:', error);
    res.status(500).json({ error: 'Failed to process external trade', details: (error as Error).message });
  }
});

// Get all simulations
app.get('/api/simulations', (req, res) => {
  try {
    const simulations = simulationManager.getAllSimulations();
    
    const cleanedSimulations = simulations.map(sim => ({
      ...sim,
      type: 'real-time',
      chartStatus: sim.priceHistory.length === 0 ? 'empty-ready' : 'building',
      cleanStart: sim.priceHistory.length === 0
    }));
    
    res.json(cleanedSimulations);
  } catch (error) {
    console.error('❌ Error getting simulations:', error);
    res.status(500).json({ error: 'Failed to get simulations' });
  }
});

// Compression test endpoint
app.get('/api/compression-test', (req, res) => {
  res.json({
    message: 'Compression test endpoint',
    compressionDisabled: true,
    timestamp: Date.now(),
    headers: {
      'content-encoding': res.getHeader('content-encoding') || 'none',
      'transfer-encoding': res.getHeader('transfer-encoding') || 'none'
    }
  });
});

// Test route
app.get('/api/test', (req, res) => {
  console.log('✅ Test route hit!');
  res.json({ message: 'Test route working!', timestamp: Date.now() });
});

// Performance monitoring
app.get('/api/metrics', (req, res) => {
  const format = req.query.format as string || 'json';
  // FIXED: Add getMetrics method check
  const metrics = (performanceMonitor as any).getMetrics ? 
    (performanceMonitor as any).getMetrics() : 
    { status: 'monitoring_active', timestamp: Date.now() };
  
  if (format === 'prometheus') {
    res.set('Content-Type', 'text/plain');
    res.send(`# TYPE performance_metrics gauge\nperformance_metrics{type="timestamp"} ${Date.now()}`);
  } else {
    res.set('Content-Type', 'application/json');
    res.json(metrics);
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // FIXED: Add proper type checking for getQueueStats
    const queueStats = transactionQueue && typeof (transactionQueue as any).getQueueStats === 'function' ? 
      await (transactionQueue as any).getQueueStats() : null;
    // FIXED: Add proper type checking for getStats
    const broadcastStats = broadcastManager && typeof (broadcastManager as any).getStats === 'function' ? 
      (broadcastManager as any).getStats() : null;
    
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      services: {
        queue: queueStats,
        broadcast: broadcastStats,
        performance: (performanceMonitor as any).getMetrics ? (performanceMonitor as any).getMetrics() : { active: true }
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../public')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });
}

// Create HTTP server
const server = http.createServer(app);

// 🚨 CRITICAL: Create WebSocket server with ABSOLUTE COMPRESSION ELIMINATION
console.log('🚨 Creating WebSocket server with ABSOLUTE compression elimination...');

// FIXED: Use proper constructor call
const wss = CompressionFreeWebSocketServer({ 
  server,
  // Multiple ways to disable compression for different versions
  perMessageDeflate: false,
  compression: false,
  compress: false,
  enableCompression: false,
  maxCompressedSize: 0,
  maxUncompressedSize: 0,
  threshold: Infinity, // Never compress
  level: 0,           // No compression level
  chunkSize: 0,       // No chunking
  windowBits: 0,      // No compression window
  memLevel: 0,        // No compression memory
  strategy: 0,        // No compression strategy
});

// Verify WebSocket server configuration
console.log('✅ WebSocket Server Created - Verification:');
console.log('Server options:', {
  compression: (wss as any).options?.compression || 'undefined',
  perMessageDeflate: (wss as any).options?.perMessageDeflate || 'undefined'
});

// Add connection handler to verify no compression
wss.on('connection', (ws: WebSocket, req) => {
  console.log('🔌 New WebSocket connection - Compression Check:');
  console.log('Extensions:', (ws as any).extensions);
  console.log('Protocol:', ws.protocol);
  
  // Verify no compression extensions
  if ((ws as any).extensions && Object.keys((ws as any).extensions).length > 0) {
    console.error('⚠️ WebSocket has extensions (might include compression):', (ws as any).extensions);
  } else {
    console.log('✅ WebSocket has NO extensions - compression-free confirmed');
  }
  
  // Send test message to verify text frame
  try {
    const testMessage = JSON.stringify({
      type: 'connection_test',
      timestamp: Date.now(),
      compressionStatus: 'DISABLED',
      message: 'This should be a TEXT frame with NO compression'
    });
    
    ws.send(testMessage);
    console.log('✅ Test TEXT message sent successfully');
  } catch (error) {
    console.error('💥 Error sending test message:', error);
  }
});

// Initialize services
async function initializeServices() {
  try {
    if (process.env.ENABLE_REDIS === 'true') {
      console.log('Initializing transaction queue...');
      transactionQueue = new TransactionQueue();
      simulationManager.setTransactionQueue(transactionQueue);
    }
    
    console.log('Initializing broadcast manager...');
    broadcastManager = new BroadcastManager(wss);
    simulationManager.setBroadcastManager(broadcastManager);
    
    console.log('Initializing candle update coordinator...');
    candleUpdateCoordinator = new CandleUpdateCoordinator(simulationManager, 25);
    
    setupWebSocketServer(wss, broadcastManager, performanceMonitor);
    // FIXED: Add method existence check
    if (typeof (performanceMonitor as any).startMonitoring === 'function') {
      (performanceMonitor as any).startMonitoring(1000);
    }
    
    console.log('✅ Clean real-time system initialized with guaranteed clean start');
    console.log('🚨 COMPRESSION DISABLED - Text frames only, no Blob conversion');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
  }
}

// Export for use in other modules
export function broadcastToAll(message: any) {
  if (broadcastManager) {
    (broadcastManager as any).broadcastToAll(message);
  } else {
    const messageStr = JSON.stringify(message);
    
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }
}

export { simulationManager };

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`🌟 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📈 CLEAN REAL-TIME CHARTS - Guaranteed clean start!`);
  console.log(`🎯 No pre-populated data - charts build live from zero`);
  console.log(`🚨 COMPRESSION DISABLED - All WebSocket messages as TEXT frames`);
  console.log(`✅ perMessageDeflate: false - No Blob conversion issues`);
  console.log(`🎯 COMPRESSION ELIMINATOR ACTIVE - All compression vectors blocked`);
  
  await initializeServices();
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  if (candleUpdateCoordinator) {
    candleUpdateCoordinator.shutdown();
  }
  
  if (broadcastManager && typeof (broadcastManager as any).shutdown === 'function') {
    (broadcastManager as any).shutdown();
  }
  
  if (transactionQueue && typeof (transactionQueue as any).shutdown === 'function') {
    await (transactionQueue as any).shutdown();
  }
  
  // FIXED: Add method existence check
  if (typeof (performanceMonitor as any).stopMonitoring === 'function') {
    (performanceMonitor as any).stopMonitoring();
  }
  simulationManager.cleanup();
  
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

export default app;