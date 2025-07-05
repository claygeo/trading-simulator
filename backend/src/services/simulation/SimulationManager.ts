// backend/src/services/simulation/SimulationManager.ts - AGGRESSIVE TIME & TRADING MODE
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
  // Core state with aggressive timing
  private simulations: Map<string, ExtendedSimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private simulationSpeeds: Map<string, number> = new Map();
  private simulationTimeframes: Map<string, Timeframe> = new Map();
  private processedTradesSyncInterval: NodeJS.Timeout | null = null;
  
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
  private broadcastService!: BroadcastService;
  private dataGenerator!: DataGenerator;
  private externalMarketEngine!: ExternalMarketEngine;

  // External dependencies
  private transactionQueue?: TransactionQueue;
  private broadcastManager?: BroadcastManager;

  // AGGRESSIVE TIMING CONFIGURATION
  private readonly baseUpdateInterval: number = 50; // 50ms (was 100ms) - MUCH FASTER
  private readonly processedTradesSyncIntervalTime: number = 25; // 25ms (was 50ms)

  constructor() {
    this.initializeEngines();
    this.startProcessedTradesSync();
    
    console.log('🚀 AGGRESSIVE SimulationManager initialized - ULTRA FAST MODE');
  }

  private initializeEngines(): void {
    // Initialize managers and engines
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
      // AGGRESSIVE MODE: Cap intervals at 10 seconds max
      const aggressiveInterval = Math.min(candleInterval, 10000);
      const manager = new CandleManager(aggressiveInterval);
      manager.clear(); // Ensure clean start
      this.candleManagers.set(simulationId, manager);
      console.log(`⚡ AGGRESSIVE CandleManager: ${simulationId} with ${aggressiveInterval/1000}s intervals (RAPID MODE)`);
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
    
    console.log('Transaction queue connected to AGGRESSIVE SimulationManager');
  }

  registerClient(client: WebSocket): void {
    this.broadcastService.registerClient(client);
  }

  // AGGRESSIVE SIMULATION CREATION with immediate trading activity
  async createSimulation(parameters: Partial<SimulationParameters> = {}): Promise<ExtendedSimulationState> {
    const simulationId = uuidv4();
    
    try {
      console.log(`🚀 Creating AGGRESSIVE simulation ${simulationId}...`);
      
      // STEP 1: Mark as creating
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
        simulation = this.finalizeAggressiveSimulationCreation(simulationId, parameters, convertedTraders, traderProfiles);
      } else {
        simulation = await this.createAggressiveSimulationWithDummyTraders(simulationId, parameters);
      }
      
      // STEP 2: Register with all systems
      console.log(`⚡ Registering AGGRESSIVE simulation ${simulationId}...`);
      this.simulationRegistrationStatus.set(simulationId, 'registering');
      
      // Register with all systems
      this.simulations.set(simulationId, simulation);
      this.simulationSpeeds.set(simulationId, simulation.parameters.timeCompressionFactor);
      
      // AGGRESSIVE MODE: Use 1-minute timeframe for ultra-fast candles
      const aggressiveTimeframe: Timeframe = '1m';
      this.simulationTimeframes.set(simulationId, aggressiveTimeframe);
      
      // Initialize candle manager with aggressive intervals (5-10 seconds)
      const config = this.timeframeManager.getTimeframeConfig(aggressiveTimeframe);
      const aggressiveInterval = 5000; // Force 5-second intervals
      this.initializeCandleManager(simulationId, aggressiveInterval);
      
      // STEP 3: Verification
      await this.verifySimulationRegistration(simulationId);
      
      // STEP 4: Mark as ready
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      console.log(`✅ AGGRESSIVE simulation ${simulationId} ready for ultra-fast trading`);
      
      // STEP 5: Notify callbacks
      this.notifyRegistrationCallbacks(simulationId, 'ready');
      
      return simulation;
      
    } catch (error) {
      console.error(`❌ Error creating AGGRESSIVE simulation ${simulationId}:`, error);
      this.simulationRegistrationStatus.set(simulationId, 'error');
      this.notifyRegistrationCallbacks(simulationId, 'error');
      
      // Create emergency fallback
      const emergencySimulation = await this.createAggressiveSimulationWithDummyTraders(simulationId, parameters);
      this.simulationRegistrationStatus.set(simulationId, 'ready');
      
      console.log(`🆘 Emergency AGGRESSIVE simulation ${simulationId} created`);
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
        console.log(`✅ AGGRESSIVE simulation ${simulationId} registration verified (attempt ${attempts + 1})`);
        return;
      }
      
      attempts++;
      console.log(`⏳ AGGRESSIVE verification attempt ${attempts} for simulation ${simulationId}...`);
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
    }
    
    throw new Error(`Failed to verify AGGRESSIVE simulation ${simulationId} registration after ${maxAttempts} attempts`);
  }

  async isSimulationRegistered(simulationId: string): Promise<boolean> {
    try {
      const simulation = this.simulations.get(simulationId);
      if (!simulation) {
        console.log(`❌ [AGGRESSIVE CHECK] Simulation ${simulationId} not found`);
        return false;
      }
      
      const status = this.simulationRegistrationStatus.get(simulationId);
      if (status !== 'ready' && status !== 'starting' && status !== 'running') {
        console.log(`⏳ [AGGRESSIVE CHECK] Simulation ${simulationId} status: ${status}`);
        return false;
      }
      
      const candleManager = this.candleManagers.get(simulationId);
      if (!candleManager) {
        console.log(`❌ [AGGRESSIVE CHECK] Simulation ${simulationId} candle manager not initialized`);
        return false;
      }
      
      console.log(`✅ [AGGRESSIVE CHECK] Simulation ${simulationId} is ready for ultra-fast trading`);
      return true;
      
    } catch (error) {
      console.error(`❌ [AGGRESSIVE CHECK] Error checking registration for ${simulationId}:`, error);
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
        console.error(`⏰ Timeout waiting for AGGRESSIVE simulation ${simulationId} to be ready`);
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

  private createAggressiveSimulationWithDummyTraders(simulationId: string, parameters: Partial<SimulationParameters> = {}): Promise<ExtendedSimulationState> {
    console.log(`Creating AGGRESSIVE simulation ${simulationId} with dummy traders`);
    const dummyTraders = this.dataGenerator.generateDummyTraders(10);
    const traderProfiles = traderService.generateTraderProfiles(dummyTraders);
    
    return Promise.resolve(this.finalizeAggressiveSimulationCreation(simulationId, parameters, dummyTraders, traderProfiles));
  }

  // AGGRESSIVE SIMULATION CREATION with ultra-fast parameters
  private finalizeAggressiveSimulationCreation(
    simulationId: string,
    parameters: Partial<SimulationParameters>,
    traders: any[],
    traderProfiles: any[]
  ): ExtendedSimulationState {
    
    const randomInitialPrice = parameters.initialPrice || this.marketEngine.generateRandomTokenPrice();
    
    // AGGRESSIVE PARAMETERS for rapid candle generation
    const defaultParams: SimulationParameters = {
      timeCompressionFactor: 50, // MUCH HIGHER: 50x speed (was 10x)
      initialPrice: randomInitialPrice,
      initialLiquidity: randomInitialPrice < 1 ? 100000 : 
                       randomInitialPrice < 10 ? 1000000 : 
                       randomInitialPrice < 100 ? 10000000 : 
                       50000000,
      volatilityFactor: 2.0, // HIGHER: More volatility for visible movement
      duration: 60 * 24,
      scenarioType: 'standard'
    };
    
    const finalParams = { ...defaultParams, ...parameters };
    
    this.simulationSpeeds.set(simulationId, finalParams.timeCompressionFactor);
    
    // AGGRESSIVE MODE: Force 1-minute timeframe with ultra-fast intervals
    const aggressiveTimeframe: Timeframe = '1m';
    this.simulationTimeframes.set(simulationId, aggressiveTimeframe);
    
    const timeframeConfig = this.timeframeManager.getTimeframeConfig(aggressiveTimeframe);
    
    // FORCE ULTRA-FAST INTERVALS: 5 seconds for immediate chart building
    const ultraFastInterval = 5000; // 5 seconds
    timeframeConfig.interval = ultraFastInterval;
    
    console.log(`⚡ [AGGRESSIVE MODE] Using ${ultraFastInterval/1000}s intervals at ${finalParams.timeCompressionFactor}x speed`);
    
    // Initialize CandleManager with ultra-fast intervals
    const candleManager = this.initializeCandleManager(simulationId, ultraFastInterval);
    candleManager.clear();
    
    const currentRealTime = Date.now();
    const simulationStartTime = currentRealTime;
    const currentPrice = finalParams.initialPrice;
    
    // Create simulation state with AGGRESSIVE configuration
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
        volume: finalParams.initialLiquidity * 0.25 // HIGHER: More initial volume
      },
      priceHistory: [], // Empty start for rapid building
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
        currentTPS: 25, // HIGHER: Start with more TPS
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
    
    // Clear any previous data
    if (this.transactionQueue) {
      this.transactionQueue.clearProcessedTrades(simulationId);
    }
    
    this.timeframeManager.clearCache(simulationId);
    
    console.log(`✅ [AGGRESSIVE CREATE] Ultra-fast simulation created:`, {
      id: simulationId,
      price: `$${currentPrice.toFixed(6)}`,
      speed: `${finalParams.timeCompressionFactor}x`,
      interval: `${ultraFastInterval/1000}s`,
      volatility: `${(simulation.marketConditions.volatility * 100).toFixed(2)}%`,
      traders: traderProfiles.length,
      mode: 'ULTRA_AGGRESSIVE'
    });
    
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
    
    // AGGRESSIVE MODE: Allow much higher speeds
    const maxSpeed = 200; // Allow up to 200x speed
    const validSpeed = Math.max(1, Math.min(maxSpeed, speed));
    
    this.simulationSpeeds.set(id, validSpeed);
    simulation.parameters.timeCompressionFactor = validSpeed;
    
    if (simulation._tickCounter !== undefined) {
      simulation._tickCounter = 0;
    }
    
    // AGGRESSIVE MODE: Adjust candle intervals based on speed
    const candleManager = this.candleManagers.get(id);
    if (candleManager) {
      candleManager.adjustSpeed(validSpeed);
    }
    
    if (validSpeed >= 50) {
      this.performanceOptimizer.enableHighFrequencyMode();
    }
    
    console.log(`⚡ AGGRESSIVE simulation ${id} speed set to ${validSpeed}x`);
  }

  // AGGRESSIVE SIMULATION START with immediate forced activity
  startSimulation(id: string): void {
    console.log(`🚀 [AGGRESSIVE START] Ultra-fast simulation start: ${id}`);
    
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      console.error(`❌ [AGGRESSIVE START FAILED] Simulation ${id} not found`);
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (simulation.isRunning && !simulation.isPaused) {
      console.warn(`⚠️ [AGGRESSIVE START SKIP] Simulation ${id} already running`);
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
      
      console.log(`✅ [AGGRESSIVE CONFIG]`, {
        id,
        speed: `${speed}x`,
        timeframe,
        price: `$${simulation.currentPrice.toFixed(6)}`,
        mode: 'ULTRA_AGGRESSIVE'
      });
      
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
      
      // Start the AGGRESSIVE simulation loop
      if (!this.simulationIntervals.has(id)) {
        console.log(`🔄 [AGGRESSIVE LOOP] Creating ultra-fast simulation loop...`);
        this.startAggressiveSimulationLoop(id);
      }
      
      // Update status
      this.simulationRegistrationStatus.set(id, 'running');
      
      // AGGRESSIVE KICKSTART: Force immediate massive trading activity
      console.log(`⚡ [AGGRESSIVE KICKSTART] Forcing immediate ultra-fast activity...`);
      setTimeout(() => {
        console.log(`🎯 [AGGRESSIVE WAVE 1] Forcing initial massive trades and time jump`);
        
        // Force time forward aggressively
        simulation.currentTime += 60000; // Jump 1 minute forward
        
        // Force massive initial trades (50+ trades)
        this.forceAggressiveTradingActivity(simulation, 50);
        
        // Force multiple candle updates
        const candleManager = this.candleManagers.get(id);
        if (candleManager) {
          for (let i = 0; i < 5; i++) {
            const timeOffset = i * 10000; // 10-second intervals
            candleManager.updateCandle(
              simulation.currentTime + timeOffset, 
              simulation.currentPrice * (0.999 + Math.random() * 0.002), 
              1000 + Math.random() * 2000
            );
          }
        }
        
        // Trigger market update
        this.marketEngine.updatePrice(simulation);
        
        console.log(`🚀 [AGGRESSIVE WAVE 1] Complete - Chart should build rapidly`);
      }, 100);
      
      // Second aggressive wave
      setTimeout(() => {
        console.log(`🎯 [AGGRESSIVE WAVE 2] Second massive trading wave...`);
        simulation.currentTime += 120000; // Jump another 2 minutes
        this.forceAggressiveTradingActivity(simulation, 30);
        this.marketEngine.updatePrice(simulation);
        console.log(`🚀 [AGGRESSIVE WAVE 2] Complete - Chart accelerating`);
      }, 500);
      
      // Third wave for sustained activity
      setTimeout(() => {
        console.log(`🎯 [AGGRESSIVE WAVE 3] Sustained trading wave...`);
        simulation.currentTime += 180000; // Jump another 3 minutes
        this.forceAggressiveTradingActivity(simulation, 25);
        this.marketEngine.updatePrice(simulation);
        console.log(`🚀 [AGGRESSIVE WAVE 3] Complete - Chart in full swing`);
      }, 1000);
      
      console.log(`🎉 [AGGRESSIVE START COMPLETE] Ultra-fast simulation ${id} started with massive immediate activity`);
      
    } catch (error) {
      console.error(`💥 [AGGRESSIVE START ERROR] Failed to start simulation ${id}:`, error);
      simulation.isRunning = false;
      simulation.isPaused = false;
      this.simulations.set(id, simulation);
      this.simulationRegistrationStatus.set(id, 'ready');
      throw error;
    }
  }

  private startAggressiveSimulationLoop(simulationId: string): void {
    console.log(`🔄 Starting AGGRESSIVE simulation loop for ${simulationId}`);
    
    const interval = setInterval(() => {
      try {
        this.advanceAggressiveSimulation(simulationId);
      } catch (error) {
        console.error(`❌ Error in AGGRESSIVE simulation loop for ${simulationId}:`, error);
        // Don't clear the interval on error - let it continue
      }
    }, this.baseUpdateInterval);
    
    this.simulationIntervals.set(simulationId, interval);
    console.log(`✅ AGGRESSIVE simulation loop interval created for ${simulationId} (${this.baseUpdateInterval}ms)`);
  }

  // AGGRESSIVE SIMULATION ADVANCEMENT with rapid time progression
  private advanceAggressiveSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    try {
      const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
      const timeframe = this.simulationTimeframes.get(id) || '1m';
      const timeframeConfig = this.timeframeManager.getTimeframeConfig(timeframe);
      
      // AGGRESSIVE: Much faster tick progression
      const aggressiveTicksPerUpdate = Math.max(1, Math.floor(speed / 5)); // More frequent updates
      
      if (simulation._tickCounter === undefined) simulation._tickCounter = 0;
      simulation._tickCounter++;
      
      // AGGRESSIVE LOGGING: Track rapid progression
      const isSignificantTick = simulation._tickCounter === 1 || simulation._tickCounter % 5 === 0;
      
      if (isSignificantTick) {
        console.log(`⚡ [AGGRESSIVE TICK] ${simulation._tickCounter} | Speed: ${speed}x | Candles: ${simulation.priceHistory.length} | Mode: ULTRA_FAST`);
      }
      
      if (simulation._tickCounter >= aggressiveTicksPerUpdate) {
        simulation._tickCounter = 0;
        
        // AGGRESSIVE TIME ADVANCEMENT: Much larger jumps
        const realTimeElapsed = this.baseUpdateInterval;
        const aggressiveTimeAdvancement = realTimeElapsed * speed * 2; // DOUBLE the time advancement
        const previousTime = simulation.currentTime;
        simulation.currentTime += aggressiveTimeAdvancement;
        
        // AGGRESSIVE LOGGING: Time progression tracking
        console.log(`⚡ [AGGRESSIVE TIME] Simulation ${id}:`, {
          advancement: `${aggressiveTimeAdvancement}ms`,
          speed: `${speed}x`,
          candleInterval: `${timeframeConfig.interval}ms`,
          candlesExpected: Math.floor((simulation.currentTime - simulation.startTime) / timeframeConfig.interval),
          actualCandles: simulation.priceHistory.length,
          mode: 'ULTRA_AGGRESSIVE'
        });
        
        if (simulation.currentTime >= simulation.endTime) {
          console.log(`⏰ [AGGRESSIVE COMPLETE] Simulation ${id} reached end time`);
          this.pauseSimulation(id);
          return;
        }
        
        // Process simulation with aggressive parameters
        console.log(`📈 [AGGRESSIVE MARKET] Ultra-fast market update...`);
        this.marketEngine.updatePrice(simulation);
        
        console.log(`👥 [AGGRESSIVE TRADERS] Processing massive trader actions...`);
        this.traderEngine.processTraderActions(simulation);
        
        // Force additional trades if activity is low
        if (simulation.recentTrades.length < 50) {
          console.log(`📊 [AGGRESSIVE BOOST] Low activity detected - forcing additional trades`);
          this.forceAggressiveTradingActivity(simulation, 20);
        }
        
        console.log(`📚 [AGGRESSIVE ORDERBOOK] Updating order book...`);
        this.orderBookManager.updateOrderBook(simulation);
        
        console.log(`💰 [AGGRESSIVE PNL] Updating positions P&L...`);
        this.traderEngine.updatePositionsPnL(simulation);
        
        // AGGRESSIVE: Force initial trading activity if chart is empty
        if (simulation.priceHistory.length === 0) {
          console.log(`🚨 [AGGRESSIVE EMPTY] No candles - forcing massive initial activity`);
          this.forceAggressiveTradingActivity(simulation, 100);
        }
        
        // Broadcast updates with enhanced data
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
        
        // AGGRESSIVE PROGRESS LOGGING
        const progressLog = this.generateAggressiveProgressLog(simulation, speed, timeframe);
        if (progressLog.shouldLog) {
          console.log(`🚀 [AGGRESSIVE PROGRESS] ${progressLog.message}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ [AGGRESSIVE ERROR] Error advancing simulation ${id}:`, error);
      // Don't stop the simulation on error
    }
  }

  // AGGRESSIVE TRADING ACTIVITY GENERATION
  private forceAggressiveTradingActivity(simulation: ExtendedSimulationState, tradeCount: number): void {
    console.log(`🎯 [AGGRESSIVE TRADES] Creating ${tradeCount} ultra-fast trades...`);
    
    for (let i = 0; i < tradeCount; i++) {
      const trader = simulation.traders[Math.floor(Math.random() * simulation.traders.length)];
      const action = Math.random() > 0.5 ? 'buy' : 'sell';
      
      // Create aggressive trade with significant price variation
      const priceVariation = (Math.random() - 0.5) * 0.01; // ±0.5% variation
      const price = simulation.currentPrice * (1 + priceVariation);
      const quantity = 1000 + Math.random() * 4000; // 1000-5000 tokens (larger sizes)
      
      const trade = {
        id: `aggressive-${simulation.currentTime}-${i}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: simulation.currentTime - (i * 100), // Spread trades over last few seconds
        trader: {
          walletAddress: trader.trader.walletAddress,
          preferredName: trader.trader.preferredName || trader.trader.walletAddress,
          netPnl: trader.trader.netPnl || 0
        },
        action,
        price,
        quantity,
        value: price * quantity,
        impact: action === 'buy' ? 0.0002 : -0.0002 // Higher impact
      };
      
      simulation.recentTrades.unshift(trade as Trade);
      
      if (i < 5) {
        console.log(`   ⚡ Aggressive trade ${i + 1}: ${action.toUpperCase()} ${quantity.toFixed(0)} @ $${price.toFixed(6)}`);
      }
    }
    
    // Update current price based on trade momentum
    const recentTrades = simulation.recentTrades.slice(0, 20);
    const buyVolume = recentTrades.filter(t => t.action === 'buy').reduce((sum, t) => sum + t.value, 0);
    const sellVolume = recentTrades.filter(t => t.action === 'sell').reduce((sum, t) => sum + t.value, 0);
    
    if (buyVolume > sellVolume) {
      simulation.currentPrice *= 1.001; // 0.1% increase
    } else if (sellVolume > buyVolume) {
      simulation.currentPrice *= 0.999; // 0.1% decrease
    }
    
    console.log(`✅ [AGGRESSIVE TRADES] Generated ${tradeCount} high-impact trades`);
  }

  // Generate aggressive progress log
  private generateAggressiveProgressLog(simulation: ExtendedSimulationState, speed: number, timeframe: string): {
    shouldLog: boolean;
    message: string;
  } {
    const shouldLog = Math.random() < 0.2 || // 20% chance
                     simulation.priceHistory.length <= 15 || // First 15 candles
                     simulation.priceHistory.length % 10 === 0; // Every 10 candles
    
    if (!shouldLog) {
      return { shouldLog: false, message: '' };
    }
    
    const elapsed = simulation.currentTime - simulation.startTime;
    const elapsedMinutes = elapsed / 60000;
    const candlesExpected = Math.floor(elapsed / this.timeframeManager.getTimeframeConfig(timeframe as Timeframe).interval);
    
    let message = `AGGRESSIVE ${simulation.id}: `;
    message += `Time: ${elapsedMinutes.toFixed(1)}min | `;
    message += `Speed: ${speed}x | `;
    message += `Price: $${simulation.currentPrice.toFixed(6)} | `;
    message += `Candles: ${simulation.priceHistory.length}/${candlesExpected} | `;
    message += `Trades: ${simulation.recentTrades.length} | `;
    message += `Mode: ULTRA_FAST`;
    
    if (simulation.priceHistory.length > 0) {
      const firstCandle = simulation.priceHistory[0];
      const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
      const priceChange = ((lastCandle.close - firstCandle.open) / firstCandle.open * 100);
      message += ` | Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(3)}%`;
    }
    
    return { shouldLog: true, message };
  }

  private getTotalTradesProcessed(simulationId: string): number {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return 0;
    
    return simulation.recentTrades.length + simulation.closedPositions.length * 2;
  }

  // Continue with rest of the methods (pause, reset, etc.) - keeping them similar but with aggressive logging
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
    
    console.log(`⏸️ AGGRESSIVE simulation ${id} paused`);
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
    
    // Reset all simulation state
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
    
    console.log(`🔄 AGGRESSIVE simulation ${id} reset to ultra-fast state`);
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
    
    console.log(`🗑️ AGGRESSIVE simulation ${id} deleted and cleaned up`);
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
    
    console.log('AGGRESSIVE SimulationManager cleanup complete');
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
    
    console.log(`⚡ AGGRESSIVE TPS mode for simulation ${simulationId} set to ${TPSMode[mode]}`);
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
      case TPSMode.NORMAL: return 25;
      case TPSMode.BURST: return 150;
      case TPSMode.STRESS: return 1500;
      case TPSMode.HFT: return 15000;
      default: return 25;
    }
  }
}

export default SimulationManager;