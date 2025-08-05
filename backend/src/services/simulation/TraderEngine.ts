// backend/src/services/simulation/TraderEngine.ts - CRITICAL FIX: Restore Trader Count Verification
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
  
  // Pool monitoring and cleanup tracking
  private poolMonitoringInterval: NodeJS.Timeout;
  private lastPoolCleanup: number = Date.now();
  private poolUsageMetrics = {
    tradesAcquired: 0,
    tradesReleased: 0,
    positionsAcquired: 0,
    positionsReleased: 0,
    forceCleanups: 0,
    errors: 0
  };

  constructor(
    private getCurrentTimeframe: (simulationId: string) => Timeframe,
    private getTimeframeConfig: (timeframe: Timeframe) => any,
    private broadcastEvent: (simulationId: string, event: any) => void,
    private updateTradesBuffer?: (simulationId: string, trades: Trade[]) => void
  ) {
    // Initialize object pools with proper monitoring
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
        try {
          trade.id = '';
          trade.timestamp = 0;
          trade.trader = {} as any;
          trade.action = 'buy';
          trade.price = 0;
          trade.quantity = 0;
          trade.value = 0;
          trade.impact = 0;
        } catch (resetError) {
          console.error('❌ POOL: Error resetting trade object:', resetError);
          throw resetError;
        }
      },
      5000, // Reduced pool size
      500   // Reduced pre-fill
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
        try {
          position.trader = {} as any;
          position.entryPrice = 0;
          position.quantity = 0;
          position.entryTime = 0;
          position.currentPnl = 0;
          position.currentPnlPercentage = 0;
        } catch (resetError) {
          console.error('❌ POOL: Error resetting position object:', resetError);
          throw resetError;
        }
      },
      2500, // Reduced pool size
      250   // Reduced pre-fill
    );
    
    this.startPoolMonitoring();
    console.log('✅ POOL: TraderEngine initialized with leak prevention monitoring');
  }
  
  private startPoolMonitoring(): void {
    this.poolMonitoringInterval = setInterval(() => {
      this.monitorPoolHealth();
    }, 30000);
  }
  
  private monitorPoolHealth(): void {
    const tradeStats = this.tradePool.getStats();
    const positionStats = this.positionPool.getStats();
    
    if (tradeStats.inUse > tradeStats.maxSize * 0.8) {
      console.warn(`⚠️ POOL: Trade pool usage high: ${tradeStats.inUse}/${tradeStats.maxSize}`);
      this.forcePoolCleanup('trade');
    }
    
    if (positionStats.inUse > positionStats.maxSize * 0.8) {
      console.warn(`⚠️ POOL: Position pool usage high: ${positionStats.inUse}/${positionStats.maxSize}`);
      this.forcePoolCleanup('position');
    }
    
    const tradeHealthCheck = this.tradePool.healthCheck();
    const positionHealthCheck = this.positionPool.healthCheck();
    
    if (!tradeHealthCheck.healthy) {
      console.error('🚨 POOL: Trade pool health check failed:', tradeHealthCheck.issues);
      this.poolUsageMetrics.errors++;
      this.forcePoolCleanup('trade');
    }
    
    if (!positionHealthCheck.healthy) {
      console.error('🚨 POOL: Position pool health check failed:', positionHealthCheck.issues);
      this.poolUsageMetrics.errors++;
      this.forcePoolCleanup('position');
    }
    
    if (Date.now() - this.lastPoolCleanup > 300000) {
      this.logPoolMetrics();
    }
  }
  
  private forcePoolCleanup(poolType: 'trade' | 'position'): void {
    console.log(`🧹 POOL: Forcing cleanup of ${poolType} pool due to health issues`);
    
    try {
      if (poolType === 'trade') {
        this.tradePool.forceGarbageCollection();
        this.poolUsageMetrics.forceCleanups++;
      } else {
        this.positionPool.forceGarbageCollection();
        this.poolUsageMetrics.forceCleanups++;
      }
      
      this.lastPoolCleanup = Date.now();
      console.log(`✅ POOL: ${poolType} pool cleanup completed`);
      
    } catch (cleanupError) {
      console.error(`❌ POOL: Error during ${poolType} pool cleanup:`, cleanupError);
      this.poolUsageMetrics.errors++;
    }
  }
  
  private logPoolMetrics(): void {
    const tradeStats = this.tradePool.getStats();
    const positionStats = this.positionPool.getStats();
    
    console.log('📊 POOL: Current pool statistics:');
    console.log(`   Trade Pool: ${tradeStats.inUse}/${tradeStats.maxSize} in use, ${tradeStats.available} available`);
    console.log(`   Position Pool: ${positionStats.inUse}/${positionStats.maxSize} in use, ${positionStats.available} available`);
    console.log(`   Metrics: Acquired=${this.poolUsageMetrics.tradesAcquired}, Released=${this.poolUsageMetrics.tradesReleased}, Errors=${this.poolUsageMetrics.errors}`);
  }

  setTransactionQueue(queue: TransactionQueue): void {
    this.transactionQueue = queue;
    console.log('✅ POOL: Transaction queue connected to TraderEngine');
  }

  // 🚨 CRITICAL FIX: Restore missing trader count verification and data flow validation
  processTraderActions(simulation: ExtendedSimulationState): void {
    const traders = simulation.traders;
    const traderCount = traders ? traders.length : 0;
    
    // 🔥 CRITICAL FIX: Restore missing trader count logging for debugging
    console.log(`🔥 [TRADER COUNT VERIFICATION] Processing ${traderCount} traders from simulation.traders array`);
    
    // 🚨 CRITICAL FIX: Add proper validation for empty trader arrays
    if (traderCount === 0) {
      console.error('❌ [TRADER DATA FLOW] No traders found in simulation! This indicates a data flow problem.');
      console.error('❌ [TRADER DATA FLOW] Expected: 118 real Dune Analytics traders');
      console.error('❌ [TRADER DATA FLOW] Actual: 0 traders');
      console.error('❌ [TRADER DATA FLOW] Check SimulationManager trader loading process');
      return;
    }
    
    // 🔥 CRITICAL FIX: Ensure 118 traders are properly processed and logged
    if (traderCount === 118) {
      console.log(`🔥 [ALL PARTICIPANTS] Activating ${traderCount}/${traderCount} real Dune Analytics traders (100%)`);
    } else {
      console.warn(`⚠️ [TRADER COUNT MISMATCH] Expected 118 traders, got ${traderCount}`);
      console.log(`🔥 [ALL PARTICIPANTS] Activating ${traderCount} traders (${((traderCount/118)*100).toFixed(1)}%)`);
    }
    
    const speed = simulation.parameters.timeCompressionFactor;
    const simulationMode = this.getMaximumActivityMode(speed);
    
    console.log(`🔥 [MAXIMUM ACTIVITY] ${simulationMode.name}: Targeting ${simulationMode.tradesPerTick} trades/tick from ALL ${traderCount} participants`);
    
    const tradesGenerated: Trade[] = [];
    let poolErrors = 0;
    
    try {
      // 1. Force maximum participant activity from all traders
      this.forceMaximumParticipantActivity(simulation, tradesGenerated, simulationMode);
      
      // 2. Generate additional market maker activity
      this.generateMaximumMarketMakerActivity(simulation, tradesGenerated, simulationMode);
      
      // 3. Generate retail trading activity  
      this.generateMaximumRetailActivity(simulation, tradesGenerated, simulationMode);
      
      // 4. Generate position activity
      this.generateMaximumPositionActivity(simulation, tradesGenerated, simulationMode);
      
      // 5. Ensure minimum activity threshold
      this.ensureMaximumActivity(simulation, tradesGenerated, simulationMode);
      
      // 6. Update trader stats and rankings
      this.updateAllTraderStatsFromTrades(simulation, tradesGenerated);
      
      const tradeStats = this.tradePool.getStats();
      if (tradeStats.inUse > tradeStats.maxSize * 0.7) {
        console.warn(`⚠️ POOL: High trade pool usage after generation: ${tradeStats.inUse}/${tradeStats.maxSize}`);
      }
      
    } catch (error) {
      console.error('❌ POOL: Error in processTraderActions:', error);
      poolErrors++;
      
      tradesGenerated.forEach(trade => {
        try {
          this.tradePool.release(trade);
          this.poolUsageMetrics.tradesReleased++;
        } catch (releaseError) {
          console.error('❌ POOL: Error releasing trade after error:', releaseError);
        }
      });
      
      throw error;
    }
    
    // Handle generated trades with automatic cleanup
    if (tradesGenerated.length > 0) {
      try {
        // Convert and queue trades
        if (this.transactionQueue) {
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
            console.error('❌ POOL: Failed to queue trades:', err);
          });
        }
        
        // Add trades to simulation for immediate candle volume
        tradesGenerated.forEach(trade => {
          simulation.recentTrades.unshift(trade);
        });
        
        // Limit recent trades and release old ones
        if (simulation.recentTrades.length > 5000) {
          const tradesToRemove = simulation.recentTrades.splice(5000);
          tradesToRemove.forEach(trade => {
            try {
              this.tradePool.release(trade);
              this.poolUsageMetrics.tradesReleased++;
            } catch (releaseError) {
              console.error('❌ POOL: Error releasing old trade:', releaseError);
              poolErrors++;
            }
          });
        }
        
      } catch (handlingError) {
        console.error('❌ POOL: Error handling generated trades:', handlingError);
        poolErrors++;
      }
    }
    
    this.poolUsageMetrics.errors += poolErrors;
    
    console.log(`✅ POOL: MAXIMUM ACTIVITY COMPLETE - Generated ${tradesGenerated.length} trades with ${poolErrors} pool errors`);
    console.log(`📊 POOL: MASSIVE CHART IMPACT - Total volume: ${tradesGenerated.reduce((sum, t) => sum + t.quantity, 0).toFixed(0)} tokens`);
  }

  private getMaximumActivityMode(speed: number): {
    name: string;
    tradesPerTick: number;
    participantActivityRate: number;
    positionActivityRate: number;
    marketMakerMultiplier: number;
  } {
    if (speed <= 5) {
      return {
        name: "MAXIMUM_NORMAL",
        tradesPerTick: 100,
        participantActivityRate: 0.80,
        positionActivityRate: 0.40,
        marketMakerMultiplier: 3
      };
    } else if (speed <= 15) {
      return {
        name: "MAXIMUM_MEDIUM", 
        tradesPerTick: 200,
        participantActivityRate: 0.90,
        positionActivityRate: 0.60,
        marketMakerMultiplier: 5
      };
    } else {
      return {
        name: "MAXIMUM_FAST",
        tradesPerTick: 400,
        participantActivityRate: 1.0,
        positionActivityRate: 0.80,
        marketMakerMultiplier: 8
      };
    }
  }

  private forceMaximumParticipantActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const { traders } = simulation;
    const activeCount = Math.max(50, Math.floor(traders.length * mode.participantActivityRate));
    const finalActiveCount = mode.participantActivityRate >= 1.0 ? traders.length : activeCount;
    
    const shuffledTraders = [...traders].sort(() => 0.5 - Math.random());
    const activeTraders = shuffledTraders.slice(0, finalActiveCount);
    
    console.log(`🔥 [ALL PARTICIPANTS] Activating ${finalActiveCount}/${traders.length} real Dune Analytics traders (${(finalActiveCount/traders.length*100).toFixed(1)}%)`);
    
    activeTraders.forEach((trader, index) => {
      const tradesPerTrader = mode.participantActivityRate >= 1.0 ? 1 + Math.floor(Math.random() * 3) : 1;
      
      for (let i = 0; i < tradesPerTrader; i++) {
        const hasPosition = simulation.activePositions.some(p => 
          p.trader.walletAddress === trader.trader.walletAddress
        );
        
        let action: 'buy' | 'sell';
        
        if (hasPosition && Math.random() < 0.4) {
          action = this.getPositionCloseAction(simulation, trader);
        } else {
          action = this.determineAggressiveTraderAction(simulation, trader);
        }
        
        const trade = this.createMaximumActivityTrade(simulation, trader, action);
        
        if (trade) {
          tradesGenerated.push(trade);
          this.updateTraderPosition(simulation, trader, trade);
          
          if (index < 5 || (index < 20 && Math.random() < 0.3)) {
            console.log(`   🔥 Hyper Trader ${trader.trader.walletAddress.slice(0, 8)}: ${action.toUpperCase()} ${trade.quantity.toFixed(0)} @ $${trade.price.toFixed(6)} (trade ${i+1}/${tradesPerTrader})`);
          }
        }
      }
    });
    
    console.log(`✅ [ALL PARTICIPANTS] Generated trades from ${finalActiveCount} hyper-active participants`);
  }

  private determineAggressiveTraderAction(simulation: ExtendedSimulationState, trader: TraderProfile): 'buy' | 'sell' {
    const { strategy } = trader;
    const { trend, volatility } = simulation.marketConditions;
    const traderWinRate = trader.trader.winRate || 0.5;
    const traderRisk = trader.trader.riskProfile || 'moderate';
    
    switch (strategy) {
      case 'momentum':
        if (trend === 'bullish' && traderWinRate > 0.5) return 'buy';
        if (trend === 'bearish' && traderWinRate > 0.5) return 'sell';
        return Math.random() > 0.3 ? 'buy' : 'sell';
        
      case 'contrarian':
        if (trend === 'bullish' && volatility > 0.02) return 'sell';
        if (trend === 'bearish' && volatility > 0.02) return 'buy';
        return Math.random() > 0.4 ? 'buy' : 'sell';
        
      case 'scalper':
        return volatility > 0.005 ? (Math.random() > 0.4 ? 'buy' : 'sell') : 'buy';
        
      default:
        if (traderRisk === 'aggressive') {
          return trend === 'bullish' ? 'buy' : 'sell';
        } else if (traderRisk === 'conservative') {
          return Math.random() > 0.5 ? 'buy' : 'sell';
        } else {
          return Math.random() > 0.4 ? 'buy' : 'sell';
        }
    }
  }

  private getPositionCloseAction(simulation: ExtendedSimulationState, trader: TraderProfile): 'buy' | 'sell' {
    const position = simulation.activePositions.find(p => 
      p.trader.walletAddress === trader.trader.walletAddress
    );
    
    if (!position) return 'buy';
    return position.quantity > 0 ? 'sell' : 'buy';
  }

  private createMaximumActivityTrade(
    simulation: ExtendedSimulationState, 
    trader: TraderProfile, 
    action: 'buy' | 'sell'
  ): Trade | null {
    let trade: Trade | null = null;
    
    try {
      trade = this.tradePool.acquire();
      this.poolUsageMetrics.tradesAcquired++;
      
      const currentPrice = simulation.currentPrice;
      const baseSize = this.calculateMaximumTradeSize(trader, currentPrice);
      const priceVariation = (Math.random() - 0.5) * 0.003;
      const tradePrice = currentPrice * (1 + priceVariation);
      
      trade.id = `max_${trader.trader.walletAddress.slice(0, 8)}-${simulation.currentTime}-${Math.random().toString(36).substr(2, 8)}`;
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
      trade.impact = this.calculateMaximumTradeImpact(simulation, trade.value);
      
      return trade;
      
    } catch (error) {
      console.error('❌ POOL: Error creating trade:', error);
      this.poolUsageMetrics.errors++;
      
      if (trade) {
        try {
          this.tradePool.release(trade);
          this.poolUsageMetrics.tradesReleased++;
        } catch (releaseError) {
          console.error('❌ POOL: Error releasing failed trade:', releaseError);
        }
      }
      
      return null;
    }
  }

  private calculateMaximumTradeSize(trader: TraderProfile, currentPrice: number): number {
    const traderVolume = trader.trader.totalVolume || 10000;
    const riskProfile = trader.trader.riskProfile || 'moderate';
    
    let basePercentage = 0.15;
    
    switch (riskProfile) {
      case 'aggressive':
        basePercentage = 0.30;
        break;
      case 'conservative':
        basePercentage = 0.10;
        break;
      default:
        basePercentage = 0.20;
    }
    
    const dollarAmount = traderVolume * basePercentage * (0.5 + Math.random() * 1.0);
    const tokenQuantity = dollarAmount / currentPrice;
    
    const minTokens = 500;
    const maxTokens = currentPrice < 1 ? 100000 : currentPrice < 10 ? 25000 : 15000;
    
    return Math.max(minTokens, Math.min(maxTokens, tokenQuantity));
  }

  private calculateMaximumTradeImpact(simulation: ExtendedSimulationState, tradeValue: number): number {
    const liquidity = simulation.parameters.initialLiquidity;
    const volatility = simulation.marketConditions.volatility;
    
    let impact = (tradeValue / liquidity) * 0.002;
    impact *= (1 + volatility * 8);
    
    return Math.min(0.01, impact);
  }

  private updateTraderPosition(
    simulation: ExtendedSimulationState, 
    trader: TraderProfile, 
    trade: Trade
  ): void {
    let position = simulation.activePositions.find(p => 
      p.trader.walletAddress === trader.trader.walletAddress
    );
    
    if (!position) {
      try {
        position = this.positionPool.acquire();
        this.poolUsageMetrics.positionsAcquired++;
        
        position.trader = trade.trader;
        position.entryPrice = trade.price;
        position.quantity = trade.action === 'buy' ? trade.quantity : -trade.quantity;
        position.entryTime = trade.timestamp;
        position.currentPnl = 0;
        position.currentPnlPercentage = 0;
        
        simulation.activePositions.push(position);
        
      } catch (error) {
        console.error('❌ POOL: Error creating position:', error);
        this.poolUsageMetrics.errors++;
        return;
      }
    } else {
      const currentQuantity = position.quantity;
      const newQuantity = trade.action === 'buy' ? trade.quantity : -trade.quantity;
      
      if ((currentQuantity > 0 && newQuantity > 0) || (currentQuantity < 0 && newQuantity < 0)) {
        const totalValue = Math.abs(currentQuantity) * position.entryPrice + Math.abs(newQuantity) * trade.price;
        const totalQuantity = Math.abs(currentQuantity) + Math.abs(newQuantity);
        
        position.entryPrice = totalValue / totalQuantity;
        position.quantity = currentQuantity + newQuantity;
      } else {
        position.quantity = currentQuantity + newQuantity;
        
        if ((currentQuantity > 0 && position.quantity <= 0) || (currentQuantity < 0 && position.quantity >= 0)) {
          if (Math.abs(position.quantity) > 0) {
            position.entryPrice = trade.price;
            position.entryTime = trade.timestamp;
          }
        }
      }
      
      if (Math.abs(position.quantity) < 10) {
        const index = simulation.activePositions.indexOf(position);
        if (index > -1) {
          simulation.activePositions.splice(index, 1);
          try {
            this.positionPool.release(position);
            this.poolUsageMetrics.positionsReleased++;
          } catch (releaseError) {
            console.error('❌ POOL: Error releasing position:', releaseError);
            this.poolUsageMetrics.errors++;
          }
        }
      }
    }
  }

  private generateMaximumMarketMakerActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const mmTradeCount = Math.floor(mode.tradesPerTick * 0.4 * mode.marketMakerMultiplier);
    
    for (let i = 0; i < mmTradeCount; i++) {
      const trade = this.createMaximumMarketMakerTrade(simulation);
      if (trade) {
        tradesGenerated.push(trade);
      }
    }
    
    console.log(`🏪 [MAXIMUM MARKET MAKERS] Generated ${mmTradeCount} massive market maker trades`);
  }

  private createMaximumMarketMakerTrade(simulation: ExtendedSimulationState): Trade | null {
    let trade: Trade | null = null;
    
    try {
      const currentPrice = simulation.currentPrice;
      const spread = this.calculateMarketSpread(simulation);
      const action = Math.random() > 0.5 ? 'buy' : 'sell';
      
      trade = this.tradePool.acquire();
      this.poolUsageMetrics.tradesAcquired++;
      
      trade.id = `max_mm-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
      trade.timestamp = simulation.currentTime;
      trade.trader = {
        walletAddress: 'maximum-market-maker',
        preferredName: 'Maximum Market Maker',
        netPnl: 0
      };
      trade.action = action;
      trade.price = action === 'buy' 
        ? currentPrice * (1 - spread)
        : currentPrice * (1 + spread);
      trade.quantity = 1000 + Math.random() * 3000;
      trade.value = trade.price * trade.quantity;
      trade.impact = 0.0002;
      
      return trade;
      
    } catch (error) {
      console.error('❌ POOL: Error creating market maker trade:', error);
      if (trade) {
        try {
          this.tradePool.release(trade);
          this.poolUsageMetrics.tradesReleased++;
        } catch (releaseError) {
          console.error('❌ POOL: Error releasing failed MM trade:', releaseError);
        }
      }
      return null;
    }
  }

  private calculateMarketSpread(simulation: ExtendedSimulationState): number {
    const volatility = simulation.marketConditions.volatility;
    const baseSpread = 0.002;
    return Math.min(0.008, baseSpread + volatility * 3);
  }

  private generateMaximumRetailActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const retailTradeCount = Math.floor(mode.tradesPerTick * 0.5);
    
    for (let i = 0; i < retailTradeCount; i++) {
      const trade = this.createMaximumRetailTrade(simulation);
      if (trade) {
        tradesGenerated.push(trade);
      }
    }
    
    console.log(`🏪 [MAXIMUM RETAIL] Generated ${retailTradeCount} massive retail trades`);
  }

  private createMaximumRetailTrade(simulation: ExtendedSimulationState): Trade | null {
    let trade: Trade | null = null;
    
    try {
      const currentPrice = simulation.currentPrice;
      const priceVariation = (Math.random() - 0.5) * 0.015;
      const action = Math.random() > 0.5 ? 'buy' : 'sell';
      
      trade = this.tradePool.acquire();
      this.poolUsageMetrics.tradesAcquired++;
      
      trade.id = `max_retail-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
      trade.timestamp = simulation.currentTime;
      trade.trader = {
        walletAddress: `max-retail-${Math.random().toString(36).substr(2, 8)}`,
        preferredName: 'Maximum Retail Trader',
        netPnl: 0
      };
      trade.action = action;
      trade.price = currentPrice * (1 + priceVariation);
      trade.quantity = 200 + Math.random() * 1500;
      trade.value = trade.price * trade.quantity;
      trade.impact = this.calculateMaximumTradeImpact(simulation, trade.value);
      
      return trade;
      
    } catch (error) {
      console.error('❌ POOL: Error creating retail trade:', error);
      if (trade) {
        try {
          this.tradePool.release(trade);
          this.poolUsageMetrics.tradesReleased++;
        } catch (releaseError) {
          console.error('❌ POOL: Error releasing failed retail trade:', releaseError);
        }
      }
      return null;
    }
  }

  private generateMaximumPositionActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const positionsToClose = simulation.activePositions
      .filter(() => Math.random() < mode.positionActivityRate)
      .slice(0, 15);
    
    positionsToClose.forEach(position => {
      const closeTrade = this.createMaximumPositionCloseTrade(simulation, position);
      if (closeTrade) {
        tradesGenerated.push(closeTrade);
        
        const index = simulation.activePositions.indexOf(position);
        if (index > -1) {
          simulation.activePositions.splice(index, 1);
          try {
            this.positionPool.release(position);
            this.poolUsageMetrics.positionsReleased++;
          } catch (releaseError) {
            console.error('❌ POOL: Error releasing closed position:', releaseError);
            this.poolUsageMetrics.errors++;
          }
        }
      }
    });
    
    if (positionsToClose.length > 0) {
      console.log(`📍 [MAXIMUM POSITIONS] Closed ${positionsToClose.length} positions`);
    }
  }

  private createMaximumPositionCloseTrade(
    simulation: ExtendedSimulationState, 
    position: TraderPosition
  ): Trade | null {
    let trade: Trade | null = null;
    
    try {
      trade = this.tradePool.acquire();
      this.poolUsageMetrics.tradesAcquired++;
      
      trade.id = `max_close-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
      trade.timestamp = simulation.currentTime;
      trade.trader = position.trader;
      trade.action = position.quantity > 0 ? 'sell' : 'buy';
      trade.price = simulation.currentPrice;
      trade.quantity = Math.abs(position.quantity);
      trade.value = trade.price * trade.quantity;
      trade.impact = this.calculateMaximumTradeImpact(simulation, trade.value);
      
      return trade;
      
    } catch (error) {
      console.error('❌ POOL: Error creating position close trade:', error);
      if (trade) {
        try {
          this.tradePool.release(trade);
          this.poolUsageMetrics.tradesReleased++;
        } catch (releaseError) {
          console.error('❌ POOL: Error releasing failed close trade:', releaseError);
        }
      }
      return null;
    }
  }

  private ensureMaximumActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const currentCount = tradesGenerated.length;
    const targetCount = mode.tradesPerTick;
    
    if (currentCount < targetCount) {
      const additionalTrades = targetCount - currentCount;
      
      for (let i = 0; i < additionalTrades; i++) {
        const trade = this.createMaximumRandomTrade(simulation);
        if (trade) {
          tradesGenerated.push(trade);
        }
      }
      
      console.log(`⚡ [MAXIMUM BOOST] Added ${additionalTrades} trades to reach massive target of ${targetCount}`);
    }
  }

  private createMaximumRandomTrade(simulation: ExtendedSimulationState): Trade | null {
    let trade: Trade | null = null;
    
    try {
      const currentPrice = simulation.currentPrice;
      const action = Math.random() > 0.5 ? 'buy' : 'sell';
      
      trade = this.tradePool.acquire();
      this.poolUsageMetrics.tradesAcquired++;
      
      trade.id = `max_random-${simulation.currentTime}-${Math.random().toString(36).substr(2, 9)}`;
      trade.timestamp = simulation.currentTime;
      trade.trader = {
        walletAddress: `max-trader-${Math.random().toString(36).substr(2, 8)}`,
        preferredName: 'Maximum Random Trader',
        netPnl: 0
      };
      trade.action = action;
      trade.price = currentPrice * (0.998 + Math.random() * 0.004);
      trade.quantity = 500 + Math.random() * 2000;
      trade.value = trade.price * trade.quantity;
      trade.impact = this.calculateMaximumTradeImpact(simulation, trade.value);
      
      return trade;
      
    } catch (error) {
      console.error('❌ POOL: Error creating random trade:', error);
      if (trade) {
        try {
          this.tradePool.release(trade);
          this.poolUsageMetrics.tradesReleased++;
        } catch (releaseError) {
          console.error('❌ POOL: Error releasing failed random trade:', releaseError);
        }
      }
      return null;
    }
  }

  private updateAllTraderStatsFromTrades(
    simulation: ExtendedSimulationState, 
    trades: Trade[]
  ): void {
    trades.forEach(trade => {
      const trader = simulation.traders.find(t => 
        t.trader.walletAddress === trade.trader.walletAddress
      );
      
      if (trader) {
        trader.trader.tradeCount = (trader.trader.tradeCount || 0) + 1;
        trader.trader.totalVolume = (trader.trader.totalVolume || 0) + trade.value;
        
        if (trade.action === 'buy') {
          trader.trader.buyVolume = (trader.trader.buyVolume || 0) + trade.value;
        } else {
          trader.trader.sellVolume = (trader.trader.sellVolume || 0) + trade.value;
        }
        
        const pnlImpact = trade.value * trade.impact * (trade.action === 'buy' ? 1 : -1);
        trader.trader.netPnl = (trader.trader.netPnl || 0) + pnlImpact;
      }
    });
    
    this.updateTraderRankings(simulation);
  }

  // Existing interface implementations...
  processTraderActionsBatch(simulation: SimulationState, batchSize: number): void {
    this.processTraderActions(simulation as ExtendedSimulationState);
  }

  applyTraderBehaviorModifiers(simulationId: string, modifiers: any): void {
    console.log(`Applying trader behavior modifiers for simulation ${simulationId}:`, modifiers);
  }

  processTraderDecisionParallel(traders: TraderProfile[], marketData: any): TraderDecision[] {
    const decisions: TraderDecision[] = [];

    traders.forEach(trader => {
      const decision = this.evaluateMaximumTraderDecision(trader, marketData);
      if (decision.action !== 'hold') {
        decisions.push(decision);
      }
    });

    return decisions;
  }

  private evaluateMaximumTraderDecision(trader: TraderProfile, marketData: any): TraderDecision {
    const { currentPrice, marketConditions } = marketData;
    const hasPosition = marketData.activePositions.some(
      (p: any) => p.walletAddress === trader.trader.walletAddress
    );

    if (hasPosition) {
      const position = marketData.activePositions.find(
        (p: any) => p.walletAddress === trader.trader.walletAddress
      );
      
      const pnlPercentage = this.calculatePnL(position, currentPrice);
      
      if (this.shouldExitAggressively(trader, pnlPercentage, position)) {
        return {
          action: 'exit',
          walletAddress: trader.trader.walletAddress,
          reason: 'Maximum activity exit signal'
        };
      }
    } else {
      if (this.shouldEnterAggressively(trader, marketData)) {
        const quantity = this.calculateMaximumPositionSize(trader, currentPrice);
        return {
          action: 'enter',
          walletAddress: trader.trader.walletAddress,
          quantity,
          reason: 'Maximum activity entry signal'
        };
      }
    }

    return {
      action: 'hold',
      walletAddress: trader.trader.walletAddress,
      reason: 'No maximum activity opportunity detected'
    };
  }

  private shouldEnterAggressively(trader: TraderProfile, marketData: any): boolean {
    const { strategy } = trader;
    const { marketConditions } = marketData;

    switch (strategy) {
      case 'scalper':
        return Math.random() < 0.6 && marketConditions.volatility > 0.01;
      case 'momentum':
        return marketConditions.trend === 'bullish' && Math.random() < 0.7;
      case 'contrarian':
        return marketConditions.trend === 'bearish' && Math.random() < 0.7;
      default:
        return Math.random() < 0.5;
    }
  }

  private shouldExitAggressively(trader: TraderProfile, pnlPercentage: number, position: any): boolean {
    const { strategy } = trader;
    const timeInPosition = position.entryTime ? Date.now() - position.entryTime : 0;
    const minutesInPosition = timeInPosition / (60 * 1000);

    switch (strategy) {
      case 'scalper':
        return pnlPercentage > 0.003 || pnlPercentage < -0.002 || minutesInPosition > 15;
      case 'swing':
        return pnlPercentage > 0.015 || pnlPercentage < -0.008 || minutesInPosition > 90;
      default:
        return pnlPercentage > 0.008 || pnlPercentage < -0.004 || minutesInPosition > 30;
    }
  }

  private calculatePnL(position: any, currentPrice: number): number {
    const entryValue = Math.abs(position.quantity) * position.entryPrice;
    const currentValue = Math.abs(position.quantity) * currentPrice;
    const pnl = position.quantity > 0 ? currentValue - entryValue : entryValue - currentValue;
    return pnl / entryValue;
  }

  private calculateMaximumPositionSize(trader: TraderProfile, currentPrice: number): number {
    const { positionSizing } = trader;
    const baseSize = currentPrice < 1 ? 15000 : currentPrice < 10 ? 20000 : 25000;
    const sizeMultiplier = positionSizing === 'aggressive' ? 5 : positionSizing === 'moderate' ? 3 : 2;
    const positionValue = baseSize * sizeMultiplier * (0.7 + Math.random() * 0.6);
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
    let tradesAdded = 0;
    
    processedTrades.forEach(trade => {
      if (cache.has(trade.id)) return;
      
      cache.add(trade.id);
      
      const exists = simulation.recentTrades.some(t => t.id === trade.id);
      if (!exists) {
        simulation.recentTrades.unshift(trade);
        tradesAdded++;
        
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
    
    if (cache.size > 20000) {
      const entriesToDelete = Array.from(cache).slice(0, 10000);
      entriesToDelete.forEach(id => cache.delete(id));
    }
    
    if (simulation.recentTrades.length > 5000) {
      const removed = simulation.recentTrades.splice(5000);
      removed.forEach(trade => {
        try {
          this.tradePool.release(trade);
          this.poolUsageMetrics.tradesReleased++;
        } catch (releaseError) {
          console.error('❌ POOL: Error releasing integrated trade:', releaseError);
          this.poolUsageMetrics.errors++;
        }
      });
    }
    
    if (tradesAdded > 0) {
      console.log(`✅ POOL: Integrated ${tradesAdded} processed trades with proper pool management`);
    }
  }

  cleanup(): void {
    console.log('🧹 POOL: Starting TraderEngine cleanup with pool release...');
    
    if (this.poolMonitoringInterval) {
      clearInterval(this.poolMonitoringInterval);
    }
    
    try {
      this.tradePool.releaseAll();
      this.positionPool.releaseAll();
      console.log('✅ POOL: Released all pool objects');
    } catch (releaseError) {
      console.error('❌ POOL: Error releasing all pool objects:', releaseError);
    }
    
    this.processedTradesCache.clear();
    this.logPoolMetrics();
    
    console.log('✅ POOL: TraderEngine cleanup completed');
    console.log(`📊 POOL: Final metrics - Acquired: ${this.poolUsageMetrics.tradesAcquired}, Released: ${this.poolUsageMetrics.tradesReleased}, Errors: ${this.poolUsageMetrics.errors}`);
  }

  getPoolHealth(): {
    trade: { healthy: boolean; stats: any; issues: string[] };
    position: { healthy: boolean; stats: any; issues: string[] };
    metrics: typeof this.poolUsageMetrics;
  } {
    const tradeHealth = this.tradePool.healthCheck();
    const positionHealth = this.positionPool.healthCheck();
    
    return {
      trade: tradeHealth,
      position: positionHealth,
      metrics: { ...this.poolUsageMetrics }
    };
  }
}