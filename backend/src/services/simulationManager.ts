// backend/src/services/simulationManager.ts - Fixed WebSocket broadcasting
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'worker_threads';
import * as os from 'os';
import {
  SimulationState,
  SimulationParameters,
  SimulationEvent,
  TradeAction,
  PricePoint,
  TraderPosition,
  Trade,
  OrderBookLevel,
  OrderBook,
  Trader,
  TraderProfile
} from '../types';
import duneApi from '../api/duneApi';
import traderService from './traderService';
import { WebSocket } from 'ws';
import { TransactionQueue } from './transactionQueue';
import { BroadcastManager } from './broadcastManager';
import { ObjectPool } from '../utils/objectPool';
import { PerformanceMonitor } from '../monitoring/performanceMonitor';

class SimulationManager {
  private simulations: Map<string, SimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private simulationSpeeds: Map<string, number> = new Map();
  private clients: Set<WebSocket> = new Set();
  private baseUpdateInterval: number = 1000; // 1 second base interval
  private highFrequencyMode: boolean = false;
  private batchedUpdates: any[] = [];
  private lastBatchTime: number = 0;
  
  // Performance optimization additions
  private workerPool: Worker[] = [];
  private transactionQueue: TransactionQueue;
  private broadcastManager: BroadcastManager;
  private traderIndex: Map<string, Map<string, TraderProfile>> = new Map();
  private activePositionsIndex: Map<string, Map<string, TraderPosition>> = new Map();
  private performanceMonitor: PerformanceMonitor;
  
  // Object pools for memory efficiency
  private tradePool: ObjectPool<Trade>;
  private positionPool: ObjectPool<TraderPosition>;
  
  constructor() {
    // Initialize performance optimizations
    this.initializeWorkerPool();
    this.initializeObjectPools();
    this.performanceMonitor = new PerformanceMonitor();
    this.performanceMonitor.startMonitoring();
  }
  
  private initializeWorkerPool() {
    const numWorkers = Math.min(os.cpus().length, 8); // Cap at 8 workers
    console.log(`Initializing ${numWorkers} worker threads for parallel processing`);
    
    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = new Worker(`${__dirname}/../workers/traderWorker.js`);
        this.workerPool.push(worker);
      } catch (error) {
        console.warn(`Failed to create worker ${i}, continuing without it:`, error);
      }
    }
  }
  
  private initializeObjectPools() {
    // Trade object pool
    this.tradePool = new ObjectPool<Trade>(
      () => ({
        id: '',
        timestamp: 0,
        trader: {} as Trader,
        action: 'buy',
        price: 0,
        quantity: 0,
        value: 0,
        impact: 0
      }),
      (trade) => {
        trade.id = '';
        trade.timestamp = 0;
        trade.trader = {} as Trader;
        trade.action = 'buy';
        trade.price = 0;
        trade.quantity = 0;
        trade.value = 0;
        trade.impact = 0;
      },
      5000
    );
    
    // Position object pool
    this.positionPool = new ObjectPool<TraderPosition>(
      () => ({
        trader: {} as Trader,
        entryPrice: 0,
        quantity: 0,
        entryTime: 0,
        currentPnl: 0,
        currentPnlPercentage: 0
      }),
      (position) => {
        position.trader = {} as Trader;
        position.entryPrice = 0;
        position.quantity = 0;
        position.entryTime = 0;
        position.currentPnl = 0;
        position.currentPnlPercentage = 0;
      },
      2000
    );
  }
  
  setBroadcastManager(broadcastManager: BroadcastManager) {
    this.broadcastManager = broadcastManager;
  }
  
  setTransactionQueue(transactionQueue: TransactionQueue) {
    this.transactionQueue = transactionQueue;
  }
  
  registerClient(client: WebSocket) {
    this.clients.add(client);
    
    client.on('close', () => {
      this.clients.delete(client);
    });
  }
  
  broadcastEvent(simulationId: string, event: SimulationEvent) {
    const simulation = this.simulations.get(simulationId);
    
    // Don't broadcast price updates if simulation is paused
    if (simulation?.isPaused && event.type === 'price_update') {
      return;
    }
    
    // Use the new broadcast manager if available
    if (this.broadcastManager) {
      this.broadcastManager.queueUpdate(simulationId, event);
    } else {
      // Direct broadcast fallback - THIS IS THE KEY FIX
      const message = JSON.stringify({
        simulationId,
        event
      });
      
      // Broadcast to all connected clients
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(message);
          } catch (error) {
            console.error('Error sending to client:', error);
          }
        }
      });
    }
  }
  
  // Add method for ultra-fast simulation mode
  enableHighFrequencyMode(simulationId: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return;
    
    this.highFrequencyMode = true;
    console.log('High-frequency trading mode enabled');
    
    // Adjust market parameters for HFT
    simulation.marketConditions.volatility *= 1.5; // Increase volatility
    simulation.marketConditions.volume *= 2; // Double the volume
    
    this.simulations.set(simulationId, simulation);
  }
  
  // Add method to handle ludicrous speed (100x)
  enableLudicrousMode(simulationId: string): void {
    this.enableHighFrequencyMode(simulationId);
    this.setSimulationSpeed(simulationId, 100);
    
    console.log('🚀 LUDICROUS MODE ACTIVATED - 100x SPEED');
  }
  
  // Optimized trader lookup using index
  private getTraderByWallet(simulationId: string, walletAddress: string): TraderProfile | undefined {
    return this.traderIndex.get(simulationId)?.get(walletAddress);
  }
  
  private buildTraderIndex(simulationId: string, traders: TraderProfile[]) {
    const index = new Map<string, TraderProfile>();
    traders.forEach(trader => {
      index.set(trader.trader.walletAddress, trader);
    });
    this.traderIndex.set(simulationId, index);
  }
  
  async createSimulation(parameters: Partial<SimulationParameters> = {}): Promise<SimulationState> {
    try {
      // Fetch trader data
      console.log('Fetching trader data from Dune API...');
      
      // First try to get data using the new getPumpFunTraders method
      const traders = await duneApi.getPumpFunTraders();
      
      if (traders && traders.length > 0) {
        console.log(`Retrieved ${traders.length} traders from Dune API`);
        
        // Convert the trader data format to match what's expected by trader service
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
          riskProfile: this.determineRiskProfile(t),
          portfolioEfficiency: t.net_pnl / (t.total_volume || 1)
        }));
        
        const traderProfiles = traderService.generateTraderProfiles(convertedTraders);
        
        return this.finalizeSimulationCreation(parameters, convertedTraders, traderProfiles);
      }
      
      // Fallback to legacy method if getPumpFunTraders returns empty
      const rawData = await duneApi.getTraderData();
      
      if (!rawData || !rawData.result || !Array.isArray(rawData.result.rows)) {
        console.error('Invalid data format from Dune API:', rawData);
        // If no data, create some dummy traders for testing
        return this.createSimulationWithDummyTraders(parameters);
      }
      
      console.log('Trader data received, rows:', rawData.result.rows.length);
      const legacyTraders = traderService.transformRawTraders(rawData.result.rows);
      const legacyTraderProfiles = traderService.generateTraderProfiles(legacyTraders);
      
      return this.finalizeSimulationCreation(parameters, legacyTraders, legacyTraderProfiles);
    } catch (error) {
      console.error('Error creating simulation:', error);
      // Create simulation with dummy data on error
      return this.createSimulationWithDummyTraders(parameters);
    }
  }
  
  // Helper method to create dummy traders when API fails
  private createSimulationWithDummyTraders(parameters: Partial<SimulationParameters> = {}): Promise<SimulationState> {
    console.log('Creating simulation with dummy traders');
    const dummyTraders = Array.from({ length: 10 }, (_, i) => ({
      position: i + 1,
      walletAddress: `Trader${i+1}`,
      netPnl: Math.random() * 10000 - 5000, // Reduced from 100000
      totalVolume: 10000 + Math.random() * 90000, // Reduced from 900000
      buyVolume: 5000 + Math.random() * 45000,
      sellVolume: 5000 + Math.random() * 45000,
      tradeCount: 10 + Math.floor(Math.random() * 90),
      feesUsd: 50 + Math.random() * 450, // Reduced from 4500
      winRate: 0.4 + Math.random() * 0.3,
      riskProfile: ['conservative', 'moderate', 'aggressive'][Math.floor(Math.random() * 3)] as 'conservative' | 'moderate' | 'aggressive',
      portfolioEfficiency: (Math.random() * 0.2) - 0.1
    }));
    
    const traderProfiles = traderService.generateTraderProfiles(dummyTraders);
    
    return Promise.resolve(this.finalizeSimulationCreation(parameters, dummyTraders, traderProfiles));
  }
  
  // Helper function to determine trader risk profile based on data from Dune
  private determineRiskProfile(trader: any): 'conservative' | 'moderate' | 'aggressive' {
    const buyToSellRatio = trader.buy_volume / (trader.sell_volume || 1);
    const avgTradeSize = trader.avg_trade_size || 0;
    const winRate = trader.win_rate || 0.5;
    
    // Build a simple risk score
    let riskScore = 0;
    
    // More balanced buy/sell ratio = more conservative
    if (buyToSellRatio > 0.8 && buyToSellRatio < 1.2) {
      riskScore += 1;
    } else if (buyToSellRatio > 0.5 && buyToSellRatio < 1.5) {
      riskScore += 2;
    } else {
      riskScore += 3;
    }
    
    // Higher average trade size = more aggressive
    if (avgTradeSize > 10000) {
      riskScore += 3;
    } else if (avgTradeSize > 5000) {
      riskScore += 2;
    } else {
      riskScore += 1;
    }
    
    // Lower win rate could indicate more aggressive trading
    if (winRate < 0.45) {
      riskScore += 3;
    } else if (winRate < 0.55) {
      riskScore += 2;
    } else {
      riskScore += 1;
    }
    
    // Categorize based on total score
    if (riskScore <= 4) return 'conservative';
    if (riskScore <= 7) return 'moderate';
    return 'aggressive';
  }
  
  // Helper method to create the simulation object with realistic token data
  private finalizeSimulationCreation(
    parameters: Partial<SimulationParameters>,
    traders: Trader[],
    traderProfiles: TraderProfile[]
  ): SimulationState {
    // Create default parameters with realistic token price
    const defaultParams: SimulationParameters = {
      timeCompressionFactor: 1, // Default to 1x (base speed)
      initialPrice: 125.00, // $125.00 per token - more engaging for simulation
      initialLiquidity: 50000000, // $50M liquidity
      volatilityFactor: 1.0,
      duration: 60 * 24, // 1 day in minutes
      scenarioType: 'standard'
    };
    
    // Merge default with provided parameters
    const finalParams = { ...defaultParams, ...parameters };
    
    // Generate a unique ID for the simulation
    const id = uuidv4();
    
    // Track the speed
    this.simulationSpeeds.set(id, finalParams.timeCompressionFactor);
    
    // Create the initial simulation state
    const now = Date.now();
    
    // Create realistic initial price history (250 candles of 15 minutes each)
    const initialPriceHistory: PricePoint[] = [];
    const candleInterval = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    // Initialize price tracking variables
    let currentPrice = finalParams.initialPrice;
    let trend = 0;
    let trendMomentum = 0;
    
    for (let i = 0; i < 250; i++) {
      const timestamp = now - (250 - i) * candleInterval;
      
      // Update trend with momentum (creates more realistic price movement)
      trendMomentum += (Math.random() - 0.5) * 0.0002; // Very small momentum changes
      trendMomentum = Math.max(-0.001, Math.min(0.001, trendMomentum)); // Cap momentum
      trend += trendMomentum;
      trend = Math.max(-0.02, Math.min(0.02, trend)); // Cap total trend to ±2%
      
      // Calculate open price (close of previous candle or initial price)
      const open = currentPrice;
      
      // Generate realistic intracandle movement
      const volatility = 0.0015 * finalParams.volatilityFactor; // 0.15% base volatility
      const candleRange = open * volatility;
      
      // Generate close price with trend bias
      const trendBias = trend * 0.5; // Apply 50% of trend to close
      const randomWalk = (Math.random() - 0.5) * candleRange;
      const close = open * (1 + trendBias + randomWalk);
      
      // Generate high and low with realistic constraints
      // High and low should contain open and close
      const minPrice = Math.min(open, close);
      const maxPrice = Math.max(open, close);
      
      // Add realistic wicks (between 0.05% and 0.3% beyond the body)
      const upperWick = maxPrice * (0.0005 + Math.random() * 0.0025);
      const lowerWick = minPrice * (0.0005 + Math.random() * 0.0025);
      
      const high = maxPrice + upperWick;
      const low = minPrice - lowerWick;
      
      // Generate realistic volume (varies with price movement)
      const priceMovement = Math.abs(close - open) / open;
      const baseVolume = 1000; // Base volume in tokens
      const volumeMultiplier = 1 + (priceMovement * 50); // More movement = more volume
      const volume = baseVolume * volumeMultiplier * (0.5 + Math.random());
      
      initialPriceHistory.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume
      });
      
      // Update current price for next candle
      currentPrice = close;
    }
    
    const simulation: SimulationState = {
      id,
      startTime: now,
      currentTime: now,
      endTime: now + (finalParams.duration * 60 * 1000),
      isRunning: false,
      isPaused: false,
      parameters: finalParams,
      marketConditions: {
        volatility: 0.02 * finalParams.volatilityFactor,
        trend: 'sideways',
        volume: finalParams.initialLiquidity * 0.1
      },
      priceHistory: initialPriceHistory,
      currentPrice: currentPrice, // Use the last close price
      orderBook: {
        bids: this.generateInitialOrderBook('bids', currentPrice, finalParams.initialLiquidity),
        asks: this.generateInitialOrderBook('asks', currentPrice, finalParams.initialLiquidity),
        lastUpdateTime: now
      },
      traders: traderProfiles,
      activePositions: [],
      closedPositions: [],
      recentTrades: [],
      traderRankings: traders.sort((a, b) => b.netPnl - a.netPnl)
    };
    
    // Build trader index for fast lookups
    this.buildTraderIndex(id, traderProfiles);
    
    // Generate some initial positions and trades for realistic data display
    this.generateInitialPositionsAndTrades(simulation);
    
    // Store the simulation
    this.simulations.set(id, simulation);
    
    console.log(`Simulation ${id} created with ${traders.length} traders`);
    console.log(`Initial price: $${currentPrice.toFixed(2)}`);
    
    return simulation;
  }
  
  // Generate initial positions and trades for more realistic data
  private generateInitialPositionsAndTrades(simulation: SimulationState): void {
    const { traders, currentPrice } = simulation;
    const now = simulation.currentTime;
    
    // Create initial trades and positions for some traders
    const activeTraderCount = Math.min(20, Math.floor(traders.length * 0.3)); // 30% of traders are active
    
    // Shuffle traders array to pick random traders
    const shuffledTraders = [...traders].sort(() => 0.5 - Math.random());
    const activeTraders = shuffledTraders.slice(0, activeTraderCount);
    
    // Generate trades and positions
    activeTraders.forEach((trader, index) => {
      // Determine if long or short position
      const isLong = Math.random() > 0.4; // 60% long bias
      
      // Calculate realistic position size based on token price
      const basePositionValue = 10000 + Math.random() * 90000; // $10K to $100K position
      const quantity = basePositionValue / currentPrice;
      
      // Apply direction
      const positionQuantity = isLong ? quantity : -quantity;
      
      // Create synthetic entry price with slight variation
      const entryPriceVariation = (Math.random() - 0.5) * 0.01; // ±0.5% variation
      const entryPrice = currentPrice * (1 + entryPriceVariation);
      
      // Calculate current P&L
      const entryValue = Math.abs(positionQuantity) * entryPrice;
      const currentValue = Math.abs(positionQuantity) * currentPrice;
      const pnl = isLong ? 
        currentValue - entryValue :
        entryValue - currentValue;
      const pnlPercentage = pnl / entryValue;
      
      // Create position using object pool
      const position = this.positionPool.acquire();
      position.trader = trader.trader;
      position.entryPrice = entryPrice;
      position.quantity = positionQuantity;
      position.entryTime = now - (Math.random() * 3600000); // Entered 0-60 minutes ago
      position.currentPnl = pnl;
      position.currentPnlPercentage = pnlPercentage;
      
      // Add to active positions
      simulation.activePositions.push(position);
      
      // Create a corresponding trade record using object pool
      const trade = this.tradePool.acquire();
      trade.id = uuidv4();
      trade.timestamp = position.entryTime;
      trade.trader = trader.trader;
      trade.action = isLong ? 'buy' : 'sell';
      trade.price = entryPrice;
      trade.quantity = Math.abs(positionQuantity);
      trade.value = entryPrice * Math.abs(positionQuantity);
      trade.impact = 0.0001 * (entryPrice * Math.abs(positionQuantity)) / simulation.marketConditions.volume;
      
      // Add to recent trades (at the beginning for most recent)
      simulation.recentTrades.unshift(trade);
      
      // Generate some closed positions/trades for history
      if (index % 3 === 0) { // Only for every 3rd trader to avoid clutter
        // Create a closed position from earlier
        const closedEntryTime = now - (Math.random() * 7200000 + 3600000); // 1-3 hours ago
        const closedExitTime = closedEntryTime + (Math.random() * 3600000); // 0-60 min after entry
        
        // Create price points with some movement
        const closedEntryPrice = currentPrice * (1 + (Math.random() - 0.5) * 0.05); // ±2.5% from current
        const closedExitPrice = closedEntryPrice * (1 + (Math.random() - 0.5) * 0.03); // ±1.5% from entry
        
        // Calculate position size (smaller for historic trades)
        const closedPositionValue = 5000 + Math.random() * 45000; // $5K to $50K position
        const closedQuantity = closedPositionValue / closedEntryPrice;
        
        // Long or short position
        const closedIsLong = Math.random() > 0.4;
        const closedPositionQty = closedIsLong ? closedQuantity : -closedQuantity;
        
        // Calculate PnL
        const closedEntryValue = Math.abs(closedPositionQty) * closedEntryPrice;
        const closedExitValue = Math.abs(closedPositionQty) * closedExitPrice;
        const closedPnl = closedIsLong ?
          closedExitValue - closedEntryValue :
          closedEntryValue - closedExitValue;
        const closedPnlPercentage = closedPnl / closedEntryValue;
        
        // Create closed position
        const closedPosition: TraderPosition & { exitPrice: number, exitTime: number } = {
          trader: trader.trader,
          entryPrice: closedEntryPrice,
          quantity: closedPositionQty,
          entryTime: closedEntryTime,
          exitPrice: closedExitPrice,
          exitTime: closedExitTime,
          currentPnl: closedPnl,
          currentPnlPercentage: closedPnlPercentage
        };
        
        // Add to closed positions
        simulation.closedPositions.push(closedPosition);
        
        // Create corresponding entry and exit trades
        const entryTrade = this.tradePool.acquire();
        entryTrade.id = uuidv4();
        entryTrade.timestamp = closedEntryTime;
        entryTrade.trader = trader.trader;
        entryTrade.action = closedIsLong ? 'buy' : 'sell';
        entryTrade.price = closedEntryPrice;
        entryTrade.quantity = Math.abs(closedPositionQty);
        entryTrade.value = closedEntryPrice * Math.abs(closedPositionQty);
        entryTrade.impact = 0.0001 * (closedEntryPrice * Math.abs(closedPositionQty)) / simulation.marketConditions.volume;
        
        const exitTrade = this.tradePool.acquire();
        exitTrade.id = uuidv4();
        exitTrade.timestamp = closedExitTime;
        exitTrade.trader = trader.trader;
        exitTrade.action = closedIsLong ? 'sell' : 'buy';
        exitTrade.price = closedExitPrice;
        exitTrade.quantity = Math.abs(closedPositionQty);
        exitTrade.value = closedExitPrice * Math.abs(closedPositionQty);
        exitTrade.impact = 0.0001 * (closedExitPrice * Math.abs(closedPositionQty)) / simulation.marketConditions.volume;
        
        // Add trades (with correct chronological ordering)
        if (simulation.recentTrades.length < 50) {
          // Find correct positions for insertion based on timestamp
          let entryIndex = simulation.recentTrades.findIndex((t: Trade) => t.timestamp < closedEntryTime);
          entryIndex = entryIndex === -1 ? simulation.recentTrades.length : entryIndex;
          
          let exitIndex = simulation.recentTrades.findIndex((t: Trade) => t.timestamp < closedExitTime);
          exitIndex = exitIndex === -1 ? simulation.recentTrades.length : exitIndex;
          
          // Insert trades at correct positions
          simulation.recentTrades.splice(entryIndex, 0, entryTrade);
          simulation.recentTrades.splice(exitIndex, 0, exitTrade);
        }
        
        // Update trader PnL
        const traderIndex = traders.findIndex((t: TraderProfile) => t.trader.walletAddress === trader.trader.walletAddress);
        if (traderIndex !== -1) {
          traders[traderIndex].trader.netPnl = (traders[traderIndex].trader.netPnl || 0) + closedPnl;
        }
      }
    });
    
    // Update trader rankings based on PnL
    this.updateTraderRankings(simulation);
    
    // Limit recent trades to last 100
    if (simulation.recentTrades.length > 100) {
      simulation.recentTrades = simulation.recentTrades.slice(0, 100);
    }
  }
  
  private generateInitialOrderBook(
    side: 'bids' | 'asks', 
    basePrice: number, 
    liquidity: number
  ): OrderBookLevel[] {
    const levels: OrderBookLevel[] = [];
    const count = 20; // Number of levels
    
    // Spread percentage from base price (smaller for a higher-priced token)
    const spreadPercentage = 0.0005; // 0.05% per level for higher priced token
    
    // Distribution of volume (higher near the mid price)
    const totalQuantity = liquidity * 0.2; // 20% of liquidity in the order book
    
    for (let i = 0; i < count; i++) {
      const distanceFromMid = (i + 1) * spreadPercentage;
      const price = side === 'bids' 
        ? basePrice * (1 - distanceFromMid)
        : basePrice * (1 + distanceFromMid);
      
      // Volume decreases as we move away from mid price
      // For high-priced token, quantities should be lower
      const volumeFactor = Math.exp(-i / 5);
      // Lower quantity for a high-priced token
      const quantity = (totalQuantity / count) * volumeFactor / price;
      
      levels.push({
        price,
        quantity
      });
    }
    
    return levels;
  }
  
  getSimulation(id: string): SimulationState | undefined {
    return this.simulations.get(id);
  }
  
  getAllSimulations(): SimulationState[] {
    return Array.from(this.simulations.values());
  }
  
  // Enhanced setSimulationSpeed to support ultra-fast speeds
  setSimulationSpeed(id: string, speed: number): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    // Allow speeds from 1x to 100x for HFT mode
    const maxSpeed = this.highFrequencyMode ? 100 : 10;
    const validSpeed = Math.max(1, Math.min(maxSpeed, speed));
    
    // Store the new speed
    this.simulationSpeeds.set(id, validSpeed);
    
    // Update the simulation parameters
    simulation.parameters.timeCompressionFactor = validSpeed;
    
    // If the simulation is running, restart it with the new speed
    if (simulation.isRunning && !simulation.isPaused) {
      // Clear the existing interval
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
      }
      
      // Calculate the new interval based on speed
      let updateInterval: number;
      
      if (validSpeed <= 10) {
        // Normal mode: 1000ms / speed
        updateInterval = Math.floor(this.baseUpdateInterval / validSpeed);
      } else if (validSpeed <= 50) {
        // Fast mode: 50ms minimum interval
        updateInterval = Math.max(50, Math.floor(1000 / validSpeed));
      } else {
        // Ultra-fast mode: 10ms minimum interval
        updateInterval = Math.max(10, Math.floor(1000 / validSpeed));
      }
      
      // Set up a new interval with the updated speed
      const newInterval = setInterval(() => {
        if (validSpeed > 50) {
          // Batch updates for ultra-high speeds
          this.advanceSimulationBatched(id);
        } else {
          this.advanceSimulation(id);
        }
      }, updateInterval);
      
      this.simulationIntervals.set(id, newInterval);
    }
    
    console.log(`Simulation ${id} speed set to ${validSpeed}x (interval: ${Math.floor(1000 / validSpeed)}ms)`);
  }
  
  // Fixed for proper pausing functionality
  startSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (simulation.isRunning && !simulation.isPaused) {
      throw new Error(`Simulation ${id} is already running`);
    }
    
    // Update simulation state
    simulation.isRunning = true;
    simulation.isPaused = false;
    this.simulations.set(id, simulation);
    
    // Get current speed for this simulation
    const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
    
    // Calculate the interval based on speed
    let updateInterval: number;
    
    if (speed <= 10) {
      // Normal mode: 1000ms / speed
      updateInterval = Math.floor(this.baseUpdateInterval / speed);
    } else if (speed <= 50) {
      // Fast mode: 50ms minimum interval
      updateInterval = Math.max(50, Math.floor(1000 / speed));
    } else {
      // Ultra-fast mode: 10ms minimum interval
      updateInterval = Math.max(10, Math.floor(1000 / speed));
    }
    
    console.log(`Starting simulation ${id} with speed ${speed}x (interval ${updateInterval}ms)`);
    console.log(`Resuming from price: $${simulation.currentPrice.toFixed(2)}`);
    
    // Set up the simulation interval
    const interval = setInterval(() => {
      if (speed > 50) {
        // Batch updates for ultra-high speeds
        this.advanceSimulationBatched(id);
      } else if (speed > 10 && this.workerPool.length > 0) {
        // Use parallel processing for high speeds
        this.advanceSimulationParallel(id);
      } else {
        this.advanceSimulation(id);
      }
    }, updateInterval);
    
    this.simulationIntervals.set(id, interval);
    
    // Immediately send a notification of the current state to clients
    this.broadcastEvent(id, {
      type: 'simulation_status',
      timestamp: Date.now(),
      data: {
        isRunning: true,
        isPaused: false,
        speed: speed,
        currentPrice: simulation.currentPrice
      }
    });
  }
  
  pauseSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (!simulation.isRunning || simulation.isPaused) {
      throw new Error(`Simulation ${id} is not running or already paused`);
    }
    
    // Store the current price before pausing
    const lastPrice = simulation.currentPrice;
    
    // Update simulation state
    simulation.isPaused = true;
    this.simulations.set(id, simulation);
    
    // Clear the interval
    const interval = this.simulationIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.simulationIntervals.delete(id);
    }
    
    // Broadcast the pause status to ensure UI updates
    this.broadcastEvent(id, {
      type: 'simulation_status',
      timestamp: Date.now(),
      data: {
        isRunning: simulation.isRunning,
        isPaused: true,
        speed: this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor,
        lastPrice: lastPrice // Include the last price before pause
      }
    });
    
    console.log(`Simulation ${id} paused at price: $${lastPrice.toFixed(2)}`);
  }
  
  resetSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    // Stop the simulation if it's running
    if (simulation.isRunning) {
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
      }
    }
    
    // Reset the simulation to its initial state
    const now = Date.now();
    const params = simulation.parameters;
    
    // Create realistic initial price history (250 candles of 15 minutes each)
    const initialPriceHistory: PricePoint[] = [];
    const candleInterval = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    // Initialize price tracking variables
    let currentPrice = params.initialPrice;
    let trend = 0;
    let trendMomentum = 0;
    
    for (let i = 0; i < 250; i++) {
      const timestamp = now - (250 - i) * candleInterval;
      
      // Update trend with momentum (creates more realistic price movement)
      trendMomentum += (Math.random() - 0.5) * 0.0002; // Very small momentum changes
      trendMomentum = Math.max(-0.001, Math.min(0.001, trendMomentum)); // Cap momentum
      trend += trendMomentum;
      trend = Math.max(-0.02, Math.min(0.02, trend)); // Cap total trend to ±2%
      
      // Calculate open price (close of previous candle or initial price)
      const open = currentPrice;
      
      // Generate realistic intracandle movement
      const volatility = 0.0015 * params.volatilityFactor; // 0.15% base volatility
      const candleRange = open * volatility;
      
      // Generate close price with trend bias
      const trendBias = trend * 0.5; // Apply 50% of trend to close
      const randomWalk = (Math.random() - 0.5) * candleRange;
      const close = open * (1 + trendBias + randomWalk);
      
      // Generate high and low with realistic constraints
      // High and low should contain open and close
      const minPrice = Math.min(open, close);
      const maxPrice = Math.max(open, close);
      
      // Add realistic wicks (between 0.05% and 0.3% beyond the body)
      const upperWick = maxPrice * (0.0005 + Math.random() * 0.0025);
      const lowerWick = minPrice * (0.0005 + Math.random() * 0.0025);
      
      const high = maxPrice + upperWick;
      const low = minPrice - lowerWick;
      
      // Generate realistic volume (varies with price movement)
      const priceMovement = Math.abs(close - open) / open;
      const baseVolume = 1000; // Base volume in tokens
      const volumeMultiplier = 1 + (priceMovement * 50); // More movement = more volume
      const volume = baseVolume * volumeMultiplier * (0.5 + Math.random());
      
      initialPriceHistory.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume
      });
      
      // Update current price for next candle
      currentPrice = close;
    }
    
    // Clear any active positions from object pool
    simulation.activePositions.forEach(position => {
      this.positionPool.release(position);
    });
    
    // Clear recent trades from object pool
    simulation.recentTrades.forEach(trade => {
      this.tradePool.release(trade);
    });
    
    simulation.startTime = now;
    simulation.currentTime = now;
    simulation.endTime = now + (params.duration * 60 * 1000);
    simulation.isRunning = false;
    simulation.isPaused = false;
    simulation.priceHistory = initialPriceHistory;
    simulation.currentPrice = currentPrice; // Use the last close price
    simulation.orderBook = {
      bids: this.generateInitialOrderBook('bids', currentPrice, params.initialLiquidity),
      asks: this.generateInitialOrderBook('asks', currentPrice, params.initialLiquidity),
      lastUpdateTime: now
    };
    simulation.activePositions = [];
    simulation.closedPositions = [];
    simulation.recentTrades = [];
    
    // Generate new initial positions and trades
    this.generateInitialPositionsAndTrades(simulation);
    
    this.simulations.set(id, simulation);
    
    // Broadcast the reset status
    this.broadcastEvent(id, {
      type: 'simulation_reset',
      timestamp: now,
      data: simulation
    });
    
    console.log(`Simulation ${id} reset`);
  }
  
  // New parallel processing method for high-speed simulations
  private async advanceSimulationParallel(id: string): Promise<void> {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    const startTime = performance.now();
    
    // Get current speed
    const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
    
    // For 15min chart, each time step should advance by 1 minute * speed factor
    const timeStep = 60 * 1000 * speed;
    simulation.currentTime += timeStep;
    
    // Check if simulation has reached its end
    if (simulation.currentTime >= simulation.endTime) {
      this.pauseSimulation(id);
      return;
    }
    
    // Update the price
    this.updatePrice(simulation);
    
    // Process traders in parallel using worker pool
    if (this.workerPool.length > 0) {
      await this.processTraderActionsParallel(simulation);
    } else {
      // Fallback to sequential processing
      this.processTraderActions(simulation);
    }
    
    // Update the order book
    this.updateOrderBook(simulation);
    
    // Only broadcast price updates if not paused
    if (!simulation.isPaused) {
      this.broadcastEvent(id, {
        type: 'price_update',
        timestamp: simulation.currentTime,
        data: {
          price: simulation.currentPrice,
          orderBook: simulation.orderBook,
          priceHistory: simulation.priceHistory
        }
      });
    }
    
    // Track performance
    const elapsed = performance.now() - startTime;
    this.performanceMonitor.recordSimulationTick(elapsed);
    
    // Save the updated simulation state
    this.simulations.set(id, simulation);
  }
  
  // New method for parallel trader processing
  private async processTraderActionsParallel(simulation: SimulationState): Promise<void> {
    const traders = simulation.traders;
    const batchSize = Math.ceil(traders.length / this.workerPool.length);
    
    // Create batches for each worker
    const batches: TraderProfile[][] = [];
    for (let i = 0; i < traders.length; i += batchSize) {
      batches.push(traders.slice(i, i + batchSize));
    }
    
    // Process batches in parallel
    const promises = batches.map((batch, index) => {
      if (index < this.workerPool.length) {
        return this.processTraderBatch(batch, simulation, this.workerPool[index]);
      }
      return Promise.resolve([]);
    });
    
    const results = await Promise.all(promises);
    const allDecisions = results.flat();
    
    // Apply decisions to simulation
    allDecisions.forEach((decision: any) => {
      if (decision.action === 'enter') {
        this.executeTraderEntry(simulation, decision);
      } else if (decision.action === 'exit') {
        this.executeTraderExit(simulation, decision);
      }
    });
  }
  
  // Process trader batch using worker
  private processTraderBatch(
    traders: TraderProfile[],
    simulation: SimulationState,
    worker: Worker
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const messageHandler = (result: any) => {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);
        resolve(result);
      };
      
      const errorHandler = (error: Error) => {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);
        console.error('Worker error:', error);
        resolve([]); // Return empty array on error
      };
      
      worker.on('message', messageHandler);
      worker.on('error', errorHandler);
      
      // Send work to worker
      worker.postMessage({
        traders: traders.map(t => ({
          ...t,
          trader: {
            walletAddress: t.trader.walletAddress,
            netPnl: t.trader.netPnl,
            riskProfile: t.trader.riskProfile
          }
        })),
        marketData: {
          currentPrice: simulation.currentPrice,
          priceHistory: simulation.priceHistory.slice(-10),
          marketConditions: simulation.marketConditions,
          currentTime: simulation.currentTime
        },
        activePositions: simulation.activePositions
          .filter(p => traders.some(t => t.trader.walletAddress === p.trader.walletAddress))
          .map(p => ({
            walletAddress: p.trader.walletAddress,
            entryPrice: p.entryPrice,
            quantity: p.quantity,
            entryTime: p.entryTime
          }))
      });
    });
  }
  
  // Execute trader entry decision
  private executeTraderEntry(simulation: SimulationState, decision: any): void {
    const traderProfile = this.getTraderByWallet(simulation.id, decision.walletAddress);
    if (!traderProfile) return;
    
    const position = this.positionPool.acquire();
    position.trader = traderProfile.trader;
    position.entryPrice = simulation.currentPrice;
    position.quantity = decision.quantity;
    position.entryTime = simulation.currentTime;
    position.currentPnl = 0;
    position.currentPnlPercentage = 0;
    
    simulation.activePositions.push(position);
    
    const trade = this.tradePool.acquire();
    trade.id = uuidv4();
    trade.timestamp = simulation.currentTime;
    trade.trader = traderProfile.trader;
    trade.action = decision.quantity > 0 ? 'buy' : 'sell';
    trade.price = simulation.currentPrice;
    trade.quantity = Math.abs(decision.quantity);
    trade.value = simulation.currentPrice * Math.abs(decision.quantity);
    trade.impact = 0.0001 * trade.value / simulation.marketConditions.volume;
    
    simulation.recentTrades.unshift(trade);
    if (simulation.recentTrades.length > 100) {
      const removed = simulation.recentTrades.pop();
      if (removed) this.tradePool.release(removed);
    }
    
    // Queue for async processing if transaction queue is available
    if (this.transactionQueue) {
      this.transactionQueue.addTrade(trade);
    }
    
    this.broadcastEvent(simulation.id, {
      type: 'trade',
      timestamp: simulation.currentTime,
      data: trade
    });
  }
  
  // Execute trader exit decision
  private executeTraderExit(simulation: SimulationState, decision: any): void {
    const position = simulation.activePositions.find(
      p => p.trader.walletAddress === decision.walletAddress
    );
    if (!position) return;
    
    this.closePosition(simulation, position);
  }
  
  private advanceSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    // Get current speed
    const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
    
    // For 15min chart, each time step should advance by 1 minute * speed factor
    // This ensures a new candle every 15 updates at 1x speed
    const timeStep = 60 * 1000 * speed; // 60 seconds * 1000ms * speed factor
    simulation.currentTime += timeStep;
    
    // Check if simulation has reached its end
    if (simulation.currentTime >= simulation.endTime) {
      this.pauseSimulation(id);
      return;
    }
    
    // Update the price (but don't change it if paused)
    this.updatePrice(simulation);
    
    // Process trader actions
    this.processTraderActions(simulation);
    
    // Update the order book
    this.updateOrderBook(simulation);
    
    // Update active positions PnL
    this.updatePositionsPnL(simulation);
    
    // Only broadcast price updates if not paused
    if (!simulation.isPaused) {
      this.broadcastEvent(id, {
        type: 'price_update',
        timestamp: simulation.currentTime,
        data: {
          price: simulation.currentPrice,
          orderBook: simulation.orderBook,
          priceHistory: simulation.priceHistory,
          activePositions: simulation.activePositions,
          recentTrades: simulation.recentTrades.slice(0, 50), // Send last 50 trades
          traderRankings: simulation.traderRankings.slice(0, 20) // Top 20 traders
        }
      });
    }
    
    // Save the updated simulation state
    this.simulations.set(id, simulation);
  }
  
  // New method to update position PnL values
  private updatePositionsPnL(simulation: SimulationState): void {
    const { currentPrice } = simulation;
    
    simulation.activePositions.forEach(position => {
      const isLong = position.quantity > 0;
      const entryValue = Math.abs(position.quantity) * position.entryPrice;
      const currentValue = Math.abs(position.quantity) * currentPrice;
      
      position.currentPnl = isLong ? 
        currentValue - entryValue :
        entryValue - currentValue;
      position.currentPnlPercentage = position.currentPnl / entryValue;
    });
  }
  
  // New batched simulation advancement for ultra-high speeds
  private advanceSimulationBatched(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    const now = performance.now();
    const timeSinceLastBatch = now - this.lastBatchTime;
    
    // Batch multiple updates together
    if (timeSinceLastBatch < 16) { // 60 FPS limit
      // Queue the update
      this.batchedUpdates.push({ id, time: now });
      return;
    }
    
    // Process all batched updates
    const speed = this.simulationSpeeds.get(id) || simulation.parameters.timeCompressionFactor;
    const updates = Math.max(1, Math.floor(timeSinceLastBatch / 10)); // Process multiple time steps
    
    for (let i = 0; i < updates; i++) {
      const timeStep = 60 * 1000 * speed / updates; // Distribute time steps
      simulation.currentTime += timeStep;
      
      if (simulation.currentTime >= simulation.endTime) {
        this.pauseSimulation(id);
        return;
      }
      
      // Update price with reduced volatility for stability at high speeds
      const volatilityFactor = Math.max(0.1, 1 / Math.sqrt(speed));
      this.updatePriceHighFrequency(simulation, volatilityFactor);
    }
    
    // Process trader actions in batch
    this.processTraderActionsBatch(simulation, updates);
    
    // Update order book once per batch
    this.updateOrderBook(simulation);
    
    // Update positions PnL
    this.updatePositionsPnL(simulation);
    
    // Broadcast consolidated update
    this.broadcastEvent(id, {
      type: 'price_update',
      timestamp: simulation.currentTime,
      data: {
        price: simulation.currentPrice,
        orderBook: simulation.orderBook,
        priceHistory: simulation.priceHistory,
        activePositions: simulation.activePositions,
        recentTrades: simulation.recentTrades.slice(0, 50),
        traderRankings: simulation.traderRankings.slice(0, 20),
        batchSize: updates
      }
    });
    
    this.lastBatchTime = now;
    this.batchedUpdates = [];
    
    // Save the updated simulation state
    this.simulations.set(id, simulation);
  }
  
  // High-frequency price update with stability controls
  private updatePriceHighFrequency(simulation: SimulationState, volatilityFactor: number): void {
    const { marketConditions, currentPrice } = simulation;
    const activeScenario = (simulation as any).activeScenario;
    
    // Reduced base volatility for high-frequency updates
    let baseVolatility = marketConditions.volatility * 0.3 * volatilityFactor;
    
    // Random walk model with trend bias
    let trendFactor = 0;
    
    // Apply scenario effects if active
    if (activeScenario && activeScenario.phase) {
      const { priceAction } = activeScenario;
      
      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.005 * priceAction.intensity * volatilityFactor;
          baseVolatility = marketConditions.volatility * priceAction.volatility * volatilityFactor;
          break;
        
        case 'pump':
          trendFactor = 0.005 * priceAction.intensity * volatilityFactor;
          baseVolatility = marketConditions.volatility * priceAction.volatility * volatilityFactor;
          break;
        
        default:
          // Reduced factors for other types
          trendFactor *= volatilityFactor;
          baseVolatility *= volatilityFactor;
      }
    } else {
      if (marketConditions.trend === 'bullish') trendFactor = 0.00005;
      else if (marketConditions.trend === 'bearish') trendFactor = -0.00005;
    }
    
    // Smaller random component for stability
    const randomFactor = (Math.random() - 0.5) * baseVolatility;
    
    // Calculate price change
    const priceChange = currentPrice * (trendFactor + randomFactor);
    const newPrice = currentPrice + priceChange;
    
    // Update the current price with bounds
    simulation.currentPrice = Math.max(1.00, Math.min(10000.00, newPrice));
    
    // Update candles (same as before)
    const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    const candleInterval = 15 * 60 * 1000;
    const currentCandlePeriod = Math.floor(simulation.currentTime / candleInterval);
    const lastCandlePeriod = Math.floor(lastCandle.timestamp / candleInterval);
    
    if (currentCandlePeriod > lastCandlePeriod) {
      simulation.priceHistory.push({
        timestamp: currentCandlePeriod * candleInterval,
        open: simulation.currentPrice,
        high: simulation.currentPrice,
        low: simulation.currentPrice,
        close: simulation.currentPrice,
        volume: 0
      });
      
      if (simulation.priceHistory.length > 250) {
        simulation.priceHistory.shift();
      }
    } else {
      const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
      currentCandle.close = simulation.currentPrice;
      currentCandle.high = Math.max(currentCandle.high, simulation.currentPrice);
      currentCandle.low = Math.min(currentCandle.low, simulation.currentPrice);
      simulation.priceHistory[simulation.priceHistory.length - 1] = currentCandle;
    }
  }
  
  // Batch process trader actions for efficiency
  private processTraderActionsBatch(simulation: SimulationState, batchSize: number): void {
    // Increase action probability based on batch size
    const actionMultiplier = Math.min(batchSize, 10);
    
    // Sample a subset of traders for efficiency
    const traderSample = this.getRandomTraderSample(simulation.traders, Math.min(50, simulation.traders.length));
    
    traderSample.forEach((trader: TraderProfile) => {
      const { tradingFrequency } = trader;
      
      // Adjusted probability for batch processing
      const actionProbability = tradingFrequency * 0.05 * actionMultiplier;
      
      if (Math.random() < actionProbability) {
        this.processTraderDecision(simulation, trader);
      }
    });
    
    // Also, if we have no trades yet, force some initial trades
    if (simulation.recentTrades.length === 0 && simulation.traders.length > 0) {
      // Force at least 3 random traders to make trades on startup
      const forcedTraderCount = Math.min(3, simulation.traders.length);
      const randomTraders = [...simulation.traders].sort(() => 0.5 - Math.random()).slice(0, forcedTraderCount);
      
      randomTraders.forEach(trader => {
        this.processTraderDecision(simulation, trader);
      });
      
      console.log(`Forced ${forcedTraderCount} initial trades`);
    }
  }
  
  // Efficient random sampling
  private getRandomTraderSample(traders: TraderProfile[], sampleSize: number): TraderProfile[] {
    const shuffled = [...traders];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleSize);
  }
  
  private updatePrice(simulation: SimulationState): void {
    const { marketConditions, currentPrice } = simulation;
    const activeScenario = (simulation as any).activeScenario;
    
    // Base volatility adjusted by the volatility factor
    let baseVolatility = marketConditions.volatility * 0.3;
    
    // Random walk model with trend bias
    let trendFactor = 0;
    
    // If there's an active scenario, use its price action
    if (activeScenario && activeScenario.phase) {
      const { priceAction, progress } = activeScenario;
      
      // Apply scenario-specific price movements
      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.01 * priceAction.intensity; // Strong downward pressure
          baseVolatility = marketConditions.volatility * priceAction.volatility;
          break;
        
        case 'pump':
          trendFactor = 0.01 * priceAction.intensity; // Strong upward pressure
          baseVolatility = marketConditions.volatility * priceAction.volatility;
          break;
        
        case 'breakout':
          trendFactor = priceAction.direction === 'up' ? 0.005 * priceAction.intensity : -0.005 * priceAction.intensity;
          baseVolatility = marketConditions.volatility * priceAction.volatility;
          break;
        
        case 'trend':
          if (priceAction.direction === 'up') trendFactor = 0.002 * priceAction.intensity;
          else if (priceAction.direction === 'down') trendFactor = -0.002 * priceAction.intensity;
          baseVolatility = marketConditions.volatility * 0.5;
          break;
        
        case 'consolidation':
          trendFactor = 0;
          baseVolatility = marketConditions.volatility * 0.2;
          break;
        
        case 'accumulation':
          trendFactor = 0.0005 * priceAction.intensity; // Slight upward bias
          baseVolatility = marketConditions.volatility * 0.3;
          break;
        
        case 'distribution':
          trendFactor = -0.0005 * priceAction.intensity; // Slight downward bias
          baseVolatility = marketConditions.volatility * 0.3;
          break;
      }
      
      // Apply direction override if specified
      if (priceAction.direction === 'sideways') {
        trendFactor = 0;
      }
    } else {
      // Default behavior when no scenario is active
      if (marketConditions.trend === 'bullish') trendFactor = 0.0001;
      else if (marketConditions.trend === 'bearish') trendFactor = -0.0001;
    }
    
    // Random component (normal distribution around 0)
    const randomFactor = (Math.random() - 0.5) * baseVolatility;
    
    // Calculate price change
    const priceChange = currentPrice * (trendFactor + randomFactor);
    const newPrice = currentPrice + priceChange;
    
    // Update the current price
    simulation.currentPrice = Math.max(1.00, newPrice);
    
    // Handle candle updates
    const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    
    // Check if we're in a new 15-minute period
    const candleInterval = 15 * 60 * 1000;
    const currentCandlePeriod = Math.floor(simulation.currentTime / candleInterval);
    const lastCandlePeriod = Math.floor(lastCandle.timestamp / candleInterval);
    
    if (currentCandlePeriod > lastCandlePeriod) {
      // Create a new candle
      simulation.priceHistory.push({
        timestamp: currentCandlePeriod * candleInterval, // Align to period start
        open: simulation.currentPrice,
        high: simulation.currentPrice,
        low: simulation.currentPrice,
        close: simulation.currentPrice,
        volume: 0
      });
      
      // Keep only the most recent 250 candles
      if (simulation.priceHistory.length > 250) {
        simulation.priceHistory.shift();
      }
    } else {
      // Update the current candle - THIS IS KEY FOR REALISTIC CANDLES
      const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
      currentCandle.close = simulation.currentPrice;
      
      // Properly track high and low during the candle period
      currentCandle.high = Math.max(currentCandle.high, simulation.currentPrice);
      currentCandle.low = Math.min(currentCandle.low, simulation.currentPrice);
      
      // Don't regenerate the entire candle, just update it
      simulation.priceHistory[simulation.priceHistory.length - 1] = currentCandle;
    }
    
    // Update market trend based on recent price movement
    if (simulation.priceHistory.length >= 10) {
      const recentPrices = simulation.priceHistory.slice(-10);
      const firstPrice = recentPrices[0].close;
      const lastPrice = simulation.currentPrice;
      const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
      
      if (percentChange > 2) { // Reduced from 3%
        simulation.marketConditions.trend = 'bullish';
      } else if (percentChange < -1.5) { // Reduced from -2%
        simulation.marketConditions.trend = 'bearish';
      } else {
        simulation.marketConditions.trend = 'sideways';
      }
      
      // Also update volatility based on recent price changes
      const volatility = this.calculateVolatility(recentPrices);
      simulation.marketConditions.volatility = volatility;
    }
  }
  
  // Calculate price volatility
  private calculateVolatility(prices: PricePoint[]): number {
    if (prices.length < 2) return 0.02; // Default volatility
    
    // Calculate percentage changes
    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const change = (prices[i].close - prices[i-1].close) / prices[i-1].close;
      changes.push(change);
    }
    
    // Calculate standard deviation
    const mean = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    const variance = changes.reduce((sum, change) => sum + Math.pow(change - mean, 2), 0) / changes.length;
    const stdDev = Math.sqrt(variance);
    
    // Scale to a reasonable volatility value (0.01 to 0.05)
    return Math.max(0.01, Math.min(0.05, stdDev * 10));
  }
  
  private processTraderActions(simulation: SimulationState): void {
    // For each trader, decide if they should take action
    simulation.traders.forEach((trader: TraderProfile) => {
      const profile = trader;
      const { tradingFrequency } = profile;
      
      // Probability of action - adjust based on chart timeframe
      // For 15min chart, we want fewer trades per update
      const actionProbability = tradingFrequency * 0.05; // Lower probability
      
      if (Math.random() < actionProbability) {
        // Decide whether to enter or exit position
        this.processTraderDecision(simulation, trader);
      }
    });
    
    // Also, if we have no trades yet, force some initial trades
    if (simulation.recentTrades.length === 0 && simulation.traders.length > 0) {
      // Force at least 3 random traders to make trades on startup
      const forcedTraderCount = Math.min(3, simulation.traders.length);
      const randomTraders = [...simulation.traders].sort(() => 0.5 - Math.random()).slice(0, forcedTraderCount);
      
      randomTraders.forEach(trader => {
        this.processTraderDecision(simulation, trader);
      });
      
      console.log(`Forced ${forcedTraderCount} initial trades`);
    }
  }
  
  private processTraderDecision(simulation: SimulationState, trader: TraderProfile): void {
    const existingPosition = simulation.activePositions.find(
      p => p.trader.walletAddress === trader.trader.walletAddress
    );
    
    if (existingPosition) {
      // Trader has a position - decide if they should exit
      const shouldExit = this.shouldExitPosition(simulation, trader, existingPosition);
      
      if (shouldExit) {
        this.closePosition(simulation, existingPosition);
      }
    } else {
      // Trader has no position - decide if they should enter
      const shouldEnter = this.shouldEnterPosition(simulation, trader);
      
      if (shouldEnter) {
        this.openPosition(simulation, trader);
      }
    }
  }
  
  private shouldEnterPosition(simulation: SimulationState, trader: TraderProfile): boolean {
    const { marketConditions, currentPrice, priceHistory } = simulation;
    const { strategy } = trader;
    
    // Get recent price data
    const recentPrices = priceHistory.slice(-20);
    if (recentPrices.length < 5) return false;
    
    // Calculate technical indicators
    const sma5 = this.calculateSMA(recentPrices.slice(-5));
    const sma20 = this.calculateSMA(recentPrices);
    const rsi = this.calculateRSI(recentPrices);
    
    // Strategy-based entry logic
    switch (strategy) {
      case 'scalper':
        // Scalpers enter on short-term momentum
        return Math.random() < 0.3 && marketConditions.volatility > 0.015;
      
      case 'swing':
        // Swing traders look for trend reversals
        if (marketConditions.trend === 'bullish' && currentPrice > sma5) {
          return Math.random() < 0.4;
        } else if (marketConditions.trend === 'bearish' && currentPrice < sma5) {
          return Math.random() < 0.4;
        }
        return false;
      
      case 'momentum':
        // Momentum traders follow strong trends
        if (marketConditions.trend === 'bullish' && currentPrice > sma20 && rsi < 70) {
          return Math.random() < 0.5;
        } else if (marketConditions.trend === 'bearish' && currentPrice < sma20 && rsi > 30) {
          return Math.random() < 0.5;
        }
        return false;
      
      case 'contrarian':
        // Contrarians bet against the trend
        if (rsi > 70 || rsi < 30) {
          return Math.random() < 0.6;
        }
        return false;
      
      default:
        // Default random entry
        return Math.random() < 0.2;
    }
  }
  
  private shouldExitPosition(
    simulation: SimulationState, 
    trader: TraderProfile, 
    position: TraderPosition
  ): boolean {
    const { currentPrice } = simulation;
    const { strategy } = trader;
    
    // Calculate P&L
    const isLong = position.quantity > 0;
    const entryValue = Math.abs(position.quantity) * position.entryPrice;
    const currentValue = Math.abs(position.quantity) * currentPrice;
    const pnl = isLong ? currentValue - entryValue : entryValue - currentValue;
    const pnlPercentage = pnl / entryValue;
    
    // Time in position (in milliseconds)
    const timeInPosition = simulation.currentTime - position.entryTime;
    const minutesInPosition = timeInPosition / (60 * 1000);
    
    // Strategy-based exit logic
    switch (strategy) {
      case 'scalper':
        // Scalpers exit quickly with small profits/losses
        if (pnlPercentage > 0.005 || pnlPercentage < -0.003) return true;
        if (minutesInPosition > 30) return true;
        return false;
      
      case 'swing':
        // Swing traders hold for larger moves
        if (pnlPercentage > 0.02 || pnlPercentage < -0.01) return true;
        if (minutesInPosition > 180) return Math.random() < 0.3;
        return false;
      
      case 'momentum':
        // Momentum traders ride trends
        if (pnlPercentage > 0.03 || pnlPercentage < -0.015) return true;
        if (minutesInPosition > 120 && pnlPercentage > 0) return Math.random() < 0.2;
        return false;
      
      case 'contrarian':
        // Contrarians have wider stops
        if (pnlPercentage > 0.015 || pnlPercentage < -0.02) return true;
        if (minutesInPosition > 90) return Math.random() < 0.4;
        return false;
      
      default:
        // Default exit logic
        if (pnlPercentage > 0.01 || pnlPercentage < -0.005) return true;
        if (minutesInPosition > 60) return Math.random() < 0.5;
        return false;
    }
  }
  
  private openPosition(simulation: SimulationState, trader: TraderProfile): void {
    const { currentPrice, marketConditions } = simulation;
    const { positionSizing, trader: traderData } = trader;
    
    // Determine position direction based on strategy and market conditions
    let isLong = true;
    
    switch (trader.strategy) {
      case 'momentum':
        isLong = marketConditions.trend === 'bullish';
        break;
      case 'contrarian':
        isLong = marketConditions.trend === 'bearish';
        break;
      default:
        isLong = Math.random() > 0.5;
    }
    
    // Calculate position size based on trader's sizing preference
    const baseSize = 10000; // $10k base position
    const sizeMultiplier = positionSizing === 'aggressive' ? 3 : positionSizing === 'moderate' ? 1.5 : 1;
    const positionValue = baseSize * sizeMultiplier * (0.5 + Math.random());
    const quantity = positionValue / currentPrice;
    
    // Apply direction
    const positionQuantity = isLong ? quantity : -quantity;
    
    // Create position using object pool
    const position = this.positionPool.acquire();
    position.trader = traderData;
    position.entryPrice = currentPrice;
    position.quantity = positionQuantity;
    position.entryTime = simulation.currentTime;
    position.currentPnl = 0;
    position.currentPnlPercentage = 0;
    
    // Add to active positions
    simulation.activePositions.push(position);
    
    // Create trade record using object pool
    const trade = this.tradePool.acquire();
    trade.id = uuidv4();
    trade.timestamp = simulation.currentTime;
    trade.trader = traderData;
    trade.action = isLong ? 'buy' : 'sell';
    trade.price = currentPrice;
    trade.quantity = Math.abs(positionQuantity);
    trade.value = currentPrice * Math.abs(positionQuantity);
    trade.impact = 0.0001 * trade.value / marketConditions.volume;
    
    // Add to recent trades
    simulation.recentTrades.unshift(trade);
    if (simulation.recentTrades.length > 100) {
      const removed = simulation.recentTrades.pop();
      if (removed) this.tradePool.release(removed);
    }
    
    // Update volume on current candle
    const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    currentCandle.volume += Math.abs(positionQuantity);
    
    // Broadcast trade event
    this.broadcastEvent(simulation.id, {
      type: 'trade',
      timestamp: simulation.currentTime,
      data: trade
    });
    
    // Queue for async processing if transaction queue is available
    if (this.transactionQueue) {
      this.transactionQueue.addTrade(trade);
    }
  }
  
  private closePosition(simulation: SimulationState, position: TraderPosition): void {
    const { currentPrice } = simulation;
    const exitTime = simulation.currentTime;
    
    // Calculate final P&L
    const isLong = position.quantity > 0;
    const entryValue = Math.abs(position.quantity) * position.entryPrice;
    const exitValue = Math.abs(position.quantity) * currentPrice;
    const pnl = isLong ? exitValue - entryValue : entryValue - exitValue;
    const pnlPercentage = pnl / entryValue;
    
    // Create exit trade using object pool
    const trade = this.tradePool.acquire();
    trade.id = uuidv4();
    trade.timestamp = exitTime;
    trade.trader = position.trader;
    trade.action = isLong ? 'sell' : 'buy'; // Opposite of position
    trade.price = currentPrice;
    trade.quantity = Math.abs(position.quantity);
    trade.value = currentPrice * Math.abs(position.quantity);
    trade.impact = 0.0001 * trade.value / simulation.marketConditions.volume;
    
    // Add to recent trades
    simulation.recentTrades.unshift(trade);
    if (simulation.recentTrades.length > 100) {
      const removed = simulation.recentTrades.pop();
      if (removed) this.tradePool.release(removed);
    }
    
    // Move to closed positions
    const closedPosition: TraderPosition & { exitPrice: number, exitTime: number } = {
      ...position,
      exitPrice: currentPrice,
      exitTime: exitTime,
      currentPnl: pnl,
      currentPnlPercentage: pnlPercentage
    };
    
    simulation.closedPositions.push(closedPosition);
    
    // Remove from active positions
    const index = simulation.activePositions.indexOf(position);
    if (index > -1) {
      simulation.activePositions.splice(index, 1);
    }
    
    // Release position back to pool
    this.positionPool.release(position);
    
    // Update trader's PnL
    const traderProfile = simulation.traders.find(
      t => t.trader.walletAddress === position.trader.walletAddress
    );
    if (traderProfile) {
      traderProfile.trader.netPnl = (traderProfile.trader.netPnl || 0) + pnl;
    }
    
    // Update volume on current candle
    const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    currentCandle.volume += Math.abs(position.quantity);
    
    // Update trader rankings
    this.updateTraderRankings(simulation);
    
    // Broadcast trade event
    this.broadcastEvent(simulation.id, {
      type: 'trade',
      timestamp: exitTime,
      data: trade
    });
    
    // Queue for async processing if transaction queue is available
    if (this.transactionQueue) {
      this.transactionQueue.addTrade(trade);
    }
  }
  
  private updateOrderBook(simulation: SimulationState): void {
    const { currentPrice, marketConditions } = simulation;
    const { volatility } = marketConditions;
    
    // Update bid levels
    simulation.orderBook.bids = simulation.orderBook.bids.map((level, index) => {
      const distance = (index + 1) * 0.0005;
      const price = currentPrice * (1 - distance);
      
      // Adjust quantity based on volatility
      const baseQuantity = 1000 - (index * 50);
      const volatilityMultiplier = 1 + (volatility * 10);
      const quantity = (baseQuantity * volatilityMultiplier) / price;
      
      return { price, quantity };
    });
    
    // Update ask levels
    simulation.orderBook.asks = simulation.orderBook.asks.map((level, index) => {
      const distance = (index + 1) * 0.0005;
      const price = currentPrice * (1 + distance);
      
      // Adjust quantity based on volatility
      const baseQuantity = 1000 - (index * 50);
      const volatilityMultiplier = 1 + (volatility * 10);
      const quantity = (baseQuantity * volatilityMultiplier) / price;
      
      return { price, quantity };
    });
    
    simulation.orderBook.lastUpdateTime = simulation.currentTime;
  }
  
  private updateTraderRankings(simulation: SimulationState): void {
    // Sort traders by net PnL
    simulation.traderRankings = [...simulation.traders]
      .map(profile => profile.trader)
      .sort((a, b) => (b.netPnl || 0) - (a.netPnl || 0));
  }
  
  // Technical indicator calculations
  private calculateSMA(prices: PricePoint[]): number {
    const sum = prices.reduce((acc, price) => acc + price.close, 0);
    return sum / prices.length;
  }
  
  private calculateRSI(prices: PricePoint[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Default neutral RSI
    
    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i].close - prices[i - 1].close);
    }
    
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return rsi;
  }
  
  // Scenario management methods
  applyScenario(simulationId: string, scenarioType: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) return;
    
    // Define scenario parameters
    const scenarios: Record<string, any> = {
      'pump': {
        duration: 30 * 60 * 1000, // 30 minutes
        priceAction: {
          type: 'pump',
          intensity: 2,
          volatility: 3,
          direction: 'up'
        }
      },
      'dump': {
        duration: 20 * 60 * 1000, // 20 minutes
        priceAction: {
          type: 'crash',
          intensity: 2.5,
          volatility: 4,
          direction: 'down'
        }
      },
      'whale_accumulation': {
        duration: 60 * 60 * 1000, // 1 hour
        priceAction: {
          type: 'accumulation',
          intensity: 1,
          volatility: 0.5,
          direction: 'sideways'
        }
      },
      'volatility_spike': {
        duration: 15 * 60 * 1000, // 15 minutes
        priceAction: {
          type: 'consolidation',
          intensity: 1,
          volatility: 5,
          direction: 'sideways'
        }
      }
    };
    
    const scenario = scenarios[scenarioType];
    if (!scenario) return;
    
    // Apply scenario to simulation
    (simulation as any).activeScenario = {
      type: scenarioType,
      startTime: simulation.currentTime,
      endTime: simulation.currentTime + scenario.duration,
      phase: 'active',
      progress: 0,
      ...scenario
    };
    
    // Adjust market conditions
    simulation.marketConditions.volatility *= scenario.priceAction.volatility;
    
    this.simulations.set(simulationId, simulation);
    
    // Broadcast scenario event
    this.broadcastEvent(simulationId, {
      type: 'scenario_applied',
      timestamp: simulation.currentTime,
      data: {
        scenarioType,
        duration: scenario.duration
      }
    });
  }

  // Add these missing methods for scenario routes
  applyTraderBehaviorModifiers(simulationId: string, modifiers: any): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) {
      throw new Error(`Simulation ${simulationId} not found`);
    }
    
    // Apply modifiers to traders
    simulation.traders.forEach(trader => {
      if (modifiers.tradingFrequency !== undefined) {
        trader.tradingFrequency *= modifiers.tradingFrequency;
      }
      if (modifiers.positionSizing !== undefined) {
        trader.positionSizing = modifiers.positionSizing;
      }
      if (modifiers.riskTolerance !== undefined) {
        // Adjust exit thresholds based on risk tolerance
        const riskMultiplier = modifiers.riskTolerance;
        trader.stopLoss *= riskMultiplier;
        trader.takeProfit *= riskMultiplier;
      }
    });
    
    this.simulations.set(simulationId, simulation);
    console.log(`Applied trader behavior modifiers to simulation ${simulationId}`);
  }

  applyScenarioPhase(simulationId: string, phase: any, progress: number): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) {
      throw new Error(`Simulation ${simulationId} not found`);
    }
    
    // Update active scenario phase
    if ((simulation as any).activeScenario) {
      (simulation as any).activeScenario.phase = phase.name;
      (simulation as any).activeScenario.progress = progress;
      
      // Apply phase-specific effects
      if (phase.volatilityMultiplier) {
        simulation.marketConditions.volatility *= phase.volatilityMultiplier;
      }
      
      if (phase.trendBias) {
        simulation.marketConditions.trend = phase.trendBias;
      }
    }
    
    this.simulations.set(simulationId, simulation);
    console.log(`Applied scenario phase ${phase.name} to simulation ${simulationId}`);
  }

  clearScenarioEffects(simulationId: string): void {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) {
      throw new Error(`Simulation ${simulationId} not found`);
    }
    
    // Remove active scenario
    delete (simulation as any).activeScenario;
    
    // Reset market conditions to defaults
    simulation.marketConditions.volatility = 0.02 * simulation.parameters.volatilityFactor;
    
    // Reset trader behaviors to original values
    const originalTraders = traderService.generateTraderProfiles(
      simulation.traders.map(t => t.trader)
    );
    
    simulation.traders = originalTraders;
    
    this.simulations.set(simulationId, simulation);
    console.log(`Cleared scenario effects from simulation ${simulationId}`);
  }
  
  deleteSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    if (!simulation) return;
    
    // Stop the simulation if running
    if (simulation.isRunning) {
      const interval = this.simulationIntervals.get(id);
      if (interval) {
        clearInterval(interval);
        this.simulationIntervals.delete(id);
      }
    }
    
    // Release all pooled objects
    simulation.activePositions.forEach(position => {
      this.positionPool.release(position);
    });
    
    simulation.recentTrades.forEach(trade => {
      this.tradePool.release(trade);
    });
    
    // Remove from indexes
    this.traderIndex.delete(id);
    this.activePositionsIndex.delete(id);
    this.simulationSpeeds.delete(id);
    
    // Remove simulation
    this.simulations.delete(id);
    
    console.log(`Simulation ${id} deleted`);
  }
  
  // Cleanup method
  cleanup(): void {
    // Stop all simulations
    this.simulations.forEach((simulation, id) => {
      if (simulation.isRunning) {
        this.pauseSimulation(id);
      }
    });
    
    // Terminate worker pool
    this.workerPool.forEach(worker => {
      worker.terminate();
    });
    
    // Stop performance monitoring
    if (this.performanceMonitor) {
      this.performanceMonitor.stopMonitoring();
    }
    
    console.log('SimulationManager cleanup complete');
  }
}

const simulationManager = new SimulationManager();
export default simulationManager;
export { simulationManager };