// backend/src/services/simulation/DataGenerator.ts - FIXED: Property initialization
import { v4 as uuidv4 } from 'uuid';
import {
  SimulationState,
  TraderProfile,
  TraderPosition,
  Trade,
  PricePoint,
  SIMULATION_CONSTANTS,
  Trader
} from './types';
import { ObjectPool } from '../../utils/objectPool';

export class DataGenerator {
  // FIXED: Initialize pools in constructor
  private tradePool: ObjectPool<Trade>;
  private positionPool: ObjectPool<TraderPosition>;

  constructor() {
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

  // CRITICAL FIX: Modified to NOT generate initial positions and trades for clean start
  generateInitialPositionsAndTrades(simulation: SimulationState): void {
    console.log('🎯 CLEAN START: Skipping initial positions and trades generation');
    console.log('📊 Chart will remain empty until simulation starts and generates real activity');
    
    // CRITICAL: DO NOT generate any initial trades or positions
    // This ensures the chart starts completely empty and builds in real-time
    
    // Keep active positions empty
    simulation.activePositions = [];
    simulation.closedPositions = [];
    simulation.recentTrades = [];
    
    // Initialize trader rankings based on existing trader data (no new trades)
    this.updateTraderRankings(simulation);
    
    console.log(`✅ Clean initialization complete:`);
    console.log(`   Active positions: ${simulation.activePositions.length}`);
    console.log(`   Closed positions: ${simulation.closedPositions.length}`);
    console.log(`   Recent trades: ${simulation.recentTrades.length}`);
    console.log(`   Chart will build from zero when simulation starts`);
  }

  // BACKUP: Original method renamed for potential future use
  generateInitialPositionsAndTradesOLD(simulation: SimulationState): void {
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
        this.generateClosedPosition(simulation, trader, now, currentPrice);
      }
    });

    // Update trader rankings based on PnL
    this.updateTraderRankings(simulation);

    // Limit recent trades to last 100
    if (simulation.recentTrades.length > SIMULATION_CONSTANTS.MAX_RECENT_TRADES) {
      simulation.recentTrades = simulation.recentTrades.slice(0, SIMULATION_CONSTANTS.MAX_RECENT_TRADES);
    }
  }

  // MODIFIED: Only used for runtime position generation (not initial)
  generateLivePosition(
    simulation: SimulationState, 
    trader: TraderProfile, 
    timestamp: number, 
    currentPrice: number
  ): void {
    // Only generate positions during live simulation (not at initialization)
    if (!simulation.isRunning) {
      console.log('Skipping position generation - simulation not running');
      return;
    }

    // Determine if long or short position
    const isLong = Math.random() > 0.4; // 60% long bias

    // Calculate realistic position size based on token price
    const basePositionValue = 5000 + Math.random() * 45000; // $5K to $50K position
    const quantity = basePositionValue / currentPrice;

    // Apply direction
    const positionQuantity = isLong ? quantity : -quantity;

    // Create entry price with slight variation
    const entryPriceVariation = (Math.random() - 0.5) * 0.005; // ±0.25% variation
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
    position.entryTime = timestamp;
    position.currentPnl = pnl;
    position.currentPnlPercentage = pnlPercentage;

    // Add to active positions
    simulation.activePositions.push(position);

    // Create a corresponding trade record
    const trade = this.tradePool.acquire();
    trade.id = uuidv4();
    trade.timestamp = timestamp;
    trade.trader = trader.trader;
    trade.action = isLong ? 'buy' : 'sell';
    trade.price = entryPrice;
    trade.quantity = Math.abs(positionQuantity);
    trade.value = entryPrice * Math.abs(positionQuantity);
    trade.impact = 0.0001 * (entryPrice * Math.abs(positionQuantity)) / simulation.marketConditions.volume;

    // Add to recent trades
    simulation.recentTrades.unshift(trade);

    console.log(`💼 Live position generated: ${trader.trader.walletAddress} ${isLong ? 'LONG' : 'SHORT'} ${Math.abs(positionQuantity).toFixed(2)} @ $${entryPrice.toFixed(4)}`);
  }

  private generateClosedPosition(
    simulation: SimulationState, 
    trader: TraderProfile, 
    now: number, 
    currentPrice: number
  ): void {
    // This method is now only used during live simulation, not initialization
    console.log('Generating closed position during live simulation');
    
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
    if (simulation.recentTrades.length < SIMULATION_CONSTANTS.MAX_RECENT_TRADES - 2) {
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
    const traderIndex = simulation.traders.findIndex((t: TraderProfile) => 
      t.trader.walletAddress === trader.trader.walletAddress
    );
    if (traderIndex !== -1) {
      simulation.traders[traderIndex].trader.netPnl = 
        (simulation.traders[traderIndex].trader.netPnl || 0) + closedPnl;
    }
  }

  generateDummyTraders(count: number = 10): Trader[] {
    console.log(`Generating ${count} dummy traders`);
    
    return Array.from({ length: count }, (_, i) => ({
      position: i + 1, // FIXED: Make position required
      walletAddress: `Trader${i+1}`,
      netPnl: Math.random() * 10000 - 5000,
      totalVolume: 10000 + Math.random() * 90000,
      buyVolume: 5000 + Math.random() * 45000,
      sellVolume: 5000 + Math.random() * 45000,
      tradeCount: 10 + Math.floor(Math.random() * 90),
      feesUsd: 50 + Math.random() * 450,
      winRate: 0.4 + Math.random() * 0.3,
      riskProfile: ['conservative', 'moderate', 'aggressive'][Math.floor(Math.random() * 3)] as 'conservative' | 'moderate' | 'aggressive',
      portfolioEfficiency: (Math.random() * 0.2) - 0.1
    }));
  }

  determineRiskProfile(trader: any): 'conservative' | 'moderate' | 'aggressive' {
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

  private updateTraderRankings(simulation: SimulationState): void {
    // Sort traders by net PnL (based on existing data, not new trades)
    simulation.traderRankings = [...simulation.traders]
      .map(profile => profile.trader)
      .sort((a, b) => (b.netPnl || 0) - (a.netPnl || 0));
    
    console.log(`📊 Trader rankings updated: ${simulation.traderRankings.length} traders`);
  }

  // NEW: Method to generate live trades during simulation (not at initialization)
  generateLiveTrade(
    simulation: SimulationState,
    trader: TraderProfile,
    action: 'buy' | 'sell',
    timestamp: number,
    currentPrice: number
  ): Trade | null {
    // Only generate trades during live simulation
    if (!simulation.isRunning) {
      return null;
    }

    const priceVariation = (Math.random() - 0.5) * 0.002; // ±0.1% variation
    const price = currentPrice * (1 + priceVariation);
    
    const trade = this.tradePool.acquire();
    trade.id = uuidv4();
    trade.timestamp = timestamp;
    trade.trader = trader.trader;
    trade.action = action;
    trade.price = price;
    trade.quantity = Math.random() * 5000 + 500; // 500-5500 tokens
    trade.value = trade.price * trade.quantity;
    trade.impact = (trade.quantity / simulation.parameters.initialLiquidity) * 0.0001;
    
    console.log(`💰 Live trade generated: ${trader.trader.walletAddress} ${action.toUpperCase()} ${trade.quantity.toFixed(2)} @ $${price.toFixed(4)}`);
    
    return trade;
  }

  // Release pooled objects
  releasePosition(position: TraderPosition): void {
    this.positionPool.release(position);
  }

  releaseTrade(trade: Trade): void {
    this.tradePool.release(trade);
  }

  cleanup(): void {
    // Object pools will be garbage collected
    console.log('DataGenerator cleanup complete');
  }
}