// backend/src/services/simulation/SimulationManager.ts - FIXED: Prevent Multiple Simultaneous Simulations
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
  
  // 🔧 FIXED: TPS metrics throttling
  private lastTPSBroadcast: Map<string, number> = new Map();
  private lastTPSMetricsSnapshot: Map<string, string> = new Map();
  private readonly TPS_BROADCAST_THROTTLE_MS = 2000;
  
  private simulationRegistrationStatus: Map<string, 'creating' | 'registering' | 'ready' | 'starting' | 'running'> = new Map();
  private registrationCallbacks: Map<string, ((status: string) => void)[]> = new Map();
  
  // 🚨 CRITICAL FIX: Prevent multiple simulations
  private static globalSimulationLock = false;
  private static activeSimulationId: string | null = null;
  private static simulationCreationInProgress = false;
  
  // 🚨 CRITICAL FIX: Remove static CandleManager handling - use singleton pattern only
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

  // 🚨 CRITICAL FIX: Enhanced pool cleanup tracking
  private poolCleanupIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly POOL_CLEANUP_INTERVAL = 60000;
  private simulationTradeCounters: Map<string, { generated: number; released: number }> = new Map();

  constructor() {
    this.initializeEngines();
    this.startProcessedTradesSync();
    this.startGlobalPoolMonitoring();
    
    // 🚨 CRITICAL FIX: Global cleanup on process exit
    process.on('SIGTERM', () => this.emergencyCleanup());
    process.on('SIGINT', () => this.emergencyCleanup());
  }

  private emergencyCleanup(): void {
    console.log('🚨 EMERGENCY: Cleaning up all simulations');
    
    // Stop all simulations immediately
    this.simulations.forEach((simulation, id) => {
      try {
        this.stopSimulation(id);
        CandleManager.cleanup(id);
      } catch (error) {
        console.error(`Error in emergency cleanup for ${id}:`, error);
      }
    });
    
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

  // 🚨 CRITICAL FIX: Enhanced pool cleanup with proper object tracking
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
            // 🚨 CRITICAL FIX: Use the correct pool for the correct object type
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
            // 🚨 CRITICAL FIX: Use the correct pool for the correct object type
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

  // 🚨 CRITICAL FIX: Simplified CandleManager access - NO CREATION, only retrieval
  private getCandleManager(simulationId: string): CandleManager | null {
    if (!CandleManager.hasInstance(simulationId)) {
      console.warn(`⚠️ SINGLETON: No CandleManager exists for ${simulationId}`);
      return null;
    }
    return CandleManager.getInstance(simulationId);
  }

  // 🚨 CRITICAL FIX: Unified CandleManager creation - ONLY called during simulation creation
  private createCandleManager(simulationId: string, price: number): CandleManager {
    // Check if one already exists (should not happen in normal flow)
    if (CandleManager.hasInstance(simulationId)) {
      console.warn(`⚠️ SINGLETON: CandleManager already exists for ${simulationId}, cleaning up first`);
      CandleManager.cleanup(simulationId);
    }

    const dynamicInterval = this.getPriceCategoryCandleInterval(price);
    const candleManager = CandleManager.getInstance(simulationId, dynamicInterval);
    
    console.log(`🕯️ SINGLETON: Created single CandleManager for ${simulationId} with ${dynamicInterval}ms interval`);
    return candleManager;
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

  // 🚨 CRITICAL FIX: Enhanced scheduled cleanup with cross-pool prevention
  private performScheduledPoolCleanup(simulationId: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) {
      this.stopPoolCleanupForSimulation(simulationId);
      return;
    }

    console.log(`🧹 CLEANUP: Scheduled cleanup for ${simulationId}`);

    try {
      // 🚨 CRITICAL FIX: Proper object type checking before release
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

  // 🚨 CRITICAL FIX: Prevent multiple simultaneous simulations
  async createSimulation(parameters: Partial<EnhancedSimulationParameters> = {}): Promise<ExtendedSimulationState> {
    // 🚨 CRITICAL: Global lock to prevent multiple simulations
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
    
    // 🚨 CRITICAL: Lock creation process immediately
    SimulationManager.simulationCreationInProgress = true;
    
    try {
      // 🚨 CRITICAL: If there's already an active simulation, clean it up first
      if (SimulationManager.activeSimulationId) {
        console.log(`🧹 CLEANUP: Removing existing simulation ${SimulationManager.activeSimulationId}`);
        await this.deleteSimulation(SimulationManager.activeSimulationId);
        SimulationManager.activeSimulationId = null;
      }
      
      const simulationId = uuidv4();
      
      console.log(`🏗️ CREATING: Single simulation ${simulationId} with global lock`);
      
      this.simulationRegistrationStatus.set(simulationId, 'creating');
      this.simulationTradeCounters.set(simulationId, { generated: 0, released: 0 });
      
      const traders = await duneApi.getPumpFunTraders();
      
      let simulation: ExtendedSimulationState;
      
      if (traders && traders.length > 0) {
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
        simulation = this.finalizeSimulationCreation(simulationId, parameters, convertedTraders, traderProfiles);
      } else {
        simulation = await this.createSimulationWithDummyTraders(simulationId, parameters);
      }
      
      this.simulationRegistrationStatus.set(simulationId, 'registering');
      
      this.simulations.set(simulationId, simulation);
      this.simulationSpeeds.set(simulationId, simulation.parameters.timeCompressionFactor);
      
      const aggressiveTimeframe: Timeframe = '1m';
      this.simulationTimeframes.set(simulationId, aggressiveTimeframe);
      
      // 🚨 CRITICAL FIX: Create SINGLE CandleManager during simulation creation
      const candleManager = this.createCandleManager(simulationId, simulation.currentPrice);
      candleManager.initialize(simulation.startTime, simulation.currentPrice);
      
      if (this.externalCandleUpdateCallback) {
        this.externalCandleUpdateCallback.ensureCleanStart(simulationId);
        console.log(`🔗 COORDINATOR: External coordinator initialized for ${simulationId}`);
      }
      
      console.log(`📊 METRICS: TPS tracking will start when simulation starts`);
      
      await this.verifySimulationRegistration(simulationId);
      
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      this.notifyRegistrationCallbacks(simulationId, 'ready');
      
      // 🚨 CRITICAL: Set as active simulation and lock globally
      SimulationManager.activeSimulationId = simulationId;
      SimulationManager.globalSimulationLock = true;
      
      console.log(`✅ CREATED: Single simulation ${simulationId} with global lock enabled`);
      console.log(`🔒 GLOBAL STATE: activeId=${SimulationManager.activeSimulationId}, locked=${SimulationManager.globalSimulationLock}`);
      
      return simulation;
      
    } catch (error) {
      console.error(`❌ Error creating simulation:`, error);
      
      // 🚨 CRITICAL: Reset global state on error
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

  // 🚨 CRITICAL FIX: Complete resource cleanup with global state management
  private cleanupSimulationResources(simulationId: string): void {
    console.log(`🧹 CLEANUP: Cleaning up resources for ${simulationId}`);
    
    this.stopTPSMetricsTracking(simulationId);
    this.stopPoolCleanupForSimulation(simulationId);
    
    // 🚨 CRITICAL: Clean up CandleManager singleton
    CandleManager.cleanup(simulationId);
    
    this.simulationTradeCounters.delete(simulationId);
    this.simulationSpeeds.delete(simulationId);
    this.simulationTimeframes.delete(simulationId);
    this.simulationRegistrationStatus.delete(simulationId);
    this.registrationCallbacks.delete(simulationId);
    
    // 🚨 CRITICAL: Reset global state if this was the active simulation
    if (SimulationManager.activeSimulationId === simulationId) {
      SimulationManager.activeSimulationId = null;
      SimulationManager.globalSimulationLock = false;
      console.log(`🔓 UNLOCKED: Global simulation lock released for ${simulationId}`);
    }
    
    console.log(`✅ CLEANUP: Resource cleanup completed for ${simulationId}`);
  }

  private async verifySimulationRegistration(simulationId: string): Promise<void> {
    const maxAttempts = 5;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const simulation = this.simulations.get(simulationId);
      const candleManager = this.getCandleManager(simulationId);
      const speed = this.simulationSpeeds.get(simulationId);
      
      if (simulation && candleManager && speed !== undefined) {
        return;
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 50));
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
      
      const candleManager = this.getCandleManager(simulationId);
      if (!candleManager) return false;
      
      return true;
      
    } catch (error) {
      console.error(`Error checking registration for ${simulationId}:`, error);
      return false;
    }
  }

  isSimulationReady(simulationId: string): boolean {
    const status = this.simulationRegistrationStatus.get(simulationId);
    return status === 'ready' || status === 'starting' || status === 'running';
  }

  async waitForSimulationReady(simulationId: string, timeoutMs: number = 5000): Promise<boolean> {
    const status = this.simulationRegistrationStatus.get(simulationId);
    
    if (status === 'ready' || status === 'starting' || status === 'running') {
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
        if (newStatus === 'ready' || newStatus === 'starting' || newStatus === 'running') {
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

  private createSimulationWithDummyTraders(simulationId: string, parameters: Partial<EnhancedSimulationParameters> = {}): Promise<ExtendedSimulationState> {
    const dummyTraders = this.dataGenerator.generateDummyTraders(10);
    const traderProfiles = traderService.generateTraderProfiles(dummyTraders);
    
    return Promise.resolve(this.finalizeSimulationCreation(simulationId, parameters, dummyTraders, traderProfiles));
  }

  // 🚨 CRITICAL FIX: Clean simulation creation with proper initial state
  private finalizeSimulationCreation(
    simulationId: string,
    parameters: Partial<EnhancedSimulationParameters>,
    traders: any[],
    traderProfiles: any[]
  ): ExtendedSimulationState {
    
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
    console.log(`   📊 SINGLE CandleManager: READY`);
    
    // 🚨 CRITICAL FIX: Proper externalMarketMetrics initialization
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
    
    // 🚨 CRITICAL FIX: Start with EMPTY chart - let it build naturally
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
      // 🚨 CRITICAL FIX: Start with empty price history - chart builds from simulation data
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

  // 🚨 CRITICAL FIX: Clean startSimulation with proper state management
  startSimulation(id: string): void {
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
      
      // 🚨 CRITICAL FIX: Initialize CandleManager properly for first candle
      const candleManager = this.getCandleManager(id);
      if (candleManager) {
        candleManager.updateCandle(simulation.currentTime, simulation.currentPrice, 1000);
        console.log(`🕯️ [START] CandleManager ready - first candle queued`);
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

  private advanceSimulation(id: string): void {
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
        
        // 🚨 CRITICAL FIX: Single candle update call
        this.updateCandlesFromSimulation(id, simulation);
        
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

  // 🚨 CRITICAL FIX: Single, coordinated candle update
  private updateCandlesFromSimulation(simulationId: string, simulation: ExtendedSimulationState): void {
    const candleManager = this.getCandleManager(simulationId);
    if (!candleManager) {
      console.warn(`⚠️ No CandleManager for ${simulationId} - skipping candle update`);
      return;
    }
    
    const currentVolume = simulation.marketConditions.volume || 1000;
    
    // 🚨 CRITICAL: Single update call to prevent duplicate data
    candleManager.updateCandle(simulation.currentTime, simulation.currentPrice, currentVolume);
    
    if (this.externalCandleUpdateCallback) {
      this.externalCandleUpdateCallback.queueUpdate(
        simulationId, 
        simulation.currentTime, 
        simulation.currentPrice, 
        currentVolume
      );
    }
    
    // 🚨 CRITICAL: Get candles from single source and update priceHistory
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
              // 🚨 CRITICAL FIX: Proper type checking before release
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

  // 🚨 CRITICAL FIX: Enhanced pause implementation with race condition prevention
  pauseSimulation(id: string): void {
    console.log(`⏸️ [PAUSE] Attempting to pause simulation ${id}`);
    
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
      
      // Finalize current candle
      const candleManager = this.getCandleManager(id);
      if (candleManager) {
        candleManager.forceFinalizeCurrent();
        console.log(`🕯️ [PAUSE] Finalized current candle for ${id}`);
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
      
      throw new Error(`Failed to pause simulation ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 🚨 CRITICAL FIX: Enhanced resume implementation with race condition prevention
  resumeSimulation(id: string): void {
    console.log(`▶️ [RESUME] Attempting to resume simulation ${id}`);
    
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
      
      // Ensure candle manager is ready
      const candleManager = this.getCandleManager(id);
      if (candleManager) {
        console.log(`🕯️ [RESUME] CandleManager ready for ${id}`);
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
      throw new Error(`Failed to resume simulation ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  stopSimulation(id: string): void {
    console.log(`⏹️ [STOP] Attempting to stop simulation ${id}`);
    
    try {
      const simulation = this.simulations.get(id);
      
      if (!simulation) {
        console.warn(`⚠️ [STOP] Simulation ${id} not found`);
        return;
      }
      
      console.log(`🔍 [STOP] Current state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
      
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
        validationIssues: ['Simulation does not exist']
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
    
    return {
      exists: true,
      isRunning: simulation.isRunning,
      isPaused: simulation.isPaused,
      canStart: !simulation.isRunning || simulation.isPaused,
      canPause: simulation.isRunning && !simulation.isPaused,
      canResume: simulation.isRunning && simulation.isPaused,
      canStop: simulation.isRunning,
      validationIssues: [],
      leakageStatus
    };
  }

  // 🚨 CRITICAL FIX: Clean reset with proper CandleManager coordination
  resetSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    console.log(`🔄 [RESET] Starting reset for simulation ${id}`);
    
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
    
    // 🚨 CRITICAL: Proper object cleanup during reset with type checking
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
    
    // 🚨 CRITICAL: Reset CandleManager properly
    const candleManager = this.getCandleManager(id);
    if (candleManager) {
      candleManager.clear();
      console.log(`🕯️ [RESET] CandleManager cleared for ${id}`);
    } else {
      console.warn(`⚠️ [RESET] No CandleManager found for ${id}`);
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
    
    // 🚨 CRITICAL: Update CandleManager with new price category
    if (candleManager) {
      const newInterval = this.getPriceCategoryCandleInterval(newDynamicPrice);
      // Re-initialize the existing CandleManager with new parameters
      candleManager.initialize(Date.now(), newDynamicPrice);
    } else {
      // Create new CandleManager if somehow missing
      this.createCandleManager(id, newDynamicPrice);
    }
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    
    console.log(`🔄 SIMULATION RESET: ${id}`);
    console.log(`   💰 New Starting Price: ${newDynamicPrice}`);
    console.log(`   💧 New Liquidity Pool: ${(newDynamicLiquidity / 1000000).toFixed(2)}M`);
    console.log(`   🕯️ CandleManager: RESET AND READY`);
    
    simulation.startTime = simulationStartTime;
    simulation.currentTime = simulationStartTime;
    simulation.endTime = simulationStartTime + (params.duration * 60 * 1000);
    
    // 🚨 CRITICAL: Reset with empty chart - let it build naturally
    simulation.priceHistory = [];
    
    simulation.currentPrice = newDynamicPrice;
    simulation.parameters.initialPrice = newDynamicPrice;
    simulation.parameters.initialLiquidity = newDynamicLiquidity;
    simulation.marketConditions.volatility = this.marketEngine.calculateBaseVolatility(newDynamicPrice) * params.volatilityFactor;
    
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
    
    console.log(`✅ [RESET] Simulation ${id} reset complete - clean slate ready`);
  }

  // 🚨 CRITICAL FIX: Enhanced delete with global state management
  deleteSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    if (!simulation) return;
    
    console.log(`🗑️ [DELETE] Deleting simulation ${id} with complete cleanup`);
    
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
    
    // 🚨 CRITICAL FIX: Proper object type checking during deletion
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
    
    // 🚨 CRITICAL: Clean up CandleManager singleton
    CandleManager.cleanup(id);
    
    this.cleanupSimulationResources(id);
    this.simulations.delete(id);
    
    // 🚨 CRITICAL FIX: Reset global state if this was the active simulation
    if (SimulationManager.activeSimulationId === id) {
      SimulationManager.activeSimulationId = null;
      SimulationManager.globalSimulationLock = false;
      console.log(`🔓 UNLOCKED: Global simulation lock released during deletion of ${id}`);
    }
    
    console.log(`✅ [DELETE] Simulation ${id} completely deleted with leak prevention and global state reset`);
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

  cleanup(): void {
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
    this.simulations.forEach((simulation, id) => {
      if (simulation.isRunning) {
        this.pauseSimulation(id);
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
    });
    
    // Cleanup all CandleManager instances
    this.simulations.forEach((simulation, id) => {
      CandleManager.cleanup(id);
    });
    
    this.simulationTradeCounters.clear();
    this.simulationRegistrationStatus.clear();
    this.registrationCallbacks.clear();
    
    // 🚨 CRITICAL FIX: Reset global state during cleanup
    SimulationManager.globalSimulationLock = false;
    SimulationManager.activeSimulationId = null;
    SimulationManager.simulationCreationInProgress = false;
    
    this.performanceOptimizer.cleanup();
    this.traderEngine.cleanup();
    this.dataGenerator.cleanup();
    this.broadcastService.cleanup();
    this.externalMarketEngine.cleanup();
    
    console.log('✅ CLEANUP: SimulationManager cleanup complete with global state reset');
  }

  getPoolLeakageReport(): { [simulationId: string]: any } {
    const report: { [simulationId: string]: any } = {};
    
    this.simulations.forEach((simulation, simulationId) => {
      const counters = this.simulationTradeCounters.get(simulationId);
      const traderEngineHealth = this.traderEngine.getPoolHealth();
      
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
        }
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
      
      if (data.leakage > 50) {
        console.warn(`⚠️ LEAK DETECTED in ${simulationId}: ${data.leakage} unreleased objects`);
      }
    });
    
    console.log(`🔒 GLOBAL STATE: activeId=${SimulationManager.activeSimulationId}, locked=${SimulationManager.globalSimulationLock}, inProgress=${SimulationManager.simulationCreationInProgress}`);
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

  public getCandleManagerStats(): { [simulationId: string]: any } {
    const stats: { [simulationId: string]: any } = {};
    
    this.simulations.forEach((simulation, simulationId) => {
      const candleManager = this.getCandleManager(simulationId);
      if (candleManager) {
        try {
          stats[simulationId] = candleManager.getStats();
        } catch (error) {
          stats[simulationId] = { error: 'Failed to get stats' };
        }
      } else {
        stats[simulationId] = { error: 'CandleManager not found' };
      }
    });
    
    return stats;
  }

  public debugCandleManagerInstances(): void {
    console.log(`🔍 [DEBUG] CandleManager instances for ${this.simulations.size} simulations:`);
    
    this.simulations.forEach((simulation, simulationId) => {
      const candleManager = this.getCandleManager(simulationId);
      if (candleManager) {
        const stats = candleManager.getStats();
        console.log(`  📊 ${simulationId}: ${stats.candleCount} candles, interval=${stats.candleInterval}ms`);
      } else {
        console.log(`  ❌ ${simulationId}: No CandleManager found`);
      }
    });
  }

  // 🚨 CRITICAL FIX: Public methods to check global state
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