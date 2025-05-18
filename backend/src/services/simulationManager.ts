// backend/src/services/simulationManager.ts
import { v4 as uuidv4 } from 'uuid';
import { 
  SimulationState, 
  SimulationParameters,
  SimulationEvent,
  TradeAction
} from '../types/simulation';
import duneApi from '../api/duneApi';
import traderService from './traderService';
import { WebSocket } from 'ws';

class SimulationManager {
  private simulations: Map<string, SimulationState> = new Map();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private clients: Set<WebSocket> = new Set();
  
  constructor() {}
  
  registerClient(client: WebSocket) {
    this.clients.add(client);
    
    client.on('close', () => {
      this.clients.delete(client);
    });
  }
  
  broadcastEvent(simulationId: string, event: SimulationEvent) {
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
    // Fetch trader data
    const rawData = await duneApi.getTraderData();
    if (!rawData || !rawData.result || !Array.isArray(rawData.result.rows)) {
      throw new Error('Invalid data format from Dune API');
    }
    
    const traders = traderService.transformRawTraders(rawData.result.rows);
    const traderProfiles = traderService.generateTraderProfiles(traders);
    
    // Create default parameters
    const defaultParams: SimulationParameters = {
      timeCompressionFactor: 30, // 1 day = 30 seconds
      initialPrice: 100, // Base price
      initialLiquidity: 10000000, // $10M
      volatilityFactor: 1.0,
      duration: 60 * 24, // 1 day in minutes
      scenarioType: 'standard'
    };
    
    // Merge default with provided parameters
    const finalParams = { ...defaultParams, ...parameters };
    
    // Generate a unique ID for the simulation
    const id = uuidv4();
    
    // Create the initial simulation state
    const now = Date.now();
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
      priceHistory: [{
        timestamp: now,
        open: finalParams.initialPrice,
        high: finalParams.initialPrice,
        low: finalParams.initialPrice,
        close: finalParams.initialPrice,
        volume: 0
      }],
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
    
    // Store the simulation
    this.simulations.set(id, simulation);
    
    return simulation;
  }
  
  private generateInitialOrderBook(
    side: 'bids' | 'asks', 
    basePrice: number, 
    liquidity: number
  ) {
    const levels: { price: number; quantity: number }[] = [];
    const count = 20; // Number of levels
    
    // Spread percentage from base price
    const spreadPercentage = 0.001;
    
    // Distribution of volume (higher near the mid price)
    const totalQuantity = liquidity * 0.2; // 20% of liquidity in the order book
    
    for (let i = 0; i < count; i++) {
      const distanceFromMid = (i + 1) * spreadPercentage;
      const price = side === 'bids' 
        ? basePrice * (1 - distanceFromMid)
        : basePrice * (1 + distanceFromMid);
      
      // Volume decreases as we move away from mid price
      const volumeFactor = Math.exp(-i / 5);
      const quantity = (totalQuantity / count) * volumeFactor;
      
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
  
  startSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (simulation.isRunning) {
      throw new Error(`Simulation ${id} is already running`);
    }
    
    // Update simulation state
    simulation.isRunning = true;
    simulation.isPaused = false;
    this.simulations.set(id, simulation);
    
    // Set up the simulation interval
    const interval = setInterval(() => {
      this.advanceSimulation(id);
    }, 100); // Update every 100ms
    
    this.simulationIntervals.set(id, interval);
  }
  
  pauseSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation) {
      throw new Error(`Simulation with ID ${id} not found`);
    }
    
    if (!simulation.isRunning || simulation.isPaused) {
      throw new Error(`Simulation ${id} is not running or already paused`);
    }
    
    // Update simulation state
    simulation.isPaused = true;
    this.simulations.set(id, simulation);
    
    // Clear the interval
    const interval = this.simulationIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.simulationIntervals.delete(id);
    }
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
    
    simulation.startTime = now;
    simulation.currentTime = now;
    simulation.endTime = now + (params.duration * 60 * 1000);
    simulation.isRunning = false;
    simulation.isPaused = false;
    simulation.priceHistory = [{
      timestamp: now,
      open: params.initialPrice,
      high: params.initialPrice,
      low: params.initialPrice,
      close: params.initialPrice,
      volume: 0
    }];
    simulation.currentPrice = params.initialPrice;
    simulation.orderBook = {
      bids: this.generateInitialOrderBook('bids', params.initialPrice, params.initialLiquidity),
      asks: this.generateInitialOrderBook('asks', params.initialPrice, params.initialLiquidity),
      lastUpdateTime: now
    };
    simulation.activePositions = [];
    simulation.closedPositions = [];
    simulation.recentTrades = [];
    
    this.simulations.set(id, simulation);
  }
  
  private advanceSimulation(id: string): void {
    const simulation = this.simulations.get(id);
    
    if (!simulation || !simulation.isRunning || simulation.isPaused) {
      return;
    }
    
    // Update the current time
    const timeStep = 100; // ms
    simulation.currentTime += timeStep;
    
    // Check if simulation has reached its end
    if (simulation.currentTime >= simulation.endTime) {
      this.pauseSimulation(id);
      return;
    }
    
    // Update the price
    this.updatePrice(simulation);
    
    // Process trader actions
    this.processTraderActions(simulation);
    
    // Update the order book
    this.updateOrderBook(simulation);
    
    // Broadcast the updates
    this.broadcastEvent(id, {
      type: 'price_update',
      timestamp: simulation.currentTime,
      data: {
        price: simulation.currentPrice,
        orderBook: simulation.orderBook
      }
    });
    
    // Save the updated simulation state
    this.simulations.set(id, simulation);
  }
  
  private updatePrice(simulation: SimulationState): void {
    const { marketConditions, currentPrice, parameters } = simulation;
    
    // Base volatility adjusted by the volatility factor
    const baseVolatility = marketConditions.volatility;
    
    // Random walk model with trend bias
    let trendFactor = 0;
    if (marketConditions.trend === 'bullish') trendFactor = 0.001;
    else if (marketConditions.trend === 'bearish') trendFactor = -0.001;
    
    // Random component (normal distribution around 0)
    const randomFactor = (Math.random() - 0.5) * baseVolatility;
    
    // Calculate price change
    const priceChange = currentPrice * (trendFactor + randomFactor);
    const newPrice = currentPrice + priceChange;
    
    // Update the current price
    simulation.currentPrice = Math.max(0.01, newPrice);
    
    // Add to price history (simplified - in reality we'd aggregate to timeframes)
    const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    
    // If we're in a new minute, create a new candle
    const inNewMinute = Math.floor(simulation.currentTime / 60000) > Math.floor(lastCandle.timestamp / 60000);
    
    if (inNewMinute) {
      simulation.priceHistory.push({
        timestamp: simulation.currentTime,
        open: simulation.currentPrice,
        high: simulation.currentPrice,
        low: simulation.currentPrice,
        close: simulation.currentPrice,
        volume: 0
      });
    } else {
      // Update the current candle
      lastCandle.close = simulation.currentPrice;
      lastCandle.high = Math.max(lastCandle.high, simulation.currentPrice);
      lastCandle.low = Math.min(lastCandle.low, simulation.currentPrice);
      
      simulation.priceHistory[simulation.priceHistory.length - 1] = lastCandle;
    }
  }
  
  private processTraderActions(simulation: SimulationState): void {
    // For each trader, decide if they should take action
    simulation.traders.forEach(trader => {
      const profile = trader;
      const { tradingFrequency } = profile;
      
      // Probability of action in this step
      const actionProbability = tradingFrequency * 0.01; // 0.01 = 1% chance per step for highest frequency
      
      if (Math.random() < actionProbability) {
        // Decide whether to enter or exit position
        this.processTraderDecision(simulation, trader);
      }
    });
  }
  
  private processTraderDecision(simulation: SimulationState, traderProfile: any): void {
    const trader = traderProfile.trader;
    
    // Check if trader has active position
    const activePosition = simulation.activePositions.find(p => p.trader.walletAddress === trader.walletAddress);
    
    if (activePosition) {
      // Decide whether to exit position
      this.processExitDecision(simulation, traderProfile, activePosition);
    } else {
      // Decide whether to enter position
      this.processEntryDecision(simulation, traderProfile);
    }
  }
  
  private processEntryDecision(simulation: SimulationState, traderProfile: any): void {
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
    const adjustedThreshold = entryThreshold * (1 - sentimentBoost);
    
    // Check if price movement exceeds threshold
    if (Math.abs(priceChange) > adjustedThreshold) {
      // Determine action based on price direction and trader's characteristics
      const action: TradeAction = priceChange > 0 ? 'buy' : 'sell';
      
      // Skip if this doesn't match trader's style
      if (trader.riskProfile === 'conservative' && priceChange < 0) return;
      
      // Calculate position size based on trader's profile
      const maxPositionValue = trader.totalVolume * 0.1 * positionSizing;
      const quantity = maxPositionValue / simulation.currentPrice;
      
      // Create a new position
      const position = {
        trader: trader,
        entryPrice: simulation.currentPrice,
        quantity: quantity,
        entryTime: simulation.currentTime,
        currentPnl: 0,
        currentPnlPercentage: 0
      };
      
      // Add to active positions
      simulation.activePositions.push(position);
      
      // Create a trade record
      const trade = {
        id: uuidv4(),
        timestamp: simulation.currentTime,
        trader: trader,
        action,
        price: simulation.currentPrice,
        quantity: quantity,
        value: simulation.currentPrice * quantity,
        impact: 0.0001 * (simulation.currentPrice * quantity) / simulation.marketConditions.volume
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
      
      // Update the last candle volume
      const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
      lastCandle.volume += trade.value;
      simulation.priceHistory[simulation.priceHistory.length - 1] = lastCandle;
    }
  }
  
  private processExitDecision(simulation: SimulationState, traderProfile: any, position: any): void {
    const { exitProfitThreshold, exitLossThreshold } = traderProfile;
    
    // Calculate current P&L
    const entryValue = position.entryPrice * position.quantity;
    const currentValue = simulation.currentPrice * position.quantity;
    const pnl = currentValue - entryValue;
    const pnlPercentage = pnl / entryValue;
    
    // Update position P&L
    position.currentPnl = pnl;
    position.currentPnlPercentage = pnlPercentage;
    
    // Check exit conditions
    const shouldTakeProfit = pnlPercentage >= exitProfitThreshold;
    const shouldCutLoss = pnlPercentage <= -exitLossThreshold;
    
    if (shouldTakeProfit || shouldCutLoss) {
      // Close the position
      this.closePosition(simulation, position);
    }
  }
  
  private closePosition(simulation: SimulationState, position: any): void {
    // Remove from active positions
    simulation.activePositions = simulation.activePositions.filter(
      p => p.trader.walletAddress !== position.trader.walletAddress
    );
    
    // Add to closed positions
    position.exitPrice = simulation.currentPrice;
    position.exitTime = simulation.currentTime;
    simulation.closedPositions.push(position);
    
    // Create a trade record
    const trade = {
      id: uuidv4(),
      timestamp: simulation.currentTime,
      trader: position.trader,
      action: position.currentPnl >= 0 ? 'sell' as TradeAction : 'buy' as TradeAction,
      price: simulation.currentPrice,
      quantity: position.quantity,
      value: simulation.currentPrice * position.quantity,
      impact: 0.0001 * (simulation.currentPrice * position.quantity) / simulation.marketConditions.volume
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
      data: {
        ...position,
        exitPrice: simulation.currentPrice,
        exitTime: simulation.currentTime
      }
    });
    
    // Update the last candle volume
    const lastCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    lastCandle.volume += trade.value;
    simulation.priceHistory[simulation.priceHistory.length - 1] = lastCandle;
  }
  
  private updateTraderRankings(simulation: SimulationState): void {
    // Calculate total P&L for each trader
    const traderPnL = new Map<string, number>();
    
    // Add P&L from closed positions
    simulation.closedPositions.forEach(position => {
      const walletAddress = position.trader.walletAddress;
      const currentPnL = traderPnL.get(walletAddress) || 0;
      traderPnL.set(walletAddress, currentPnL + position.currentPnl);
    });
    
    // Add P&L from active positions
    simulation.activePositions.forEach(position => {
      const walletAddress = position.trader.walletAddress;
      const currentPnL = traderPnL.get(walletAddress) || 0;
      traderPnL.set(walletAddress, currentPnL + position.currentPnl);
    });
    
    // Update trader rankings
    simulation.traderRankings = simulation.traders
      .map(profile => ({
        ...profile.trader,
        simulationPnl: traderPnL.get(profile.trader.walletAddress) || 0
      }))
      .sort((a, b) => (b.simulationPnl || 0) - (a.simulationPnl || 0));
  }
  
  private updateOrderBook(simulation: SimulationState): void {
    const { currentPrice, orderBook, marketConditions } = simulation;
    
    // Update timestamp
    orderBook.lastUpdateTime = simulation.currentTime;
    
    // Regenerate order book around current price
    // This is a simplified model; in reality, the order book would evolve more organically
    
    // Adjust spread based on volatility
    const spread = 0.001 * (1 + marketConditions.volatility * 5);
    
    // Create new bids and asks
    orderBook.bids = this.generateInitialOrderBook(
      'bids', 
      currentPrice * (1 - spread/2), 
      marketConditions.volume
    );
    
    orderBook.asks = this.generateInitialOrderBook(
      'asks', 
      currentPrice * (1 + spread/2), 
      marketConditions.volume
    );
  }
}

export const simulationManager = new SimulationManager();