// backend/src/services/simulation/TraderEngine.ts - COMPLETE ENHANCED VERSION
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
    // Initialize object pools
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

  // CRITICAL FIX: Dramatically enhanced trading activity with 118 real participants
  processTraderActions(simulation: ExtendedSimulationState): void {
    const traders = simulation.traders; // These are the 118 real Dune Analytics traders
    const speed = simulation.parameters.timeCompressionFactor;
    
    // ENHANCED: Calculate simulation mode based on speed
    const simulationMode = this.getSimulationMode(speed);
    console.log(`🎯 [TRADING MODE] ${simulationMode.name}: Targeting ${simulationMode.tradesPerTick} trades/tick from ${traders.length} real participants`);
    
    // FORCE MASSIVE TRADING ACTIVITY
    const tradesGenerated: Trade[] = [];
    
    // 1. FORCE REAL PARTICIPANTS TO BE ACTIVE (118 Dune Analytics traders)
    this.forceParticipantActivity(simulation, tradesGenerated, simulationMode);
    
    // 2. GENERATE MARKET MAKER ACTIVITY
    this.generateMarketMakerActivity(simulation, tradesGenerated, simulationMode);
    
    // 3. GENERATE RETAIL TRADING ACTIVITY  
    this.generateRetailActivity(simulation, tradesGenerated, simulationMode);
    
    // 4. GENERATE POSITION OPENINGS/CLOSINGS
    this.generatePositionActivity(simulation, tradesGenerated, simulationMode);
    
    // 5. ENSURE MINIMUM ACTIVITY THRESHOLD
    this.ensureMinimumActivity(simulation, tradesGenerated, simulationMode);
    
    // 6. UPDATE TRADER POSITIONS AND RANKINGS
    this.updateTraderStatsFromTrades(simulation, tradesGenerated);
    
    // Convert and queue all trades
    if (this.transactionQueue && tradesGenerated.length > 0) {
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
      
      this.transactionQueue.addTrades(convertedTrades as any[], simulation.id).catch(err => {
        console.error('Failed to queue trades:', err);
      });
    }
    
    // Add trades to simulation for immediate candle volume
    tradesGenerated.forEach(trade => {
      simulation.recentTrades.unshift(trade);
    });
    
    // Limit recent trades to prevent memory issues
    if (simulation.recentTrades.length > 2000) {
      simulation.recentTrades = simulation.recentTrades.slice(0, 2000);
    }
    
    console.log(`🚀 [TRADING COMPLETE] Generated ${tradesGenerated.length} trades in ${simulationMode.name} mode`);
    console.log(`📊 [CHART IMPACT] Total volume: ${tradesGenerated.reduce((sum, t) => sum + t.quantity, 0).toFixed(0)} tokens`);
  }

  // NEW: Determine simulation mode based on speed (Normal/Medium/Fast)
  private getSimulationMode(speed: number): {
    name: string;
    tradesPerTick: number;
    participantActivityRate: number;
    positionActivityRate: number;
    marketMakerMultiplier: number;
  } {
    if (speed <= 5) {
      return {
        name: "NORMAL",
        tradesPerTick: 25,
        participantActivityRate: 0.20, // 20% of 118 participants active per tick
        positionActivityRate: 0.15,
        marketMakerMultiplier: 1
      };
    } else if (speed <= 15) {
      return {
        name: "MEDIUM", 
        tradesPerTick: 75,
        participantActivityRate: 0.35, // 35% active
        positionActivityRate: 0.25,
        marketMakerMultiplier: 2
      };
    } else {
      return {
        name: "FAST",
        tradesPerTick: 150,
        participantActivityRate: 0.50, // 50% active
        positionActivityRate: 0.35,
        marketMakerMultiplier: 3
      };
    }
  }

  // NEW: Force real 118 Dune Analytics participants to be active
  private forceParticipantActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const { traders } = simulation; // These are the 118 real Dune Analytics traders
    const activeCount = Math.max(10, Math.floor(traders.length * mode.participantActivityRate));
    
    // Shuffle traders to get random selection each tick
    const shuffledTraders = [...traders].sort(() => 0.5 - Math.random());
    const activeTraders = shuffledTraders.slice(0, activeCount);
    
    console.log(`👥 [REAL PARTICIPANTS] Activating ${activeCount}/${traders.length} real Dune Analytics traders`);
    
    activeTraders.forEach((trader, index) => {
      // Determine if trader should open/close position or just trade
      const hasPosition = simulation.activePositions.some(p => 
        p.trader.walletAddress === trader.trader.walletAddress
      );
      
      let action: 'buy' | 'sell';
      
      if (hasPosition && Math.random() < 0.3) {
        // 30% chance to close existing position
        action = this.getPositionCloseAction(simulation, trader);
      } else {
        // Regular trading action
        action = this.determineTraderAction(simulation, trader);
      }
      
      const trade = this.createTraderTrade(simulation, trader, action);
      
      if (trade) {
        tradesGenerated.push(trade);
        
        // Create/update position for this trader
        this.updateTraderPosition(simulation, trader, trade);
        
        // Log first few for debugging
        if (index < 3) {
          console.log(`   💰 Real Trader ${trader.trader.walletAddress.slice(0, 8)}: ${action.toUpperCase()} ${trade.quantity.toFixed(0)} @ $${trade.price.toFixed(6)}`);
        }
      }
    });
    
    console.log(`✅ [REAL PARTICIPANTS] Generated ${activeCount} real participant trades`);
  }

  // NEW: Determine what action a real trader should take
  private determineTraderAction(simulation: ExtendedSimulationState, trader: TraderProfile): 'buy' | 'sell' {
    const { strategy } = trader;
    const { trend, volatility } = simulation.marketConditions;
    const priceHistory = simulation.priceHistory.slice(-10);
    
    // Use real trader's historical performance to influence decisions
    const traderWinRate = trader.trader.winRate || 0.5;
    const traderRisk = trader.trader.riskProfile || 'moderate';
    
    // Strategy-based decisions with risk profile influence
    switch (strategy) {
      case 'momentum':
        if (trend === 'bullish' && traderWinRate > 0.6) return 'buy';
        if (trend === 'bearish' && traderWinRate > 0.6) return 'sell';
        return Math.random() > 0.5 ? 'buy' : 'sell';
        
      case 'contrarian':
        if (trend === 'bullish' && volatility > 0.03) return 'sell';
        if (trend === 'bearish' && volatility > 0.03) return 'buy';
        return Math.random() > 0.5 ? 'buy' : 'sell';
        
      case 'scalper':
        // Scalpers trade more frequently on any movement
        return volatility > 0.01 ? (Math.random() > 0.5 ? 'buy' : 'sell') : 'buy';
        
      default:
        // Default behavior based on trader's historical success
        if (traderRisk === 'aggressive') {
          return trend === 'bullish' ? 'buy' : 'sell';
        } else if (traderRisk === 'conservative') {
          return Math.random() > 0.7 ? 'buy' : 'sell'; // Less frequent trading
        } else {
          return Math.random() > 0.5 ? 'buy' : 'sell';
        }
    }
  }

  // NEW: Get action to close existing position
  private getPositionCloseAction(simulation: ExtendedSimulationState, trader: TraderProfile): 'buy' | 'sell' {
    const position = simulation.activePositions.find(p => 
      p.trader.walletAddress === trader.trader.walletAddress
    );
    
    if (!position) return 'buy';
    
    // Close position = opposite action
    return position.quantity > 0 ? 'sell' : 'buy';
  }

  // NEW: Create a trade for a specific trader
  private createTraderTrade(
    simulation: ExtendedSimulationState, 
    trader: TraderProfile, 
    action: 'buy' | 'sell'
  ): Trade | null {
    const currentPrice = simulation.currentPrice;
    
    // Calculate trade size based on trader's historical volume and risk profile
    const baseSize = this.calculateTradeSize(trader, currentPrice);
    const priceVariation = (Math.random() - 0.5) * 0.002; // ±0.1% price variation
    const tradePrice = currentPrice * (1 + priceVariation);
    
    const trade = this.tradePool.acquire();
    trade.id = `${trader.trader.walletAddress.slice(0, 8)}-${simulation.currentTime}-${Math.random().toString(36).substr(2, 6)}`;
    trade.timestamp = simulation.currentTime;
    trade.trader = {
      walletAddress: trader.trader.walletAddress,
      preferredName: trader.trader.preferredName || trader.trader.walletAddress.slice(0, 8),
      netPnl: trader.trader.netPnl || 0,
      position: trader.trader.position || 0,
      totalVolume: trader.trader.totalVolume || 0,
      buyVolume: trader.trader.buyVolume || 0,
      sellVolume: trader.trader.sellVolume || 0,
      tradeCount: trader.trader.tradeCount || 0,
      feesUsd: trader.trader.feesUsd || 0,
      winRate: trader.trader.winRate || 0.5,
      riskProfile: trader.trader.riskProfile || 'moderate',
      portfolioEfficiency: trader.trader.portfolioEfficiency || 0
    };
    trade.action = action;
    trade.price = tradePrice;
    trade.quantity = baseSize;
    trade.value = tradePrice * baseSize;
    trade.impact = this.calculateTradeImpact(simulation, trade.value);
    
    return trade;
  }

  // NEW: Calculate realistic trade size based on trader's profile
  private calculateTradeSize(trader: TraderProfile, currentPrice: number): number {
    const traderVolume = trader.trader.totalVolume || 10000;
    const riskProfile = trader.trader.riskProfile || 'moderate';
    
    // Base trade size as percentage of trader's historical volume
    let basePercentage = 0.05; // 5% of total volume
    
    // Adjust based on risk profile
    switch (riskProfile) {
      case 'aggressive':
        basePercentage = 0.15; // 15% of volume
        break;
      case 'conservative':
        basePercentage = 0.02; // 2% of volume
        break;
      default:
        basePercentage = 0.05; // 5% of volume
    }
    
    // Calculate token quantity
    const dollarAmount = traderVolume * basePercentage * (0.5 + Math.random()); // ±50% variation
    const tokenQuantity = dollarAmount / currentPrice;
    
    // Ensure minimum and maximum bounds
    const minTokens = 100;
    const maxTokens = currentPrice < 1 ? 50000 : currentPrice < 10 ? 10000 : 5000;
    
    return Math.max(minTokens, Math.min(maxTokens, tokenQuantity));
  }

  // NEW: Calculate trade impact on price
  private calculateTradeImpact(simulation: ExtendedSimulationState, tradeValue: number): number {
    const liquidity = simulation.parameters.initialLiquidity;
    const volatility = simulation.marketConditions.volatility;
    
    // Base impact from trade size relative to liquidity
    let impact = (tradeValue / liquidity) * 0.001;
    
    // Increase impact in volatile conditions
    impact *= (1 + volatility * 5);
    
    // Cap maximum impact
    return Math.min(0.005, impact); // Max 0.5% impact per trade
  }

  // NEW: Update trader position based on trade
  private updateTraderPosition(
    simulation: ExtendedSimulationState, 
    trader: TraderProfile, 
    trade: Trade
  ): void {
    let position = simulation.activePositions.find(p => 
      p.trader.walletAddress === trader.trader.walletAddress
    );
    
    if (!position) {
      // Create new position
      position = this.positionPool.acquire();
      position.trader = trade.trader;
      position.entryPrice = trade.price;
      position.quantity = trade.action === 'buy' ? trade.quantity : -trade.quantity;
      position.entryTime = trade.timestamp;
      position.currentPnl = 0;
      position.currentPnlPercentage = 0;
      
      simulation.activePositions.push(position);
    } else {
      // Update existing position
      const currentQuantity = position.quantity;
      const newQuantity = trade.action === 'buy' ? trade.quantity : -trade.quantity;
      
      if ((currentQuantity > 0 && newQuantity > 0) || (currentQuantity < 0 && newQuantity < 0)) {
        // Same direction - increase position
        const totalValue = Math.abs(currentQuantity) * position.entryPrice + Math.abs(newQuantity) * trade.price;
        const totalQuantity = Math.abs(currentQuantity) + Math.abs(newQuantity);
        
        position.entryPrice = totalValue / totalQuantity;
        position.quantity = currentQuantity + newQuantity;
      } else {
        // Opposite direction - reduce or close position
        position.quantity = currentQuantity + newQuantity;
        
        // If position is closed or flipped, update entry price
        if ((currentQuantity > 0 && position.quantity <= 0) || (currentQuantity < 0 && position.quantity >= 0)) {
          if (Math.abs(position.quantity) > 0) {
            position.entryPrice = trade.price;
            position.entryTime = trade.timestamp;
          }
        }
      }
      
      // Remove position if quantity is very small
      if (Math.abs(position.quantity) < 1) {
        const index = simulation.activePositions.indexOf(position);
        if (index > -1) {
          simulation.activePositions.splice(index, 1);
          this.positionPool.release(position);
        }
      }
    }
  }

  // NEW: Generate market maker activity
  private generateMarketMakerActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const mmTradeCount = Math.floor(mode.tradesPerTick * 0.3 * mode.marketMakerMultiplier);
    
    for (let i = 0; i < mmTradeCount; i++) {
      const trade = this.createMarketMakerTrade(simulation);
      if (trade) {
        tradesGenerated.push(trade);
      }
    }
    
    console.log(`🏪 [MARKET MAKERS] Generated ${mmTradeCount} market maker trades`);
  }

  // NEW: Create market maker trade
  private createMarketMakerTrade(simulation: ExtendedSimulationState): Trade | null {
    const currentPrice = simulation.currentPrice;
    const spread = this.calculateMarketSpread(simulation);
    const action = Math.random() > 0.5 ? 'buy' : 'sell';
    
    const trade = this.tradePool.acquire();
    trade.id = `mm-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
    trade.timestamp = simulation.currentTime;
    trade.trader = {
      walletAddress: 'market-maker',
      preferredName: 'Market Maker',
      netPnl: 0
    };
    trade.action = action;
    trade.price = action === 'buy' 
      ? currentPrice * (1 - spread)
      : currentPrice * (1 + spread);
    trade.quantity = 200 + Math.random() * 800; // 200-1000 tokens
    trade.value = trade.price * trade.quantity;
    trade.impact = 0.0001; // Minimal impact for MM trades
    
    return trade;
  }

  // NEW: Calculate market spread
  private calculateMarketSpread(simulation: ExtendedSimulationState): number {
    const volatility = simulation.marketConditions.volatility;
    const baseSpread = 0.001; // 0.1%
    return Math.min(0.005, baseSpread + volatility * 2); // Max 0.5% spread
  }

  // NEW: Generate retail trading activity
  private generateRetailActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const retailTradeCount = Math.floor(mode.tradesPerTick * 0.4);
    
    for (let i = 0; i < retailTradeCount; i++) {
      const trade = this.createRetailTrade(simulation);
      if (trade) {
        tradesGenerated.push(trade);
      }
    }
    
    console.log(`🏪 [RETAIL] Generated ${retailTradeCount} retail trades`);
  }

  // NEW: Create retail trade
  private createRetailTrade(simulation: ExtendedSimulationState): Trade | null {
    const currentPrice = simulation.currentPrice;
    const priceVariation = (Math.random() - 0.5) * 0.01; // ±0.5% variation
    const action = Math.random() > 0.5 ? 'buy' : 'sell';
    
    const trade = this.tradePool.acquire();
    trade.id = `retail-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
    trade.timestamp = simulation.currentTime;
    trade.trader = {
      walletAddress: `retail-${Math.random().toString(36).substr(2, 8)}`,
      preferredName: 'Retail Trader',
      netPnl: 0
    };
    trade.action = action;
    trade.price = currentPrice * (1 + priceVariation);
    trade.quantity = 50 + Math.random() * 500; // 50-550 tokens
    trade.value = trade.price * trade.quantity;
    trade.impact = this.calculateTradeImpact(simulation, trade.value);
    
    return trade;
  }

  // NEW: Generate position-related activity
  private generatePositionActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    // Randomly close some existing positions
    const positionsToClose = simulation.activePositions
      .filter(() => Math.random() < mode.positionActivityRate)
      .slice(0, 5); // Limit to 5 closures per tick
    
    positionsToClose.forEach(position => {
      const closeTrade = this.createPositionCloseTrade(simulation, position);
      if (closeTrade) {
        tradesGenerated.push(closeTrade);
        
        // Remove position
        const index = simulation.activePositions.indexOf(position);
        if (index > -1) {
          simulation.activePositions.splice(index, 1);
          this.positionPool.release(position);
        }
      }
    });
    
    if (positionsToClose.length > 0) {
      console.log(`📍 [POSITIONS] Closed ${positionsToClose.length} positions`);
    }
  }

  // NEW: Create position close trade
  private createPositionCloseTrade(
    simulation: ExtendedSimulationState, 
    position: TraderPosition
  ): Trade | null {
    const trade = this.tradePool.acquire();
    trade.id = `close-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
    trade.timestamp = simulation.currentTime;
    trade.trader = position.trader;
    trade.action = position.quantity > 0 ? 'sell' : 'buy';
    trade.price = simulation.currentPrice;
    trade.quantity = Math.abs(position.quantity);
    trade.value = trade.price * trade.quantity;
    trade.impact = this.calculateTradeImpact(simulation, trade.value);
    
    return trade;
  }

  // NEW: Ensure minimum activity threshold
  private ensureMinimumActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const currentCount = tradesGenerated.length;
    const targetCount = mode.tradesPerTick;
    
    if (currentCount < targetCount) {
      const additionalTrades = targetCount - currentCount;
      
      for (let i = 0; i < additionalTrades; i++) {
        const trade = this.createRandomTrade(simulation);
        if (trade) {
          tradesGenerated.push(trade);
        }
      }
      
      console.log(`⚡ [MINIMUM] Added ${additionalTrades} trades to reach target of ${targetCount}`);
    }
  }

  // NEW: Create random trade to fill minimum
  private createRandomTrade(simulation: ExtendedSimulationState): Trade | null {
    const currentPrice = simulation.currentPrice;
    const action = Math.random() > 0.5 ? 'buy' : 'sell';
    
    const trade = this.tradePool.acquire();
    trade.id = `random-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
    trade.timestamp = simulation.currentTime;
    trade.trader = {
      walletAddress: `trader-${Math.random().toString(36).substr(2, 8)}`,
      preferredName: 'Random Trader',
      netPnl: 0
    };
    trade.action = action;
    trade.price = currentPrice * (0.999 + Math.random() * 0.002); // ±0.1% variation
    trade.quantity = 100 + Math.random() * 400; // 100-500 tokens
    trade.value = trade.price * trade.quantity;
    trade.impact = this.calculateTradeImpact(simulation, trade.value);
    
    return trade;
  }

  // NEW: Update trader stats from generated trades
  private updateTraderStatsFromTrades(
    simulation: ExtendedSimulationState, 
    trades: Trade[]
  ): void {
    trades.forEach(trade => {
      const trader = simulation.traders.find(t => 
        t.trader.walletAddress === trade.trader.walletAddress
      );
      
      if (trader) {
        // Update trader statistics
        trader.trader.tradeCount = (trader.trader.tradeCount || 0) + 1;
        trader.trader.totalVolume = (trader.trader.totalVolume || 0) + trade.value;
        
        if (trade.action === 'buy') {
          trader.trader.buyVolume = (trader.trader.buyVolume || 0) + trade.value;
        } else {
          trader.trader.sellVolume = (trader.trader.sellVolume || 0) + trade.value;
        }
      }
    });
    
    // Update trader rankings
    this.updateTraderRankings(simulation);
  }

  // Existing methods with minimal changes...
  processTraderActionsBatch(simulation: SimulationState, batchSize: number): void {
    // Use the enhanced processTraderActions instead
    this.processTraderActions(simulation as ExtendedSimulationState);
  }

  applyTraderBehaviorModifiers(simulationId: string, modifiers: any): void {
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

  private evaluateTraderDecision(trader: TraderProfile, marketData: any): TraderDecision {
    const { currentPrice, marketConditions } = marketData;
    const hasPosition = marketData.activePositions.some(
      (p: any) => p.walletAddress === trader.trader.walletAddress
    );

    if (hasPosition) {
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

    return {
      action: 'hold',
      walletAddress: trader.trader.walletAddress,
      reason: 'No trading opportunity detected'
    };
  }

  private shouldEnterBasedOnStrategy(trader: TraderProfile, marketData: any): boolean {
    const { strategy } = trader;
    const { marketConditions } = marketData;

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
    const timeInPosition = position.entryTime ? Date.now() - position.entryTime : 0;
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
    simulation.traderRankings = [...simulation.traders]
      .map(profile => profile.trader)
      .sort((a, b) => (b.netPnl || 0) - (a.netPnl || 0));
  }

  integrateProcessedTrades(simulation: ExtendedSimulationState, processedTrades: Trade[]): void {
    if (!this.processedTradesCache.has(simulation.id)) {
      this.processedTradesCache.set(simulation.id, new Set());
    }
    
    const cache = this.processedTradesCache.get(simulation.id)!;
    
    processedTrades.forEach(trade => {
      if (cache.has(trade.id)) return;
      
      cache.add(trade.id);
      
      const exists = simulation.recentTrades.some(t => t.id === trade.id);
      if (!exists) {
        simulation.recentTrades.unshift(trade);
        
        const currentCandle = simulation.priceHistory[simulation.priceHistory.length - 1];
        if (currentCandle) {
          currentCandle.volume += Math.abs(trade.quantity);
        }
        
        this.broadcastEvent(simulation.id, {
          type: 'processed_trade',
          timestamp: simulation.currentTime,
          data: trade
        });
      }
    });
    
    if (cache.size > 10000) {
      const entriesToDelete = Array.from(cache).slice(0, 5000);
      entriesToDelete.forEach(id => cache.delete(id));
    }
    
    if (simulation.recentTrades.length > 2000) {
      const removed = simulation.recentTrades.splice(2000);
      removed.forEach(trade => this.tradePool.release(trade));
    }
  }

  cleanup(): void {
    this.processedTradesCache.clear();
    console.log('TraderEngine cleanup complete');
  }
}