// backend/src/services/simulation/SimulationManager.ts - COMPLETE: Dynamic Starting Price Implementation
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

// NEW: Enhanced simulation parameters with price range options
export interface EnhancedSimulationParameters extends SimulationParameters {
  priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega' | 'random';
  customPrice?: number;
}

export class SimulationManager {
  // Core state with aggressive timing
  private simulations: Map<string, ExtendedSimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private simulationSpeeds: Map<string, number> = new Map();
  private simulationTimeframes: Map<string, Timeframe> = new Map();
  private processedTradesSyncInterval: NodeJS.Timeout | null = null;
  
  // FIXED: Add metrics tracking for TPS
  private liveTPSMetrics: Map<string, ExternalMarketMetrics> = new Map();
  private metricsUpdateIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  // Registration tracking
  private simulationRegistrationStatus: Map<string, 'creating' | 'registering' | 'ready' | 'starting' | 'running'> = new Map();
  private registrationCallbacks: Map<string, ((status: string) => void)[]> = new Map();
  
  // CandleManager for each simulation with aggressive timing
  private candleManagers: Map<string, CandleManager> = new Map();

  // Engine instances
  private marketEngine!: MarketEngine;
  private traderEngine!: TraderEngine;
  private orderBookManager!: OrderBookManager;
  private timeframeManager!: TimeframeManager;
  private scenarioEngine!: ScenarioEngine;
  private performanceOptimizer!: PerformanceOptimizer;
  public broadcastService!: BroadcastService; // Made public for WebSocket access
  private dataGenerator!: DataGenerator;
  private externalMarketEngine!: ExternalMarketEngine;

  // External dependencies
  private transactionQueue?: TransactionQueue;
  private broadcastManager?: BroadcastManager;

  // PRODUCTION: Ultra-fast timing configuration
  private readonly baseUpdateInterval: number = 50; // 50ms for ultra-fast mode
  private readonly processedTradesSyncIntervalTime: number = 25; // 25ms sync
  private readonly metricsUpdateInterval: number = 100; // 100ms metrics updates

  constructor() {
    this.initializeEngines();
    this.startProcessedTradesSync();
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

  private initializeCandleManager(simulationId: string, candleInterval: number): CandleManager {
    if (!this.candleManagers.has(simulationId)) {
      const aggressiveInterval = Math.min(candleInterval, 10000); // Cap at 10 seconds
      const manager = new CandleManager(aggressiveInterval);
      manager.clear();
      this.candleManagers.set(simulationId, manager);
    }
    return this.candleManagers.get(simulationId)!;
  }

  // FIXED: Start TPS metrics tracking for a simulation
  private startTPSMetricsTracking(simulationId: string): void {
    if (this.metricsUpdateIntervals.has(simulationId)) {
      return; // Already tracking
    }
    
    console.log(`📊 [TPS METRICS] Starting metrics tracking for simulation ${simulationId}`);
    
    const interval = setInterval(() => {
      const simulation = this.simulations.get(simulationId);
      if (!simulation) {
        console.log(`📊 [TPS METRICS] Simulation ${simulationId} not found, stopping metrics tracking`);
        this.stopTPSMetricsTracking(simulationId);
        return;
      }
      
      // Calculate live TPS metrics
      const liveMetrics = this.calculateLiveTPSMetrics(simulation);
      this.liveTPSMetrics.set(simulationId, liveMetrics);
      
      // Broadcast TPS metrics update
      this.broadcastTPSMetricsUpdate(simulationId, liveMetrics);
      
    }, this.metricsUpdateInterval);
    
    this.metricsUpdateIntervals.set(simulationId, interval);
  }

  // FIXED: Stop TPS metrics tracking
  private stopTPSMetricsTracking(simulationId: string): void {
    const interval = this.metricsUpdateIntervals.get(simulationId);
    if (interval) {
      clearInterval(interval);
      this.metricsUpdateIntervals.delete(simulationId);
      this.liveTPSMetrics.delete(simulationId);
      console.log(`📊 [TPS METRICS] Stopped metrics tracking for simulation ${simulationId}`);
    }
  }

  // FIXED: Calculate live TPS metrics
  private calculateLiveTPSMetrics(simulation: ExtendedSimulationState): ExternalMarketMetrics {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const fiveSecondsAgo = now - 5000;
    
    // Count recent trades
    const tradesLastSecond = simulation.recentTrades.filter(trade => 
      trade.timestamp > oneSecondAgo
    ).length;
    
    const tradesLast5Seconds = simulation.recentTrades.filter(trade => 
      trade.timestamp > fiveSecondsAgo
    ).length;
    
    // Calculate TPS
    const actualTPS = tradesLastSecond;
    const avgTPS = Math.round(tradesLast5Seconds / 5);
    
    // Analyze market sentiment from recent trades
    const recentTrades = simulation.recentTrades.slice(0, 20);
    const buyCount = recentTrades.filter(t => t.action === 'buy').length;
    const sellCount = recentTrades.filter(t => t.action === 'sell').length;
    
    let marketSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (buyCount > sellCount * 1.3) {
      marketSentiment = 'bullish';
    } else if (sellCount > buyCount * 1.3) {
      marketSentiment = 'bearish';
    }
    
    // Get current TPS mode settings
    const currentMode = simulation.currentTPSMode || TPSMode.NORMAL;
    const targetTPS = this.getTargetTPSForMode(currentMode);
    
    // Calculate queue depth estimate
    const queueDepth = Math.max(0, targetTPS - actualTPS);
    
    // Determine dominant trader type based on TPS mode
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
    
    // Calculate processing metrics
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

  // FIXED: Calculate liquidation risk
  private calculateLiquidationRisk(simulation: ExtendedSimulationState): number {
    const currentPrice = simulation.currentPrice;
    const initialPrice = simulation.parameters.initialPrice;
    const priceChange = Math.abs(currentPrice - initialPrice) / initialPrice;
    
    // High volatility and price swings increase liquidation risk
    const volatilityFactor = simulation.marketConditions.volatility || 1;
    const riskScore = (priceChange * 100) + (volatilityFactor * 10);
    
    return Math.min(100, Math.max(0, riskScore));
  }

  // FIXED: Broadcast TPS metrics update
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

  // FIXED: Get TPS mode as string
  private getTPSModeString(simulationId: string): string {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return 'NORMAL';
    
    const mode = simulation.currentTPSMode || TPSMode.NORMAL;
    return TPSMode[mode] || 'NORMAL';
  }

  // FIXED: Get live TPS metrics (public method for WebSocket)
  public getLiveTPSMetrics(simulationId: string): ExternalMarketMetrics | undefined {
    const liveMetrics = this.liveTPSMetrics.get(simulationId);
    if (liveMetrics) {
      return liveMetrics;
    }
    
    // Calculate on-demand if not available
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

  // FIXED: Enhanced createSimulation with dynamic price generation
  async createSimulation(parameters: Partial<EnhancedSimulationParameters> = {}): Promise<ExtendedSimulationState> {
    const simulationId = uuidv4();
    
    try {
      // Mark as creating
      this.simulationRegistrationStatus.set(simulationId, 'creating');
      
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
      
      // Register with all systems
      this.simulationRegistrationStatus.set(simulationId, 'registering');
      
      this.simulations.set(simulationId, simulation);
      this.simulationSpeeds.set(simulationId, simulation.parameters.timeCompressionFactor);
      
      const aggressiveTimeframe: Timeframe = '1m';
      this.simulationTimeframes.set(simulationId, aggressiveTimeframe);
      
      const aggressiveInterval = 5000; // 5-second intervals
      this.initializeCandleManager(simulationId, aggressiveInterval);
      
      // FIXED: Start TPS metrics tracking immediately
      this.startTPSMetricsTracking(simulationId);
      
      // Verification
      await this.verifySimulationRegistration(simulationId);
      
      // Mark as ready
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      
      // Notify callbacks
      this.notifyRegistrationCallbacks(simulationId, 'ready');
      
      return simulation;
      
    } catch (error) {
      console.error(`Error creating simulation ${simulationId}:`, error);
      this.simulationRegistrationStatus.set(simulationId, 'error');
      this.notifyRegistrationCallbacks(simulationId, 'error');
      
      // Create emergency fallback
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
      const candleManager = this.candleManagers.get(simulationId);
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
      
      const candleManager = this.candleManagers.get(simulationId);
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

  // FIXED: Enhanced simulation creation with dynamic price generation
  private finalizeSimulationCreation(
    simulationId: string,
    parameters: Partial<EnhancedSimulationParameters>,
    traders: any[],
    traderProfiles: any[]
  ): ExtendedSimulationState {
    
    // FIXED: Enhanced dynamic price generation logic
    let dynamicInitialPrice: number;
    
    if (parameters.customPrice && parameters.customPrice > 0) {
      // Use custom price if provided
      dynamicInitialPrice = parameters.customPrice;
      console.log(`💰 CUSTOM PRICE: Using user-specified price $${dynamicInitialPrice}`);
    } else if (parameters.initialPrice && parameters.initialPrice > 0) {
      // Use explicit initial price if provided (backwards compatibility)
      dynamicInitialPrice = parameters.initialPrice;
      console.log(`💰 EXPLICIT PRICE: Using parameter-specified price $${dynamicInitialPrice}`);
    } else {
      // Generate dynamic random price based on range
      const priceRange = parameters.priceRange;
      dynamicInitialPrice = this.marketEngine.generateRandomTokenPrice(priceRange);
      
      // Get price category info for logging
      const priceInfo = this.marketEngine.getPriceCategory(dynamicInitialPrice);
      console.log(`🎲 DYNAMIC PRICE: Generated $${dynamicInitialPrice} (${priceInfo.description}: ${priceInfo.range})`);
    }
    
    const defaultParams: SimulationParameters = {
      timeCompressionFactor: 50, // 50x speed for ultra-fast mode
      initialPrice: dynamicInitialPrice, // FIXED: Use dynamic price
      initialLiquidity: this.calculateDynamicLiquidity(dynamicInitialPrice), // ENHANCED: Dynamic liquidity
      volatilityFactor: 2.0,
      duration: 60 * 24,
      scenarioType: 'standard'
    };
    
    const finalParams = { ...defaultParams, ...parameters };
    
    // ENSURE: Final price is always dynamic, never fixed
    if (!parameters.customPrice && !parameters.initialPrice) {
      finalParams.initialPrice = dynamicInitialPrice;
    }
    
    this.simulationSpeeds.set(simulationId, finalParams.timeCompressionFactor);
    
    const aggressiveTimeframe: Timeframe = '1m';
    this.simulationTimeframes.set(simulationId, aggressiveTimeframe);
    
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(aggressiveTimeframe);
    const ultraFastInterval = 5000; // 5 seconds
    timeframeConfig.interval = ultraFastInterval;
    
    const candleManager = this.initializeCandleManager(simulationId, ultraFastInterval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    const currentPrice = finalParams.initialPrice; // Use the dynamic price
    
    console.log(`🚀 SIMULATION CREATED: ${simulationId}`);
    console.log(`   💰 Starting Price: $${currentPrice}`);
    console.log(`   💧 Liquidity Pool: $${(finalParams.initialLiquidity / 1000000).toFixed(2)}M`);
    console.log(`   ⚡ Speed: ${finalParams.timeCompressionFactor}x`);
    console.log(`   🎯 Price Category: ${this.marketEngine.getPriceCategory(currentPrice).description}`);
    
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
    
    // Clear previous data
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(simulationId);
    }
    
    this.timeframeManager.clearCache(simulationId);
    
    return simulation;
  }

  // NEW: Calculate dynamic liquidity based on token price
  private calculateDynamicLiquidity(price: number): number {
    // Realistic liquidity scaling based on token price category
    if (price < 0.001) {
      // Micro-cap tokens: Lower liquidity
      return 50000 + Math.random() * 150000; // $50K - $200K
    } else if (price < 0.01) {
      // Small micro-cap: Moderate liquidity
      return 100000 + Math.random() * 300000; // $100K - $400K
    } else if (price < 0.1) {
      // Large micro-cap: Higher liquidity
      return 200000 + Math.random() * 500000; // $200K - $700K
    } else if (price < 1) {
      // Small-cap: Substantial liquidity
      return 500000 + Math.random() * 1500000; // $500K - $2M
    } else if (price < 10) {
      // Mid-cap: Large liquidity pools
      return 1000000 + Math.random() * 4000000; // $1M - $5M
    } else if (price < 100) {
      // Large-cap: Very large pools
      return 5000000 + Math.random() * 15000000; // $5M - $20M
    } else {
      // Mega-cap: Enormous liquidity
      return 10000000 + Math.random() * 40000000; // $10M - $50M
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
    
    const candleManager = this.candleManagers.get(id);
    if (candleManager) {
      candleManager.adjustSpeed(validSpeed);
    }
    
    if (validSpeed >= 50) {
      this.performanceOptimizer.enableHighFrequencyMode();
    }
  }

  // PRODUCTION: Start simulation with error handling
  startSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      console.error(`Simulation ${id} not found`);
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (simulation.isRunning && !simulation.isPaused) {
      console.warn(`Simulation ${id} already running`);
      throw new Error(`Simulation ${id} is already running`);
    }
    
    try {
      // Update simulation status
      simulation.isRunning = true;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      this.simulationRegistrationStatus.set(id, 'starting');
      
      const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
      const timeframe = this.simulationTimeframes.get(id) || '1m';
      
      // FIXED: Ensure TPS metrics tracking is active
      if (!this.metricsUpdateIntervals.has(id)) {
        this.startTPSMetricsTracking(id);
      }
      
      // Broadcast initial state
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
      
      // Start simulation loop
      if (!this.simulationIntervals.has(id)) {
        this.startSimulationLoop(id);
      }
      
      this.simulationRegistrationStatus.set(id, 'running');
      
      // Force initial activity
      setTimeout(() => {
        simulation.currentTime += 60000;
        this.forceInitialTradingActivity(simulation, 50);
        const candleManager = this.candleManagers.get(id);
        if (candleManager) {
          for (let i = 0; i < 5; i++) {
            const timeOffset = i * 10000;
            candleManager.updateCandle(
              simulation.currentTime + timeOffset, 
              simulation.currentPrice * (0.999 + Math.random() * 0.002), 
              1000 + Math.random() * 2000
            );
          }
        }
        this.marketEngine.updatePrice(simulation);
      }, 100);
      
      // Second wave
      setTimeout(() => {
        simulation.currentTime += 120000;
        this.forceInitialTradingActivity(simulation, 30);
        this.marketEngine.updatePrice(simulation);
      }, 500);
      
      // Third wave
      setTimeout(() => {
        simulation.currentTime += 180000;
        this.forceInitialTradingActivity(simulation, 25);
        this.marketEngine.updatePrice(simulation);
      }, 1000);
      
    } catch (error) {
      console.error(`Failed to start simulation ${id}:`, error);
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

  // PRODUCTION: Advance simulation with minimal logging
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
        
        // Process simulation
        this.marketEngine.updatePrice(simulation);
        this.traderEngine.processTraderActions(simulation);
        
        // Process external market orders based on TPS mode
        this.processExternalMarketActivity(simulation);
        
        // Force additional trades if activity is low
        if (simulation.recentTrades.length < 50) {
          this.forceInitialTradingActivity(simulation, 20);
        }
        
        this.orderBookManager.updateOrderBook(simulation);
        this.traderEngine.updatePositionsPnL(simulation);
        
        // Force initial trading activity if chart is empty
        if (simulation.priceHistory.length === 0) {
          this.forceInitialTradingActivity(simulation, 100);
        }
        
        // FIXED: Enhanced price history interpolation for high TPS modes
        this.updatePriceHistoryWithInterpolation(simulation, speed);
        
        // Broadcast updates
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

  // FIXED: Enhanced price history interpolation for smoother charts
  private updatePriceHistoryWithInterpolation(simulation: ExtendedSimulationState, speed: number): void {
    const now = simulation.currentTime;
    const lastHistoryPoint = simulation.priceHistory[simulation.priceHistory.length - 1];
    
    // For high TPS modes, add interpolated points to prevent gaps
    if (speed > 100 && lastHistoryPoint) {
      const timeSinceLastPoint = now - lastHistoryPoint.timestamp;
      const expectedInterval = 60000; // 1 minute intervals
      
      if (timeSinceLastPoint > expectedInterval * 2) {
        // Add interpolated points
        const pointsNeeded = Math.floor(timeSinceLastPoint / expectedInterval);
        const priceStep = (simulation.currentPrice - lastHistoryPoint.price) / pointsNeeded;
        
        for (let i = 1; i < pointsNeeded; i++) {
          const interpolatedPrice = lastHistoryPoint.price + (priceStep * i);
          const interpolatedTime = lastHistoryPoint.timestamp + (expectedInterval * i);
          
          simulation.priceHistory.push({
            timestamp: interpolatedTime,
            price: interpolatedPrice,
            volume: simulation.marketConditions.volume * 0.5 // Reduced volume for interpolated points
          });
        }
      }
    }
    
    // Add current price point
    simulation.priceHistory.push({
      timestamp: now,
      price: simulation.currentPrice,
      volume: simulation.marketConditions.volume
    });
    
    // Keep history manageable
    if (simulation.priceHistory.length > 1000) {
      simulation.priceHistory = simulation.priceHistory.slice(-500);
    }
  }

  // Process external market activity based on TPS mode
  private processExternalMarketActivity(simulation: ExtendedSimulationState): void {
    try {
      const externalTrades = this.externalMarketEngine.processExternalOrders(simulation);
      
      if (externalTrades.length > 0) {
        // Add external trades to simulation
        simulation.recentTrades.unshift(...externalTrades as any[]);
        
        // Keep trade list manageable
        if (simulation.recentTrades.length > 2000) {
          simulation.recentTrades = simulation.recentTrades.slice(0, 1000);
        }
        
        // Update external market metrics
        if (simulation.externalMarketMetrics) {
          simulation.externalMarketMetrics.processedOrders += externalTrades.length;
          simulation.externalMarketMetrics.actualTPS = this.calculateActualTPS(simulation);
          
          // Update market sentiment based on external trades
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

  // Calculate actual TPS
  private calculateActualTPS(simulation: ExtendedSimulationState): number {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    const recentTrades = simulation.recentTrades.filter(trade => 
      trade.timestamp > oneSecondAgo
    );
    
    return recentTrades.length;
  }

  // PRODUCTION: Force initial trading activity
  private forceInitialTradingActivity(simulation: ExtendedSimulationState, tradeCount: number): void {
    for (let i = 0; i < tradeCount; i++) {
      const trader = simulation.traders[Math.floor(Math.random() * simulation.traders.length)];
      const action = Math.random() > 0.5 ? 'buy' : 'sell';
      
      const priceVariation = (Math.random() - 0.5) * 0.01;
      const price = simulation.currentPrice * (1 + priceVariation);
      const quantity = 1000 + Math.random() * 4000;
      
      const trade = {
        id: `init-${simulation.currentTime}-${i}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: simulation.currentTime - (i * 100),
        trader: {
          walletAddress: trader.trader.walletAddress,
          preferredName: trader.trader.preferredName || trader.trader.walletAddress,
          netPnl: trader.trader.netPnl || 0
        },
        action,
        price,
        quantity,
        value: price * quantity,
        impact: action === 'buy' ? 0.0002 : -0.0002
      };
      
      simulation.recentTrades.unshift(trade as Trade);
    }
    
    // Update current price based on trade momentum
    const recentTrades = simulation.recentTrades.slice(0, 20);
    const buyVolume = recentTrades.filter(t => t.action === 'buy').reduce((sum, t) => sum + t.value, 0);
    const sellVolume = recentTrades.filter(t => t.action === 'sell').reduce((sum, t) => sum + t.value, 0);
    
    if (buyVolume > sellVolume) {
      simulation.currentPrice *= 1.001;
    } else if (sellVolume > buyVolume) {
      simulation.currentPrice *= 0.999;
    }
  }

  private getTotalTradesProcessed(simulationId: string): number {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return 0;
    
    return simulation.recentTrades.length + simulation.closedPositions.length * 2;
  }

  pauseSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (!simulation.isRunning || simulation.isPaused) {
      throw new Error(`Simulation ${id} is not running or already paused`);
    }
    
    simulation.isPaused = true;
    this.simulations.set(id, simulation);
    
    const interval = this.simulationIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.simulationIntervals.delete(id);
    }
    
    // FIXED: Stop TPS metrics tracking when paused
    this.stopTPSMetricsTracking(id);
    
    this.broadcastService.broadcastSimulationStatus(
      id,
      simulation.isRunning,
      true,
      this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
      simulation.currentPrice
    );
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
    
    // FIXED: Stop TPS metrics tracking
    this.stopTPSMetricsTracking(id);
    
    // Clean up positions and trades
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
    
    // Reset to aggressive timeframe
    const aggressiveTimeframe: Timeframe = '1m';
    this.simulationTimeframes.set(id, aggressiveTimeframe);
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(aggressiveTimeframe);
    
    // Force ultra-fast intervals on reset
    timeframeConfig.interval = 5000; // 5 seconds
    
    // Clear and recreate candle manager
    const candleManager = this.initializeCandleManager(id, timeframeConfig.interval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    
    // FIXED: Generate new dynamic price on reset
    const newDynamicPrice = this.marketEngine.generateRandomTokenPrice();
    const newDynamicLiquidity = this.calculateDynamicLiquidity(newDynamicPrice);
    
    console.log(`🔄 SIMULATION RESET: ${id}`);
    console.log(`   💰 New Starting Price: $${newDynamicPrice}`);
    console.log(`   💧 New Liquidity Pool: $${(newDynamicLiquidity / 1000000).toFixed(2)}M`);
    console.log(`   🎯 New Price Category: ${this.marketEngine.getPriceCategory(newDynamicPrice).description}`);
    
    // Reset all simulation state completely with new dynamic values
    simulation.startTime = simulationStartTime;
    simulation.currentTime = simulationStartTime;
    simulation.endTime = simulationStartTime + (params.duration * 60 * 1000);
    simulation.priceHistory = []; // CRITICAL: Clear price history
    simulation.currentPrice = newDynamicPrice; // NEW: Dynamic price
    simulation.parameters.initialPrice = newDynamicPrice; // UPDATE: Parameters
    simulation.parameters.initialLiquidity = newDynamicLiquidity; // UPDATE: Dynamic liquidity
    simulation.marketConditions.volatility = this.marketEngine.calculateBaseVolatility(newDynamicPrice) * params.volatilityFactor;
    
    simulation.isRunning = false;
    simulation.isPaused = false;
    simulation.orderBook = {
      bids: this.orderBookManager.generateInitialOrderBook('bids', newDynamicPrice, newDynamicLiquidity),
      asks: this.orderBookManager.generateInitialOrderBook('asks', newDynamicPrice, newDynamicLiquidity),
      lastUpdateTime: simulation.startTime
    };
    simulation.activePositions = []; // CRITICAL: Clear positions
    simulation.closedPositions = []; // CRITICAL: Clear closed positions
    simulation.recentTrades = []; // CRITICAL: Clear trades
    simulation._tickCounter = 0;
    
    // Reset TPS mode to NORMAL
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
    
    // Reset registration status
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
    
    if (simulation.isRunning) {
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
      }
    }
    
    // FIXED: Stop TPS metrics tracking
    this.stopTPSMetricsTracking(id);
    
    simulation.activePositions.forEach(position => {
      this.dataGenerator.releasePosition(position);
    });
    
    simulation.recentTrades.forEach(trade => {
      this.dataGenerator.releaseTrade(trade);
    });
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(id);
    }
    
    // Clean up all tracking
    this.candleManagers.delete(id);
    this.simulationSpeeds.delete(id);
    this.simulationTimeframes.delete(id);
    this.simulationRegistrationStatus.delete(id);
    this.registrationCallbacks.delete(id);
    this.timeframeManager.clearCache(id);
    this.simulations.delete(id);
  }

  // FIXED: TPS Mode Management Methods - Async version to prevent conflicts
  
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
      
      // Convert string mode to TPSMode enum
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
      
      // Update simulation TPS mode
      simulation.currentTPSMode = tpsMode;
      
      // Update external market engine
      this.externalMarketEngine.setTPSMode(tpsMode);
      
      // Update external market metrics based on mode
      const targetTPS = this.getTargetTPSForMode(tpsMode);
      if (simulation.externalMarketMetrics) {
        simulation.externalMarketMetrics.currentTPS = targetTPS;
        
        // Reset counters for new mode
        simulation.externalMarketMetrics.actualTPS = 0;
        simulation.externalMarketMetrics.processedOrders = 0;
        simulation.externalMarketMetrics.rejectedOrders = 0;
        simulation.externalMarketMetrics.queueDepth = 0;
        
        // Update dominant trader type based on mode
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
      
      // Apply market condition changes based on TPS mode
      switch (tpsMode) {
        case TPSMode.NORMAL:
          simulation.marketConditions.volatility *= 1.0; // No change
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
      
      // Save updated simulation
      this.simulations.set(simulationId, simulation);
      
      console.log(`✅ [TPS] Successfully changed TPS mode to ${mode} for simulation ${simulationId}`);
      
      // FIXED: Get live metrics for response
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
      
      // Check if simulation is in appropriate mode
      const currentMode = simulation.currentTPSMode || TPSMode.NORMAL;
      if (currentMode !== TPSMode.STRESS && currentMode !== TPSMode.HFT) {
        console.error(`❌ [LIQUIDATION] Invalid mode for liquidation cascade: ${TPSMode[currentMode]}`);
        return {
          success: false,
          error: `Liquidation cascade requires STRESS or HFT mode, current mode is ${TPSMode[currentMode]}`
        };
      }
      
      // Trigger liquidation cascade through external market engine
      const liquidationOrders = this.externalMarketEngine.triggerLiquidationCascade(simulation);
      
      if (liquidationOrders.length === 0) {
        console.warn(`⚠️ [LIQUIDATION] No liquidation orders generated for ${simulationId}`);
        return {
          success: false,
          error: 'Failed to generate liquidation orders'
        };
      }
      
      // Calculate estimated market impact
      const totalLiquidationValue = liquidationOrders.reduce((sum, order) => 
        sum + (order.price * order.quantity), 0
      );
      
      const marketCap = simulation.currentPrice * 1000000; // Assume 1M token supply
      const estimatedImpact = (totalLiquidationValue / marketCap) * 100;
      
      // Update simulation metrics
      if (simulation.externalMarketMetrics) {
        simulation.externalMarketMetrics.liquidationRisk = Math.min(100, estimatedImpact);
        simulation.externalMarketMetrics.marketSentiment = 'bearish';
      }
      
      // Force market conditions to reflect panic
      simulation.marketConditions.trend = 'bearish';
      simulation.marketConditions.volatility *= 1.5;
      
      console.log(`✅ [LIQUIDATION] Liquidation cascade triggered: ${liquidationOrders.length} orders, estimated impact: ${estimatedImpact.toFixed(2)}%`);
      
      // Broadcast liquidation event
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
    if (this.processedTradesSyncInterval) {
      clearInterval(this.processedTradesSyncInterval);
      this.processedTradesSyncInterval = null;
    }
    
    // FIXED: Clean up all TPS metrics intervals
    this.metricsUpdateIntervals.forEach((interval, simulationId) => {
      clearInterval(interval);
    });
    this.metricsUpdateIntervals.clear();
    this.liveTPSMetrics.clear();
    
    this.simulations.forEach((simulation, id) => {
      if (simulation.isRunning) {
        this.pauseSimulation(id);
      }
    });
    
    this.candleManagers.clear();
    this.simulationRegistrationStatus.clear();
    this.registrationCallbacks.clear();
    this.performanceOptimizer.cleanup();
    this.traderEngine.cleanup();
    this.dataGenerator.cleanup();
    this.broadcastService.cleanup();
    this.externalMarketEngine.cleanup();
  }

  // Additional methods for external use
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

  // NEW: Get available price ranges for UI
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
}

export default SimulationManager;