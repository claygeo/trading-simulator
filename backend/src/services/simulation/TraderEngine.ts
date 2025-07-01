// backend/src/services/simulation/TraderEngine.ts - FIXED: Property initialization
import { v4 as uuidv4 } from 'uuid';
import { 
  SimulationState, 
  TraderProfile, 
  TraderPosition,
  Trade,
  ITraderEngine,
  TraderDecision,
  Timeframe,
  ExtendedSimulationState
} from './types';
import { TechnicalIndicators } from './TechnicalIndicators';
import { ObjectPool } from '../../utils/objectPool';
import { TransactionQueue } from '../transactionQueue';

export class TraderEngine implements ITraderEngine {
  // FIXED: Initialize in constructor
  private tradePool: ObjectPool<Trade>;
  private positionPool: ObjectPool<TraderPosition>;
  private transactionQueue?: TransactionQueue;
  private processedTradesCache: Map<string, Set<string>> = new Map();

  constructor(
    private getCurrentTimeframe: (simulationId: string) => Timeframe,
    private getTimeframeConfig: (timeframe: Timeframe) => any,
    private broadcastEvent: (simulationId: string, event: any) => void,
    private updateTradesBuffer?: (simulationId: string, trades: Trade[]) => void
  ) {
    // FIXED: Initialize object pools in constructor
    this.tradePool = new ObjectPool<Trade>(
      () => ({
        id: '',
        timestamp: 0,
        trader: {} as any,
        action: 'buy',
        price: 0,
        quantity: 0,
        value: 0,
        impact: 0
      }),
      (trade) => {
        trade.id = '';
        trade.timestamp = 0;
        trade.trader = {} as any;
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
        trader: {} as any,
        entryPrice: 0,
        quantity: 0,
        entryTime: 0,
        currentPnl: 0,
        currentPnlPercentage: 0
      }),
      (position) => {
        position.trader = {} as any;
        position.entryPrice = 0;
        position.quantity = 0;
        position.entryTime = 0;
        position.currentPnl = 0;
        position.currentPnlPercentage = 0;
      },
      2000
    );
  }

  setTransactionQueue(queue: TransactionQueue): void {
    this.transactionQueue = queue;
    console.log('Transaction queue connected to TraderEngine');
  }

  processTraderActions(simulation: ExtendedSimulationState): void {
    const traders = simulation.traders;
    const speed = simulation.parameters.timeCompressionFactor;
    
    // Smart trader selection based on market conditions
    const { volatility, trend, volume } = simulation.marketConditions;
    
    // Different trader types are active in different market conditions
    let activeTraderTypes: string[] = [];
    
    if (volatility > 0.02) {
      activeTraderTypes.push('scalper', 'momentum');
    }
    
    if (trend === 'bullish' || trend === 'bearish') {
      activeTraderTypes.push('momentum', 'swing');
    } else {
      activeTraderTypes.push('contrarian', 'position');
    }
    
    // If no specific types, use all
    if (activeTraderTypes.length === 0) {
      activeTraderTypes = ['scalper', 'momentum', 'swing', 'contrarian', 'position'];
    }
    
    // Filter traders by active types
    const activeTraders = traders.filter(t => 
      activeTraderTypes.includes(t.strategy) || !t.strategy
    );
    
    // SUPER ENHANCED: Much more aggressive trade generation
    const marketActivityScore = this.calculateMarketActivityScore(simulation);
    const basePercentage = 0.20 + (marketActivityScore * 0.30); // Increased from 0.10-0.25 to 0.20-0.50
    const speedMultiplier = Math.log2(speed + 1) * 1.5; // More aggressive multiplier
    const traderPercentage = Math.min(0.8, basePercentage * speedMultiplier); // Increased cap to 80%
    
    // Calculate number of traders to process
    const numTradersToProcess = Math.max(
      10, // Increased minimum from 5 to 10
      Math.floor(activeTraders.length * traderPercentage)
    );
    
    // Smart selection: prioritize traders who haven't traded recently
    const sortedTraders = [...activeTraders].sort((a, b) => {
      const aLastTrade = this.getLastTradeTime(simulation, a.trader.walletAddress);
      const bLastTrade = this.getLastTradeTime(simulation, b.trader.walletAddress);
      return aLastTrade - bLastTrade; // Prioritize traders who haven't traded in a while
    });
    
    const selectedTraders = sortedTraders.slice(0, numTradersToProcess);
    
    // Track trades generated in this tick
    const tradesGenerated: Trade[] = [];
    
    // Process each selected trader with MUCH MORE aggressive probability
    selectedTraders.forEach(traderProfile => {
      // SUPER ENHANCED: Very aggressive trading probability
      const opportunityExists = this.evaluateTradeOpportunity(simulation, traderProfile);
      const baseProb = opportunityExists ? 0.9 : 0.5; // Increased from 0.8:0.3
      const speedBonus = Math.min(0.2, speed / 100); // Bonus based on speed
      const shouldTrade = Math.random() < (baseProb + speedBonus);
      
      if (shouldTrade) {
        const trade = this.processTraderDecision(simulation, traderProfile);
        if (trade) {
          tradesGenerated.push(trade);
        }
      }
    });

    // Force trades if too few
    const minTradesPerTick = Math.max(5, Math.floor(speed / 10));
    if (tradesGenerated.length < minTradesPerTick) {
      const forcedCount = minTradesPerTick - tradesGenerated.length;
      const forcedTraders = [...simulation.traders]
        .sort(() => 0.5 - Math.random())
        .slice(0, forcedCount);

      forcedTraders.forEach(trader => {
        const trade = this.processTraderDecision(simulation, trader);
        if (trade) {
          tradesGenerated.push(trade);
        }
      });
    }

    // Force initial trades if none exist
    if (simulation.recentTrades.length === 0 && simulation.traders.length > 0) {
      const forcedTraderCount = Math.min(5, simulation.traders.length); // Increased from 3 to 5
      const randomTraders = [...simulation.traders].sort(() => 0.5 - Math.random()).slice(0, forcedTraderCount);

      randomTraders.forEach(trader => {
        const trade = this.processTraderDecision(simulation, trader);
        if (trade) {
          tradesGenerated.push(trade);
        }
      });

      console.log(`Forced ${forcedTraderCount} initial trades`);
    }
    
    // SUPER ENHANCED: Much more aggressive market maker activity
    const mmTrades = this.generateMarketMakerTrades(simulation, speed);
    tradesGenerated.push(...mmTrades);
    
    // FIXED: Convert to main Trade type before sending to queue
    const convertedTrades = tradesGenerated.map(trade => ({
      ...trade,
      trader: {
        ...trade.trader,
        position: trade.trader.position || 0,
        totalVolume: trade.trader.totalVolume || 0,
        buyVolume: trade.trader.buyVolume || 0,
        sellVolume: trade.trader.sellVolume || 0,
        tradeCount: trade.trader.tradeCount || 0,
        feesUsd: trade.trader.feesUsd || 0,
        winRate: trade.trader.winRate || 0.5,
        riskProfile: trade.trader.riskProfile || 'moderate' as const,
        portfolioEfficiency: trade.trader.portfolioEfficiency || 0
      }
    }));
    
    // Send all generated trades to transaction queue if available
    if (this.transactionQueue && convertedTrades.length > 0) {
      this.transactionQueue.addTrades(convertedTrades as any[], simulation.id).catch(err => {
        console.error('Failed to queue trades:', err);
      });
    }
    
    // Log trading activity periodically
    if (Math.random() < 0.05) { // 5% chance
      console.log(`Trading activity: ${tradesGenerated.length} trades from ${numTradersToProcess} traders (${activeTraderTypes.join(', ')} strategies active)`);
    }
  }

  // Calculate market activity score
  private calculateMarketActivityScore(simulation: ExtendedSimulationState): number {
    const recentTrades = simulation.recentTrades.filter(t => 
      simulation.currentTime - t.timestamp < 60000 // Last minute in simulation time
    );
    
    const tradeFrequency = recentTrades.length / 60; // Trades per second
    const priceMovement = Math.abs(
      (simulation.currentPrice - simulation.priceHistory[simulation.priceHistory.length - 10]?.close || simulation.currentPrice) 
      / simulation.currentPrice
    );
    
    const volumeScore = Math.min(1, simulation.marketConditions.volume / simulation.parameters.initialLiquidity);
    
    // Combine factors
    return Math.min(1, tradeFrequency * 0.3 + priceMovement * 50 + volumeScore * 0.2);
  }

  // Get last trade time for a trader
  private getLastTradeTime(simulation: ExtendedSimulationState, walletAddress: string): number {
    const lastTrade = simulation.recentTrades.find(t => 
      t.trader && t.trader.walletAddress === walletAddress
    );
    return lastTrade ? lastTrade.timestamp : 0;
  }

  // Evaluate if trader should trade based on their strategy
  private evaluateTradeOpportunity(simulation: ExtendedSimulationState, trader: TraderProfile): boolean {
    const { strategy } = trader;
    const { volatility, trend } = simulation.marketConditions;
    const priceHistory = simulation.priceHistory.slice(-20);
    
    if (priceHistory.length < 5) return false;
    
    // Calculate technical indicators
    const sma5 = TechnicalIndicators.calculateSMA(priceHistory.slice(-5));
    const sma20 = TechnicalIndicators.calculateSMA(priceHistory);
    const rsi = TechnicalIndicators.calculateRSI(priceHistory);
    
    // Strategy-specific opportunity detection
    switch (strategy) {
      case 'scalper':
        // Scalpers love volatility and quick moves
        const priceChange = Math.abs((simulation.currentPrice - priceHistory[priceHistory.length - 2].close) / simulation.currentPrice);
        return volatility > 0.015 && priceChange > 0.001;
        
      case 'swing':
        // Swing traders look for trend confirmations
        if (trend === 'bullish' && simulation.currentPrice > sma5 && sma5 > sma20) {
          return true;
        }
        if (trend === 'bearish' && simulation.currentPrice < sma5 && sma5 < sma20) {
          return true;
        }
        return false;
        
      case 'momentum':
        // Momentum traders follow strong moves
        const momentum = (simulation.currentPrice - priceHistory[priceHistory.length - 5].close) / simulation.currentPrice;
        return Math.abs(momentum) > 0.01 && (
          (momentum > 0 && rsi < 70) || (momentum < 0 && rsi > 30)
        );
        
      case 'contrarian':
        // Contrarians trade against extremes
        return rsi > 75 || rsi < 25;
        
      default:
        // Default traders are less sophisticated
        return volatility > 0.01 && Math.random() < 0.3;
    }
  }

  // Generate smarter market maker trades with SUPER ENHANCED logic
  private generateMarketMakerTrades(simulation: ExtendedSimulationState, speed: number): Trade[] {
    const trades: Trade[] = [];
    const { volatility, volume } = simulation.marketConditions;
    
    // SUPER ENHANCED: Many more market maker trades
    const baseMMTrades = volatility > 0.02 ? 10 : 5; // Increased from 5:3
    const speedAdjusted = Math.ceil(baseMMTrades * Math.log2(speed + 1) * 2); // More aggressive
    
    for (let i = 0; i < speedAdjusted; i++) {
      if (Math.random() < 0.95) { // Increased from 0.9 to 0.95
        const spread = this.calculateOptimalSpread(simulation);
        const side = this.determineMakerSide(simulation);
        
        const trade = this.tradePool.acquire();
        trade.id = `mm-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
        trade.timestamp = simulation.currentTime; // Use simulation time
        trade.trader = {
          walletAddress: 'market-maker',
          avatarUrl: '',
          preferredName: 'Market Maker',
          netPnl: 0
        };
        trade.action = side;
        
        // Market makers trade at the spread
        trade.price = side === 'buy' 
          ? simulation.currentPrice * (1 - spread)
          : simulation.currentPrice * (1 + spread);
        
        // Larger sizes for more volume
        const baseSize = simulation.currentPrice < 1 ? 20000 : 5000; // Increased sizes
        const volatilityMultiplier = 1 + volatility * 30; // Increased multiplier
        trade.quantity = (Math.random() * baseSize * volatilityMultiplier) + 500;
        
        trade.value = trade.price * trade.quantity;
        trade.impact = (trade.quantity / simulation.parameters.initialLiquidity) * 0.0003; // Increased impact
        
        trades.push(trade);
        
        // Update price immediately for market maker trades
        simulation.currentPrice *= (1 + (side === 'buy' ? trade.impact : -trade.impact));
      }
    }
    
    return trades;
  }

  // Calculate optimal spread based on market conditions
  private calculateOptimalSpread(simulation: ExtendedSimulationState): number {
    const { volatility } = simulation.marketConditions;
    const baseSpread = 0.001; // 0.1% base
    const volatilityAdjustment = volatility * 0.5;
    return Math.min(0.005, baseSpread + volatilityAdjustment); // Max 0.5% spread
  }

  // Determine which side market maker should take
  private determineMakerSide(simulation: ExtendedSimulationState): 'buy' | 'sell' {
    const { trend } = simulation.marketConditions;
    const orderImbalance = this.calculateOrderImbalance(simulation);
    
    // Market makers provide liquidity against the flow
    if (orderImbalance > 0.1) return 'sell'; // Too many buyers, provide sells
    if (orderImbalance < -0.1) return 'buy'; // Too many sellers, provide buys
    
    // Otherwise, slight bias based on trend
    if (trend === 'bullish') return Math.random() < 0.6 ? 'sell' : 'buy';
    if (trend === 'bearish') return Math.random() < 0.6 ? 'buy' : 'sell';
    
    return Math.random() > 0.5 ? 'buy' : 'sell';
  }

  // Calculate order book imbalance
  private calculateOrderImbalance(simulation: ExtendedSimulationState): number {
    const { bids, asks } = simulation.orderBook;
    
    const bidVolume = bids.slice(0, 5).reduce((sum, bid) => sum + bid.quantity, 0);
    const askVolume = asks.slice(0, 5).reduce((sum, ask) => sum + ask.quantity, 0);
    
    const totalVolume = bidVolume + askVolume;
    if (totalVolume === 0) return 0;
    
    return (bidVolume - askVolume) / totalVolume;
  }

  // Add method to simulate market maker activity
  private processMarketMakerActivity(simulation: ExtendedSimulationState): void {
    const speed = simulation.parameters.timeCompressionFactor;
    
    // Market makers trade more frequently at higher speeds
    const mmTradesPerTick = Math.ceil(speed / 2);
    
    for (let i = 0; i < mmTradesPerTick; i++) {
      if (Math.random() < 0.7) { // 70% chance per attempt
        const trade = this.generateMarketMakerTrade(simulation);
        if (trade) {
          simulation.recentTrades.unshift(trade);
          this.updatePriceFromTrade(simulation, trade);
        }
      }
    }
  }

  // Generate market maker trades
  private generateMarketMakerTrade(simulation: ExtendedSimulationState): Trade | null {
    const currentPrice = simulation.currentPrice;
    const action = Math.random() > 0.5 ? 'buy' : 'sell';
    
    // Market makers trade near the spread
    const spreadPercentage = 0.001; // 0.1% spread
    const price = action === 'buy' 
      ? currentPrice * (1 - spreadPercentage)
      : currentPrice * (1 + spreadPercentage);
    
    const trade = this.tradePool.acquire();
    trade.id = `mm-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
    trade.timestamp = simulation.currentTime; // Use simulation time
    trade.trader = {
      walletAddress: 'market-maker',
      avatarUrl: '',
      preferredName: 'Market Maker',
      netPnl: 0
    };
    trade.action = action;
    trade.price = price;
    trade.quantity = Math.random() * 1000 + 100;
    trade.value = trade.price * trade.quantity;
    trade.impact = (trade.quantity / 100000) * 0.0005; // Smaller impact for MM trades
    
    return trade;
  }

  // Helper method to update price from trade
  private updatePriceFromTrade(simulation: ExtendedSimulationState, trade: Trade): void {
    // Update current price based on trade
    const priceImpact = trade.action === 'buy' ? trade.impact : -trade.impact;
    simulation.currentPrice = simulation.currentPrice * (1 + priceImpact);
    
    // Update volume on current candle
    const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    if (currentCandle) {
      currentCandle.volume += trade.quantity;
    }
  }

  processTraderActionsBatch(simulation: SimulationState, batchSize: number): void {
    // Increase action probability based on batch size
    const actionMultiplier = Math.min(batchSize, 10);

    // Sample a subset of traders for efficiency
    const traderSample = this.getRandomTraderSample(simulation.traders, Math.min(50, simulation.traders.length));

    // Track trades generated in this batch
    const tradesGenerated: Trade[] = [];

    traderSample.forEach((trader: TraderProfile) => {
      const { tradingFrequency } = trader;

      // Adjusted probability for batch processing
      const actionProbability = tradingFrequency * 0.05 * actionMultiplier;

      if (Math.random() < actionProbability) {
        const trade = this.processTraderDecision(simulation, trader);
        if (trade) {
          tradesGenerated.push(trade);
        }
      }
    });

    // Force initial trades if needed
    if (simulation.recentTrades.length === 0 && simulation.traders.length > 0) {
      const forcedTraderCount = Math.min(3, simulation.traders.length);
      const randomTraders = [...simulation.traders].sort(() => 0.5 - Math.random()).slice(0, forcedTraderCount);

      randomTraders.forEach(trader => {
        const trade = this.processTraderDecision(simulation, trader);
        if (trade) {
          tradesGenerated.push(trade);
        }
      });
    }

    // FIXED: Convert trades before sending to queue
    const convertedTrades = tradesGenerated.map(trade => ({
      ...trade,
      trader: {
        ...trade.trader,
        position: trade.trader.position || 0,
        totalVolume: trade.trader.totalVolume || 0,
        buyVolume: trade.trader.buyVolume || 0,
        sellVolume: trade.trader.sellVolume || 0,
        tradeCount: trade.trader.tradeCount || 0,
        feesUsd: trade.trader.feesUsd || 0,
        winRate: trade.trader.winRate || 0.5,
        riskProfile: trade.trader.riskProfile || 'moderate' as const,
        portfolioEfficiency: trade.trader.portfolioEfficiency || 0
      }
    }));

    // Send batch to transaction queue
    if (this.transactionQueue && convertedTrades.length > 0) {
      this.transactionQueue.addTrades(convertedTrades as any[], simulation.id).catch(err => {
        console.error('Failed to queue batch trades:', err);
      });
    }
  }

  applyTraderBehaviorModifiers(simulationId: string, modifiers: any): void {
    // This would need access to the simulation - implement in main manager
    console.log(`Applying trader behavior modifiers for simulation ${simulationId}:`, modifiers);
  }

  processTraderDecisionParallel(traders: TraderProfile[], marketData: any): TraderDecision[] {
    const decisions: TraderDecision[] = [];

    traders.forEach(trader => {
      const decision = this.evaluateTraderDecision(trader, marketData);
      if (decision.action !== 'hold') {
        decisions.push(decision);
      }
    });

    return decisions;
  }

  updatePositionsPnL(simulation: SimulationState): void {
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

  updateTraderRankings(simulation: SimulationState): void {
    // Sort traders by net PnL
    simulation.traderRankings = [...simulation.traders]
      .map(profile => profile.trader)
      .sort((a, b) => (b.netPnl || 0) - (a.netPnl || 0));
  }

  // Method to integrate processed trades from the transaction queue
  integrateProcessedTrades(simulation: ExtendedSimulationState, processedTrades: Trade[]): void {
    if (!this.processedTradesCache.has(simulation.id)) {
      this.processedTradesCache.set(simulation.id, new Set());
    }
    
    const cache = this.processedTradesCache.get(simulation.id)!;
    
    processedTrades.forEach(trade => {
      // Skip if we've already integrated this trade
      if (cache.has(trade.id)) return;
      
      cache.add(trade.id);
      
      // Add to recent trades if not already there
      const exists = simulation.recentTrades.some(t => t.id === trade.id);
      if (!exists) {
        simulation.recentTrades.unshift(trade);
        
        // Update volume on current candle
        const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
        if (currentCandle) {
          currentCandle.volume += Math.abs(trade.quantity);
        }
        
        // Broadcast the trade
        this.broadcastEvent(simulation.id, {
          type: 'processed_trade',
          timestamp: simulation.currentTime, // Use simulation time
          data: trade
        });
      }
    });
    
    // Maintain cache size
    if (cache.size > 10000) {
      const entriesToDelete = Array.from(cache).slice(0, 5000);
      entriesToDelete.forEach(id => cache.delete(id));
    }
    
    // Keep recent trades limited
    if (simulation.recentTrades.length > 500) {
      const removed = simulation.recentTrades.splice(500);
      removed.forEach(trade => this.tradePool.release(trade));
    }
  }

  private processTraderDecision(simulation: SimulationState, trader: TraderProfile): Trade | null {
    const existingPosition = simulation.activePositions.find(
      p => p.trader.walletAddress === trader.trader.walletAddress
    );

    if (existingPosition) {
      // Trader has a position - decide if they should exit
      const shouldExit = this.shouldExitPosition(simulation, trader, existingPosition);

      if (shouldExit) {
        return this.closePosition(simulation, existingPosition, trader);
      }
    } else {
      // Trader has no position - decide if they should enter
      const shouldEnter = this.shouldEnterPosition(simulation, trader);

      if (shouldEnter) {
        return this.openPosition(simulation, trader);
      }
    }

    return null;
  }

  private evaluateTraderDecision(trader: TraderProfile, marketData: any): TraderDecision {
    // Simplified decision logic for parallel processing
    const { currentPrice, priceHistory, marketConditions } = marketData;
    const hasPosition = marketData.activePositions.some(
      (p: any) => p.walletAddress === trader.trader.walletAddress
    );

    if (hasPosition) {
      // Evaluate exit conditions
      const position = marketData.activePositions.find(
        (p: any) => p.walletAddress === trader.trader.walletAddress
      );
      
      const pnlPercentage = this.calculatePnL(position, currentPrice);
      
      if (this.shouldExitBasedOnStrategy(trader, pnlPercentage, position)) {
        return {
          action: 'exit',
          walletAddress: trader.trader.walletAddress,
          reason: 'Strategy exit signal'
        };
      }
    } else {
      // Evaluate entry conditions
      if (this.shouldEnterBasedOnStrategy(trader, marketData)) {
        const quantity = this.calculatePositionSize(trader, currentPrice);
        return {
          action: 'enter',
          walletAddress: trader.trader.walletAddress,
          quantity,
          reason: 'Strategy entry signal'
        };
      }
    }

    // FIXED: Add required reason property
    return {
      action: 'hold',
      walletAddress: trader.trader.walletAddress,
      reason: 'No trading opportunity detected'
    };
  }

  private shouldEnterPosition(simulation: SimulationState, trader: TraderProfile): boolean {
    const { marketConditions, currentPrice, priceHistory } = simulation;
    const { strategy } = trader;

    // Get recent price data
    const recentPrices = priceHistory.slice(-20);
    if (recentPrices.length < 5) return false;

    // Calculate technical indicators
    const sma5 = TechnicalIndicators.calculateSMA(recentPrices.slice(-5));
    const sma20 = TechnicalIndicators.calculateSMA(recentPrices);
    const rsi = TechnicalIndicators.calculateRSI(recentPrices);

    // Adjust entry thresholds based on price level
    const priceLevel = currentPrice;
    const volatilityThreshold = priceLevel < 1 ? 0.03 : 0.015;

    // Strategy-based entry logic
    switch (strategy) {
      case 'scalper':
        return Math.random() < 0.3 && marketConditions.volatility > volatilityThreshold;

      case 'swing':
        if (marketConditions.trend === 'bullish' && currentPrice > sma5) {
          return Math.random() < 0.4;
        } else if (marketConditions.trend === 'bearish' && currentPrice < sma5) {
          return Math.random() < 0.4;
        }
        return false;

      case 'momentum':
        if (marketConditions.trend === 'bullish' && currentPrice > sma20 && rsi < 70) {
          return Math.random() < 0.5;
        } else if (marketConditions.trend === 'bearish' && currentPrice < sma20 && rsi > 30) {
          return Math.random() < 0.5;
        }
        return false;

      case 'contrarian':
        if (rsi > 70 || rsi < 30) {
          return Math.random() < 0.6;
        }
        return false;

      default:
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

    // Time in position (using simulation time)
    const timeInPosition = simulation.currentTime - position.entryTime;
    const minutesInPosition = timeInPosition / (60 * 1000);

    // Adjust exit thresholds based on price level
    const priceLevel = currentPrice;
    const profitMultiplier = priceLevel < 1 ? 2 : 1;
    const lossMultiplier = priceLevel < 1 ? 1.5 : 1;

    // Strategy-based exit logic
    switch (strategy) {
      case 'scalper':
        if (pnlPercentage > 0.005 * profitMultiplier || pnlPercentage < -0.003 * lossMultiplier) return true;
        if (minutesInPosition > 30) return true;
        return false;

      case 'swing':
        if (pnlPercentage > 0.02 * profitMultiplier || pnlPercentage < -0.01 * lossMultiplier) return true;
        if (minutesInPosition > 180) return Math.random() < 0.3;
        return false;

      case 'momentum':
        if (pnlPercentage > 0.03 * profitMultiplier || pnlPercentage < -0.015 * lossMultiplier) return true;
        if (minutesInPosition > 120 && pnlPercentage > 0) return Math.random() < 0.2;
        return false;

      case 'contrarian':
        if (pnlPercentage > 0.015 * profitMultiplier || pnlPercentage < -0.02 * lossMultiplier) return true;
        if (minutesInPosition > 90) return Math.random() < 0.4;
        return false;

      default:
        if (pnlPercentage > 0.01 * profitMultiplier || pnlPercentage < -0.005 * lossMultiplier) return true;
        if (minutesInPosition > 60) return Math.random() < 0.5;
        return false;
    }
  }

  private shouldEnterBasedOnStrategy(trader: TraderProfile, marketData: any): boolean {
    // Simplified entry logic for parallel processing
    const { strategy } = trader;
    const { marketConditions, currentPrice } = marketData;

    switch (strategy) {
      case 'scalper':
        return Math.random() < 0.3 && marketConditions.volatility > 0.015;
      case 'momentum':
        return marketConditions.trend === 'bullish' && Math.random() < 0.4;
      case 'contrarian':
        return marketConditions.trend === 'bearish' && Math.random() < 0.4;
      default:
        return Math.random() < 0.2;
    }
  }

  private shouldExitBasedOnStrategy(trader: TraderProfile, pnlPercentage: number, position: any): boolean {
    const { strategy } = trader;
    const timeInPosition = position.entryTime ? Date.now() - position.entryTime : 0; // Fallback if simulation time not available
    const minutesInPosition = timeInPosition / (60 * 1000);

    switch (strategy) {
      case 'scalper':
        return pnlPercentage > 0.005 || pnlPercentage < -0.003 || minutesInPosition > 30;
      case 'swing':
        return pnlPercentage > 0.02 || pnlPercentage < -0.01 || minutesInPosition > 180;
      default:
        return pnlPercentage > 0.01 || pnlPercentage < -0.005 || minutesInPosition > 60;
    }
  }

  private calculatePnL(position: any, currentPrice: number): number {
    const entryValue = Math.abs(position.quantity) * position.entryPrice;
    const currentValue = Math.abs(position.quantity) * currentPrice;
    const pnl = position.quantity > 0 ? currentValue - entryValue : entryValue - currentValue;
    return pnl / entryValue;
  }

  private calculatePositionSize(trader: TraderProfile, currentPrice: number): number {
    const { positionSizing } = trader;
    const baseSize = currentPrice < 1 ? 5000 : currentPrice < 10 ? 7500 : 10000;
    const sizeMultiplier = positionSizing === 'aggressive' ? 3 : positionSizing === 'moderate' ? 1.5 : 1;
    const positionValue = baseSize * sizeMultiplier * (0.5 + Math.random());
    return positionValue / currentPrice;
  }

  private openPosition(simulation: SimulationState, trader: TraderProfile): Trade | null {
    const { currentPrice, marketConditions } = simulation;
    const { positionSizing, trader: traderData } = trader;

    // CRITICAL FIX: Ensure we use consistent simulation time
    const tradeTimestamp = simulation.currentTime;

    // Determine position direction
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

    // Calculate position size
    const quantity = this.calculatePositionSize(trader, currentPrice);
    const positionQuantity = isLong ? quantity : -quantity;

    // Create position using object pool
    const position = this.positionPool.acquire();
    position.trader = traderData;
    position.entryPrice = currentPrice;
    position.quantity = positionQuantity;
    position.entryTime = tradeTimestamp; // FIXED: Use consistent timestamp
    position.currentPnl = 0;
    position.currentPnlPercentage = 0;

    // Add to active positions
    simulation.activePositions.push(position);

    // Create trade record
    const trade = this.tradePool.acquire();
    trade.id = uuidv4();
    trade.timestamp = tradeTimestamp; // FIXED: Use consistent timestamp
    trade.trader = traderData;
    trade.action = isLong ? 'buy' : 'sell';
    trade.price = currentPrice;
    trade.quantity = Math.abs(positionQuantity);
    trade.value = currentPrice * Math.abs(positionQuantity);
    trade.impact = 0.0001 * trade.value / marketConditions.volume;

    // Add to recent trades
    simulation.recentTrades.unshift(trade);
    if (simulation.recentTrades.length > 500) {
      const removed = simulation.recentTrades.pop();
      if (removed) this.tradePool.release(removed);
    }

    // Update trades buffer if callback provided
    if (this.updateTradesBuffer) {
      this.updateTradesBuffer(simulation.id, [trade]);
    }

    // Update volume on current candle
    const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
    if (currentCandle) {
      currentCandle.volume += Math.abs(positionQuantity);
    }

    // Broadcast trade event
    this.broadcastEvent(simulation.id, {
      type: 'trade',
      timestamp: tradeTimestamp, // FIXED: Use consistent timestamp
      data: trade
    });

    return trade;
  }

  private closePosition(simulation: SimulationState, position: TraderPosition, trader: TraderProfile): Trade | null {
    const { currentPrice } = simulation;
    const exitTime = simulation.currentTime; // Use simulation time

    // Calculate final P&L
    const isLong = position.quantity > 0;
    const entryValue = Math.abs(position.quantity) * position.entryPrice;
    const exitValue = Math.abs(position.quantity) * currentPrice;
    const pnl = isLong ? exitValue - entryValue : entryValue - exitValue;
    const pnlPercentage = pnl / entryValue;

    // Create exit trade
    const trade = this.tradePool.acquire();
    trade.id = uuidv4();
    trade.timestamp = exitTime; // Use simulation time
    trade.trader = position.trader;
    trade.action = isLong ? 'sell' : 'buy';
    trade.price = currentPrice;
    trade.quantity = Math.abs(position.quantity);
    trade.value = currentPrice * Math.abs(position.quantity);
    trade.impact = 0.0001 * trade.value / simulation.marketConditions.volume;

    // Add to recent trades
    simulation.recentTrades.unshift(trade);
    if (simulation.recentTrades.length > 500) {
      const removed = simulation.recentTrades.pop();
      if (removed) this.tradePool.release(removed);
    }

    // Update trades buffer if callback provided
    if (this.updateTradesBuffer) {
      this.updateTradesBuffer(simulation.id, [trade]);
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
    if (currentCandle) {
      currentCandle.volume += Math.abs(position.quantity);
    }

    // Update trader rankings
    this.updateTraderRankings(simulation);

    // Broadcast trade event
    this.broadcastEvent(simulation.id, {
      type: 'trade',
      timestamp: exitTime, // Use simulation time
      data: trade
    });

    return trade;
  }

  private getRandomTraderSample(traders: TraderProfile[], sampleSize: number): TraderProfile[] {
    const shuffled = [...traders];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleSize);
  }

  // Cleanup method
  cleanup(): void {
    this.processedTradesCache.clear();
    console.log('TraderEngine cleanup complete');
  }
}