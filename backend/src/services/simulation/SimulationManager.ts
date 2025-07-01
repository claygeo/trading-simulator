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

export class SimulationManager {
  // Core state
  private simulations: Map<string, ExtendedSimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private simulationSpeeds: Map<string, number> = new Map();
  private simulationTimeframes: Map<string, Timeframe> = new Map();
  private processedTradesSyncInterval: NodeJS.Timeout | null = null;
  
  // CandleManager for each simulation
  private candleManagers: Map<string, CandleManager> = new Map();

  // FIXED: Engine instances with definite assignment assertions
  private marketEngine!: MarketEngine;
  private traderEngine!: TraderEngine;
  private orderBookManager!: OrderBookManager;
  private timeframeManager!: TimeframeManager;
  private scenarioEngine!: ScenarioEngine;
  private performanceOptimizer!: PerformanceOptimizer;
  private broadcastService!: BroadcastService;
  private dataGenerator!: DataGenerator;
  private externalMarketEngine!: ExternalMarketEngine;

  // External dependencies
  private transactionQueue?: TransactionQueue;
  private broadcastManager?: BroadcastManager;

  // Configuration
  private readonly baseUpdateInterval: number = SIMULATION_CONSTANTS.BASE_UPDATE_INTERVAL;
  private readonly processedTradesSyncIntervalTime: number = 50; // Sync every 50ms

  constructor() {
    this.initializeEngines();
    this.startProcessedTradesSync();
    
    console.log('✅ Enhanced simulation system initialized with real-time chart building');
  }

  private initializeEngines(): void {
    // Initialize managers and engines
    this.timeframeManager = new TimeframeManager();
    this.broadcastService = new BroadcastService();
    this.dataGenerator = new DataGenerator();
    this.orderBookManager = new OrderBookManager();
    this.performanceOptimizer = new PerformanceOptimizer();

    // Initialize market engine with dependencies
    this.marketEngine = new MarketEngine(
      (timeframe) => this.timeframeManager.getTimeframeConfig(timeframe),
      (simulationId) => this.simulationTimeframes.get(simulationId) || '15m',
      this.orderBookManager
    );

    // Initialize trader engine with enhanced callbacks
    this.traderEngine = new TraderEngine(
      (simulationId) => this.simulationTimeframes.get(simulationId) || '15m',
      (timeframe) => this.timeframeManager.getTimeframeConfig(timeframe),
      (simulationId, event) => this.broadcastService.broadcastEvent(simulationId, event),
      (simulationId, trades) => {
        this.timeframeManager.updateTradesBuffer(simulationId, trades);
        // Broadcast each trade immediately for real-time updates
        trades.forEach(trade => {
          this.broadcastService.broadcastTradeEvent(simulationId, trade);
        });
      }
    );

    // Initialize scenario engine with dependencies
    this.scenarioEngine = new ScenarioEngine(
      (simulationId) => this.timeframeManager.clearCache(simulationId),
      (simulationId, event) => this.broadcastService.broadcastEvent(simulationId, event)
    );

    // Initialize external market engine
    this.externalMarketEngine = new ExternalMarketEngine(
      (order, simulation) => this.marketEngine.processExternalOrder(order, simulation),
      (simulationId, event) => this.broadcastService.broadcastEvent(simulationId, event)
    );

    // Start performance monitoring
    this.performanceOptimizer.startPerformanceMonitoring();
  }

  private initializeCandleManager(simulationId: string, candleInterval: number): CandleManager {
    if (!this.candleManagers.has(simulationId)) {
      const manager = new CandleManager(candleInterval);
      this.candleManagers.set(simulationId, manager);
      console.log(`🕯️ CandleManager created for ${simulationId} with ${candleInterval/60000}m intervals`);
    }
    return this.candleManagers.get(simulationId)!;
  }

  private startProcessedTradesSync(): void {
    // Periodically sync processed trades from the transaction queue
    this.processedTradesSyncInterval = setInterval(() => {
      if (!this.transactionQueue) return;

      this.simulations.forEach((simulation, id) => {
        // Get processed trades from the queue
        const processedResults = this.transactionQueue!.getProcessedTrades(id, 100);
        
        if (processedResults.length > 0) {
          // Find the actual trade objects that were processed
          const processedTrades = simulation.recentTrades.filter(trade => 
            processedResults.some(result => result.tradeId === trade.id && result.processed)
          );

          if (processedTrades.length > 0) {
            // Integrate the processed trades back
            this.traderEngine.integrateProcessedTrades(simulation, processedTrades);
            
            // Update metrics
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
    
    // Set up the callback for when trades are processed
    transactionQueue.setTradeProcessedCallback((trade: Trade, simulationId: string) => {
      const simulation = this.simulations.get(simulationId);
      if (!simulation) return;

      // Integrate the processed trade immediately
      this.traderEngine.integrateProcessedTrades(simulation, [trade]);
      
      // Update simulation state
      this.simulations.set(simulationId, simulation);
    });
    
    console.log('Transaction queue connected to SimulationManager');
  }

  registerClient(client: WebSocket): void {
    this.broadcastService.registerClient(client);
  }

  // Create simulation with clean start
  async createSimulation(parameters: Partial<SimulationParameters> = {}): Promise<ExtendedSimulationState> {
    try {
      console.log('🚀 Creating simulation with clean start...');
      
      const traders = await duneApi.getPumpFunTraders();
      
      let simulation: ExtendedSimulationState;
      
      if (traders && traders.length > 0) {
        console.log(`Retrieved ${traders.length} traders from Dune API`);
        
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
        simulation = this.finalizeSimulationCreation(parameters, convertedTraders, traderProfiles);
      } else {
        // Fallback to dummy traders
        simulation = await this.createSimulationWithDummyTraders(parameters);
      }
      
      return simulation;
      
    } catch (error) {
      console.error('❌ Error creating simulation:', error);
      
      // Create emergency fallback simulation
      const emergencySimulation = await this.createSimulationWithDummyTraders(parameters);
      
      console.log(`🆘 Emergency simulation created`);
      return emergencySimulation;
    }
  }

  private createSimulationWithDummyTraders(parameters: Partial<SimulationParameters> = {}): Promise<ExtendedSimulationState> {
    console.log('Creating simulation with dummy traders');
    const dummyTraders = this.dataGenerator.generateDummyTraders(10);
    const traderProfiles = traderService.generateTraderProfiles(dummyTraders);
    
    return Promise.resolve(this.finalizeSimulationCreation(parameters, dummyTraders, traderProfiles));
  }

  private finalizeSimulationCreation(
    parameters: Partial<SimulationParameters>,
    traders: any[],
    traderProfiles: any[]
  ): ExtendedSimulationState {
    
    const randomInitialPrice = parameters.initialPrice || this.marketEngine.generateRandomTokenPrice();
    
    const defaultParams: SimulationParameters = {
      timeCompressionFactor: 1,
      initialPrice: randomInitialPrice,
      initialLiquidity: randomInitialPrice < 1 ? 100000 : 
                       randomInitialPrice < 10 ? 1000000 : 
                       randomInitialPrice < 100 ? 10000000 : 
                       50000000,
      volatilityFactor: 1.0,
      duration: 60 * 24,
      scenarioType: 'standard'
    };
    
    const finalParams = { ...defaultParams, ...parameters };
    const id = uuidv4();
    
    this.simulationSpeeds.set(id, finalParams.timeCompressionFactor);
    const optimalTimeframe = this.timeframeManager.determineOptimalTimeframe(finalParams.initialPrice);
    this.simulationTimeframes.set(id, optimalTimeframe);
    
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(optimalTimeframe);
    
    // Initialize empty CandleManager
    const candleManager = this.initializeCandleManager(id, timeframeConfig.interval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    const currentPrice = finalParams.initialPrice;
    
    // Create simulation state with empty chart
    const simulation: ExtendedSimulationState = {
      id,
      startTime: simulationStartTime,
      currentTime: simulationStartTime,
      endTime: simulationStartTime + (finalParams.duration * 60 * 1000),
      isRunning: false,
      isPaused: false,
      parameters: finalParams,
      marketConditions: {
        volatility: this.marketEngine.calculateBaseVolatility(currentPrice) * finalParams.volatilityFactor,
        trend: 'sideways',
        volume: finalParams.initialLiquidity * 0.1
      },
      priceHistory: [], // Empty start
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
        currentTPS: 10,
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
    
    this.simulations.set(id, simulation);
    
    // Clear any previous processed trades for this simulation
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(id);
    }
    
    // Clear timeframe cache to ensure fresh start
    this.timeframeManager.clearCache(id);
    
    console.log(`✅ Clean simulation created: ${id}`);
    
    return simulation;
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
    
    const maxSpeed = 1000;
    const validSpeed = Math.max(1, Math.min(maxSpeed, speed));
    
    this.simulationSpeeds.set(id, validSpeed);
    simulation.parameters.timeCompressionFactor = validSpeed;
    
    if (simulation._tickCounter !== undefined) {
      simulation._tickCounter = 0;
    }
    
    if (validSpeed >= 50) {
      this.performanceOptimizer.enableHighFrequencyMode();
    }
    
    console.log(`Simulation ${id} speed set to ${validSpeed}x`);
  }

  setTPSMode(simulationId: string, mode: TPSMode): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) {
      throw new Error(`Simulation ${simulationId} not found`);
    }

    this.externalMarketEngine.setTPSMode(mode);
    simulation.currentTPSMode = mode;
    
    switch (mode) {
      case TPSMode.HFT:
        this.enableHighFrequencyMode(simulationId);
        break;
      case TPSMode.STRESS:
        simulation.marketConditions.volatility *= 2;
        break;
    }
    
    this.simulations.set(simulationId, simulation);
    
    this.broadcastService.broadcastEvent(simulationId, {
      type: 'tps_mode_changed',
      timestamp: Date.now(),
      data: {
        mode: TPSMode[mode],
        targetTPS: this.getTargetTPSForMode(mode)
      }
    });
    
    console.log(`TPS mode for simulation ${simulationId} set to ${TPSMode[mode]}`);
  }

  enableHighFrequencyMode(simulationId: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return;
    
    this.performanceOptimizer.enableHighFrequencyMode();
    
    simulation.marketConditions.volatility *= 1.5;
    simulation.marketConditions.volume *= 2;
    
    this.simulations.set(simulationId, simulation);
  }

  // FIXED: Add missing startSimulation method
  startSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (simulation.isRunning && !simulation.isPaused) {
      throw new Error(`Simulation ${id} is already running`);
    }
    
    simulation.isRunning = true;
    simulation.isPaused = false;
    this.simulations.set(id, simulation);
    
    const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
    const timeframe = this.simulationTimeframes.get(id) || this.timeframeManager.determineOptimalTimeframe(simulation.currentPrice);
    
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
      totalTradesProcessed: this.getTotalTradesProcessed(id)
    }, marketAnalysis);
    
    if (!this.simulationIntervals.has(id)) {
      this.startSimulationLoop(id);
    }
    
    console.log(`Simulation ${id} started`);
  }

  private startSimulationLoop(simulationId: string): void {
    const interval = setInterval(() => {
      this.advanceSimulation(simulationId);
    }, this.baseUpdateInterval);
    
    this.simulationIntervals.set(simulationId, interval);
  }

  // FIXED: Add missing pauseSimulation method
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
    
    this.broadcastService.broadcastSimulationStatus(
      id,
      simulation.isRunning,
      true,
      this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
      simulation.currentPrice
    );
    
    console.log(`Simulation ${id} paused`);
  }

  // FIXED: Add missing resetSimulation method
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
    
    const optimalTimeframe = this.timeframeManager.determineOptimalTimeframe(params.initialPrice);
    this.simulationTimeframes.set(id, optimalTimeframe);
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(optimalTimeframe);
    
    const candleManager = this.initializeCandleManager(id, timeframeConfig.interval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    
    simulation.startTime = simulationStartTime;
    simulation.currentTime = simulationStartTime;
    simulation.endTime = simulationStartTime + (params.duration * 60 * 1000);
    simulation.priceHistory = [];
    simulation.currentPrice = params.initialPrice;
    simulation.marketConditions.volatility = this.marketEngine.calculateBaseVolatility(params.initialPrice) * params.volatilityFactor;
    
    simulation.isRunning = false;
    simulation.isPaused = false;
    simulation.orderBook = {
      bids: this.orderBookManager.generateInitialOrderBook('bids', simulation.currentPrice, simulation.parameters.initialLiquidity),
      asks: this.orderBookManager.generateInitialOrderBook('asks', simulation.currentPrice, simulation.parameters.initialLiquidity),
      lastUpdateTime: simulation.startTime
    };
    simulation.activePositions = [];
    simulation.closedPositions = [];
    simulation.recentTrades = [];
    simulation._tickCounter = 0;
    simulation.currentTPSMode = TPSMode.NORMAL;
    simulation.externalMarketMetrics = {
      currentTPS: 10,
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
    
    this.broadcastService.broadcastEvent(id, {
      type: 'simulation_reset',
      timestamp: simulation.startTime,
      data: simulation
    });
    
    console.log(`Simulation ${id} reset`);
  }

  // FIXED: Add missing methods for scenario management
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

  // FIXED: Add missing getTargetTPSForMode method
  private getTargetTPSForMode(mode: TPSMode): number {
    switch (mode) {
      case TPSMode.NORMAL: return 10;
      case TPSMode.BURST: return 100;
      case TPSMode.STRESS: return 1000;
      case TPSMode.HFT: return 10000;
      default: return 10;
    }
  }

  // FIXED: Add missing getTotalTradesProcessed method
  private getTotalTradesProcessed(simulationId: string): number {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return 0;
    
    return simulation.recentTrades.length + simulation.closedPositions.length * 2;
  }

  private advanceSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
    const timeframe = this.simulationTimeframes.get(id) || '15m';
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(timeframe);
    
    const ticksPerUpdate = Math.max(1, Math.floor(timeframeConfig.updateFrequency / (this.baseUpdateInterval * speed)));
    
    if (simulation._tickCounter === undefined) simulation._tickCounter = 0;
    simulation._tickCounter++;
    
    if (simulation._tickCounter >= ticksPerUpdate) {
      simulation._tickCounter = 0;
      
      if (this.performanceOptimizer.shouldUseBatchProcessing(speed)) {
        this.advanceSimulationBatched(id);
      } else if (this.performanceOptimizer.shouldUseParallelProcessing(speed)) {
        this.advanceSimulationParallel(id);
      } else {
        this.advanceSimulationNormal(id);
      }
    }
  }

  private async advanceSimulationNormal(id: string): Promise<void> {
    const simulation = this.simulations.get(id);
    if (!simulation) return;
    
    const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
    const realTimeElapsed = this.baseUpdateInterval;
    const simulatedTimeAdvancement = realTimeElapsed * speed;
    
    simulation.currentTime += simulatedTimeAdvancement;
    
    if (simulation.currentTime >= simulation.endTime) {
      this.pauseSimulation(id);
      return;
    }
    
    this.marketEngine.updatePrice(simulation);
    this.traderEngine.processTraderActions(simulation);
    this.orderBookManager.updateOrderBook(simulation);
    this.traderEngine.updatePositionsPnL(simulation);
    
    const marketAnalysis = this.timeframeManager.analyzeMarketConditions(id, simulation);
    const currentTimeframe = this.simulationTimeframes.get(id) || '15m';
    
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
        timeframe: currentTimeframe,
        externalMarketMetrics: simulation.externalMarketMetrics,
        totalTradesProcessed: this.getTotalTradesProcessed(id)
      }
    }, marketAnalysis);
    
    this.simulations.set(id, simulation);
  }

  private async advanceSimulationParallel(id: string): Promise<void> {
    // Simplified parallel implementation
    await this.advanceSimulationNormal(id);
  }

  private async advanceSimulationBatched(id: string): Promise<void> {
    // Simplified batch implementation
    await this.advanceSimulationNormal(id);
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
    
    simulation.activePositions.forEach(position => {
      this.dataGenerator.releasePosition(position);
    });
    
    simulation.recentTrades.forEach(trade => {
      this.dataGenerator.releaseTrade(trade);
    });
    
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(id);
    }
    
    this.candleManagers.delete(id);
    this.simulationSpeeds.delete(id);
    this.simulationTimeframes.delete(id);
    this.timeframeManager.clearCache(id);
    this.simulations.delete(id);
    
    console.log(`Simulation ${id} deleted`);
  }

  cleanup(): void {
    if (this.processedTradesSyncInterval) {
      clearInterval(this.processedTradesSyncInterval);
      this.processedTradesSyncInterval = null;
    }
    
    this.simulations.forEach((simulation, id) => {
      if (simulation.isRunning) {
        this.pauseSimulation(id);
      }
    });
    
    this.candleManagers.clear();
    this.performanceOptimizer.cleanup();
    this.traderEngine.cleanup();
    this.dataGenerator.cleanup();
    this.broadcastService.cleanup();
    this.externalMarketEngine.cleanup();
    
    console.log('SimulationManager cleanup complete');
  }
}