// backend/src/services/simulationManager.ts - Complete Fixed File with Pause State Handling
import { v4 as uuidv4 } from 'uuid';
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

class SimulationManager {
  private simulations: Map<string, SimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private simulationSpeeds: Map<string, number> = new Map();
  private clients: Set<WebSocket> = new Set();
  private baseUpdateInterval: number = 1000; // 1 second base interval
  
  constructor() {}
  
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
    
    const message = JSON.stringify({
      simulationId,
      event
    });
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
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
      netPnl: Math.random() * 100000 - 50000,
      totalVolume: 100000 + Math.random() * 900000,
      buyVolume: 50000 + Math.random() * 450000,
      sellVolume: 50000 + Math.random() * 450000,
      tradeCount: 10 + Math.floor(Math.random() * 90),
      feesUsd: 500 + Math.random() * 4500,
      winRate: 0.4 + Math.random() * 0.3,
      riskProfile: ['conservative', 'moderate', 'aggressive'][Math.floor(Math.random() * 3)] as 'conservative' | 'moderate' | 'aggressive',
      portfolioEfficiency: (Math.random() * 0.2) - 0.1
    }));
    
    const traderProfiles = traderService.generateTraderProfiles(dummyTraders);
    
    // Wrap in Promise.resolve to fix the TypeScript error
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
  
  // Helper method to create the simulation object with more realistic token data
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
    
    // Create initial price history (250 candles of 15 minutes each)
    const initialPriceHistory: PricePoint[] = [];
    const candleInterval = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    for (let i = 0; i < 250; i++) {
      const timestamp = now - (250 - i) * candleInterval; // Going back in time
      const basePrice = finalParams.initialPrice;
      // Add some random variation to create a realistic price history
      const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
      const close = basePrice * (1 + variation);
      const open = close * (1 + (Math.random() - 0.5) * 0.01);
      const high = Math.max(open, close) * (1 + Math.random() * 0.005);
      const low = Math.min(open, close) * (1 - Math.random() * 0.005);
      // More realistic volume for a higher-priced token
      const volume = Math.random() * 2000 + 500; // 500 to 2500 tokens (adjusted for higher price)
      
      initialPriceHistory.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume
      });
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
      currentPrice: finalParams.initialPrice,
      orderBook: {
        bids: this.generateInitialOrderBook('bids', finalParams.initialPrice, finalParams.initialLiquidity),
        asks: this.generateInitialOrderBook('asks', finalParams.initialPrice, finalParams.initialLiquidity),
        lastUpdateTime: now
      },
      traders: traderProfiles,
      activePositions: [],
      closedPositions: [],
      recentTrades: [],
      traderRankings: traders.sort((a, b) => b.netPnl - a.netPnl)
    };
    
    // Generate some initial positions and trades for realistic data display
    this.generateInitialPositionsAndTrades(simulation);
    
    // Store the simulation
    this.simulations.set(id, simulation);
    
    console.log(`Simulation ${id} created with ${traders.length} traders`);
    console.log(`Initial price: $${finalParams.initialPrice.toFixed(2)}`);
    
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
      
      // Create position
      const position: TraderPosition = {
        trader: trader.trader,
        entryPrice: entryPrice,
        quantity: positionQuantity,
        entryTime: now - (Math.random() * 3600000), // Entered 0-60 minutes ago
        currentPnl: pnl,
        currentPnlPercentage: pnlPercentage
      };
      
      // Add to active positions
      simulation.activePositions.push(position);
      
      // Create a corresponding trade record
      const trade: Trade = {
        id: uuidv4(),
        timestamp: position.entryTime,
        trader: trader.trader,
        action: isLong ? 'buy' : 'sell',
        price: entryPrice,
        quantity: Math.abs(positionQuantity),
        value: entryPrice * Math.abs(positionQuantity),
        impact: 0.0001 * (entryPrice * Math.abs(positionQuantity)) / simulation.marketConditions.volume
      };
      
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
        const entryTrade: Trade = {
          id: uuidv4(),
          timestamp: closedEntryTime,
          trader: trader.trader,
          action: closedIsLong ? 'buy' : 'sell',
          price: closedEntryPrice,
          quantity: Math.abs(closedPositionQty),
          value: closedEntryPrice * Math.abs(closedPositionQty),
          impact: 0.0001 * (closedEntryPrice * Math.abs(closedPositionQty)) / simulation.marketConditions.volume
        };
        
        const exitTrade: Trade = {
          id: uuidv4(),
          timestamp: closedExitTime,
          trader: trader.trader,
          action: closedIsLong ? 'sell' : 'buy',
          price: closedExitPrice,
          quantity: Math.abs(closedPositionQty),
          value: closedExitPrice * Math.abs(closedPositionQty),
          impact: 0.0001 * (closedExitPrice * Math.abs(closedPositionQty)) / simulation.marketConditions.volume
        };
        
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
  
  // Updated for proper speed settings
  setSimulationSpeed(id: string, speed: number): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    // Allow speeds from 1x to 10x
    const validSpeed = Math.max(1, Math.min(10, speed));
    
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
      const updateInterval = Math.floor(this.baseUpdateInterval / validSpeed);
      
      // Set up a new interval with the updated speed
      const newInterval = setInterval(() => {
        this.advanceSimulation(id);
      }, updateInterval);
      
      this.simulationIntervals.set(id, newInterval);
    }
    
    console.log(`Simulation ${id} speed set to ${validSpeed}x`);
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
    const updateInterval = Math.floor(this.baseUpdateInterval / speed);
    
    console.log(`Starting simulation ${id} with speed ${speed}x (interval ${updateInterval}ms)`);
    console.log(`Resuming from price: $${simulation.currentPrice.toFixed(2)}`);
    
    // Set up the simulation interval
    const interval = setInterval(() => {
      this.advanceSimulation(id);
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
    
    // Create initial price history (250 candles of 15 minutes each)
    const initialPriceHistory: PricePoint[] = [];
    const candleInterval = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    for (let i = 0; i < 250; i++) {
      const timestamp = now - (250 - i) * candleInterval; // Going back in time
      const basePrice = params.initialPrice;
      // Add some random variation to create a realistic price history
      const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
      const close = basePrice * (1 + variation);
      const open = close * (1 + (Math.random() - 0.5) * 0.01);
      const high = Math.max(open, close) * (1 + Math.random() * 0.005);
      const low = Math.min(open, close) * (1 - Math.random() * 0.005);
      // More realistic volume for a higher-priced token
      const volume = Math.random() * 2000 + 500; // 500 to 2500 tokens
      
      initialPriceHistory.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume
      });
    }
    
    simulation.startTime = now;
    simulation.currentTime = now;
    simulation.endTime = now + (params.duration * 60 * 1000);
    simulation.isRunning = false;
    simulation.isPaused = false;
    simulation.priceHistory = initialPriceHistory;
    simulation.currentPrice = params.initialPrice;
    simulation.orderBook = {
      bids: this.generateInitialOrderBook('bids', params.initialPrice, params.initialLiquidity),
      asks: this.generateInitialOrderBook('asks', params.initialPrice, params.initialLiquidity),
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
    
    // Only broadcast price updates if not paused
    if (!simulation.isPaused) {
      this.broadcastEvent(id, {
        type: 'price_update',
        timestamp: simulation.currentTime,
        data: {
          price: simulation.currentPrice,
          orderBook: simulation.orderBook
        }
      });
    }
    
    // Save the updated simulation state
    this.simulations.set(id, simulation);
  }
  
  private updatePrice(simulation: SimulationState): void {
    const { marketConditions, currentPrice } = simulation;
    
    // Base volatility adjusted by the volatility factor
    const baseVolatility = marketConditions.volatility;
    
    // Random walk model with trend bias
    let trendFactor = 0;
    if (marketConditions.trend === 'bullish') trendFactor = 0.0005;
    else if (marketConditions.trend === 'bearish') trendFactor = -0.0005;
    
    // Random component (normal distribution around 0)
    const randomFactor = (Math.random() - 0.5) * baseVolatility;
    
    // Calculate price change
    const priceChange = currentPrice * (trendFactor + randomFactor);
    const newPrice = currentPrice + priceChange;
    
    // Update the current price
    simulation.currentPrice = Math.max(1.00, newPrice); // Prevent price from going too low
    
    // Add to price history (ensuring consistent 15-minute candles)
    const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    
    // If we're in a new 15-minute period, create a new candle
    const inNewPeriod = Math.floor(simulation.currentTime / (15 * 60 * 1000)) > 
                         Math.floor(lastCandle.timestamp / (15 * 60 * 1000));
    
    if (inNewPeriod) {
      // Create a new candle
      simulation.priceHistory.push({
        timestamp: simulation.currentTime,
        open: simulation.currentPrice,
        high: simulation.currentPrice,
        low: simulation.currentPrice,
        close: simulation.currentPrice,
        volume: 0
      });
      
      // Keep only the most recent 250 candles
      if (simulation.priceHistory.length > 250) {
        simulation.priceHistory.shift(); // Remove oldest candle
      }
    } else {
      // Update the current candle
      lastCandle.close = simulation.currentPrice;
      lastCandle.high = Math.max(lastCandle.high, simulation.currentPrice);
      lastCandle.low = Math.min(lastCandle.low, simulation.currentPrice);
      
      simulation.priceHistory[simulation.priceHistory.length - 1] = lastCandle;
    }
    
    // Update market trend based on recent price movement
    if (simulation.priceHistory.length >= 10) {
      const recentPrices = simulation.priceHistory.slice(-10);
      const firstPrice = recentPrices[0].close;
      const lastPrice = simulation.currentPrice;
      const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
      
      if (percentChange > 3) {
        simulation.marketConditions.trend = 'bullish';
      } else if (percentChange < -2) {
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
  
  private processTraderDecision(simulation: SimulationState, traderProfile: TraderProfile): void {
    const trader = traderProfile.trader;
    
    // Check if trader has active position
    const activePosition = simulation.activePositions.find((p: TraderPosition) => p.trader.walletAddress === trader.walletAddress);
    
    if (activePosition) {
      // Decide whether to exit position
      this.processExitDecision(simulation, traderProfile, activePosition);
    } else {
      // Decide whether to enter position
      this.processEntryDecision(simulation, traderProfile);
    }
  }
  
  private processEntryDecision(simulation: SimulationState, traderProfile: TraderProfile): void {
    const { entryThreshold, positionSizing, sentimentSensitivity } = traderProfile;
    const trader = traderProfile.trader;
    
    // Simplified decision model:
    // Check recent price movement to see if it exceeds threshold
    const recentCandles = simulation.priceHistory.slice(-5);
    if (recentCandles.length < 2) return;
    
    const oldPrice = recentCandles[0].close;
    const newPrice = simulation.currentPrice;
    const priceChange = (newPrice - oldPrice) / oldPrice;
    
    // Determine market sentiment
    const marketTrend = simulation.marketConditions.trend;
    const sentimentBoost = marketTrend === 'bullish' ? sentimentSensitivity * 0.01 : 
                           marketTrend === 'bearish' ? -sentimentSensitivity * 0.01 : 0;
    
    // Adjust threshold based on sentiment
    const adjustedThreshold = entryThreshold * (1 - sentimentBoost) * 0.5;
    
    // Check if price movement exceeds threshold
    if (Math.abs(priceChange) > adjustedThreshold) {
      // Determine action based on price direction and trader's characteristics
      const action: TradeAction = priceChange > 0 ? 'buy' : 'sell';
      
      // Calculate position size based on trader's profile
      // For a high-priced token, position sizes should be smaller
      const maxPositionValue = trader.totalVolume * 0.1 * positionSizing;
      
      // Calculate quantity based on token price (yields smaller quantity for higher-priced tokens)
      const quantity = maxPositionValue / simulation.currentPrice;
      
      // Ensure position size is not zero but scale appropriately for higher token price
      const finalQuantity = Math.max(10, quantity); // Minimum 10 tokens for higher priced token
      
      // Create a new position
      const position: TraderPosition = {
        trader: trader,
        entryPrice: simulation.currentPrice,
        quantity: action === 'buy' ? finalQuantity : -finalQuantity, // Negative for short positions
        entryTime: simulation.currentTime,
        currentPnl: 0,
        currentPnlPercentage: 0
      };
      
      // Add to active positions
      simulation.activePositions.push(position);
      
      // Create a trade record
      const trade: Trade = {
        id: uuidv4(),
        timestamp: simulation.currentTime,
        trader: trader,
        action,
        price: simulation.currentPrice,
        quantity: finalQuantity, // Always positive in trade record
        value: simulation.currentPrice * finalQuantity,
        impact: 0.0001 * (simulation.currentPrice * finalQuantity) / simulation.marketConditions.volume
      };
      
      // Add to recent trades
      simulation.recentTrades.unshift(trade);
      if (simulation.recentTrades.length > 100) {
        simulation.recentTrades.pop();
      }
      
      // Broadcast the trade event
      this.broadcastEvent(simulation.id, {
        type: 'trade',
        timestamp: simulation.currentTime,
        data: trade
      });
      
      // Broadcast position open event
      this.broadcastEvent(simulation.id, {
        type: 'position_open',
        timestamp: simulation.currentTime,
        data: position
      });
      
      // Update the last candle volume with null check to fix TypeScript error
      const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
      if (lastCandle) {
        lastCandle.volume = (lastCandle.volume || 0) + finalQuantity;
        simulation.priceHistory[simulation.priceHistory.length - 1] = lastCandle;
      }
    }
  }
  
  private processExitDecision(simulation: SimulationState, traderProfile: TraderProfile, position: TraderPosition): void {
    const { exitProfitThreshold, exitLossThreshold } = traderProfile;
    
    // Calculate current P&L
    const entryValue = position.entryPrice * Math.abs(position.quantity);
    const currentValue = simulation.currentPrice * Math.abs(position.quantity);
    
    // P&L calculation depends on position direction
    const isLong = position.quantity > 0;
    const pnl = isLong ? 
      currentValue - entryValue : // Long position
      entryValue - currentValue;  // Short position
    
    const pnlPercentage = pnl / entryValue;
    
    // Update position P&L
    position.currentPnl = pnl;
    position.currentPnlPercentage = pnlPercentage;
    
    // Check exit conditions
    const shouldTakeProfit = pnlPercentage >= exitProfitThreshold;
    const shouldCutLoss = pnlPercentage <= -exitLossThreshold;
    
    // Force position close more frequently
    const forceClose = Math.random() < 0.005; // 0.5% chance to just close position
    
    if (shouldTakeProfit || shouldCutLoss || forceClose) {
      // Close the position
      this.closePosition(simulation, position);
    }
  }
  
  private closePosition(simulation: SimulationState, position: TraderPosition): void {
    // Remove from active positions
    simulation.activePositions = simulation.activePositions.filter(
      (p: TraderPosition) => p.trader.walletAddress !== position.trader.walletAddress
    );
    
    // Add to closed positions
    const closedPosition = {
      ...position,
      exitPrice: simulation.currentPrice,
      exitTime: simulation.currentTime
    };
    simulation.closedPositions.push(closedPosition);
    
    // Create a trade record
    const trade: Trade = {
      id: uuidv4(),
      timestamp: simulation.currentTime,
      trader: position.trader,
      action: position.quantity > 0 ? 'sell' : 'buy', // Opposite of position direction
      price: simulation.currentPrice,
      quantity: Math.abs(position.quantity),
      value: simulation.currentPrice * Math.abs(position.quantity),
      impact: 0.0001 * (simulation.currentPrice * Math.abs(position.quantity)) / simulation.marketConditions.volume
    };
    
    // Add to recent trades
    simulation.recentTrades.unshift(trade);
    if (simulation.recentTrades.length > 100) {
      simulation.recentTrades.pop();
    }
    
    // Update trader rankings
    this.updateTraderRankings(simulation);
    
    // Broadcast the trade event
    this.broadcastEvent(simulation.id, {
      type: 'trade',
      timestamp: simulation.currentTime,
      data: trade
    });
    
    // Broadcast position close event
    this.broadcastEvent(simulation.id, {
      type: 'position_close',
      timestamp: simulation.currentTime,
      data: closedPosition
    });
    
    // Update the last candle volume with null check to fix TypeScript error
    const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    if (lastCandle) {
      lastCandle.volume = (lastCandle.volume || 0) + Math.abs(position.quantity);
      simulation.priceHistory[simulation.priceHistory.length - 1] = lastCandle;
    }
  }
  
  private updateTraderRankings(simulation: SimulationState): void {
    // Calculate total P&L for each trader
    const traderPnL = new Map<string, number>();
    
    // Add P&L from closed positions
    simulation.closedPositions.forEach((position: TraderPosition & { exitPrice: number; exitTime: number }) => {
      const walletAddress = position.trader.walletAddress;
      const currentPnL = traderPnL.get(walletAddress) || 0;
      traderPnL.set(walletAddress, currentPnL + position.currentPnl);
    });
    
    // Add P&L from active positions
    simulation.activePositions.forEach((position: TraderPosition) => {
      const walletAddress = position.trader.walletAddress;
      const currentPnL = traderPnL.get(walletAddress) || 0;
      traderPnL.set(walletAddress, currentPnL + position.currentPnl);
    });
    
    // Update trader rankings
    simulation.traderRankings = simulation.traders
      .map((profile: TraderProfile) => ({
        ...profile.trader,
        simulationPnl: traderPnL.get(profile.trader.walletAddress) || 0
      }))
      .sort((a: Trader & { simulationPnl?: number }, b: Trader & { simulationPnl?: number }) => (b.simulationPnl || 0) - (a.simulationPnl || 0));
  }
  
  private updateOrderBook(simulation: SimulationState): void {
    const { currentPrice, orderBook, marketConditions } = simulation;
    
    // Update timestamp
    orderBook.lastUpdateTime = simulation.currentTime;
    
    // Generate more realistic levels - vary quantity at each level
    // to make it more dynamic
    const generateLevel = (side: 'bids' | 'asks', basePrice: number, index: number, volatility: number): OrderBookLevel => {
      // Adjust spread based on volatility - smaller for higher priced tokens
      const spread = 0.0005 * (1 + volatility * 5);
      const distanceFromMid = (index + 1) * spread;
      const price = side === 'bids' 
        ? basePrice * (1 - distanceFromMid)
        : basePrice * (1 + distanceFromMid);
      
      // Add more randomness to quantity based on volatility and market conditions
      const volumeFactor = Math.exp(-index / 5);
      const randomFactor = 0.5 + (Math.random() * volatility * 10);
      
      // Smaller quantities for high-priced token
      const baseQuantity = (marketConditions.volume / 1000) * volumeFactor * randomFactor;
      const quantity = baseQuantity / price; // Convert dollar value to token quantity
      
      return {
        price,
        quantity
      };
    };
    
    // Create new bids and asks with more variation
    const bidBasePrice = currentPrice * 0.9998; // Tight spread
    const askBasePrice = currentPrice * 1.0002; // Tight spread
    
    // Generate multiple levels with varying quantities
    orderBook.bids = Array.from({ length: 15 }, (_, i) => 
      generateLevel('bids', bidBasePrice, i, marketConditions.volatility)
    ).slice(0, 10); // Ensure exactly 10 levels
    
    orderBook.asks = Array.from({ length: 15 }, (_, i) => 
      generateLevel('asks', askBasePrice, i, marketConditions.volatility)
    ).slice(0, 10); // Ensure exactly 10 levels
  }
}

export const simulationManager = new SimulationManager();