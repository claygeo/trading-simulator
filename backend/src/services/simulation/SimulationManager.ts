// backend/src/services/simulation/SimulationManager.ts - CRITICAL FIXES
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
  // Core state with proper initialization tracking
  private simulations: Map<string, ExtendedSimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private simulationSpeeds: Map<string, number> = new Map();
  private simulationTimeframes: Map<string, Timeframe> = new Map();
  private processedTradesSyncInterval: NodeJS.Timeout | null = null;
  
  // CRITICAL FIX: Registration tracking to prevent race conditions
  private simulationRegistrationStatus: Map<string, 'creating' | 'registering' | 'ready' | 'starting' | 'running'> = new Map();
  private registrationCallbacks: Map<string, ((status: string) => void)[]> = new Map();
  
  // CandleManager for each simulation with proper initialization
  private candleManagers: Map<string, CandleManager> = new Map();

  // Engine instances
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
  private readonly processedTradesSyncIntervalTime: number = 50;

  constructor() {
    this.initializeEngines();
    this.startProcessedTradesSync();
    
    console.log('✅ Enhanced SimulationManager initialized with race condition fixes');
  }

  private initializeEngines(): void {
    // Initialize managers and engines (existing code)
    this.timeframeManager = new TimeframeManager();
    this.broadcastService = new BroadcastService();
    this.dataGenerator = new DataGenerator();
    this.orderBookManager = new OrderBookManager();
    this.performanceOptimizer = new PerformanceOptimizer();

    this.marketEngine = new MarketEngine(
      (timeframe) => this.timeframeManager.getTimeframeConfig(timeframe),
      (simulationId) => this.simulationTimeframes.get(simulationId) || '15m',
      this.orderBookManager
    );

    this.traderEngine = new TraderEngine(
      (simulationId) => this.simulationTimeframes.get(simulationId) || '15m',
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
      const manager = new CandleManager(candleInterval);
      manager.clear(); // Ensure clean start
      this.candleManagers.set(simulationId, manager);
      console.log(`🕯️ CandleManager created for ${simulationId} with ${candleInterval/60000}m intervals (clean start)`);
    }
    return this.candleManagers.get(simulationId)!;
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
    
    console.log('Transaction queue connected to SimulationManager');
  }

  registerClient(client: WebSocket): void {
    this.broadcastService.registerClient(client);
  }

  // CRITICAL FIX: Enhanced simulation creation with proper registration tracking
  async createSimulation(parameters: Partial<SimulationParameters> = {}): Promise<ExtendedSimulationState> {
    const simulationId = uuidv4();
    
    try {
      console.log(`🚀 Creating simulation ${simulationId} with comprehensive registration tracking...`);
      
      // STEP 1: Mark as creating to prevent race conditions
      this.simulationRegistrationStatus.set(simulationId, 'creating');
      
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
        simulation = this.finalizeSimulationCreation(simulationId, parameters, convertedTraders, traderProfiles);
      } else {
        simulation = await this.createSimulationWithDummyTraders(simulationId, parameters);
      }
      
      // STEP 2: CRITICAL - Ensure simulation is fully registered before returning
      console.log(`🔄 Registering simulation ${simulationId} with all systems...`);
      this.simulationRegistrationStatus.set(simulationId, 'registering');
      
      // Register with all systems
      this.simulations.set(simulationId, simulation);
      this.simulationSpeeds.set(simulationId, simulation.parameters.timeCompressionFactor);
      
      // Initialize candle manager with clean state
      const timeframe = this.simulationTimeframes.get(simulationId) || '15m';
      const config = this.timeframeManager.getTimeframeConfig(timeframe);
      this.initializeCandleManager(simulationId, config.interval);
      
      // STEP 3: Final verification and status update
      await this.verifySimulationRegistration(simulationId);
      
      // STEP 4: Mark as ready for WebSocket subscriptions
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      console.log(`✅ Simulation ${simulationId} fully registered and ready for WebSocket subscriptions`);
      
      // STEP 5: Notify any waiting callbacks
      this.notifyRegistrationCallbacks(simulationId, 'ready');
      
      return simulation;
      
    } catch (error) {
      console.error(`❌ Error creating simulation ${simulationId}:`, error);
      this.simulationRegistrationStatus.set(simulationId, 'error');
      this.notifyRegistrationCallbacks(simulationId, 'error');
      
      // Create emergency fallback simulation
      const emergencySimulation = await this.createSimulationWithDummyTraders(simulationId, parameters);
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      
      console.log(`🆘 Emergency simulation ${simulationId} created`);
      return emergencySimulation;
    }
  }

  // CRITICAL FIX: Verification method to ensure simulation is properly registered
  private async verifySimulationRegistration(simulationId: string): Promise<void> {
    const maxAttempts = 5;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const simulation = this.simulations.get(simulationId);
      const candleManager = this.candleManagers.get(simulationId);
      const speed = this.simulationSpeeds.get(simulationId);
      
      if (simulation && candleManager && speed !== undefined) {
        console.log(`✅ Simulation ${simulationId} registration verified (attempt ${attempts + 1})`);
        return;
      }
      
      attempts++;
      console.log(`⏳ Verification attempt ${attempts} for simulation ${simulationId}...`);
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
    }
    
    throw new Error(`Failed to verify simulation ${simulationId} registration after ${maxAttempts} attempts`);
  }

  // CRITICAL FIX: Public method to check if simulation is ready for WebSocket subscriptions
  isSimulationReady(simulationId: string): boolean {
    const status = this.simulationRegistrationStatus.get(simulationId);
    return status === 'ready' || status === 'starting' || status === 'running';
  }

  // CRITICAL FIX: Public method to wait for simulation readiness
  async waitForSimulationReady(simulationId: string, timeoutMs: number = 5000): Promise<boolean> {
    const status = this.simulationRegistrationStatus.get(simulationId);
    
    if (status === 'ready' || status === 'starting' || status === 'running') {
      return true;
    }
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error(`⏰ Timeout waiting for simulation ${simulationId} to be ready`);
        resolve(false);
      }, timeoutMs);
      
      // Add callback for when registration completes
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
      this.registrationCallbacks.delete(simulationId); // Clean up
    }
  }

  private createSimulationWithDummyTraders(simulationId: string, parameters: Partial<SimulationParameters> = {}): Promise<ExtendedSimulationState> {
    console.log(`Creating simulation ${simulationId} with dummy traders`);
    const dummyTraders = this.dataGenerator.generateDummyTraders(10);
    const traderProfiles = traderService.generateTraderProfiles(dummyTraders);
    
    return Promise.resolve(this.finalizeSimulationCreation(simulationId, parameters, dummyTraders, traderProfiles));
  }

  private finalizeSimulationCreation(
    simulationId: string,
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
    
    this.simulationSpeeds.set(simulationId, finalParams.timeCompressionFactor);
    const optimalTimeframe = this.timeframeManager.determineOptimalTimeframe(finalParams.initialPrice);
    this.simulationTimeframes.set(simulationId, optimalTimeframe);
    
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(optimalTimeframe);
    
    // Initialize empty CandleManager
    const candleManager = this.initializeCandleManager(simulationId, timeframeConfig.interval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    const currentPrice = finalParams.initialPrice;
    
    // Create simulation state with guaranteed empty chart
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
        volume: finalParams.initialLiquidity * 0.1
      },
      priceHistory: [], // Guaranteed empty start
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
    
    // Clear any previous processed trades for this simulation
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(simulationId);
    }
    
    // Clear timeframe cache to ensure fresh start
    this.timeframeManager.clearCache(simulationId);
    
    console.log(`✅ Clean simulation created: ${simulationId} with guaranteed empty chart`);
    
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

  // CRITICAL FIX: Enhanced startSimulation with comprehensive logging and error handling
  startSimulation(id: string): void {
    console.log(`🚀 [START REQUEST] Starting simulation: ${id}`);
    
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      console.error(`❌ [START FAILED] Simulation ${id} not found in simulations map`);
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    console.log(`✅ [START FOUND] Simulation found:`, {
      id: simulation.id,
      isRunning: simulation.isRunning,
      isPaused: simulation.isPaused,
      currentPrice: simulation.currentPrice,
      traderCount: simulation.traders.length,
      candleCount: simulation.priceHistory.length
    });
    
    if (simulation.isRunning && !simulation.isPaused) {
      console.warn(`⚠️ [START SKIP] Simulation ${id} is already running`);
      throw new Error(`Simulation ${id} is already running`);
    }
    
    try {
      console.log(`⚡ [START ATTEMPT] Calling simulationManager.startSimulation()`);
      
      // Update simulation status
      simulation.isRunning = true;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      this.simulationRegistrationStatus.set(id, 'starting');
      
      console.log(`✅ [START SUCCESS] Simulation state updated to running`);
      
      const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
      const timeframe = this.simulationTimeframes.get(id) || this.timeframeManager.determineOptimalTimeframe(simulation.currentPrice);
      
      console.log(`📊 [START CONFIG] Speed: ${speed}x, Timeframe: ${timeframe}`);
      
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
        totalTradesProcessed: this.getTotalTradesProcessed(id)
      }, marketAnalysis);
      
      console.log(`📡 [START BROADCAST] Initial state broadcasted`);
      
      // Start the simulation loop
      if (!this.simulationIntervals.has(id)) {
        console.log(`🔄 [SIM MANAGER] Starting simulation loop for ${id}`);
        this.startSimulationLoop(id);
        console.log(`✅ [SIM LOOP] Simulation loop started successfully`);
      } else {
        console.log(`⚠️ [SIM LOOP] Simulation loop already exists for ${id}`);
      }
      
      // Update registration status
      this.simulationRegistrationStatus.set(id, 'running');
      
      // Force immediate tick to start generating data
      console.log(`⏰ [FORCE TICK] Triggering immediate simulation tick`);
      setTimeout(() => {
        this.advanceSimulation(id);
        console.log(`📊 [TEST TRADE] First simulation tick completed`);
      }, 100);
      
      console.log(`🎉 [START COMPLETE] Simulation ${id} started successfully`);
      
    } catch (error) {
      console.error(`💥 [START ERROR] Failed to start simulation ${id}:`, error);
      
      // Reset state on failure
      simulation.isRunning = false;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      this.simulationRegistrationStatus.set(id, 'ready');
      
      throw error;
    }
  }

  private startSimulationLoop(simulationId: string): void {
    console.log(`🔄 Starting simulation loop for ${simulationId}`);
    
    const interval = setInterval(() => {
      try {
        this.advanceSimulation(simulationId);
      } catch (error) {
        console.error(`❌ Error in simulation loop for ${simulationId}:`, error);
        // Don't clear the interval on error - let it continue
      }
    }, this.baseUpdateInterval);
    
    this.simulationIntervals.set(simulationId, interval);
    console.log(`✅ Simulation loop interval created for ${simulationId}`);
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
    
    this.broadcastService.broadcastSimulationStatus(
      id,
      simulation.isRunning,
      true,
      this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
      simulation.currentPrice
    );
    
    console.log(`Simulation ${id} paused`);
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
    
    const optimalTimeframe = this.timeframeManager.determineOptimalTimeframe(params.initialPrice);
    this.simulationTimeframes.set(id, optimalTimeframe);
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(optimalTimeframe);
    
    // Clear and recreate candle manager
    const candleManager = this.initializeCandleManager(id, timeframeConfig.interval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    
    // Reset all simulation state
    simulation.startTime = simulationStartTime;
    simulation.currentTime = simulationStartTime;
    simulation.endTime = simulationStartTime + (params.duration * 60 * 1000);
    simulation.priceHistory = []; // Critical: ensure empty
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
    
    // Reset registration status
    this.simulationRegistrationStatus.set(id, 'ready');
    
    this.broadcastService.broadcastEvent(id, {
      type: 'simulation_reset',
      timestamp: simulation.startTime,
      data: simulation
    });
    
    console.log(`Simulation ${id} reset to clean state`);
  }

  // CRITICAL FIX: Enhanced advanceSimulation with comprehensive logging
  private advanceSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    try {
      const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
      const timeframe = this.simulationTimeframes.get(id) || '15m';
      const timeframeConfig = this.timeframeManager.getTimeframeConfig(timeframe);
      
      const ticksPerUpdate = Math.max(1, Math.floor(timeframeConfig.updateFrequency / (this.baseUpdateInterval * speed)));
      
      if (simulation._tickCounter === undefined) simulation._tickCounter = 0;
      simulation._tickCounter++;
      
      // Log periodic tick information
      if (simulation._tickCounter === 1 || simulation._tickCounter % 10 === 0) {
        console.log(`⏰ [SIM LOOP] Tick ${simulation._tickCounter} for simulation ${id}`);
      }
      
      if (simulation._tickCounter >= ticksPerUpdate) {
        simulation._tickCounter = 0;
        
        // Advance simulation time
        const realTimeElapsed = this.baseUpdateInterval;
        const simulatedTimeAdvancement = realTimeElapsed * speed;
        simulation.currentTime += simulatedTimeAdvancement;
        
        if (simulation.currentTime >= simulation.endTime) {
          console.log(`⏰ [SIM COMPLETE] Simulation ${id} reached end time`);
          this.pauseSimulation(id);
          return;
        }
        
        // Process simulation step by step with logging
        this.marketEngine.updatePrice(simulation);
        this.traderEngine.processTraderActions(simulation);
        this.orderBookManager.updateOrderBook(simulation);
        this.traderEngine.updatePositionsPnL(simulation);
        
        // Generate test trades if needed (for empty simulations)
        if (simulation.recentTrades.length === 0 && simulation._tickCounter === 0) {
          console.log(`📊 [TEST TRADE] Generated initial test trade for ${id}`);
          const testTrade = {
            id: `test-${Date.now()}`,
            timestamp: simulation.currentTime,
            trader: {
              walletAddress: 'test-trader',
              netPnl: 0
            },
            action: Math.random() > 0.5 ? 'buy' : 'sell',
            price: simulation.currentPrice * (0.995 + Math.random() * 0.01),
            quantity: 100 + Math.random() * 200,
            value: 0,
            impact: 0.0001
          };
          testTrade.value = testTrade.price * testTrade.quantity;
          
          simulation.recentTrades.unshift(testTrade as Trade);
          
          console.log(`📊 [TEST TRADE] Generated: ${testTrade.action} ${testTrade.quantity} @ $${testTrade.price.toFixed(4)}`);
        }
        
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
            totalTradesProcessed: this.getTotalTradesProcessed(id)
          }
        }, marketAnalysis);
        
        this.simulations.set(id, simulation);
        
        // Log progress periodically
        if (Math.random() < 0.05) { // 5% chance
          console.log(`📊 [SIM UPDATE] ${id}: Price=$${simulation.currentPrice.toFixed(4)}, Candles=${simulation.priceHistory.length}, Trades=${simulation.recentTrades.length}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ [SIM ERROR] Error advancing simulation ${id}:`, error);
      // Don't stop the simulation on error, just log it
    }
  }

  private getTotalTradesProcessed(simulationId: string): number {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return 0;
    
    return simulation.recentTrades.length + simulation.closedPositions.length * 2;
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
    
    // Clean up all tracking
    this.candleManagers.delete(id);
    this.simulationSpeeds.delete(id);
    this.simulationTimeframes.delete(id);
    this.simulationRegistrationStatus.delete(id);
    this.registrationCallbacks.delete(id);
    this.timeframeManager.clearCache(id);
    this.simulations.delete(id);
    
    console.log(`Simulation ${id} deleted and cleaned up`);
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
    this.simulationRegistrationStatus.clear();
    this.registrationCallbacks.clear();
    this.performanceOptimizer.cleanup();
    this.traderEngine.cleanup();
    this.dataGenerator.cleanup();
    this.broadcastService.cleanup();
    this.externalMarketEngine.cleanup();
    
    console.log('SimulationManager cleanup complete');
  }

  // Additional helper methods for external use
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

  private getTargetTPSForMode(mode: TPSMode): number {
    switch (mode) {
      case TPSMode.NORMAL: return 10;
      case TPSMode.BURST: return 100;
      case TPSMode.STRESS: return 1000;
      case TPSMode.HFT: return 10000;
      default: return 10;
    }
  }
}

export default SimulationManager;