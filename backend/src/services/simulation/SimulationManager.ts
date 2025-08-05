// backend/src/services/simulation/SimulationManager.ts - CRITICAL FIX: Proper State Management and User Controls
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import {
  SimulationState,
  SimulationParameters,
  SimulationEvent,
  Timeframe,
  SIMULATION_CONSTANTS,
  ExtendedSimulationState,
  TPSMode,
  ExternalMarketMetrics,
  ExternalTraderType,
  Trade,
  PricePoint
} from './types';
import { MarketEngine } from './MarketEngine';
import { TraderEngine } from './TraderEngine';
import { OrderBookManager } from './OrderBookManager';
import { TimeframeManager } from './TimeframeManager';
import { ScenarioEngine } from './ScenarioEngine';
import { PerformanceOptimizer } from './PerformanceOptimizer';
import { BroadcastService } from './BroadcastService';
import { DataGenerator } from './DataGenerator';
import { ExternalMarketEngine } from './ExternalMarketEngine';
import { CandleManager } from './CandleManager';
import duneApi from '../../api/duneApi';
import traderService from '../traderService';
import { TransactionQueue } from '../transactionQueue';
import { BroadcastManager } from '../broadcastManager';

export interface EnhancedSimulationParameters extends SimulationParameters {
  priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega' | 'random';
  customPrice?: number;
}

export interface CandleUpdateCallback {
  queueUpdate(simulationId: string, timestamp: number, price: number, volume: number): void;
  setSimulationSpeed(simulationId: string, speedMultiplier: number): void;
  clearCandles(simulationId: string): void;
  ensureCleanStart(simulationId: string): void;
}

export class SimulationManager {
  private simulations: Map<string, ExtendedSimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private simulationSpeeds: Map<string, number> = new Map();
  private simulationTimeframes: Map<string, Timeframe> = new Map();
  private processedTradesSyncInterval: NodeJS.Timeout | null = null;
  
  private liveTPSMetrics: Map<string, ExternalMarketMetrics> = new Map();
  private metricsUpdateIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  // TPS metrics throttling
  private lastTPSBroadcast: Map<string, number> = new Map();
  private lastTPSMetricsSnapshot: Map<string, string> = new Map();
  private readonly TPS_BROADCAST_THROTTLE_MS = 2000;
  
  private simulationRegistrationStatus: Map<string, 'creating' | 'registering' | 'ready' | 'starting' | 'running'> = new Map();
  private registrationCallbacks: Map<string, ((status: string) => void)[]> = new Map();
  
  // 🚨 CRITICAL FIX: Enhanced WebSocket readiness tracking for proper coordination
  private websocketReadinessStatus: Map<string, boolean> = new Map();
  private websocketRegistrationPromises: Map<string, Promise<boolean>> = new Map();
  
  // Prevent multiple simulations
  private static globalSimulationLock = false;
  private static activeSimulationId: string | null = null;
  private static simulationCreationInProgress = false;
  
  // Enhanced CandleManager coordination tracking
  private candleManagerReadiness: Map<string, boolean> = new Map();
  private candleManagerCreationPromises: Map<string, Promise<CandleManager>> = new Map();
  private candleManagerInitializationStatus: Map<string, 'pending' | 'initializing' | 'ready' | 'error'> = new Map();

  // 🚨 CRITICAL FIX: Enhanced pause state operation tracking with better race condition prevention
  private pauseOperations: Map<string, Promise<void>> = new Map();
  private pauseOperationLocks: Map<string, boolean> = new Map();
  private pauseStateMutex: Map<string, boolean> = new Map(); // NEW: Mutex for pause state changes

  private externalCandleUpdateCallback?: CandleUpdateCallback;

  private marketEngine!: MarketEngine;
  private traderEngine!: TraderEngine;
  private orderBookManager!: OrderBookManager;
  private timeframeManager!: TimeframeManager;
  private scenarioEngine!: ScenarioEngine;
  private performanceOptimizer!: PerformanceOptimizer;
  public broadcastService!: BroadcastService;
  private dataGenerator!: DataGenerator;
  private externalMarketEngine!: ExternalMarketEngine;

  private transactionQueue?: TransactionQueue;
  private broadcastManager?: BroadcastManager;

  private readonly baseUpdateInterval: number = 50;
  private readonly processedTradesSyncIntervalTime: number = 25;
  private readonly metricsUpdateInterval: number = 2000;

  // Enhanced pool cleanup tracking
  private poolCleanupIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly POOL_CLEANUP_INTERVAL = 60000;
  private simulationTradeCounters: Map<string, { generated: number; released: number }> = new Map();

  constructor() {
    this.initializeEngines();
    this.startProcessedTradesSync();
    this.startGlobalPoolMonitoring();
    
    // Global cleanup on process exit
    process.on('SIGTERM', () => this.emergencyCleanup());
    process.on('SIGINT', () => this.emergencyCleanup());
  }

  private async emergencyCleanup(): Promise<void> {
    console.log('🚨 EMERGENCY: Cleaning up all simulations');
    
    // Stop all simulations immediately
    const cleanupPromises = Array.from(this.simulations.keys()).map(async (id) => {
      try {
        this.stopSimulation(id);
        await this.cleanupCandleManagerForSimulation(id);
      } catch (error) {
        console.error(`Error in emergency cleanup for ${id}:`, error);
      }
    });
    
    await Promise.allSettled(cleanupPromises);
    
    // Reset global state
    SimulationManager.globalSimulationLock = false;
    SimulationManager.activeSimulationId = null;
    SimulationManager.simulationCreationInProgress = false;
    
    this.cleanup();
  }

  private startGlobalPoolMonitoring(): void {
    setInterval(() => {
      this.monitorAllSimulationPools();
    }, 30000);

    console.log('🔍 MONITOR: Started global pool monitoring');
  }

  private monitorAllSimulationPools(): void {
    let totalLeaks = 0;
    let criticalSimulations: string[] = [];

    this.simulations.forEach((simulation, simulationId) => {
      const counters = this.simulationTradeCounters.get(simulationId);
      if (counters) {
        const leakage = counters.generated - counters.released;
        if (leakage > 100) {
          totalLeaks += leakage;
          criticalSimulations.push(simulationId);
          console.warn(`🚨 LEAK: Simulation ${simulationId} has ${leakage} unreleased objects`);
        }
      }

      const traderEngineHealth = this.traderEngine.getPoolHealth();
      if (!traderEngineHealth.trade.healthy || !traderEngineHealth.position.healthy) {
        console.error(`🚨 POOL HEALTH: Simulation ${simulationId} has unhealthy pools`);
        this.forceSimulationPoolCleanup(simulationId);
      }
    });

    if (totalLeaks > 500) {
      console.error(`🚨 SYSTEM ALERT: Total leakage of ${totalLeaks} objects`);
      criticalSimulations.forEach(simId => this.forceSimulationPoolCleanup(simId));
    }
  }

  private forceSimulationPoolCleanup(simulationId: string): void {
    console.log(`🧹 CLEANUP: Force cleaning pools for ${simulationId}`);
    
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return;

    try {
      // Clean up recent trades with proper pool release
      if (simulation.recentTrades.length > 1000) {
        const tradesToRelease = simulation.recentTrades.splice(1000);
        tradesToRelease.forEach(trade => {
          try {
            if (trade && typeof trade.id === 'string') {
              this.dataGenerator.releaseTrade(trade);
              this.incrementReleasedCounter(simulationId);
            }
          } catch (error) {
            console.error(`❌ Error releasing trade ${trade?.id}:`, error);
          }
        });
        console.log(`🔄 CLEANUP: Released ${tradesToRelease.length} trades`);
      }

      // Clean up positions with proper pool release
      if (simulation.activePositions.length > 100) {
        const positionsToClose = simulation.activePositions.splice(100);
        positionsToClose.forEach(position => {
          try {
            if (position && typeof position.entryTime === 'number') {
              this.dataGenerator.releasePosition(position);
            }
          } catch (error) {
            console.error(`❌ Error releasing position:`, error);
          }
        });
        console.log(`🔄 CLEANUP: Released ${positionsToClose.length} positions`);
      }

      // Clean up closed positions
      if (simulation.closedPositions.length > 500) {
        const excessClosed = simulation.closedPositions.splice(500);
        excessClosed.forEach(position => {
          try {
            this.dataGenerator.releasePosition(position);
          } catch (error) {
            console.error(`❌ Error releasing closed position:`, error);
          }
        });
        console.log(`🔄 CLEANUP: Released ${excessClosed.length} closed positions`);
      }

      console.log(`✅ CLEANUP: Pool cleanup completed for ${simulationId}`);

    } catch (error) {
      console.error(`❌ CLEANUP: Error during pool cleanup:`, error);
    }
  }

  private incrementGeneratedCounter(simulationId: string): void {
    if (!this.simulationTradeCounters.has(simulationId)) {
      this.simulationTradeCounters.set(simulationId, { generated: 0, released: 0 });
    }
    this.simulationTradeCounters.get(simulationId)!.generated++;
  }

  private incrementReleasedCounter(simulationId: string): void {
    if (!this.simulationTradeCounters.has(simulationId)) {
      this.simulationTradeCounters.set(simulationId, { generated: 0, released: 0 });
    }
    this.simulationTradeCounters.get(simulationId)!.released++;
  }

  setExternalCandleUpdateCallback(callback: CandleUpdateCallback): void {
    this.externalCandleUpdateCallback = callback;
    console.log('🔗 COORDINATOR: External candle coordinator connected');
  }

  private initializeEngines(): void {
    this.timeframeManager = new TimeframeManager();
    this.broadcastService = new BroadcastService();
    this.dataGenerator = new DataGenerator();
    this.orderBookManager = new OrderBookManager();
    this.performanceOptimizer = new PerformanceOptimizer();

    this.marketEngine = new MarketEngine(
      (timeframe) => this.timeframeManager.getTimeframeConfig(timeframe),
      (simulationId) => this.simulationTimeframes.get(simulationId) || '1m',
      this.orderBookManager
    );

    this.traderEngine = new TraderEngine(
      (simulationId) => this.simulationTimeframes.get(simulationId) || '1m',
      (timeframe) => this.timeframeManager.getTimeframeConfig(timeframe),
      (simulationId, event) => this.broadcastService.broadcastEvent(simulationId, event),
      (simulationId, trades) => {
        this.timeframeManager.updateTradesBuffer(simulationId, trades);
        trades.forEach(trade => {
          this.broadcastService.broadcastTradeEvent(simulationId, trade);
          this.incrementGeneratedCounter(simulationId);
        });
      }
    );

    this.scenarioEngine = new ScenarioEngine(
      (simulationId) => this.timeframeManager.clearCache(simulationId),
      (simulationId, event) => this.broadcastService.broadcastEvent(simulationId, event)
    );

    this.externalMarketEngine = new ExternalMarketEngine(
      (order, simulation) => this.marketEngine.processExternalOrder(order, simulation),
      (simulationId, event) => this.broadcastService.broadcastEvent(simulationId, event)
    );

    this.performanceOptimizer.startPerformanceMonitoring();
  }

  // Enhanced async CandleManager access with comprehensive error handling
  private async getCandleManager(simulationId: string, retryCount: number = 0): Promise<CandleManager | null> {
    const maxRetries = 3;
    
    try {
      // Check if we have a creation promise in progress
      if (this.candleManagerCreationPromises.has(simulationId)) {
        console.log(`⏳ CANDLE: Waiting for CandleManager creation promise for ${simulationId}`);
        const candleManager = await this.candleManagerCreationPromises.get(simulationId)!;
        
        if (candleManager && !candleManager.isInstanceDestroyed()) {
          console.log(`✅ CANDLE: Retrieved CandleManager from creation promise for ${simulationId}`);
          return candleManager;
        }
      }
      
      // Check if instance exists
      if (!CandleManager.hasInstance(simulationId)) {
        console.warn(`⚠️ CANDLE: No CandleManager exists for ${simulationId}`);
        
        // Try to create one if we don't have too many retries
        if (retryCount < maxRetries) {
          console.log(`🔄 CANDLE: Attempting to create CandleManager for ${simulationId} (retry ${retryCount + 1})`);
          const simulation = this.simulations.get(simulationId);
          
          if (simulation) {
            await this.ensureCandleManagerExists(simulationId, simulation.currentPrice);
            return this.getCandleManager(simulationId, retryCount + 1);
          }
        }
        
        return null;
      }
      
      // Try to get existing instance
      const candleManager = await CandleManager.getInstance(simulationId);
      
      // Validate the instance
      if (!candleManager || candleManager.isInstanceDestroyed()) {
        console.warn(`⚠️ CANDLE: CandleManager for ${simulationId} is destroyed or invalid`);
        
        if (retryCount < maxRetries) {
          console.log(`🔄 CANDLE: Recreating CandleManager for ${simulationId} (retry ${retryCount + 1})`);
          await CandleManager.cleanup(simulationId);
          
          const simulation = this.simulations.get(simulationId);
          if (simulation) {
            await this.ensureCandleManagerExists(simulationId, simulation.currentPrice);
            return this.getCandleManager(simulationId, retryCount + 1);
          }
        }
        
        return null;
      }
      
      // Check if it's properly initialized
      if (!candleManager.isInstanceInitialized()) {
        console.log(`🔧 CANDLE: Initializing CandleManager for ${simulationId}`);
        const simulation = this.simulations.get(simulationId);
        
        if (simulation) {
          candleManager.initialize(simulation.startTime, simulation.currentPrice);
          this.candleManagerReadiness.set(simulationId, true);
          this.candleManagerInitializationStatus.set(simulationId, 'ready');
        }
      }
      
      console.log(`✅ CANDLE: Successfully retrieved CandleManager for ${simulationId}`);
      return candleManager;
      
    } catch (error) {
      console.error(`❌ CANDLE: Error getting CandleManager for ${simulationId}:`, error);
      
      if (retryCount < maxRetries) {
        console.log(`🔄 CANDLE: Retrying getCandleManager for ${simulationId} (retry ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1)));
        return this.getCandleManager(simulationId, retryCount + 1);
      }
      
      return null;
    }
  }

  // Ensure CandleManager exists and is ready
  private async ensureCandleManagerExists(simulationId: string, price: number): Promise<CandleManager> {
    console.log(`🔧 CANDLE: Ensuring CandleManager exists for ${simulationId} with price ${price}`);
    
    // Check if we already have a creation promise
    if (this.candleManagerCreationPromises.has(simulationId)) {
      console.log(`⏳ CANDLE: Creation already in progress for ${simulationId}`);
      const existingPromise = this.candleManagerCreationPromises.get(simulationId)!;
      try {
        const candleManager = await existingPromise;
        if (candleManager && !candleManager.isInstanceDestroyed()) {
          return candleManager;
        }
      } catch (error) {
        console.warn(`⚠️ CANDLE: Existing creation promise failed for ${simulationId}:`, error);
        this.candleManagerCreationPromises.delete(simulationId);
      }
    }
    
    // Set initialization status
    this.candleManagerInitializationStatus.set(simulationId, 'pending');
    
    // Create new CandleManager
    const creationPromise = this.createCandleManagerSafe(simulationId, price);
    this.candleManagerCreationPromises.set(simulationId, creationPromise);
    
    try {
      const candleManager = await creationPromise;
      
      // Initialize it
      this.candleManagerInitializationStatus.set(simulationId, 'initializing');
      
      const simulation = this.simulations.get(simulationId);
      if (simulation) {
        candleManager.initialize(simulation.startTime, price);
        console.log(`🔧 CANDLE: Initialized CandleManager for ${simulationId}`);
      }
      
      // Mark as ready
      this.candleManagerReadiness.set(simulationId, true);
      this.candleManagerInitializationStatus.set(simulationId, 'ready');
      
      console.log(`✅ CANDLE: CandleManager ensured and ready for ${simulationId}`);
      return candleManager;
      
    } catch (error) {
      console.error(`❌ CANDLE: Error ensuring CandleManager for ${simulationId}:`, error);
      this.candleManagerInitializationStatus.set(simulationId, 'error');
      throw error;
    } finally {
      this.candleManagerCreationPromises.delete(simulationId);
    }
  }

  // Safe CandleManager creation with error handling
  private async createCandleManagerSafe(simulationId: string, price: number): Promise<CandleManager> {
    console.log(`🏭 CANDLE: Creating CandleManager for ${simulationId} with price ${price}`);
    
    // Check if one already exists (race condition check)
    if (CandleManager.hasInstance(simulationId)) {
      console.log(`🔄 CANDLE: CandleManager already exists for ${simulationId}, using existing`);
      const existing = await CandleManager.getInstance(simulationId);
      
      if (existing && !existing.isInstanceDestroyed()) {
        return existing;
      } else {
        console.log(`🧹 CANDLE: Cleaning up invalid existing instance for ${simulationId}`);
        await CandleManager.cleanup(simulationId);
      }
    }

    const dynamicInterval = this.getPriceCategoryCandleInterval(price);
    
    try {
      const candleManager = await CandleManager.getInstance(simulationId, dynamicInterval);
      console.log(`🕯️ CANDLE: Created CandleManager for ${simulationId} with ${dynamicInterval}ms interval`);
      return candleManager;
    } catch (error) {
      console.error(`❌ CANDLE: Error creating CandleManager for ${simulationId}:`, error);
      throw error;
    }
  }

  // Wait for CandleManager to be ready
  private async waitForCandleManagerReady(simulationId: string, timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const status = this.candleManagerInitializationStatus.get(simulationId);
      
      if (status === 'ready') {
        const candleManager = await this.getCandleManager(simulationId);
        if (candleManager && candleManager.isInstanceInitialized()) {
          return true;
        }
      }
      
      if (status === 'error') {
        console.error(`❌ CANDLE: CandleManager initialization failed for ${simulationId}`);
        return false;
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.warn(`⚠️ CANDLE: Timeout waiting for CandleManager ready for ${simulationId}`);
    return false;
  }

  // Clean up CandleManager for simulation
  private async cleanupCandleManagerForSimulation(simulationId: string): Promise<void> {
    console.log(`🧹 CANDLE: Cleaning up CandleManager for ${simulationId}`);
    
    try {
      // Remove from our tracking maps
      this.candleManagerReadiness.delete(simulationId);
      this.candleManagerInitializationStatus.delete(simulationId);
      
      // Cancel any pending creation promises
      if (this.candleManagerCreationPromises.has(simulationId)) {
        console.log(`🚫 CANDLE: Cancelling creation promise for ${simulationId}`);
        this.candleManagerCreationPromises.delete(simulationId);
      }
      
      // Clean up the CandleManager singleton
      await CandleManager.cleanup(simulationId);
      
      console.log(`✅ CANDLE: Cleanup completed for ${simulationId}`);
    } catch (error) {
      console.error(`❌ CANDLE: Error during cleanup for ${simulationId}:`, error);
    }
  }

  private getPriceCategoryCandleInterval(price: number): number {
    if (price < 0.01) return 6000;
    else if (price < 1) return 8000;
    else if (price < 10) return 10000;
    else if (price < 100) return 12000;
    else return 15000;
  }

  private startTPSMetricsTracking(simulationId: string): void {
    if (this.metricsUpdateIntervals.has(simulationId)) {
      return;
    }
    
    console.log(`📊 METRICS: Starting TPS tracking for ${simulationId}`);
    
    const interval = setInterval(() => {
      const simulation = this.simulations.get(simulationId);
      if (!simulation) {
        this.stopTPSMetricsTracking(simulationId);
        return;
      }
      
      const liveMetrics = this.calculateLiveTPSMetrics(simulation);
      this.liveTPSMetrics.set(simulationId, liveMetrics);
      this.throttledTPSMetricsBroadcast(simulationId, liveMetrics);
      
    }, this.metricsUpdateInterval);
    
    this.metricsUpdateIntervals.set(simulationId, interval);
    this.startPoolCleanupForSimulation(simulationId);
  }

  private startPoolCleanupForSimulation(simulationId: string): void {
    if (this.poolCleanupIntervals.has(simulationId)) {
      return;
    }

    const cleanupInterval = setInterval(() => {
      this.performScheduledPoolCleanup(simulationId);
    }, this.POOL_CLEANUP_INTERVAL);

    this.poolCleanupIntervals.set(simulationId, cleanupInterval);
    console.log(`🧹 CLEANUP: Started pool monitoring for ${simulationId}`);
  }

  // Enhanced scheduled cleanup with cross-pool prevention
  private performScheduledPoolCleanup(simulationId: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) {
      this.stopPoolCleanupForSimulation(simulationId);
      return;
    }

    console.log(`🧹 CLEANUP: Scheduled cleanup for ${simulationId}`);

    try {
      // Proper object type checking before release
      if (simulation.recentTrades.length > 2000) {
        const excessTrades = simulation.recentTrades.splice(2000);
        excessTrades.forEach(trade => {
          try {
            // Verify it's actually a trade object before releasing
            if (trade && 
                typeof trade.id === 'string' && 
                typeof trade.timestamp === 'number' &&
                typeof trade.price === 'number') {
              this.dataGenerator.releaseTrade(trade);
              this.incrementReleasedCounter(simulationId);
            } else {
              console.warn(`⚠️ CLEANUP: Invalid trade object skipped`, Object.keys(trade || {}));
            }
          } catch (error) {
            console.error(`❌ Error releasing trade during cleanup:`, error);
          }
        });
        console.log(`🔄 CLEANUP: Released ${excessTrades.length} excess trades`);
      }

      if (simulation.closedPositions.length > 500) {
        const excessPositions = simulation.closedPositions.splice(500);
        excessPositions.forEach(position => {
          try {
            // Verify it's actually a position object before releasing
            if (position && 
                typeof position.entryTime === 'number' && 
                typeof position.entryPrice === 'number' &&
                typeof position.quantity === 'number') {
              this.dataGenerator.releasePosition(position);
            } else {
              console.warn(`⚠️ CLEANUP: Invalid position object skipped`, Object.keys(position || {}));
            }
          } catch (error) {
            console.error(`❌ Error releasing position during cleanup:`, error);
          }
        });
        console.log(`🔄 CLEANUP: Released ${excessPositions.length} excess positions`);
      }

    } catch (error) {
      console.error(`❌ CLEANUP: Error during scheduled cleanup:`, error);
    }
  }

  private stopPoolCleanupForSimulation(simulationId: string): void {
    const interval = this.poolCleanupIntervals.get(simulationId);
    if (interval) {
      clearInterval(interval);
      this.poolCleanupIntervals.delete(simulationId);
      console.log(`🛑 CLEANUP: Stopped pool monitoring for ${simulationId}`);
    }
  }

  private throttledTPSMetricsBroadcast(simulationId: string, metrics: ExternalMarketMetrics): void {
    const now = Date.now();
    const lastBroadcast = this.lastTPSBroadcast.get(simulationId) || 0;
    
    if (now - lastBroadcast < this.TPS_BROADCAST_THROTTLE_MS) {
      return;
    }
    
    const metricsSnapshot = JSON.stringify({
      actualTPS: metrics.actualTPS,
      currentTPS: metrics.currentTPS,
      queueDepth: metrics.queueDepth,
      marketSentiment: metrics.marketSentiment,
      dominantTraderType: metrics.dominantTraderType
    });
    
    const lastSnapshot = this.lastTPSMetricsSnapshot.get(simulationId);
    const hasChanges = lastSnapshot !== metricsSnapshot;
    const forceUpdate = now - lastBroadcast > this.TPS_BROADCAST_THROTTLE_MS * 5;
    
    if (hasChanges || forceUpdate) {
      this.broadcastTPSMetricsUpdate(simulationId, metrics);
      this.lastTPSBroadcast.set(simulationId, now);
      this.lastTPSMetricsSnapshot.set(simulationId, metricsSnapshot);
    }
  }

  private stopTPSMetricsTracking(simulationId: string): void {
    const interval = this.metricsUpdateIntervals.get(simulationId);
    if (interval) {
      clearInterval(interval);
      this.metricsUpdateIntervals.delete(simulationId);
      this.liveTPSMetrics.delete(simulationId);
      this.lastTPSBroadcast.delete(simulationId);
      this.lastTPSMetricsSnapshot.delete(simulationId);
      console.log(`📊 METRICS: Stopped TPS tracking for ${simulationId}`);
    }

    this.stopPoolCleanupForSimulation(simulationId);
  }

  private calculateLiveTPSMetrics(simulation: ExtendedSimulationState): ExternalMarketMetrics {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const fiveSecondsAgo = now - 5000;
    
    const tradesLastSecond = simulation.recentTrades.filter(trade => 
      trade.timestamp > oneSecondAgo
    ).length;
    
    const tradesLast5Seconds = simulation.recentTrades.filter(trade => 
      trade.timestamp > fiveSecondsAgo
    ).length;
    
    const actualTPS = tradesLastSecond;
    const avgTPS = Math.round(tradesLast5Seconds / 5);
    
    const recentTrades = simulation.recentTrades.slice(0, 20);
    const buyCount = recentTrades.filter(t => t.action === 'buy').length;
    const sellCount = recentTrades.filter(t => t.action === 'sell').length;
    
    let marketSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (buyCount > sellCount * 1.3) {
      marketSentiment = 'bullish';
    } else if (sellCount > buyCount * 1.3) {
      marketSentiment = 'bearish';
    }
    
    const currentMode = simulation.currentTPSMode || TPSMode.NORMAL;
    const targetTPS = this.getTargetTPSForMode(currentMode);
    const queueDepth = Math.max(0, targetTPS - actualTPS);
    
    let dominantTraderType: ExternalTraderType;
    switch (currentMode) {
      case TPSMode.HFT:
        dominantTraderType = ExternalTraderType.MEV_BOT;
        break;
      case TPSMode.STRESS:
        dominantTraderType = ExternalTraderType.PANIC_SELLER;
        break;
      case TPSMode.BURST:
        dominantTraderType = ExternalTraderType.ARBITRAGE_BOT;
        break;
      default:
        dominantTraderType = ExternalTraderType.RETAIL_TRADER;
    }
    
    const processedOrders = simulation.externalMarketMetrics?.processedOrders || 0;
    const rejectedOrders = simulation.externalMarketMetrics?.rejectedOrders || 0;
    
    return {
      currentTPS: targetTPS,
      actualTPS: actualTPS,
      queueDepth: queueDepth,
      processedOrders: processedOrders + recentTrades.length,
      rejectedOrders: rejectedOrders,
      avgProcessingTime: actualTPS > 0 ? 1000 / actualTPS : 0,
      dominantTraderType: dominantTraderType,
      marketSentiment: marketSentiment,
      liquidationRisk: this.calculateLiquidationRisk(simulation)
    };
  }

  private calculateLiquidationRisk(simulation: ExtendedSimulationState): number {
    const currentPrice = simulation.currentPrice;
    const initialPrice = simulation.parameters.initialPrice;
    const priceChange = Math.abs(currentPrice - initialPrice) / initialPrice;
    
    const volatilityFactor = simulation.marketConditions.volatility || 1;
    const riskScore = (priceChange * 100) + (volatilityFactor * 10);
    
    return Math.min(100, Math.max(0, riskScore));
  }

  private broadcastTPSMetricsUpdate(simulationId: string, metrics: ExternalMarketMetrics): void {
    this.broadcastService.broadcastEvent(simulationId, {
      type: 'external_market_pressure',
      timestamp: Date.now(),
      data: {
        tpsMode: this.getTPSModeString(simulationId),
        processedOrders: metrics.actualTPS,
        queueDepth: metrics.queueDepth,
        metrics: metrics
      }
    });
  }

  private getTPSModeString(simulationId: string): string {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return 'NORMAL';
    
    const mode = simulation.currentTPSMode || TPSMode.NORMAL;
    return TPSMode[mode] || 'NORMAL';
  }

  public getLiveTPSMetrics(simulationId: string): ExternalMarketMetrics | undefined {
    const liveMetrics = this.liveTPSMetrics.get(simulationId);
    if (liveMetrics) {
      return liveMetrics;
    }
    
    const simulation = this.simulations.get(simulationId);
    if (simulation) {
      return this.calculateLiveTPSMetrics(simulation);
    }
    
    return undefined;
  }

  private startProcessedTradesSync(): void {
    this.processedTradesSyncInterval = setInterval(() => {
      if (!this.transactionQueue) return;

      this.simulations.forEach((simulation, id) => {
        const processedResults = this.transactionQueue!.getProcessedTrades(id, 100);
        
        if (processedResults.length > 0) {
          const processedTrades = simulation.recentTrades.filter(trade => 
            processedResults.some(result => result.tradeId === trade.id && result.processed)
          );

          if (processedTrades.length > 0) {
            this.traderEngine.integrateProcessedTrades(simulation, processedTrades);
            processedTrades.forEach(() => this.incrementReleasedCounter(id));
            
            if (simulation.externalMarketMetrics) {
              simulation.externalMarketMetrics.processedOrders += processedTrades.length;
            }
          }
        }
      });
    }, this.processedTradesSyncIntervalTime);
  }

  setBroadcastManager(broadcastManager: BroadcastManager): void {
    this.broadcastManager = broadcastManager;
    this.broadcastService.setBroadcastManager(broadcastManager);
  }

  setTransactionQueue(transactionQueue: TransactionQueue): void {
    this.transactionQueue = transactionQueue;
    this.traderEngine.setTransactionQueue(transactionQueue);
    
    transactionQueue.setTradeProcessedCallback((trade: Trade, simulationId: string) => {
      const simulation = this.simulations.get(simulationId);
      if (!simulation) return;

      this.traderEngine.integrateProcessedTrades(simulation, [trade]);
      this.incrementReleasedCounter(simulationId);
      this.simulations.set(simulationId, simulation);
    });
  }

  registerClient(client: WebSocket): void {
    this.broadcastService.registerClient(client);
  }

  // 🚨 CRITICAL FIX: Prevent multiple simultaneous simulations with enhanced coordination
  async createSimulation(parameters: Partial<EnhancedSimulationParameters> = {}): Promise<ExtendedSimulationState> {
    // Global lock to prevent multiple simulations
    if (SimulationManager.globalSimulationLock || SimulationManager.simulationCreationInProgress) {
      console.warn(`🔒 PREVENTED: Simulation creation blocked - lock: ${SimulationManager.globalSimulationLock}, inProgress: ${SimulationManager.simulationCreationInProgress}`);
      
      if (SimulationManager.activeSimulationId) {
        const existingSimulation = this.simulations.get(SimulationManager.activeSimulationId);
        if (existingSimulation) {
          console.log(`✅ REUSE: Returning existing simulation ${SimulationManager.activeSimulationId}`);
          return existingSimulation;
        }
      }
      
      throw new Error('Simulation creation is locked - only one simulation allowed at a time');
    }
    
    // Lock creation process immediately
    SimulationManager.simulationCreationInProgress = true;
    
    try {
      // If there's already an active simulation, clean it up first
      if (SimulationManager.activeSimulationId) {
        console.log(`🧹 CLEANUP: Removing existing simulation ${SimulationManager.activeSimulationId}`);
        await this.deleteSimulation(SimulationManager.activeSimulationId);
        SimulationManager.activeSimulationId = null;
      }
      
      const simulationId = uuidv4();
      
      console.log(`🏗️ CREATING: Single simulation ${simulationId} with global lock`);
      
      this.simulationRegistrationStatus.set(simulationId, 'creating');
      this.simulationTradeCounters.set(simulationId, { generated: 0, released: 0 });
      
      // Enhanced Dune API trader loading with proper fallback
      console.log(`🔍 TRADERS: Loading real Dune Analytics traders...`);
      const traders = await duneApi.getPumpFunTraders();
      
      let simulation: ExtendedSimulationState;
      
      if (traders && traders.length > 0) {
        console.log(`🔥 [ALL PARTICIPANTS] Activating ${traders.length}/${traders.length} real Dune Analytics traders (100%)`);
        
        const convertedTraders = traders.map(t => ({
          position: t.position,
          walletAddress: t.wallet_address,
          netPnl: t.net_pnl,
          totalVolume: t.total_volume,
          buyVolume: t.buy_volume,
          sellVolume: t.sell_volume,
          tradeCount: t.trade_count,
          feesUsd: t.fees_usd,
          winRate: t.win_rate || 0.5,
          riskProfile: this.dataGenerator.determineRiskProfile(t),
          portfolioEfficiency: t.net_pnl / (t.total_volume || 1)
        }));
        
        const traderProfiles = traderService.generateTraderProfiles(convertedTraders);
        simulation = await this.finalizeSimulationCreation(simulationId, parameters, convertedTraders, traderProfiles);
      } else {
        console.warn(`⚠️ [FALLBACK PARTICIPANTS] Dune API failed, generating 118 dummy traders (fallback: true)`);
        simulation = await this.createSimulationWithDummyTraders(simulationId, parameters);
      }
      
      this.simulationRegistrationStatus.set(simulationId, 'registering');
      
      this.simulations.set(simulationId, simulation);
      this.simulationSpeeds.set(simulationId, simulation.parameters.timeCompressionFactor);
      
      const aggressiveTimeframe: Timeframe = '1m';
      this.simulationTimeframes.set(simulationId, aggressiveTimeframe);
      
      // Create and coordinate CandleManager during simulation creation
      console.log(`🕯️ CANDLE: Creating CandleManager for ${simulationId} with price ${simulation.currentPrice}`);
      await this.ensureCandleManagerExists(simulationId, simulation.currentPrice);
      
      // Wait for CandleManager to be ready
      const isReady = await this.waitForCandleManagerReady(simulationId, 10000);
      if (!isReady) {
        console.warn(`⚠️ CANDLE: CandleManager not ready for ${simulationId}, but continuing...`);
      }
      
      if (this.externalCandleUpdateCallback) {
        this.externalCandleUpdateCallback.ensureCleanStart(simulationId);
        console.log(`🔗 COORDINATOR: External coordinator initialized for ${simulationId}`);
      }
      
      console.log(`📊 METRICS: TPS tracking will start when simulation starts`);
      
      await this.verifySimulationRegistration(simulationId);
      
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      this.notifyRegistrationCallbacks(simulationId, 'ready');
      
      // Set as active simulation and lock globally
      SimulationManager.activeSimulationId = simulationId;
      SimulationManager.globalSimulationLock = true;
      
      console.log(`✅ CREATED: Single simulation ${simulationId} with global lock enabled`);
      console.log(`🔒 GLOBAL STATE: activeId=${SimulationManager.activeSimulationId}, locked=${SimulationManager.globalSimulationLock}`);
      
      return simulation;
      
    } catch (error) {
      console.error(`❌ Error creating simulation:`, error);
      
      // Reset global state on error
      SimulationManager.globalSimulationLock = false;
      SimulationManager.activeSimulationId = null;
      
      const emergencySimulation = await this.createSimulationWithDummyTraders(uuidv4(), parameters);
      SimulationManager.activeSimulationId = emergencySimulation.id;
      SimulationManager.globalSimulationLock = true;
      
      return emergencySimulation;
    } finally {
      SimulationManager.simulationCreationInProgress = false;
    }
  }

  // Complete resource cleanup with global state management and enhanced CandleManager cleanup
  private async cleanupSimulationResources(simulationId: string): Promise<void> {
    console.log(`🧹 CLEANUP: Cleaning up resources for ${simulationId}`);
    
    this.stopTPSMetricsTracking(simulationId);
    this.stopPoolCleanupForSimulation(simulationId);
    
    // Clean up CandleManager coordination
    await this.cleanupCandleManagerForSimulation(simulationId);
    
    this.simulationTradeCounters.delete(simulationId);
    this.simulationSpeeds.delete(simulationId);
    this.simulationTimeframes.delete(simulationId);
    this.simulationRegistrationStatus.delete(simulationId);
    this.registrationCallbacks.delete(simulationId);
    
    // Clean up pause operation tracking
    this.pauseOperations.delete(simulationId);
    this.pauseOperationLocks.delete(simulationId);
    this.pauseStateMutex.delete(simulationId); // NEW: Clean up mutex
    
    // 🚨 CRITICAL FIX: Clean up WebSocket readiness tracking
    this.websocketReadinessStatus.delete(simulationId);
    this.websocketRegistrationPromises.delete(simulationId);
    
    // Reset global state if this was the active simulation
    if (SimulationManager.activeSimulationId === simulationId) {
      SimulationManager.activeSimulationId = null;
      SimulationManager.globalSimulationLock = false;
      console.log(`🔓 UNLOCKED: Global simulation lock released for ${simulationId}`);
    }
    
    console.log(`✅ CLEANUP: Resource cleanup completed for ${simulationId}`);
  }

  // Enhanced async verification with proper CandleManager check
  private async verifySimulationRegistration(simulationId: string): Promise<void> {
    const maxAttempts = 10;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const simulation = this.simulations.get(simulationId);
      const speed = this.simulationSpeeds.get(simulationId);
      
      // Check if CandleManager is ready
      const candleManagerReady = this.candleManagerReadiness.get(simulationId);
      const candleManagerStatus = this.candleManagerInitializationStatus.get(simulationId);
      
      if (simulation && speed !== undefined && candleManagerReady && candleManagerStatus === 'ready') {
        // Double-check by actually getting the CandleManager
        const candleManager = await this.getCandleManager(simulationId);
        if (candleManager && candleManager.isInstanceInitialized()) {
          console.log(`✅ VERIFY: Simulation ${simulationId} fully registered and ready`);
          return;
        }
      }
      
      attempts++;
      console.log(`🔍 VERIFY: Attempt ${attempts}/${maxAttempts} - simulation: ${!!simulation}, speed: ${speed}, candleReady: ${candleManagerReady}, candleStatus: ${candleManagerStatus}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    throw new Error(`Failed to verify simulation ${simulationId} registration after ${maxAttempts} attempts`);
  }

  async isSimulationRegistered(simulationId: string): Promise<boolean> {
    try {
      const simulation = this.simulations.get(simulationId);
      if (!simulation) return false;
      
      const status = this.simulationRegistrationStatus.get(simulationId);
      if (status !== 'ready' && status !== 'starting' && status !== 'running') {
        return false;
      }
      
      // Check CandleManager
      const candleManager = await this.getCandleManager(simulationId);
      if (!candleManager || !candleManager.isInstanceInitialized()) {
        return false;
      }
      
      return true;
      
    } catch (error) {
      console.error(`Error checking registration for ${simulationId}:`, error);
      return false;
    }
  }

  // 🚨 CRITICAL FIX: Restore WebSocket readiness tracking for proper coordination
  isSimulationReady(simulationId: string): boolean {
    const status = this.simulationRegistrationStatus.get(simulationId);
    const candleManagerReady = this.candleManagerReadiness.get(simulationId);
    const websocketReady = this.websocketReadinessStatus.get(simulationId);
    
    return (status === 'ready' || status === 'starting' || status === 'running') && 
           candleManagerReady === true && 
           websocketReady !== false; // Allow undefined as ready
  }

  async waitForSimulationReady(simulationId: string, timeoutMs: number = 5000): Promise<boolean> {
    const status = this.simulationRegistrationStatus.get(simulationId);
    
    if ((status === 'ready' || status === 'starting' || status === 'running') && 
        this.candleManagerReadiness.get(simulationId) &&
        this.websocketReadinessStatus.get(simulationId) !== false) {
      return true;
    }
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error(`Timeout waiting for simulation ${simulationId} to be ready`);
        resolve(false);
      }, timeoutMs);
      
      if (!this.registrationCallbacks.has(simulationId)) {
        this.registrationCallbacks.set(simulationId, []);
      }
      
      this.registrationCallbacks.get(simulationId)!.push((newStatus: string) => {
        if ((newStatus === 'ready' || newStatus === 'starting' || newStatus === 'running') && 
            this.candleManagerReadiness.get(simulationId) &&
            this.websocketReadinessStatus.get(simulationId) !== false) {
          clearTimeout(timeout);
          resolve(true);
        } else if (newStatus === 'error') {
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });
  }

  private notifyRegistrationCallbacks(simulationId: string, status: string): void {
    const callbacks = this.registrationCallbacks.get(simulationId);
    if (callbacks) {
      callbacks.forEach(callback => callback(status));
      this.registrationCallbacks.delete(simulationId);
    }
  }

  private async createSimulationWithDummyTraders(simulationId: string, parameters: Partial<EnhancedSimulationParameters> = {}): Promise<ExtendedSimulationState> {
    const dummyTraders = this.dataGenerator.generateDummyTraders(118);
    const traderProfiles = traderService.generateTraderProfiles(dummyTraders);
    
    return await this.finalizeSimulationCreation(simulationId, parameters, dummyTraders, traderProfiles);
  }

  // Async finalization with CandleManager coordination
  private async finalizeSimulationCreation(
    simulationId: string,
    parameters: Partial<EnhancedSimulationParameters>,
    traders: any[],
    traderProfiles: any[]
  ): Promise<ExtendedSimulationState> {
    
    let dynamicInitialPrice: number;
    
    if (parameters.customPrice && parameters.customPrice > 0) {
      dynamicInitialPrice = parameters.customPrice;
      console.log(`💰 CUSTOM PRICE: Using user-specified price $${dynamicInitialPrice}`);
    } else if (parameters.initialPrice && parameters.initialPrice > 0) {
      dynamicInitialPrice = parameters.initialPrice;
      console.log(`💰 EXPLICIT PRICE: Using parameter-specified price $${dynamicInitialPrice}`);
    } else {
      const priceRange = parameters.priceRange;
      dynamicInitialPrice = this.marketEngine.generateRandomTokenPrice(priceRange);
      
      const priceInfo = this.marketEngine.getPriceCategory(dynamicInitialPrice);
      console.log(`🎲 DYNAMIC PRICE: Generated ${dynamicInitialPrice} (${priceInfo.description}: ${priceInfo.range})`);
    }
    
    const defaultParams: SimulationParameters = {
      timeCompressionFactor: 50,
      initialPrice: dynamicInitialPrice,
      initialLiquidity: this.calculateDynamicLiquidity(dynamicInitialPrice),
      volatilityFactor: 2.0,
      duration: 60 * 24,
      scenarioType: 'standard'
    };
    
    const finalParams = { ...defaultParams, ...parameters };
    
    if (!parameters.customPrice && !parameters.initialPrice) {
      finalParams.initialPrice = dynamicInitialPrice;
    }
    
    this.simulationSpeeds.set(simulationId, finalParams.timeCompressionFactor);
    
    const aggressiveTimeframe: Timeframe = '1m';
    this.simulationTimeframes.set(simulationId, aggressiveTimeframe);
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    const currentPrice = finalParams.initialPrice;
    
    console.log(`🚀 SIMULATION CREATED: ${simulationId}`);
    console.log(`   💰 Starting Price: ${currentPrice}`);
    console.log(`   💧 Liquidity Pool: ${(finalParams.initialLiquidity / 1000000).toFixed(2)}M`);
    console.log(`   ⚡ Speed: ${finalParams.timeCompressionFactor}x`);
    console.log(`   📊 CandleManager: WILL BE COORDINATED`);
    
    // Proper externalMarketMetrics initialization
    const validExternalMarketMetrics: ExternalMarketMetrics = {
      currentTPS: 25,
      actualTPS: 0,
      queueDepth: 0,
      processedOrders: 0,
      rejectedOrders: 0,
      avgProcessingTime: 0,
      dominantTraderType: ExternalTraderType.RETAIL_TRADER,
      marketSentiment: 'neutral',
      liquidationRisk: 0
    };
    
    // Start with EMPTY chart - let it build naturally
    const simulation: ExtendedSimulationState = {
      id: simulationId,
      startTime: simulationStartTime,
      currentTime: simulationStartTime,
      endTime: simulationStartTime + (finalParams.duration * 60 * 1000),
      isRunning: false,
      isPaused: false,
      parameters: finalParams,
      marketConditions: {
        volatility: this.marketEngine.calculateBaseVolatility(currentPrice) * finalParams.volatilityFactor,
        trend: 'sideways',
        volume: finalParams.initialLiquidity * 0.25
      },
      // Start with empty price history - chart builds from simulation data
      priceHistory: [],
      currentPrice: currentPrice,
      orderBook: {
        bids: this.orderBookManager.generateInitialOrderBook('bids', currentPrice, finalParams.initialLiquidity),
        asks: this.orderBookManager.generateInitialOrderBook('asks', currentPrice, finalParams.initialLiquidity),
        lastUpdateTime: simulationStartTime
      },
      traders: traderProfiles,
      activePositions: [],
      closedPositions: [],
      recentTrades: [],
      traderRankings: traders.sort((a, b) => b.netPnl - a.netPnl),
      _tickCounter: 0,
      currentTPSMode: TPSMode.NORMAL,
      externalMarketMetrics: validExternalMarketMetrics
    };
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(simulationId);
    }
    
    this.timeframeManager.clearCache(simulationId);
    
    console.log(`✅ VALIDATION: Clean start - empty priceHistory, ready for real-time data`);
    console.log(`✅ VALIDATION: externalMarketMetrics properly initialized`);
    console.log(`✅ VALIDATION: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
    
    return simulation;
  }

  private calculateDynamicLiquidity(price: number): number {
    if (price < 0.001) {
      return 50000 + Math.random() * 150000;
    } else if (price < 0.01) {
      return 100000 + Math.random() * 300000;
    } else if (price < 0.1) {
      return 200000 + Math.random() * 500000;
    } else if (price < 1) {
      return 500000 + Math.random() * 1500000;
    } else if (price < 10) {
      return 1000000 + Math.random() * 4000000;
    } else if (price < 100) {
      return 5000000 + Math.random() * 15000000;
    } else {
      return 10000000 + Math.random() * 40000000;
    }
  }

  getSimulation(id: string): ExtendedSimulationState | undefined {
    return this.simulations.get(id);
  }

  getAllSimulations(): ExtendedSimulationState[] {
    return Array.from(this.simulations.values());
  }

  setSimulationSpeed(id: string, speed: number): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    const maxSpeed = 200;
    const validSpeed = Math.max(1, Math.min(maxSpeed, speed));
    
    this.simulationSpeeds.set(id, validSpeed);
    simulation.parameters.timeCompressionFactor = validSpeed;
    
    if (simulation._tickCounter !== undefined) {
      simulation._tickCounter = 0;
    }
    
    if (this.externalCandleUpdateCallback) {
      this.externalCandleUpdateCallback.setSimulationSpeed(id, validSpeed);
    }
    
    if (validSpeed >= 50) {
      this.performanceOptimizer.enableHighFrequencyMode();
    }
  }

  // Enhanced async startSimulation with CandleManager coordination
  async startSimulation(id: string): Promise<void> {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      console.error(`❌ [START] Simulation ${id} not found`);
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    console.log(`🔍 [START] Current state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
    
    if (simulation.isRunning && !simulation.isPaused) {
      console.warn(`⚠️ [START] Simulation ${id} already running`);
      throw new Error(`Simulation ${id} is already running`);
    }
    
    try {
      if (!simulation.isRunning) {
        simulation.isRunning = true;
        simulation.isPaused = false;
        console.log(`🚀 [START] Starting simulation ${id} for the first time`);
      } else if (simulation.isPaused) {
        simulation.isPaused = false;
        console.log(`▶️ [START] Resuming paused simulation ${id}`);
      }
      
      this.simulations.set(id, simulation);
      this.simulationRegistrationStatus.set(id, 'starting');
      
      const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
      const timeframe = this.simulationTimeframes.get(id) || '1m';
      
      // Start TPS metrics tracking when simulation starts
      if (!this.metricsUpdateIntervals.has(id)) {
        this.startTPSMetricsTracking(id);
        console.log(`📊 [START] Started TPS tracking for ${id}`);
      }
      
      // Ensure CandleManager is ready before starting
      console.log(`🕯️ [START] Ensuring CandleManager is ready for ${id}`);
      const candleManager = await this.getCandleManager(id);
      
      if (!candleManager) {
        console.warn(`⚠️ [START] No CandleManager found, creating one for ${id}`);
        await this.ensureCandleManagerExists(id, simulation.currentPrice);
        
        // Wait for it to be ready
        const isReady = await this.waitForCandleManagerReady(id, 5000);
        if (!isReady) {
          console.warn(`⚠️ [START] CandleManager still not ready for ${id}, proceeding anyway`);
        }
      } else if (!candleManager.isInstanceInitialized()) {
        console.log(`🔧 [START] Initializing existing CandleManager for ${id}`);
        candleManager.initialize(simulation.startTime, simulation.currentPrice);
        this.candleManagerReadiness.set(id, true);
      }
      
      // Initialize first candle
      const readyCandleManager = await this.getCandleManager(id);
      if (readyCandleManager) {
        readyCandleManager.updateCandle(simulation.currentTime, simulation.currentPrice, 1000);
        console.log(`🕯️ [START] First candle initialized for ${id}`);
      } else {
        console.warn(`⚠️ [START] CandleManager not available for first candle for ${id}`);
      }
      
      const marketAnalysis = this.timeframeManager.analyzeMarketConditions(id, simulation);
      this.broadcastService.broadcastSimulationState(id, {
        isRunning: true,
        isPaused: false,
        speed: speed,
        currentPrice: simulation.currentPrice,
        timeframe: timeframe,
        orderBook: simulation.orderBook,
        priceHistory: simulation.priceHistory,
        activePositions: simulation.activePositions,
        recentTrades: simulation.recentTrades.slice(0, 200),
        traderRankings: simulation.traderRankings.slice(0, 20),
        externalMarketMetrics: simulation.externalMarketMetrics,
        totalTradesProcessed: this.getTotalTradesProcessed(id),
        currentTPSMode: simulation.currentTPSMode
      }, marketAnalysis);
      
      if (!this.simulationIntervals.has(id)) {
        this.startSimulationLoop(id);
      }
      
      this.simulationRegistrationStatus.set(id, 'running');
      
      console.log(`✅ [START] Successfully started simulation ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [START] Failed to start simulation ${id}:`, error);
      
      simulation.isRunning = false;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      this.simulationRegistrationStatus.set(id, 'ready');
      throw error;
    }
  }

  private startSimulationLoop(simulationId: string): void {
    const interval = setInterval(() => {
      try {
        this.advanceSimulation(simulationId);
      } catch (error) {
        console.error(`Error in simulation loop for ${simulationId}:`, error);
      }
    }, this.baseUpdateInterval);
    
    this.simulationIntervals.set(simulationId, interval);
  }

  // Enhanced async advanceSimulation with improved CandleManager integration
  private async advanceSimulation(id: string): Promise<void> {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    try {
      const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
      const timeframe = this.simulationTimeframes.get(id) || '1m';
      
      const aggressiveTicksPerUpdate = Math.max(1, Math.floor(speed / 5));
      
      if (simulation._tickCounter === undefined) simulation._tickCounter = 0;
      simulation._tickCounter++;
      
      if (simulation._tickCounter >= aggressiveTicksPerUpdate) {
        simulation._tickCounter = 0;
        
        const realTimeElapsed = this.baseUpdateInterval;
        const aggressiveTimeAdvancement = realTimeElapsed * speed * 2;
        simulation.currentTime += aggressiveTimeAdvancement;
        
        if (simulation.currentTime >= simulation.endTime) {
          this.pauseSimulation(id);
          return;
        }
        
        this.marketEngine.updatePrice(simulation);
        
        const tradesBefore = simulation.recentTrades.length;
        this.traderEngine.processTraderActions(simulation);
        const tradesAfter = simulation.recentTrades.length;
        const newTrades = tradesAfter - tradesBefore;
        
        for (let i = 0; i < newTrades; i++) {
          this.incrementGeneratedCounter(id);
        }
        
        this.processExternalMarketActivity(simulation);
        
        if (simulation.recentTrades.length < 50) {
          const generatedTrades = this.generateRealisticTradingActivity(simulation);
          for (let i = 0; i < generatedTrades; i++) {
            this.incrementGeneratedCounter(id);
          }
        }
        
        this.orderBookManager.updateOrderBook(simulation);
        this.traderEngine.updatePositionsPnL(simulation);
        
        // Enhanced candle update with better error handling
        await this.updateCandlesFromSimulationSafe(id, simulation);
        
        const marketAnalysis = this.timeframeManager.analyzeMarketConditions(id, simulation);
        
        this.broadcastService.broadcastPriceUpdate(id, {
          type: 'price_update',
          timestamp: simulation.currentTime,
          data: {
            price: simulation.currentPrice,
            orderBook: simulation.orderBook,
            priceHistory: simulation.priceHistory.slice(-250),
            activePositions: simulation.activePositions,
            recentTrades: simulation.recentTrades.slice(0, 1000),
            traderRankings: simulation.traderRankings.slice(0, 20),
            timeframe: timeframe,
            externalMarketMetrics: simulation.externalMarketMetrics,
            totalTradesProcessed: this.getTotalTradesProcessed(id),
            currentTPSMode: simulation.currentTPSMode
          }
        }, marketAnalysis);
        
        this.simulations.set(id, simulation);
      }
      
    } catch (error) {
      console.error(`Error advancing simulation ${id}:`, error);
    }
  }

  private generateRealisticTradingActivity(simulation: ExtendedSimulationState): number {
    const tradeCount = Math.floor(Math.random() * 10) + 5;
    
    for (let i = 0; i < tradeCount; i++) {
      const trader = simulation.traders[Math.floor(Math.random() * simulation.traders.length)];
      const action = Math.random() > 0.5 ? 'buy' : 'sell';
      
      const volatility = simulation.marketConditions.volatility || 0.02;
      const priceVariation = (Math.random() - 0.5) * volatility * 0.5;
      const price = simulation.currentPrice * (1 + priceVariation);
      
      const baseQuantity = 1000;
      const quantityVariation = Math.random() * 3 + 0.5;
      const quantity = baseQuantity * quantityVariation;
      
      const tradeTimestamp = simulation.currentTime + (i * 100);
      
      const trade = {
        id: `trade-${simulation.currentTime}-${i}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: tradeTimestamp,
        trader: {
          walletAddress: trader.trader.walletAddress,
          preferredName: trader.trader.preferredName || trader.trader.walletAddress,
          netPnl: trader.trader.netPnl || 0
        },
        action,
        price,
        quantity,
        value: price * quantity,
        impact: this.calculateRealisticImpact(action, price * quantity, simulation)
      };
      
      simulation.recentTrades.unshift(trade as Trade);
    }
    
    const totalImpact = simulation.recentTrades.slice(0, tradeCount)
      .reduce((sum, trade) => sum + trade.impact, 0);
    
    simulation.currentPrice *= (1 + totalImpact);
    
    return tradeCount;
  }

  private calculateRealisticImpact(action: 'buy' | 'sell', value: number, simulation: ExtendedSimulationState): number {
    const liquidity = simulation.parameters.initialLiquidity;
    const volatility = simulation.marketConditions.volatility || 0.02;
    
    const sizeImpact = (value / liquidity) * 0.1;
    const directionMultiplier = action === 'buy' ? 1 : -1;
    const volatilityAdjustment = 1 + (volatility * 2);
    
    const impact = sizeImpact * directionMultiplier * volatilityAdjustment;
    
    return Math.max(-0.01, Math.min(0.01, impact));
  }

  // Safe candle update with comprehensive error handling and retry logic
  private async updateCandlesFromSimulationSafe(simulationId: string, simulation: ExtendedSimulationState): Promise<void> {
    try {
      const candleManager = await this.getCandleManager(simulationId);
      
      if (!candleManager) {
        // Try to create one if missing
        console.warn(`⚠️ CANDLE: CandleManager missing for ${simulationId}, attempting to recreate`);
        try {
          await this.ensureCandleManagerExists(simulationId, simulation.currentPrice);
          const newCandleManager = await this.getCandleManager(simulationId);
          
          if (newCandleManager) {
            await this.performCandleUpdate(newCandleManager, simulationId, simulation);
          } else {
            console.error(`❌ CANDLE: Failed to recreate CandleManager for ${simulationId}`);
          }
        } catch (recreateError) {
          console.error(`❌ CANDLE: Error recreating CandleManager for ${simulationId}:`, recreateError);
        }
        return;
      }
      
      if (!candleManager.isInstanceInitialized()) {
        console.log(`🔧 CANDLE: Reinitializing CandleManager for ${simulationId}`);
        candleManager.initialize(simulation.startTime, simulation.currentPrice);
        this.candleManagerReadiness.set(simulationId, true);
      }
      
      await this.performCandleUpdate(candleManager, simulationId, simulation);
      
    } catch (error) {
      console.error(`❌ CANDLE: Error in updateCandlesFromSimulationSafe for ${simulationId}:`, error);
      
      // Mark CandleManager as not ready to prevent further issues
      this.candleManagerReadiness.set(simulationId, false);
      this.candleManagerInitializationStatus.set(simulationId, 'error');
    }
  }

  // Separate candle update performance method
  private async performCandleUpdate(candleManager: CandleManager, simulationId: string, simulation: ExtendedSimulationState): Promise<void> {
    const currentVolume = simulation.marketConditions.volume || 1000;
    
    // Single update call to prevent duplicate data
    candleManager.updateCandle(simulation.currentTime, simulation.currentPrice, currentVolume);
    
    if (this.externalCandleUpdateCallback) {
      this.externalCandleUpdateCallback.queueUpdate(
        simulationId, 
        simulation.currentTime, 
        simulation.currentPrice, 
        currentVolume
      );
    }
    
    // Get candles from single source and update priceHistory
    const candles = candleManager.getCandles();
    simulation.priceHistory = candles.map(candle => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume || 0
    }));
  }

  private processExternalMarketActivity(simulation: ExtendedSimulationState): void {
    try {
      const externalTrades = this.externalMarketEngine.processExternalOrders(simulation);
      
      if (externalTrades.length > 0) {
        simulation.recentTrades.unshift(...externalTrades as any[]);
        
        externalTrades.forEach(() => this.incrementGeneratedCounter(simulation.id));
        
        if (simulation.recentTrades.length > 2000) {
          const excessTrades = simulation.recentTrades.splice(2000);
          excessTrades.forEach(trade => {
            try {
              // Proper type checking before release
              if (trade && typeof trade.id === 'string') {
                this.dataGenerator.releaseTrade(trade);
                this.incrementReleasedCounter(simulation.id);
              }
            } catch (error) {
              console.error(`❌ Error releasing excess external trade:`, error);
            }
          });
        }
        
        if (simulation.externalMarketMetrics) {
          simulation.externalMarketMetrics.processedOrders += externalTrades.length;
          simulation.externalMarketMetrics.actualTPS = this.calculateActualTPS(simulation);
          
          const recentExternalTrades = externalTrades.slice(0, 20);
          const buyCount = recentExternalTrades.filter(t => t.action === 'buy').length;
          const sellCount = recentExternalTrades.filter(t => t.action === 'sell').length;
          
          if (buyCount > sellCount * 1.5) {
            simulation.externalMarketMetrics.marketSentiment = 'bullish';
          } else if (sellCount > buyCount * 1.5) {
            simulation.externalMarketMetrics.marketSentiment = 'bearish';
          } else {
            simulation.externalMarketMetrics.marketSentiment = 'neutral';
          }
        }
      }
    } catch (error) {
      console.error(`Error processing external market activity for ${simulation.id}:`, error);
    }
  }

  private calculateActualTPS(simulation: ExtendedSimulationState): number {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    const recentTrades = simulation.recentTrades.filter(trade => 
      trade.timestamp > oneSecondAgo
    );
    
    return recentTrades.length;
  }

  private getTotalTradesProcessed(simulationId: string): number {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return 0;
    
    return simulation.recentTrades.length + simulation.closedPositions.length * 2;
  }

  // 🚨 CRITICAL FIX: Enhanced pause implementation with mutex and proper state management
  async pauseSimulation(id: string): Promise<void> {
    console.log(`⏸️ [PAUSE] Attempting to pause simulation ${id}`);
    
    // 🚨 CRITICAL FIX: Check for mutex lock to prevent race conditions
    if (this.pauseStateMutex.get(id)) {
      console.warn(`⚠️ [PAUSE] Mutex lock active: pause operation already in progress for ${id}`);
      throw new Error(`Pause operation already in progress for simulation ${id}`);
    }
    
    // 🚨 CRITICAL FIX: Set mutex lock immediately
    this.pauseStateMutex.set(id, true);
    
    // Check for existing pause operation to prevent race conditions
    if (this.pauseOperationLocks.get(id)) {
      console.warn(`⚠️ [PAUSE] Race condition prevented: pause operation already in progress for ${id}`);
      this.pauseStateMutex.delete(id); // Clean up mutex
      throw new Error(`Duplicate pause state request - please wait before retrying`);
    }
    
    // Set operation lock immediately
    this.pauseOperationLocks.set(id, true);
    
    // Create pause operation promise
    const pausePromise = this.performPauseOperation(id);
    this.pauseOperations.set(id, pausePromise);
    
    try {
      await pausePromise;
    } finally {
      // Always clean up locks and operations
      this.pauseOperationLocks.delete(id);
      this.pauseOperations.delete(id);
      this.pauseStateMutex.delete(id); // Clean up mutex
    }
  }

  // Separate pause operation method for better error handling
  private async performPauseOperation(id: string): Promise<void> {
    try {
      const simulation = this.simulations.get(id);
      
      if (!simulation) {
        const error = new Error(`Simulation with ID ${id} not found`);
        console.error(`❌ [PAUSE] ${error.message}`);
        throw error;
      }
      
      console.log(`🔍 [PAUSE] Current state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
      
      if (!simulation.isRunning) {
        const error = new Error(`Cannot pause simulation ${id} - not running`);
        console.error(`❌ [PAUSE] ${error.message}`);
        throw error;
      }
      
      if (simulation.isPaused) {
        const error = new Error(`Cannot pause simulation ${id} - already paused`);
        console.error(`❌ [PAUSE] ${error.message}`);
        throw error;
      }
      
      console.log(`⏸️ [PAUSE] Pausing simulation ${id}`);
      
      // 🚨 CRITICAL FIX: Set pause state BEFORE stopping intervals to prevent race conditions
      simulation.isPaused = true;
      this.simulations.set(id, simulation);
      
      // Stop simulation loop immediately
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
        console.log(`⏸️ [PAUSE] Stopped data generation for ${id}`);
      }
      
      // Stop TPS metrics to prevent further updates
      this.stopTPSMetricsTracking(id);
      console.log(`📊 [PAUSE] Stopped TPS metrics for ${id}`);
      
      // 🚨 CRITICAL FIX: Finalize current candle with enhanced error handling
      try {
        const candleManager = await this.getCandleManager(id);
        if (candleManager && candleManager.isInstanceInitialized()) {
          candleManager.forceFinalizeCurrent();
          console.log(`🕯️ [PAUSE] Finalized current candle for ${id}`);
        } else {
          console.warn(`⚠️ [PAUSE] CandleManager not available for finalization for ${id}`);
        }
      } catch (candleError) {
        console.error(`❌ [PAUSE] Error finalizing candle for ${id}:`, candleError);
      }
      
      // Immediate cleanup
      this.performScheduledPoolCleanup(id);
      console.log(`🧹 [PAUSE] Performed cleanup during pause for ${id}`);
      
      // Broadcast pause state
      this.broadcastService.broadcastSimulationStatus(
        id,
        simulation.isRunning,
        simulation.isPaused,
        this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
        simulation.currentPrice
      );
      
      console.log(`✅ [PAUSE] Successfully paused ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [PAUSE] Error pausing simulation ${id}:`, error);
      
      // 🚨 CRITICAL FIX: Reset pause state on error to prevent stuck state
      const simulation = this.simulations.get(id);
      if (simulation) {
        simulation.isPaused = false;
        this.simulations.set(id, simulation);
        console.log(`🔄 [PAUSE] Reset state after error for ${id}`);
      }
      
      throw error;
    }
  }

  // 🚨 CRITICAL FIX: Enhanced resume implementation with mutex and proper state management
  async resumeSimulation(id: string): Promise<void> {
    console.log(`▶️ [RESUME] Attempting to resume simulation ${id}`);
    
    // 🚨 CRITICAL FIX: Check for mutex lock to prevent race conditions
    if (this.pauseStateMutex.get(id)) {
      console.warn(`⚠️ [RESUME] Mutex lock active: pause operation in progress for ${id}`);
      throw new Error(`Cannot resume while pause operation is in progress - please wait`);
    }
    
    // 🚨 CRITICAL FIX: Set mutex lock for resume
    this.pauseStateMutex.set(id, true);
    
    // Check for existing pause operation to prevent race conditions
    if (this.pauseOperationLocks.get(id)) {
      console.warn(`⚠️ [RESUME] Race condition prevented: pause operation in progress for ${id}`);
      this.pauseStateMutex.delete(id); // Clean up mutex
      throw new Error(`Cannot resume while pause operation is in progress - please wait`);
    }
    
    // Set operation lock for resume
    this.pauseOperationLocks.set(id, true);
    
    try {
      const simulation = this.simulations.get(id);
      
      if (!simulation) {
        const error = new Error(`Simulation with ID ${id} not found`);
        console.error(`❌ [RESUME] ${error.message}`);
        throw error;
      }
      
      console.log(`🔍 [RESUME] Current state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
      
      if (!simulation.isRunning) {
        const error = new Error(`Cannot resume simulation ${id} - not running`);
        console.error(`❌ [RESUME] ${error.message}`);
        throw error;
      }
      
      if (!simulation.isPaused) {
        const error = new Error(`Cannot resume simulation ${id} - not paused`);
        console.error(`❌ [RESUME] ${error.message}`);
        throw error;
      }
      
      console.log(`▶️ [RESUME] Resuming simulation ${id}`);
      
      // 🚨 CRITICAL FIX: Set resume state BEFORE starting intervals to prevent race conditions
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      
      // Restart simulation loop
      if (!this.simulationIntervals.has(id)) {
        this.startSimulationLoop(id);
        console.log(`▶️ [RESUME] Restarted data generation for ${id}`);
      }
      
      // Restart TPS metrics
      if (!this.metricsUpdateIntervals.has(id)) {
        this.startTPSMetricsTracking(id);
        console.log(`📊 [RESUME] Restarted TPS metrics for ${id}`);
      }
      
      // 🚨 CRITICAL FIX: Ensure candle manager is ready with enhanced error handling
      try {
        const candleManager = await this.getCandleManager(id);
        if (candleManager && candleManager.isInstanceInitialized()) {
          console.log(`🕯️ [RESUME] CandleManager ready for ${id}`);
        } else {
          console.warn(`⚠️ [RESUME] CandleManager not ready for ${id}, attempting to fix`);
          await this.ensureCandleManagerExists(id, simulation.currentPrice);
        }
      } catch (candleError) {
        console.error(`❌ [RESUME] Error checking CandleManager for ${id}:`, candleError);
      }
      
      // Broadcast resume state
      this.broadcastService.broadcastSimulationStatus(
        id,
        simulation.isRunning,
        simulation.isPaused,
        this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
        simulation.currentPrice
      );
      
      console.log(`✅ [RESUME] Successfully resumed ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [RESUME] Error resuming simulation ${id}:`, error);
      throw error;
    } finally {
      // Always clean up the operation lock and mutex
      this.pauseOperationLocks.delete(id);
      this.pauseStateMutex.delete(id);
    }
  }

  // 🚨 CRITICAL FIX: Enhanced stop implementation with proper state management
  stopSimulation(id: string): void {
    console.log(`⏹️ [STOP] Attempting to stop simulation ${id}`);
    
    try {
      const simulation = this.simulations.get(id);
      
      if (!simulation) {
        console.warn(`⚠️ [STOP] Simulation ${id} not found`);
        return;
      }
      
      console.log(`🔍 [STOP] Current state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
      
      // 🚨 CRITICAL FIX: Proper stop behavior - stops data generation and waits for user start
      simulation.isRunning = false;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
        console.log(`⏹️ [STOP] Cleared simulation interval for ${id}`);
      }
      
      this.stopTPSMetricsTracking(id);
      this.performScheduledPoolCleanup(id);
      console.log(`🧹 [STOP] Performed final cleanup for ${id}`);
      
      this.broadcastService.broadcastSimulationStatus(
        id,
        false,
        false,
        this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
        simulation.currentPrice
      );
      
      console.log(`✅ [STOP] Successfully stopped ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [STOP] Error stopping simulation ${id}:`, error);
      throw new Error(`Failed to stop simulation ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getSimulationState(id: string): { 
    exists: boolean; 
    isRunning: boolean; 
    isPaused: boolean; 
    canStart: boolean; 
    canPause: boolean; 
    canResume: boolean; 
    canStop: boolean;
    validationIssues: string[];
    leakageStatus?: { generated: number; released: number; leakage: number };
    candleManagerStatus?: string;
    pauseOperationInProgress?: boolean;
  } {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      return {
        exists: false,
        isRunning: false,
        isPaused: false,
        canStart: false,
        canPause: false,
        canResume: false,
        canStop: false,
        validationIssues: ['Simulation does not exist'],
        candleManagerStatus: 'not_found',
        pauseOperationInProgress: false
      };
    }
    
    const counters = this.simulationTradeCounters.get(id);
    let leakageStatus;
    if (counters) {
      leakageStatus = {
        generated: counters.generated,
        released: counters.released,
        leakage: counters.generated - counters.released
      };
    }
    
    const candleManagerStatus = this.candleManagerInitializationStatus.get(id) || 'unknown';
    const pauseOperationInProgress = this.pauseOperationLocks.get(id) || this.pauseStateMutex.get(id) || false;
    const validationIssues: string[] = [];
    
    if (candleManagerStatus === 'error') {
      validationIssues.push('CandleManager has errors');
    } else if (candleManagerStatus !== 'ready') {
      validationIssues.push('CandleManager not ready');
    }
    
    if (pauseOperationInProgress) {
      validationIssues.push('Pause operation in progress');
    }
    
    return {
      exists: true,
      isRunning: simulation.isRunning,
      isPaused: simulation.isPaused,
      canStart: (!simulation.isRunning || simulation.isPaused) && !pauseOperationInProgress,
      canPause: simulation.isRunning && !simulation.isPaused && !pauseOperationInProgress,
      canResume: simulation.isRunning && simulation.isPaused && !pauseOperationInProgress,
      canStop: simulation.isRunning && !pauseOperationInProgress,
      validationIssues,
      leakageStatus,
      candleManagerStatus,
      pauseOperationInProgress
    };
  }

  // 🚨 CRITICAL FIX: Enhanced reset with proper state management - reset stops simulation and waits for user start
  async resetSimulation(id: string): Promise<void> {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    console.log(`🔄 [RESET] Starting reset for simulation ${id}`);
    
    // 🚨 CRITICAL FIX: Reset stops simulation completely and waits for manual start
    if (simulation.isRunning) {
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
      }
    }
    
    this.stopTPSMetricsTracking(id);
    
    if (this.externalCandleUpdateCallback) {
      this.externalCandleUpdateCallback.clearCandles(id);
      this.externalCandleUpdateCallback.ensureCleanStart(id);
    }
    
    // Proper object cleanup during reset with type checking
    simulation.activePositions.forEach(position => {
      try {
        if (position && typeof position.entryTime === 'number') {
          this.dataGenerator.releasePosition(position);
        }
      } catch (error) {
        console.error(`❌ Error releasing position during reset:`, error);
      }
    });
    
    simulation.recentTrades.forEach(trade => {
      try {
        if (trade && typeof trade.id === 'string') {
          this.dataGenerator.releaseTrade(trade);
          this.incrementReleasedCounter(id);
        }
      } catch (error) {
        console.error(`❌ Error releasing trade during reset:`, error);
      }
    });
    
    // Reset CandleManager properly with enhanced coordination
    try {
      const candleManager = await this.getCandleManager(id);
      if (candleManager) {
        candleManager.clear();
        console.log(`🕯️ [RESET] CandleManager cleared for ${id}`);
      } else {
        console.warn(`⚠️ [RESET] No CandleManager found for ${id}`);
      }
    } catch (error) {
      console.error(`❌ [RESET] Error resetting CandleManager for ${id}:`, error);
    }
    
    this.simulationTradeCounters.set(id, { generated: 0, released: 0 });
    console.log(`🔄 [RESET] Reset leak tracking counters for ${id}`);
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(id);
    }
    
    const params = simulation.parameters;
    
    const aggressiveTimeframe: Timeframe = '1m';
    this.simulationTimeframes.set(id, aggressiveTimeframe);
    
    const newDynamicPrice = this.marketEngine.generateRandomTokenPrice();
    const newDynamicLiquidity = this.calculateDynamicLiquidity(newDynamicPrice);
    
    // Update CandleManager with new price category
    try {
      const candleManager = await this.getCandleManager(id);
      if (candleManager) {
        // Re-initialize the existing CandleManager with new parameters
        candleManager.initialize(Date.now(), newDynamicPrice);
        console.log(`🔧 [RESET] Re-initialized CandleManager for ${id} with new price ${newDynamicPrice}`);
      } else {
        // Create new CandleManager if somehow missing
        console.log(`🔧 [RESET] Creating new CandleManager for ${id}`);
        await this.ensureCandleManagerExists(id, newDynamicPrice);
      }
    } catch (error) {
      console.error(`❌ [RESET] Error updating CandleManager for ${id}:`, error);
    }
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    
    console.log(`🔄 SIMULATION RESET: ${id}`);
    console.log(`   💰 New Starting Price: ${newDynamicPrice}`);
    console.log(`   💧 New Liquidity Pool: ${(newDynamicLiquidity / 1000000).toFixed(2)}M`);
    console.log(`   🕯️ CandleManager: RESET AND COORDINATED`);
    
    simulation.startTime = simulationStartTime;
    simulation.currentTime = simulationStartTime;
    simulation.endTime = simulationStartTime + (params.duration * 60 * 1000);
    
    // 🚨 CRITICAL FIX: Reset with empty chart - let it build naturally
    simulation.priceHistory = [];
    
    simulation.currentPrice = newDynamicPrice;
    simulation.parameters.initialPrice = newDynamicPrice;
    simulation.parameters.initialLiquidity = newDynamicLiquidity;
    simulation.marketConditions.volatility = this.marketEngine.calculateBaseVolatility(newDynamicPrice) * params.volatilityFactor;
    
    // 🚨 CRITICAL FIX: Reset behavior - stops simulation and waits for manual start
    simulation.isRunning = false;
    simulation.isPaused = false;
    
    simulation.orderBook = {
      bids: this.orderBookManager.generateInitialOrderBook('bids', newDynamicPrice, newDynamicLiquidity),
      asks: this.orderBookManager.generateInitialOrderBook('asks', newDynamicPrice, newDynamicLiquidity),
      lastUpdateTime: simulation.startTime
    };
    simulation.activePositions = [];
    simulation.closedPositions = [];
    simulation.recentTrades = [];
    simulation._tickCounter = 0;
    
    simulation.currentTPSMode = TPSMode.NORMAL;
    
    simulation.externalMarketMetrics = {
      currentTPS: 25,
      actualTPS: 0,
      queueDepth: 0,
      processedOrders: 0,
      rejectedOrders: 0,
      avgProcessingTime: 0,
      dominantTraderType: ExternalTraderType.RETAIL_TRADER,
      marketSentiment: 'neutral',
      liquidationRisk: 0
    };
    
    this.externalMarketEngine.setTPSMode(TPSMode.NORMAL);
    this.timeframeManager.clearCache(id);
    this.simulations.set(id, simulation);
    
    this.simulationRegistrationStatus.set(id, 'ready');
    
    this.broadcastService.broadcastEvent(id, {
      type: 'simulation_reset',
      timestamp: simulation.startTime,
      data: simulation
    });
    
    console.log(`✅ [RESET] Simulation ${id} reset complete - isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused} (waits for manual start)`);
  }

  // Enhanced delete with global state management and CandleManager cleanup
  async deleteSimulation(id: string): Promise<void> {
    const simulation = this.simulations.get(id);
    if (!simulation) return;
    
    console.log(`🗑️ [DELETE] Deleting simulation ${id} with comprehensive cleanup`);
    
    if (simulation.isRunning) {
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
      }
    }
    
    this.stopTPSMetricsTracking(id);
    
    if (this.externalCandleUpdateCallback) {
      this.externalCandleUpdateCallback.clearCandles(id);
    }
    
    // Proper object type checking during deletion
    simulation.activePositions.forEach(position => {
      try {
        if (position && typeof position.entryTime === 'number') {
          this.dataGenerator.releasePosition(position);
        }
      } catch (error) {
        console.error(`❌ Error releasing position during deletion:`, error);
      }
    });
    
    simulation.recentTrades.forEach(trade => {
      try {
        if (trade && typeof trade.id === 'string') {
          this.dataGenerator.releaseTrade(trade);
          this.incrementReleasedCounter(id);
        }
      } catch (error) {
        console.error(`❌ Error releasing trade during deletion:`, error);
      }
    });
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(id);
    }
    
    // Enhanced CandleManager cleanup
    await this.cleanupCandleManagerForSimulation(id);
    
    await this.cleanupSimulationResources(id);
    this.simulations.delete(id);
    
    // Reset global state if this was the active simulation
    if (SimulationManager.activeSimulationId === id) {
      SimulationManager.activeSimulationId = null;
      SimulationManager.globalSimulationLock = false;
      console.log(`🔓 UNLOCKED: Global simulation lock released during deletion of ${id}`);
    }
    
    console.log(`✅ [DELETE] Simulation ${id} completely deleted with comprehensive CandleManager cleanup`);
  }

  async setTPSModeAsync(simulationId: string, mode: string): Promise<{
    success: boolean;
    error?: string;
    previousMode?: string;
    metrics?: ExternalMarketMetrics;
  }> {
    console.log(`🚀 [TPS] Setting TPS mode for ${simulationId} to ${mode}`);
    
    try {
      const simulation = this.simulations.get(simulationId);
      
      if (!simulation) {
        console.error(`❌ [TPS] Simulation ${simulationId} not found`);
        return {
          success: false,
          error: `Simulation ${simulationId} not found`
        };
      }
      
      let tpsMode: TPSMode;
      switch (mode.toUpperCase()) {
        case 'NORMAL':
          tpsMode = TPSMode.NORMAL;
          break;
        case 'BURST':
          tpsMode = TPSMode.BURST;
          break;
        case 'STRESS':
          tpsMode = TPSMode.STRESS;
          break;
        case 'HFT':
          tpsMode = TPSMode.HFT;
          break;
        default:
          return {
            success: false,
            error: `Invalid TPS mode: ${mode}`
          };
      }
      
      const previousMode = simulation.currentTPSMode || TPSMode.NORMAL;
      const previousModeString = TPSMode[previousMode];
      
      simulation.currentTPSMode = tpsMode;
      
      this.externalMarketEngine.setTPSMode(tpsMode);
      
      const targetTPS = this.getTargetTPSForMode(tpsMode);
      if (simulation.externalMarketMetrics) {
        simulation.externalMarketMetrics.currentTPS = targetTPS;
        simulation.externalMarketMetrics.actualTPS = 0;
        simulation.externalMarketMetrics.processedOrders = 0;
        simulation.externalMarketMetrics.rejectedOrders = 0;
        simulation.externalMarketMetrics.queueDepth = 0;
        
        switch (tpsMode) {
          case TPSMode.NORMAL:
            simulation.externalMarketMetrics.dominantTraderType = ExternalTraderType.RETAIL_TRADER;
            break;
          case TPSMode.BURST:
            simulation.externalMarketMetrics.dominantTraderType = ExternalTraderType.ARBITRAGE_BOT;
            break;
          case TPSMode.STRESS:
            simulation.externalMarketMetrics.dominantTraderType = ExternalTraderType.PANIC_SELLER;
            break;
          case TPSMode.HFT:
            simulation.externalMarketMetrics.dominantTraderType = ExternalTraderType.MEV_BOT;
            break;
        }
      }
      
      switch (tpsMode) {
        case TPSMode.NORMAL:
          simulation.marketConditions.volatility *= 1.0;
          break;
        case TPSMode.BURST:
          simulation.marketConditions.volatility *= 1.2;
          simulation.marketConditions.volume *= 1.5;
          break;
        case TPSMode.STRESS:
          simulation.marketConditions.volatility *= 2.0;
          simulation.marketConditions.volume *= 3.0;
          simulation.marketConditions.trend = 'bearish';
          break;
        case TPSMode.HFT:
          simulation.marketConditions.volatility *= 1.8;
          simulation.marketConditions.volume *= 5.0;
          this.enableHighFrequencyMode(simulationId);
          break;
      }
      
      this.simulations.set(simulationId, simulation);
      
      console.log(`✅ [TPS] Successfully changed TPS mode to ${mode} for ${simulationId}`);
      
      const liveMetrics = this.getLiveTPSMetrics(simulationId);
      
      return {
        success: true,
        previousMode: previousModeString,
        metrics: liveMetrics || simulation.externalMarketMetrics
      };
      
    } catch (error) {
      console.error(`❌ [TPS] Error setting TPS mode for ${simulationId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error setting TPS mode'
      };
    }
  }

  async triggerLiquidationCascade(simulationId: string): Promise<{
    success: boolean;
    error?: string;
    ordersGenerated?: number;
    estimatedImpact?: number;
    cascadeSize?: number;
  }> {
    console.log(`💥 [LIQUIDATION] Triggering liquidation cascade for ${simulationId}`);
    
    try {
      const simulation = this.simulations.get(simulationId);
      
      if (!simulation) {
        console.error(`❌ [LIQUIDATION] Simulation ${simulationId} not found`);
        return {
          success: false,
          error: `Simulation ${simulationId} not found`
        };
      }
      
      const currentMode = simulation.currentTPSMode || TPSMode.NORMAL;
      if (currentMode !== TPSMode.STRESS && currentMode !== TPSMode.HFT) {
        console.error(`❌ [LIQUIDATION] Invalid mode: ${TPSMode[currentMode]}`);
        return {
          success: false,
          error: `Liquidation cascade requires STRESS or HFT mode, current mode is ${TPSMode[currentMode]}`
        };
      }
      
      const liquidationOrders = this.externalMarketEngine.triggerLiquidationCascade(simulation);
      
      if (liquidationOrders.length === 0) {
        console.warn(`⚠️ [LIQUIDATION] No liquidation orders generated for ${simulationId}`);
        return {
          success: false,
          error: 'Failed to generate liquidation orders'
        };
      }
      
      const totalLiquidationValue = liquidationOrders.reduce((sum, order) => 
        sum + (order.price * order.quantity), 0
      );
      
      const marketCap = simulation.currentPrice * 1000000;
      const estimatedImpact = (totalLiquidationValue / marketCap) * 100;
      
      if (simulation.externalMarketMetrics) {
        simulation.externalMarketMetrics.liquidationRisk = Math.min(100, estimatedImpact);
        simulation.externalMarketMetrics.marketSentiment = 'bearish';
      }
      
      simulation.marketConditions.trend = 'bearish';
      simulation.marketConditions.volatility *= 1.5;
      
      console.log(`✅ [LIQUIDATION] Cascade triggered: ${liquidationOrders.length} orders, impact: ${estimatedImpact.toFixed(2)}%`);
      
      this.broadcastService.broadcastEvent(simulationId, {
        type: 'liquidation_cascade_triggered',
        timestamp: Date.now(),
        data: {
          simulationId: simulationId,
          ordersGenerated: liquidationOrders.length,
          estimatedImpact: estimatedImpact,
          totalValue: totalLiquidationValue,
          marketConditions: simulation.marketConditions
        }
      });
      
      return {
        success: true,
        ordersGenerated: liquidationOrders.length,
        estimatedImpact: estimatedImpact,
        cascadeSize: liquidationOrders.length
      };
      
    } catch (error) {
      console.error(`❌ [LIQUIDATION] Error triggering liquidation cascade:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error triggering liquidation cascade'
      };
    }
  }

  private getTargetTPSForMode(mode: TPSMode): number {
    switch (mode) {
      case TPSMode.NORMAL: return 25;
      case TPSMode.BURST: return 150;
      case TPSMode.STRESS: return 1500;
      case TPSMode.HFT: return 15000;
      default: return 25;
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 CLEANUP: Starting SimulationManager cleanup');
    
    if (this.processedTradesSyncInterval) {
      clearInterval(this.processedTradesSyncInterval);
      this.processedTradesSyncInterval = null;
    }
    
    this.metricsUpdateIntervals.forEach((interval, simulationId) => {
      clearInterval(interval);
    });
    this.metricsUpdateIntervals.clear();
    this.liveTPSMetrics.clear();
    
    this.poolCleanupIntervals.forEach((interval, simulationId) => {
      clearInterval(interval);
    });
    this.poolCleanupIntervals.clear();
    
    this.lastTPSBroadcast.clear();
    this.lastTPSMetricsSnapshot.clear();
    
    // Final cleanup for all simulations with proper object release
    const cleanupPromises = Array.from(this.simulations.entries()).map(async ([id, simulation]) => {
      if (simulation.isRunning) {
        await this.pauseSimulation(id);
      }
      
      this.performScheduledPoolCleanup(id);
      
      const counters = this.simulationTradeCounters.get(id);
      if (counters) {
        const leakage = counters.generated - counters.released;
        if (leakage > 0) {
          console.warn(`⚠️ CLEANUP: Final leakage for ${id}: ${leakage} objects`);
        } else {
          console.log(`✅ CLEANUP: No leakage detected for ${id}`);
        }
      }
      
      // Clean up CandleManager
      await this.cleanupCandleManagerForSimulation(id);
    });
    
    await Promise.allSettled(cleanupPromises);
    
    // Cleanup all CandleManager instances
    await CandleManager.cleanupAll();
    
    // Clean up tracking maps
    this.candleManagerReadiness.clear();
    this.candleManagerCreationPromises.clear();
    this.candleManagerInitializationStatus.clear();
    this.pauseOperations.clear();
    this.pauseOperationLocks.clear();
    this.pauseStateMutex.clear(); // NEW: Clean up mutex
    this.websocketReadinessStatus.clear(); // NEW: Clean up WebSocket status
    this.websocketRegistrationPromises.clear(); // NEW: Clean up WebSocket promises
    
    this.simulationTradeCounters.clear();
    this.simulationRegistrationStatus.clear();
    this.registrationCallbacks.clear();
    
    // Reset global state during cleanup
    SimulationManager.globalSimulationLock = false;
    SimulationManager.activeSimulationId = null;
    SimulationManager.simulationCreationInProgress = false;
    
    this.performanceOptimizer.cleanup();
    this.traderEngine.cleanup();
    this.dataGenerator.cleanup();
    this.broadcastService.cleanup();
    this.externalMarketEngine.cleanup();
    
    console.log('✅ CLEANUP: SimulationManager cleanup complete with proper state management and global state reset');
  }

  getPoolLeakageReport(): { [simulationId: string]: any } {
    const report: { [simulationId: string]: any } = {};
    
    this.simulations.forEach((simulation, simulationId) => {
      const counters = this.simulationTradeCounters.get(simulationId);
      const traderEngineHealth = this.traderEngine.getPoolHealth();
      const candleManagerStatus = this.candleManagerInitializationStatus.get(simulationId);
      
      report[simulationId] = {
        simulation: {
          isRunning: simulation.isRunning,
          isPaused: simulation.isPaused,
          recentTradesCount: simulation.recentTrades.length,
          activePositionsCount: simulation.activePositions.length,
          closedPositionsCount: simulation.closedPositions.length
        },
        leakageCounters: counters || { generated: 0, released: 0 },
        leakage: counters ? counters.generated - counters.released : 0,
        traderEngineHealth: {
          trade: traderEngineHealth.trade.healthy ? 'healthy' : 'unhealthy',
          position: traderEngineHealth.position.healthy ? 'healthy' : 'unhealthy'
        },
        candleManagerStatus: candleManagerStatus || 'unknown',
        candleManagerReady: this.candleManagerReadiness.get(simulationId) || false,
        pauseOperationInProgress: this.pauseOperationLocks.get(simulationId) || false,
        pauseStateMutex: this.pauseStateMutex.get(simulationId) || false,
        websocketReady: this.websocketReadinessStatus.get(simulationId) !== false
      };
    });
    
    return report;
  }

  debugLeakage(): void {
    console.log('🔍 LEAK DEBUG: Comprehensive analysis');
    const report = this.getPoolLeakageReport();
    
    Object.entries(report).forEach(([simulationId, data]) => {
      console.log(`📊 SIMULATION ${simulationId}:`);
      console.log(`   State: running=${data.simulation.isRunning}, paused=${data.simulation.isPaused}`);
      console.log(`   Objects: trades=${data.simulation.recentTradesCount}, positions=${data.simulation.activePositionsCount}`);
      console.log(`   Leakage: generated=${data.leakageCounters.generated}, released=${data.leakageCounters.released}, leak=${data.leakage}`);
      console.log(`   Pool Health: trade=${data.traderEngineHealth.trade}, position=${data.traderEngineHealth.position}`);
      console.log(`   CandleManager: status=${data.candleManagerStatus}, ready=${data.candleManagerReady}`);
      console.log(`   Pause Operation: ${data.pauseOperationInProgress ? 'IN PROGRESS' : 'NONE'}, Mutex: ${data.pauseStateMutex ? 'LOCKED' : 'UNLOCKED'}`);
      console.log(`   WebSocket: ready=${data.websocketReady}`);
      
      if (data.leakage > 50) {
        console.warn(`⚠️ LEAK DETECTED in ${simulationId}: ${data.leakage} unreleased objects`);
      }
    });
    
    console.log(`🔒 GLOBAL STATE: activeId=${SimulationManager.activeSimulationId}, locked=${SimulationManager.globalSimulationLock}, inProgress=${SimulationManager.simulationCreationInProgress}`);
    
    // Debug CandleManager instances
    const candleDebug = CandleManager.getDebugInfo();
    console.log(`🕯️ CANDLE DEBUG:`, candleDebug);
  }

  applyTraderBehaviorModifiers(simulationId: string, modifiers: any): void {
    this.traderEngine.applyTraderBehaviorModifiers(simulationId, modifiers);
  }

  applyScenarioPhase(simulationId: string, phase: any, progress: number): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return;
    
    this.scenarioEngine.applyScenarioPhase(simulation, phase, progress);
    this.simulations.set(simulationId, simulation);
  }

  clearScenarioEffects(simulationId: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return;
    
    this.scenarioEngine.clearScenarioEffects(simulation);
    
    const originalTraders = traderService.generateTraderProfiles(
      simulation.traders.map(t => t.trader)
    );
    simulation.traders = originalTraders;
    
    this.simulations.set(simulationId, simulation);
  }

  enableHighFrequencyMode(simulationId: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return;
    
    this.performanceOptimizer.enableHighFrequencyMode();
    
    simulation.marketConditions.volatility *= 1.5;
    simulation.marketConditions.volume *= 2;
    
    this.simulations.set(simulationId, simulation);
  }

  public getAvailablePriceRanges(): Array<{
    id: string;
    name: string;
    description: string;
    range: string;
    example: string;
  }> {
    return [
      {
        id: 'random',
        name: 'Random',
        description: 'Weighted random selection',
        range: 'All ranges',
        example: 'Varied'
      },
      {
        id: 'micro',
        name: 'Micro-cap',
        description: 'Very low price tokens',
        range: '< $0.01',
        example: '$0.0001 - $0.01'
      },
      {
        id: 'small',
        name: 'Small-cap',
        description: 'Low price tokens',
        range: '$0.01 - $1',
        example: '$0.05, $0.25, $0.75'
      },
      {
        id: 'mid',
        name: 'Mid-cap',
        description: 'Medium price tokens',
        range: '$1 - $10',
        example: '$2.50, $5.75, $8.25'
      },
      {
        id: 'large',
        name: 'Large-cap',
        description: 'High price tokens',
        range: '$10 - $100',
        example: '$25, $50, $85'
      },
      {
        id: 'mega',
        name: 'Mega-cap',
        description: 'Very high price tokens',
        range: '$100+',
        example: '$250, $500, $750'
      }
    ];
  }

  public async getCandleManagerStats(): Promise<{ [simulationId: string]: any }> {
    const stats: { [simulationId: string]: any } = {};
    
    const statPromises = Array.from(this.simulations.keys()).map(async (simulationId) => {
      try {
        const candleManager = await this.getCandleManager(simulationId);
        if (candleManager) {
          stats[simulationId] = candleManager.getStats();
        } else {
          stats[simulationId] = { 
            error: 'CandleManager not found',
            status: this.candleManagerInitializationStatus.get(simulationId) || 'unknown'
          };
        }
      } catch (error) {
        stats[simulationId] = { 
          error: 'Failed to get stats',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
    
    await Promise.allSettled(statPromises);
    return stats;
  }

  public async debugCandleManagerInstances(): Promise<void> {
    console.log(`🔍 [DEBUG] CandleManager instances for ${this.simulations.size} simulations:`);
    
    const debugPromises = Array.from(this.simulations.keys()).map(async (simulationId) => {
      try {
        const candleManager = await this.getCandleManager(simulationId);
        const status = this.candleManagerInitializationStatus.get(simulationId);
        const ready = this.candleManagerReadiness.get(simulationId);
        
        if (candleManager) {
          const stats = candleManager.getStats();
          console.log(`  📊 ${simulationId}: ${stats.candleCount} candles, interval=${stats.candleInterval}ms, status=${status}, ready=${ready}`);
        } else {
          console.log(`  ❌ ${simulationId}: No CandleManager found, status=${status}, ready=${ready}`);
        }
      } catch (error) {
        console.log(`  ❌ ${simulationId}: Error getting CandleManager - ${error}`);
      }
    });
    
    await Promise.allSettled(debugPromises);
    
    // Show global CandleManager debug info
    const debugInfo = CandleManager.getDebugInfo();
    console.log(`🔍 [DEBUG] Global CandleManager state:`, debugInfo);
  }

  // Public methods to check global state
  public static getGlobalState(): {
    locked: boolean;
    activeSimulationId: string | null;
    creationInProgress: boolean;
  } {
    return {
      locked: SimulationManager.globalSimulationLock,
      activeSimulationId: SimulationManager.activeSimulationId,
      creationInProgress: SimulationManager.simulationCreationInProgress
    };
  }

  public static forceUnlock(): void {
    console.log('🔓 FORCE UNLOCK: Resetting global simulation state');
    SimulationManager.globalSimulationLock = false;
    SimulationManager.activeSimulationId = null;
    SimulationManager.simulationCreationInProgress = false;
  }
}

export default SimulationManager;