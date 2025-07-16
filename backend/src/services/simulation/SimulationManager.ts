// backend/src/services/simulation/SimulationManager.ts - COMPLETE FIXED VERSION
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
  
  // 🔧 FIXED: TPS metrics throttling to prevent spam
  private lastTPSBroadcast: Map<string, number> = new Map();
  private lastTPSMetricsSnapshot: Map<string, string> = new Map();
  private readonly TPS_BROADCAST_THROTTLE_MS = 2000; // Only broadcast TPS changes every 2 seconds
  
  private simulationRegistrationStatus: Map<string, 'creating' | 'registering' | 'ready' | 'starting' | 'running'> = new Map();
  private registrationCallbacks: Map<string, ((status: string) => void)[]> = new Map();
  
  // 🔧 CRITICAL FIX: Strict CandleManager singleton pattern
  private static candleManagerInstances: Map<string, CandleManager> = new Map();
  private static candleManagerLocks: Map<string, boolean> = new Map();
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
  // 🔧 FIXED: Increased metrics update interval to reduce spam
  private readonly metricsUpdateInterval: number = 2000; // Changed from 100ms to 2000ms

  constructor() {
    this.initializeEngines();
    this.startProcessedTradesSync();
  }

  setExternalCandleUpdateCallback(callback: CandleUpdateCallback): void {
    this.externalCandleUpdateCallback = callback;
    console.log('🔗 FIXED: External candle update coordinator connected to SimulationManager');
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

  // 🔧 CRITICAL FIX: Bulletproof CandleManager singleton per simulation
  private static getOrCreateCandleManager(simulationId: string, candleInterval: number): CandleManager {
    console.log(`🕯️ CRITICAL: Getting CandleManager for ${simulationId} with interval ${candleInterval}ms`);
    
    // Check if already exists
    if (SimulationManager.candleManagerInstances.has(simulationId)) {
      const existing = SimulationManager.candleManagerInstances.get(simulationId)!;
      console.log(`♻️ REUSING: Existing CandleManager for ${simulationId}`);
      return existing;
    }
    
    // Check if creation is in progress (prevent race conditions)
    if (SimulationManager.candleManagerLocks.get(simulationId)) {
      console.warn(`⚠️ BLOCKED: CandleManager creation already in progress for ${simulationId}`);
      // Wait for existing creation to complete
      const waitForCreation = (): CandleManager => {
        if (SimulationManager.candleManagerInstances.has(simulationId)) {
          return SimulationManager.candleManagerInstances.get(simulationId)!;
        }
        // Fallback: create anyway if waiting fails
        console.warn(`⚠️ FALLBACK: Creating CandleManager despite lock for ${simulationId}`);
        return new CandleManager(candleInterval);
      };
      return waitForCreation();
    }
    
    // Lock creation to prevent duplicates
    SimulationManager.candleManagerLocks.set(simulationId, true);
    
    try {
      // Double-check after acquiring lock
      if (SimulationManager.candleManagerInstances.has(simulationId)) {
        const existing = SimulationManager.candleManagerInstances.get(simulationId)!;
        console.log(`♻️ DOUBLE-CHECK: Found existing CandleManager for ${simulationId}`);
        return existing;
      }
      
      // Create new instance
      console.log(`🆕 CREATING: New CandleManager for ${simulationId} (interval: ${candleInterval}ms)`);
      const newManager = new CandleManager(candleInterval);
      
      // Store in singleton map
      SimulationManager.candleManagerInstances.set(simulationId, newManager);
      
      // Initialize with clean state
      newManager.clear();
      
      console.log(`✅ CREATED: CandleManager registered for ${simulationId}`);
      console.log(`📊 TOTAL: ${SimulationManager.candleManagerInstances.size} CandleManager instances`);
      
      return newManager;
      
    } finally {
      // Always release lock
      SimulationManager.candleManagerLocks.delete(simulationId);
    }
  }

  // 🔧 CRITICAL FIX: Cleanup specific CandleManager instance
  private static cleanupCandleManager(simulationId: string): void {
    console.log(`🧹 CLEANUP: Removing CandleManager for ${simulationId}`);
    
    const manager = SimulationManager.candleManagerInstances.get(simulationId);
    if (manager) {
      try {
        manager.shutdown();
        console.log(`🛑 SHUTDOWN: CandleManager stopped for ${simulationId}`);
      } catch (error) {
        console.warn(`⚠️ CLEANUP WARNING: Error shutting down CandleManager for ${simulationId}:`, error);
      }
      
      SimulationManager.candleManagerInstances.delete(simulationId);
      console.log(`🗑️ REMOVED: CandleManager unregistered for ${simulationId}`);
    } else {
      console.log(`❓ NO CLEANUP: No CandleManager found for ${simulationId}`);
    }
    
    // Clean up any lingering locks
    SimulationManager.candleManagerLocks.delete(simulationId);
    
    console.log(`📊 REMAINING: ${SimulationManager.candleManagerInstances.size} CandleManager instances`);
  }

  // 🔧 CRITICAL FIX: Get CandleManager safely
  private getCandleManager(simulationId: string): CandleManager | null {
    const manager = SimulationManager.candleManagerInstances.get(simulationId);
    if (!manager) {
      console.warn(`⚠️ MISSING: No CandleManager found for ${simulationId}`);
      return null;
    }
    return manager;
  }

  // 🔧 CRITICAL FIX: List all active CandleManager instances for debugging
  public static debugCandleManagers(): void {
    console.log(`🔍 DEBUG: ${SimulationManager.candleManagerInstances.size} CandleManager instances:`);
    for (const [simId, manager] of SimulationManager.candleManagerInstances.entries()) {
      const stats = manager.getStats();
      console.log(`  📊 ${simId}: ${stats.candleCount} candles, interval=${stats.candleInterval}ms, active=${!stats.isResetting}`);
    }
    
    console.log(`🔒 LOCKS: ${SimulationManager.candleManagerLocks.size} creation locks:`);
    for (const [simId, locked] of SimulationManager.candleManagerLocks.entries()) {
      console.log(`  🔒 ${simId}: ${locked ? 'LOCKED' : 'UNLOCKED'}`);
    }
  }

  // 🔧 CRITICAL FIX: Emergency cleanup all CandleManagers
  public static emergencyCleanupAllCandleManagers(): void {
    console.log(`🚨 EMERGENCY: Cleaning up ALL ${SimulationManager.candleManagerInstances.size} CandleManager instances`);
    
    for (const [simId, manager] of SimulationManager.candleManagerInstances.entries()) {
      try {
        manager.shutdown();
        console.log(`🛑 Emergency shutdown: ${simId}`);
      } catch (error) {
        console.warn(`⚠️ Emergency shutdown error for ${simId}:`, error);
      }
    }
    
    SimulationManager.candleManagerInstances.clear();
    SimulationManager.candleManagerLocks.clear();
    
    console.log(`✅ EMERGENCY CLEANUP: All CandleManager instances removed`);
  }

  private calculateDynamicCandleInterval(baseInterval: number): number {
    return Math.min(baseInterval, 8000);
  }

  private getPriceCategoryCandleInterval(price: number): number {
    if (price < 0.01) {
      return 6000;
    } else if (price < 1) {
      return 8000;
    } else if (price < 10) {
      return 10000;
    } else if (price < 100) {
      return 12000;
    } else {
      return 15000;
    }
  }

  // 🔧 FIXED: Enhanced TPS metrics tracking with spam prevention
  private startTPSMetricsTracking(simulationId: string): void {
    if (this.metricsUpdateIntervals.has(simulationId)) {
      return;
    }
    
    console.log(`📊 [TPS METRICS] Starting metrics tracking for simulation ${simulationId} with anti-spam throttling`);
    
    const interval = setInterval(() => {
      const simulation = this.simulations.get(simulationId);
      if (!simulation) {
        console.log(`📊 [TPS METRICS] Simulation ${simulationId} not found, stopping metrics tracking`);
        this.stopTPSMetricsTracking(simulationId);
        return;
      }
      
      const liveMetrics = this.calculateLiveTPSMetrics(simulation);
      this.liveTPSMetrics.set(simulationId, liveMetrics);
      
      // 🔧 FIXED: Only broadcast if metrics have actually changed
      this.throttledTPSMetricsBroadcast(simulationId, liveMetrics);
      
    }, this.metricsUpdateInterval);
    
    this.metricsUpdateIntervals.set(simulationId, interval);
  }

  // 🔧 FIXED: New throttled broadcast method to prevent TPS spam
  private throttledTPSMetricsBroadcast(simulationId: string, metrics: ExternalMarketMetrics): void {
    const now = Date.now();
    const lastBroadcast = this.lastTPSBroadcast.get(simulationId) || 0;
    
    // Only broadcast if enough time has passed
    if (now - lastBroadcast < this.TPS_BROADCAST_THROTTLE_MS) {
      return;
    }
    
    // Create a snapshot of the metrics to compare for changes
    const metricsSnapshot = JSON.stringify({
      actualTPS: metrics.actualTPS,
      currentTPS: metrics.currentTPS,
      queueDepth: metrics.queueDepth,
      marketSentiment: metrics.marketSentiment,
      dominantTraderType: metrics.dominantTraderType
    });
    
    const lastSnapshot = this.lastTPSMetricsSnapshot.get(simulationId);
    
    // 🔧 FIXED: Only broadcast if metrics have actually changed OR if it's been a while
    const hasChanges = lastSnapshot !== metricsSnapshot;
    const forceUpdate = now - lastBroadcast > this.TPS_BROADCAST_THROTTLE_MS * 5; // Force update every 10 seconds
    
    if (hasChanges || forceUpdate) {
      this.broadcastTPSMetricsUpdate(simulationId, metrics);
      this.lastTPSBroadcast.set(simulationId, now);
      this.lastTPSMetricsSnapshot.set(simulationId, metricsSnapshot);
      
      if (hasChanges) {
        console.log(`📊 [TPS METRICS] Broadcasting metrics change for ${simulationId}: actualTPS=${metrics.actualTPS}, queueDepth=${metrics.queueDepth}`);
      } else {
        console.log(`📊 [TPS METRICS] Force broadcasting metrics for ${simulationId} (periodic update)`);
      }
    }
  }

  private stopTPSMetricsTracking(simulationId: string): void {
    const interval = this.metricsUpdateIntervals.get(simulationId);
    if (interval) {
      clearInterval(interval);
      this.metricsUpdateIntervals.delete(simulationId);
      this.liveTPSMetrics.delete(simulationId);
      // 🔧 FIXED: Clean up throttling maps
      this.lastTPSBroadcast.delete(simulationId);
      this.lastTPSMetricsSnapshot.delete(simulationId);
      console.log(`📊 [TPS METRICS] Stopped metrics tracking for simulation ${simulationId}`);
    }
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
      this.simulations.set(simulationId, simulation);
    });
  }

  registerClient(client: WebSocket): void {
    this.broadcastService.registerClient(client);
  }

  async createSimulation(parameters: Partial<EnhancedSimulationParameters> = {}): Promise<ExtendedSimulationState> {
    const simulationId = uuidv4();
    
    try {
      this.simulationRegistrationStatus.set(simulationId, 'creating');
      console.log(`🏗️ CREATING: Simulation ${simulationId} with deduplication`);
      
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
      
      // 🔧 CRITICAL FIX: Use singleton CandleManager
      const dynamicInterval = this.getPriceCategoryCandleInterval(simulation.currentPrice);
      const candleManager = SimulationManager.getOrCreateCandleManager(simulationId, dynamicInterval);
      
      if (this.externalCandleUpdateCallback) {
        this.externalCandleUpdateCallback.ensureCleanStart(simulationId);
        console.log(`🔗 FIXED: External candle coordinator initialized for ${simulationId}`);
      }
      
      // 🔧 FIXED: Don't start TPS metrics tracking immediately on creation
      // Only start when simulation actually starts
      console.log(`📊 [TPS METRICS] TPS tracking will start when simulation ${simulationId} is started`);
      
      await this.verifySimulationRegistration(simulationId);
      
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      
      this.notifyRegistrationCallbacks(simulationId, 'ready');
      
      console.log(`✅ CREATED: Simulation ${simulationId} with single CandleManager`);
      
      return simulation;
      
    } catch (error) {
      console.error(`❌ Error creating simulation ${simulationId}:`, error);
      this.simulationRegistrationStatus.set(simulationId, 'error');
      this.notifyRegistrationCallbacks(simulationId, 'error');
      
      // 🔧 CRITICAL FIX: Cleanup on error
      SimulationManager.cleanupCandleManager(simulationId);
      
      const emergencySimulation = await this.createSimulationWithDummyTraders(simulationId, parameters);
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      
      return emergencySimulation;
    }
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
      console.log(`🎲 DYNAMIC PRICE: Generated $${dynamicInitialPrice} (${priceInfo.description}: ${priceInfo.range})`);
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
    
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(aggressiveTimeframe);
    
    const dynamicInterval = this.getPriceCategoryCandleInterval(dynamicInitialPrice);
    timeframeConfig.interval = dynamicInterval;
    
    // 🔧 CRITICAL FIX: Use singleton CandleManager and initialize properly
    const candleManager = SimulationManager.getOrCreateCandleManager(simulationId, dynamicInterval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    const currentPrice = finalParams.initialPrice;
    
    console.log(`🚀 SIMULATION CREATED: ${simulationId}`);
    console.log(`   💰 Starting Price: $${currentPrice}`);
    console.log(`   💧 Liquidity Pool: $${(finalParams.initialLiquidity / 1000000).toFixed(2)}M`);
    console.log(`   ⚡ Speed: ${finalParams.timeCompressionFactor}x`);
    console.log(`   🕯️ Candle Interval: ${dynamicInterval}ms`);
    console.log(`   🎯 Price Category: ${this.marketEngine.getPriceCategory(currentPrice).description}`);
    console.log(`   📊 CandleManager: SINGLETON (total: ${SimulationManager.candleManagerInstances.size})`);
    
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
      externalMarketMetrics: {
        currentTPS: 25,
        actualTPS: 0,
        queueDepth: 0,
        processedOrders: 0,
        rejectedOrders: 0,
        avgProcessingTime: 0,
        dominantTraderType: ExternalTraderType.RETAIL_TRADER,
        marketSentiment: 'neutral',
        liquidationRisk: 0
      }
    };
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(simulationId);
    }
    
    this.timeframeManager.clearCache(simulationId);
    
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

  // CRITICAL FIX: Enhanced startSimulation with proper state management
  startSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      console.error(`❌ [START] Simulation ${id} not found`);
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    // CRITICAL FIX: Proper state validation for start
    console.log(`🔍 [START] Current simulation state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
    
    if (simulation.isRunning && !simulation.isPaused) {
      console.warn(`⚠️ [START] Simulation ${id} already running and not paused`);
      throw new Error(`Simulation ${id} is already running`);
    }
    
    try {
      // CRITICAL FIX: Proper state initialization
      if (!simulation.isRunning) {
        // First time start
        simulation.isRunning = true;
        simulation.isPaused = false;
        console.log(`🚀 [START] Starting simulation ${id} for the first time`);
      } else if (simulation.isPaused) {
        // Resume from pause
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
        console.log(`📊 [START] Started TPS tracking for running simulation ${id}`);
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
      
      // Generate initial proper candles instead of thin candles
      setTimeout(() => {
        this.generateInitialProperCandles(simulation);
      }, 100);
      
      console.log(`✅ [START] Successfully started simulation ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [START] Failed to start simulation ${id}:`, error);
      
      // CRITICAL FIX: Reset state on error
      simulation.isRunning = false;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      this.simulationRegistrationStatus.set(id, 'ready');
      throw error;
    }
  }

  // 🔧 FIXED: Generate proper OHLCV candles instead of thin trades
  private generateInitialProperCandles(simulation: ExtendedSimulationState): void {
    console.log(`🕯️ FIXED: Generating proper OHLCV candles for ${simulation.id}`);
    
    const candleManager = this.getCandleManager(simulation.id);
    if (!candleManager) {
      console.error(`❌ No candle manager found for ${simulation.id}`);
      return;
    }
    
    // Initialize candle manager with simulation start time
    candleManager.initialize(simulation.startTime, simulation.currentPrice);
    
    // Generate 5-10 proper OHLCV candles with realistic data
    const candleInterval = this.getPriceCategoryCandleInterval(simulation.currentPrice);
    const numCandles = 8; // Fixed number instead of variable
    
    let currentTime = simulation.startTime;
    let currentPrice = simulation.currentPrice;
    
    for (let i = 0; i < numCandles; i++) {
      // Calculate realistic OHLCV data
      const volatility = simulation.marketConditions.volatility || 0.02;
      const priceVariation = volatility * 0.5; // Reduced variation for stability
      
      // Generate OHLC with proper relationships
      const open = i === 0 ? currentPrice : currentPrice * (1 + (Math.random() - 0.5) * priceVariation * 0.1);
      const closeVariation = (Math.random() - 0.5) * priceVariation;
      const close = open * (1 + closeVariation);
      
      // Ensure high is highest and low is lowest
      const high = Math.max(open, close) * (1 + Math.random() * priceVariation * 0.2);
      const low = Math.min(open, close) * (1 - Math.random() * priceVariation * 0.2);
      
      // Generate realistic volume
      const baseVolume = simulation.marketConditions.volume * 0.1;
      const volume = baseVolume * (0.5 + Math.random() * 1.5);
      
      // Create proper timestamp
      const timestamp = currentTime + (i * candleInterval);
      
      // Create the candle directly in price history (bypassing trade creation)
      const candle: PricePoint = {
        timestamp: timestamp,
        open: open,
        high: high,
        low: low,
        close: close,
        volume: volume
      };
      
      // Update candle manager
      candleManager.updateCandle(timestamp, close, volume);
      
      // Update external coordinator
      if (this.externalCandleUpdateCallback) {
        this.externalCandleUpdateCallback.queueUpdate(simulation.id, timestamp, close, volume);
      }
      
      currentPrice = close;
      currentTime = timestamp;
    }
    
    // Update simulation with proper candles
    const candles = candleManager.getCandles();
    simulation.priceHistory = candles.map(candle => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume || 0
    }));
    
    // Update current price to last candle's close
    simulation.currentPrice = currentPrice;
    simulation.currentTime = currentTime;
    
    console.log(`✅ FIXED: Generated ${candles.length} proper OHLCV candles for ${simulation.id}`);
    console.log(`   💰 Final Price: $${currentPrice.toFixed(6)}`);
    console.log(`   📊 Candles: ${candles.length} with realistic OHLCV data`);
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
        this.traderEngine.processTraderActions(simulation);
        
        this.processExternalMarketActivity(simulation);
        
        // 🔧 FIXED: Generate realistic trades instead of forced thin ones
        if (simulation.recentTrades.length < 50) {
          this.generateRealisticTradingActivity(simulation);
        }
        
        this.orderBookManager.updateOrderBook(simulation);
        this.traderEngine.updatePositionsPnL(simulation);
        
        this.updateCandlesFromSimulation(id, simulation);
        this.updatePriceHistoryWithInterpolation(simulation, speed);
        
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

  // 🔧 FIXED: Generate realistic trading activity instead of thin placeholder trades
  private generateRealisticTradingActivity(simulation: ExtendedSimulationState): void {
    const tradeCount = Math.floor(Math.random() * 10) + 5; // 5-15 trades
    
    for (let i = 0; i < tradeCount; i++) {
      const trader = simulation.traders[Math.floor(Math.random() * simulation.traders.length)];
      const action = Math.random() > 0.5 ? 'buy' : 'sell';
      
      // Generate realistic price variation
      const volatility = simulation.marketConditions.volatility || 0.02;
      const priceVariation = (Math.random() - 0.5) * volatility * 0.5; // Reduced variation
      const price = simulation.currentPrice * (1 + priceVariation);
      
      // Generate realistic quantity
      const baseQuantity = 1000;
      const quantityVariation = Math.random() * 3 + 0.5; // 0.5x to 3.5x variation
      const quantity = baseQuantity * quantityVariation;
      
      // Create trade with proper timestamp
      const tradeTimestamp = simulation.currentTime + (i * 100); // 100ms apart
      
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
    
    // Apply cumulative price impact
    const totalImpact = simulation.recentTrades.slice(0, tradeCount)
      .reduce((sum, trade) => sum + trade.impact, 0);
    
    simulation.currentPrice *= (1 + totalImpact);
    
    console.log(`🔄 Generated ${tradeCount} realistic trades with total impact: ${(totalImpact * 100).toFixed(3)}%`);
  }

  // Helper to calculate realistic price impact
  private calculateRealisticImpact(action: 'buy' | 'sell', value: number, simulation: ExtendedSimulationState): number {
    const liquidity = simulation.parameters.initialLiquidity;
    const volatility = simulation.marketConditions.volatility || 0.02;
    
    // Base impact based on trade size relative to liquidity
    const sizeImpact = (value / liquidity) * 0.1; // Reduced impact factor
    
    // Direction-based impact
    const directionMultiplier = action === 'buy' ? 1 : -1;
    
    // Volatility-adjusted impact
    const volatilityAdjustment = 1 + (volatility * 2);
    
    // Calculate final impact with realistic bounds
    const impact = sizeImpact * directionMultiplier * volatilityAdjustment;
    
    // Clamp to reasonable range
    return Math.max(-0.01, Math.min(0.01, impact)); // Max 1% impact per trade
  }

  private updateCandlesFromSimulation(simulationId: string, simulation: ExtendedSimulationState): void {
    const candleManager = this.getCandleManager(simulationId);
    if (!candleManager) return;
    
    const currentVolume = simulation.marketConditions.volume || 1000;
    candleManager.updateCandle(simulation.currentTime, simulation.currentPrice, currentVolume);
    
    if (this.externalCandleUpdateCallback) {
      this.externalCandleUpdateCallback.queueUpdate(
        simulationId, 
        simulation.currentTime, 
        simulation.currentPrice, 
        currentVolume
      );
    }
    
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

  private updatePriceHistoryWithInterpolation(simulation: ExtendedSimulationState, speed: number): void {
    const now = simulation.currentTime;
    const lastHistoryPoint = simulation.priceHistory[simulation.priceHistory.length - 1];
    
    if (speed > 100 && lastHistoryPoint) {
      const timeSinceLastPoint = now - lastHistoryPoint.timestamp;
      const expectedInterval = this.getPriceCategoryCandleInterval(simulation.currentPrice);
      
      if (timeSinceLastPoint > expectedInterval * 2) {
        const pointsNeeded = Math.floor(timeSinceLastPoint / expectedInterval);
        const priceStep = (simulation.currentPrice - lastHistoryPoint.close) / pointsNeeded;
        
        for (let i = 1; i < pointsNeeded; i++) {
          const interpolatedPrice = lastHistoryPoint.close + (priceStep * i);
          const interpolatedTime = lastHistoryPoint.timestamp + (expectedInterval * i);
          
          simulation.priceHistory.push({
            timestamp: interpolatedTime,
            open: lastHistoryPoint.close + (priceStep * (i-1)),
            high: interpolatedPrice * 1.001,
            low: interpolatedPrice * 0.999,
            close: interpolatedPrice,
            volume: simulation.marketConditions.volume * 0.5
          });
        }
      }
    }
    
    // Ensure we always have OHLCV structure
    const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    const openPrice = lastCandle ? lastCandle.close : simulation.currentPrice;
    
    simulation.priceHistory.push({
      timestamp: now,
      open: openPrice,
      high: Math.max(openPrice, simulation.currentPrice),
      low: Math.min(openPrice, simulation.currentPrice),
      close: simulation.currentPrice,
      volume: simulation.marketConditions.volume
    });
    
    if (simulation.priceHistory.length > 1000) {
      simulation.priceHistory = simulation.priceHistory.slice(-500);
    }
  }

  private processExternalMarketActivity(simulation: ExtendedSimulationState): void {
    try {
      const externalTrades = this.externalMarketEngine.processExternalOrders(simulation);
      
      if (externalTrades.length > 0) {
        simulation.recentTrades.unshift(...externalTrades as any[]);
        
        if (simulation.recentTrades.length > 2000) {
          simulation.recentTrades = simulation.recentTrades.slice(0, 1000);
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

  // CRITICAL FIX: Enhanced pauseSimulation with proper state management
  pauseSimulation(id: string): void {
    console.log(`⏸️ [PAUSE] Attempting to pause simulation ${id}`);
    
    try {
      const simulation = this.simulations.get(id);
      
      if (!simulation) {
        const error = new Error(`Simulation with ID ${id} not found`);
        console.error(`❌ [PAUSE] ${error.message}`);
        throw error;
      }
      
      // CRITICAL FIX: Proper state validation to prevent isRunning=true && isPaused=true
      console.log(`🔍 [PAUSE] Current simulation state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
      
      // State validation with clear logic
      if (!simulation.isRunning) {
        const error = new Error(`Simulation ${id} is not running (current state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused})`);
        console.error(`❌ [PAUSE] ${error.message}`);
        throw error;
      }
      
      if (simulation.isPaused) {
        const error = new Error(`Simulation ${id} is already paused (current state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused})`);
        console.error(`❌ [PAUSE] ${error.message}`);
        throw error;
      }
      
      console.log(`⏸️ [PAUSE] Pausing simulation ${id} - state transition: running → paused`);
      
      // CRITICAL FIX: Atomic state transition - pause first, keep running state temporarily
      simulation.isPaused = true;
      // Note: We keep isRunning=true while paused, as the simulation can be resumed
      // This allows for pause/resume functionality while maintaining state consistency
      
      // Store the updated simulation state
      this.simulations.set(id, simulation);
      
      // Stop the simulation interval
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
        console.log(`⏸️ [PAUSE] Cleared simulation interval for ${id}`);
      }
      
      // CRITICAL FIX: Stop TPS metrics tracking when paused to prevent spam
      this.stopTPSMetricsTracking(id);
      console.log(`📊 [PAUSE] Stopped TPS metrics tracking for paused simulation ${id}`);
      
      // Broadcast the pause state - use the current state which shows paused but still "running" (can be resumed)
      this.broadcastService.broadcastSimulationStatus(
        id,
        simulation.isRunning,  // Still true - simulation can be resumed
        simulation.isPaused,   // Now true - simulation is paused
        this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
        simulation.currentPrice
      );
      
      console.log(`✅ [PAUSE] Successfully paused simulation ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [PAUSE] Error pausing simulation ${id}:`, error);
      
      // CRITICAL FIX: Ensure state consistency on error
      const simulation = this.simulations.get(id);
      if (simulation) {
        // Reset to previous consistent state on error
        simulation.isPaused = false;
        this.simulations.set(id, simulation);
        console.log(`🔄 [PAUSE] Reset simulation state after error for ${id}`);
      }
      
      // Re-throw the error with more context for the API endpoint
      if (error instanceof Error) {
        throw new Error(`Failed to pause simulation ${id}: ${error.message}`);
      } else {
        throw new Error(`Failed to pause simulation ${id}: Unknown error`);
      }
    }
  }

  // CRITICAL FIX: Enhanced resumeSimulation method for proper state management
  resumeSimulation(id: string): void {
    console.log(`▶️ [RESUME] Attempting to resume simulation ${id}`);
    
    try {
      const simulation = this.simulations.get(id);
      
      if (!simulation) {
        const error = new Error(`Simulation with ID ${id} not found`);
        console.error(`❌ [RESUME] ${error.message}`);
        throw error;
      }
      
      // CRITICAL FIX: Proper state validation for resume
      console.log(`🔍 [RESUME] Current simulation state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
      
      if (!simulation.isRunning) {
        const error = new Error(`Simulation ${id} is not in a resumable state (isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused})`);
        console.error(`❌ [RESUME] ${error.message}`);
        throw error;
      }
      
      if (!simulation.isPaused) {
        const error = new Error(`Simulation ${id} is not paused and cannot be resumed (current state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused})`);
        console.error(`❌ [RESUME] ${error.message}`);
        throw error;
      }
      
      console.log(`▶️ [RESUME] Resuming simulation ${id} - state transition: paused → running`);
      
      // CRITICAL FIX: Atomic state transition - clear pause state
      simulation.isPaused = false;
      // isRunning remains true throughout pause/resume cycle
      
      // Store the updated simulation state
      this.simulations.set(id, simulation);
      
      // Restart the simulation interval
      if (!this.simulationIntervals.has(id)) {
        this.startSimulationLoop(id);
        console.log(`▶️ [RESUME] Restarted simulation interval for ${id}`);
      }
      
      // CRITICAL FIX: Restart TPS metrics tracking when resumed
      if (!this.metricsUpdateIntervals.has(id)) {
        this.startTPSMetricsTracking(id);
        console.log(`📊 [RESUME] Restarted TPS metrics tracking for resumed simulation ${id}`);
      }
      
      // Broadcast the resume state
      this.broadcastService.broadcastSimulationStatus(
        id,
        simulation.isRunning,  // True - simulation is running
        simulation.isPaused,   // False - simulation is no longer paused
        this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
        simulation.currentPrice
      );
      
      console.log(`✅ [RESUME] Successfully resumed simulation ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [RESUME] Error resuming simulation ${id}:`, error);
      
      // Re-throw the error with more context
      if (error instanceof Error) {
        throw new Error(`Failed to resume simulation ${id}: ${error.message}`);
      } else {
        throw new Error(`Failed to resume simulation ${id}: Unknown error`);
      }
    }
  }

  // CRITICAL FIX: Enhanced stopSimulation method for complete shutdown
  stopSimulation(id: string): void {
    console.log(`⏹️ [STOP] Attempting to stop simulation ${id}`);
    
    try {
      const simulation = this.simulations.get(id);
      
      if (!simulation) {
        console.warn(`⚠️ [STOP] Simulation ${id} not found`);
        return;
      }
      
      console.log(`🔍 [STOP] Current simulation state - isRunning: ${simulation.isRunning}, isPaused: ${simulation.isPaused}`);
      
      // CRITICAL FIX: Complete state reset for stop
      simulation.isRunning = false;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      
      // Stop the simulation interval
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
        console.log(`⏹️ [STOP] Cleared simulation interval for ${id}`);
      }
      
      // Stop TPS metrics tracking
      this.stopTPSMetricsTracking(id);
      
      // Broadcast the stop state
      this.broadcastService.broadcastSimulationStatus(
        id,
        false, // isRunning = false
        false, // isPaused = false
        this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
        simulation.currentPrice
      );
      
      console.log(`✅ [STOP] Successfully stopped simulation ${id} - final state: isRunning=${simulation.isRunning}, isPaused=${simulation.isPaused}`);
      
    } catch (error) {
      console.error(`❌ [STOP] Error stopping simulation ${id}:`, error);
      throw new Error(`Failed to stop simulation ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // CRITICAL FIX: State validation helper method
  private validateSimulationState(simulation: ExtendedSimulationState): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for impossible state combinations
    if (!simulation.isRunning && simulation.isPaused) {
      issues.push('Invalid state: Simulation cannot be paused while not running');
    }
    
    // Check for consistent timestamps
    if (simulation.currentTime < simulation.startTime) {
      issues.push('Invalid state: Current time is before start time');
    }
    
    if (simulation.endTime <= simulation.startTime) {
      issues.push('Invalid state: End time is not after start time');
    }
    
    // Check for valid price
    if (!simulation.currentPrice || simulation.currentPrice <= 0) {
      issues.push('Invalid state: Current price is invalid');
    }
    
    // Check for data consistency
    if (!simulation.parameters) {
      issues.push('Invalid state: Missing simulation parameters');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  // CRITICAL FIX: Get simulation state summary with validation
  getSimulationState(id: string): { 
    exists: boolean; 
    isRunning: boolean; 
    isPaused: boolean; 
    canStart: boolean; 
    canPause: boolean; 
    canResume: boolean; 
    canStop: boolean;
    validationIssues: string[];
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
    
    const validation = this.validateSimulationState(simulation);
    
    return {
      exists: true,
      isRunning: simulation.isRunning,
      isPaused: simulation.isPaused,
      canStart: !simulation.isRunning || simulation.isPaused,
      canPause: simulation.isRunning && !simulation.isPaused,
      canResume: simulation.isRunning && simulation.isPaused,
      canStop: simulation.isRunning,
      validationIssues: validation.issues
    };
  }

  resetSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (simulation.isRunning) {
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
      }
    }
    
    this.stopTPSMetricsTracking(id);
    
    // 🔧 FIXED: Clear external candle coordinator properly
    if (this.externalCandleUpdateCallback) {
      this.externalCandleUpdateCallback.clearCandles(id);
      this.externalCandleUpdateCallback.ensureCleanStart(id);
    }
    
    simulation.activePositions.forEach(position => {
      this.dataGenerator.releasePosition(position);
    });
    
    simulation.recentTrades.forEach(trade => {
      this.dataGenerator.releaseTrade(trade);
    });
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(id);
    }
    
    const params = simulation.parameters;
    
    const aggressiveTimeframe: Timeframe = '1m';
    this.simulationTimeframes.set(id, aggressiveTimeframe);
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(aggressiveTimeframe);
    
    const newDynamicPrice = this.marketEngine.generateRandomTokenPrice();
    const newDynamicLiquidity = this.calculateDynamicLiquidity(newDynamicPrice);
    
    const dynamicInterval = this.getPriceCategoryCandleInterval(newDynamicPrice);
    timeframeConfig.interval = dynamicInterval;
    
    // 🔧 CRITICAL FIX: Reset CandleManager properly
    const candleManager = this.getCandleManager(id);
    if (candleManager) {
      candleManager.clear();
    } else {
      console.warn(`⚠️ No CandleManager found for ${id} during reset`);
    }
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    
    console.log(`🔄 SIMULATION RESET: ${id}`);
    console.log(`   💰 New Starting Price: ${newDynamicPrice}`);
    console.log(`   💧 New Liquidity Pool: ${(newDynamicLiquidity / 1000000).toFixed(2)}M`);
    console.log(`   🕯️ New Candle Interval: ${dynamicInterval}ms`);
    console.log(`   🎯 New Price Category: ${this.marketEngine.getPriceCategory(newDynamicPrice).description}`);
    
    simulation.startTime = simulationStartTime;
    simulation.currentTime = simulationStartTime;
    simulation.endTime = simulationStartTime + (params.duration * 60 * 1000);
    simulation.priceHistory = []; // 🔧 FIXED: Ensure empty start
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
    simulation.recentTrades = []; // 🔧 FIXED: Ensure empty start
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
  }

  deleteSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    if (!simulation) return;
    
    console.log(`🗑️ DELETING: Simulation ${id} with full cleanup`);
    
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
    
    simulation.activePositions.forEach(position => {
      this.dataGenerator.releasePosition(position);
    });
    
    simulation.recentTrades.forEach(trade => {
      this.dataGenerator.releaseTrade(trade);
    });
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(id);
    }
    
    // 🔧 CRITICAL FIX: Cleanup CandleManager singleton
    SimulationManager.cleanupCandleManager(id);
    
    this.simulationSpeeds.delete(id);
    this.simulationTimeframes.delete(id);
    this.simulationRegistrationStatus.delete(id);
    this.registrationCallbacks.delete(id);
    this.timeframeManager.clearCache(id);
    this.simulations.delete(id);
    
    console.log(`✅ DELETED: Simulation ${id} completely cleaned up`);
    SimulationManager.debugCandleManagers(); // Debug remaining instances
  }

  async setTPSModeAsync(simulationId: string, mode: string): Promise<{
    success: boolean;
    error?: string;
    previousMode?: string;
    metrics?: ExternalMarketMetrics;
  }> {
    console.log(`🚀 [TPS] Setting TPS mode for simulation ${simulationId} to ${mode}`);
    
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
      
      console.log(`✅ [TPS] Successfully changed TPS mode to ${mode} for simulation ${simulationId}`);
      
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
    console.log(`💥 [LIQUIDATION] Triggering liquidation cascade for simulation ${simulationId}`);
    
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
        console.error(`❌ [LIQUIDATION] Invalid mode for liquidation cascade: ${TPSMode[currentMode]}`);
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
      
      console.log(`✅ [LIQUIDATION] Liquidation cascade triggered: ${liquidationOrders.length} orders, estimated impact: ${estimatedImpact.toFixed(2)}%`);
      
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
      console.error(`❌ [LIQUIDATION] Error triggering liquidation cascade for ${simulationId}:`, error);
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
    
    // 🔧 FIXED: Clean up throttling maps
    this.lastTPSBroadcast.clear();
    this.lastTPSMetricsSnapshot.clear();
    
    this.simulations.forEach((simulation, id) => {
      if (simulation.isRunning) {
        this.pauseSimulation(id);
      }
    });
    
    // 🔧 CRITICAL FIX: Emergency cleanup all CandleManager instances
    SimulationManager.emergencyCleanupAllCandleManagers();
    
    this.simulationRegistrationStatus.clear();
    this.registrationCallbacks.clear();
    this.performanceOptimizer.cleanup();
    this.traderEngine.cleanup();
    this.dataGenerator.cleanup();
    this.broadcastService.cleanup();
    this.externalMarketEngine.cleanup();
    
    console.log('✅ CLEANUP: SimulationManager cleanup complete');
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

  // 🔧 CRITICAL FIX: Debug methods for monitoring CandleManager instances
  public getCandleManagerStats(): { [simulationId: string]: any } {
    const stats: { [simulationId: string]: any } = {};
    
    for (const [simId, manager] of SimulationManager.candleManagerInstances.entries()) {
      try {
        stats[simId] = manager.getStats();
      } catch (error) {
        stats[simId] = { error: 'Failed to get stats', message: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
    
    return stats;
  }

  public debugCandleManagerInstances(): void {
    SimulationManager.debugCandleManagers();
  }

  public emergencyCleanupCandleManagers(): void {
    SimulationManager.emergencyCleanupAllCandleManagers();
  }
}

export default SimulationManager;