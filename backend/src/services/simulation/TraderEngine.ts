// backend/src/services/simulation/TraderEngine.ts - COMPLETE FILE WITH CRITICAL POOL LEAK FIXES
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
  
  // CRITICAL FIX: Add pool monitoring and cleanup tracking
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
    // CRITICAL FIX: Initialize object pools with proper monitoring
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
        // CRITICAL FIX: Enhanced reset function with validation
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
          throw resetError; // Let pool handle the error
        }
      },
      5000, // Reduced from 10000 to prevent memory issues
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
        // CRITICAL FIX: Enhanced reset function with validation
        try {
          position.trader = {} as any;
          position.entryPrice = 0;
          position.quantity = 0;
          position.entryTime = 0;
          position.currentPnl = 0;
          position.currentPnlPercentage = 0;
        } catch (resetError) {
          console.error('❌ POOL: Error resetting position object:', resetError);
          throw resetError; // Let pool handle the error
        }
      },
      2500, // Reduced from 5000
      250   // Reduced pre-fill
    );
    
    // CRITICAL FIX: Start pool monitoring to prevent leaks
    this.startPoolMonitoring();
    
    console.log('✅ POOL: TraderEngine initialized with leak prevention monitoring');
  }
  
  // CRITICAL FIX: Pool monitoring to detect and prevent leaks
  private startPoolMonitoring(): void {
    this.poolMonitoringInterval = setInterval(() => {
      this.monitorPoolHealth();
    }, 30000); // Check every 30 seconds
  }
  
  // CRITICAL FIX: Pool health monitoring
  private monitorPoolHealth(): void {
    const tradeStats = this.tradePool.getStats();
    const positionStats = this.positionPool.getStats();
    
    // Check for concerning usage patterns
    if (tradeStats.inUse > tradeStats.maxSize * 0.8) {
      console.warn(`⚠️ POOL: Trade pool usage high: ${tradeStats.inUse}/${tradeStats.maxSize}`);
      this.forcePoolCleanup('trade');
    }
    
    if (positionStats.inUse > positionStats.maxSize * 0.8) {
      console.warn(`⚠️ POOL: Position pool usage high: ${positionStats.inUse}/${positionStats.maxSize}`);
      this.forcePoolCleanup('position');
    }
    
    // Check for memory leaks
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
    
    // Log metrics periodically
    if (Date.now() - this.lastPoolCleanup > 300000) { // Every 5 minutes
      this.logPoolMetrics();
    }
  }
  
  // CRITICAL FIX: Force pool cleanup when issues detected
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
  
  // CRITICAL FIX: Log pool metrics for monitoring
  private logPoolMetrics(): void {
    const tradeStats = this.tradePool.getStats();
    const positionStats = this.positionPool.getStats();
    
    console.log('📊 POOL: Current pool statistics:');
    console.log(`   Trade Pool: ${tradeStats.inUse}/${tradeStats.maxSize} in use, ${tradeStats.available} available, ${tradeStats.memoryEfficiency} efficiency`);
    console.log(`   Position Pool: ${positionStats.inUse}/${positionStats.maxSize} in use, ${positionStats.available} available, ${positionStats.memoryEfficiency} efficiency`);
    console.log(`   Metrics: Acquired=${this.poolUsageMetrics.tradesAcquired}, Released=${this.poolUsageMetrics.tradesReleased}, Cleanups=${this.poolUsageMetrics.forceCleanups}, Errors=${this.poolUsageMetrics.errors}`);
    
    if (tradeStats.warnings.length > 0) {
      console.warn(`⚠️ POOL: Trade pool warnings:`, tradeStats.warnings);
    }
    
    if (positionStats.warnings.length > 0) {
      console.warn(`⚠️ POOL: Position pool warnings:`, positionStats.warnings);
    }
  }

  setTransactionQueue(queue: TransactionQueue): void {
    this.transactionQueue = queue;
    console.log('✅ POOL: Transaction queue connected to MAXIMUM ACTIVITY TraderEngine');
  }

  // CRITICAL FIX: Enhanced processTraderActions with proper pool management
  processTraderActions(simulation: ExtendedSimulationState): void {
    const traders = simulation.traders; // All 118 real Dune Analytics traders
    const speed = simulation.parameters.timeCompressionFactor;
    
    // MAXIMUM ACTIVITY MODE: Calculate ultra-aggressive simulation mode
    const simulationMode = this.getMaximumActivityMode(speed);
    console.log(`🔥 [MAXIMUM ACTIVITY] ${simulationMode.name}: Targeting ${simulationMode.tradesPerTick} trades/tick from ALL ${traders.length} participants with pool leak prevention`);
    
    // FORCE MAXIMUM TRADING ACTIVITY
    const tradesGenerated: Trade[] = [];
    let poolErrors = 0;
    
    try {
      // 1. FORCE ALL 118 PARTICIPANTS TO BE HYPER-ACTIVE
      this.forceMaximumParticipantActivity(simulation, tradesGenerated, simulationMode);
      
      // 2. GENERATE MASSIVE MARKET MAKER ACTIVITY
      this.generateMaximumMarketMakerActivity(simulation, tradesGenerated, simulationMode);
      
      // 3. GENERATE MASSIVE RETAIL TRADING ACTIVITY  
      this.generateMaximumRetailActivity(simulation, tradesGenerated, simulationMode);
      
      // 4. GENERATE AGGRESSIVE POSITION ACTIVITY
      this.generateMaximumPositionActivity(simulation, tradesGenerated, simulationMode);
      
      // 5. ENSURE OVERWHELMING ACTIVITY THRESHOLD
      this.ensureMaximumActivity(simulation, tradesGenerated, simulationMode);
      
      // 6. UPDATE ALL TRADER STATS AND RANKINGS
      this.updateAllTraderStatsFromTrades(simulation, tradesGenerated);
      
      // CRITICAL FIX: Monitor pool usage after generation
      const tradeStats = this.tradePool.getStats();
      if (tradeStats.inUse > tradeStats.maxSize * 0.7) {
        console.warn(`⚠️ POOL: High trade pool usage after generation: ${tradeStats.inUse}/${tradeStats.maxSize}`);
      }
      
    } catch (error) {
      console.error('❌ POOL: Error in processTraderActions:', error);
      poolErrors++;
      
      // CRITICAL FIX: Release any trades that were generated before the error
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
    
    // CRITICAL FIX: Proper trade handling with automatic cleanup
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
        
        // CRITICAL FIX: Limit recent trades and release old ones
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
    
    // Update pool metrics
    this.poolUsageMetrics.errors += poolErrors;
    
    console.log(`✅ POOL: MAXIMUM ACTIVITY COMPLETE - Generated ${tradesGenerated.length} trades with ${poolErrors} pool errors`);
    console.log(`📊 POOL: MASSIVE CHART IMPACT - Total volume: ${tradesGenerated.reduce((sum, t) => sum + t.quantity, 0).toFixed(0)} tokens`);
  }

  // MAXIMUM ACTIVITY: Determine ultra-aggressive simulation mode
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
        tradesPerTick: 100, // MUCH higher than before (was 25)
        participantActivityRate: 0.80, // 80% of 118 participants active per tick
        positionActivityRate: 0.40,
        marketMakerMultiplier: 3
      };
    } else if (speed <= 15) {
      return {
        name: "MAXIMUM_MEDIUM", 
        tradesPerTick: 200, // MUCH higher (was 75)
        participantActivityRate: 0.90, // 90% active
        positionActivityRate: 0.60,
        marketMakerMultiplier: 5
      };
    } else {
      return {
        name: "MAXIMUM_FAST",
        tradesPerTick: 400, // MASSIVE activity (was 150)
        participantActivityRate: 1.0, // 100% active - ALL participants
        positionActivityRate: 0.80,
        marketMakerMultiplier: 8
      };
    }
  }

  // MAXIMUM ACTIVITY: Force ALL 118 participants to be hyper-active
  private forceMaximumParticipantActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const { traders } = simulation; // All 118 real Dune Analytics traders
    const activeCount = Math.max(50, Math.floor(traders.length * mode.participantActivityRate));
    
    // MAXIMUM MODE: Ensure we use ALL traders in fast mode
    const finalActiveCount = mode.participantActivityRate >= 1.0 ? traders.length : activeCount;
    
    // Shuffle traders but ensure high activity
    const shuffledTraders = [...traders].sort(() => 0.5 - Math.random());
    const activeTraders = shuffledTraders.slice(0, finalActiveCount);
    
    console.log(`🔥 [ALL PARTICIPANTS] Activating ${finalActiveCount}/${traders.length} real Dune Analytics traders (${(finalActiveCount/traders.length*100).toFixed(1)}%)`);
    
    // Generate multiple trades per active trader for maximum activity
    activeTraders.forEach((trader, index) => {
      // MAXIMUM MODE: Each trader can make 1-3 trades per tick
      const tradesPerTrader = mode.participantActivityRate >= 1.0 ? 1 + Math.floor(Math.random() * 3) : 1;
      
      for (let i = 0; i < tradesPerTrader; i++) {
        // Determine trading action
        const hasPosition = simulation.activePositions.some(p => 
          p.trader.walletAddress === trader.trader.walletAddress
        );
        
        let action: 'buy' | 'sell';
        
        if (hasPosition && Math.random() < 0.4) {
          // 40% chance to close existing position
          action = this.getPositionCloseAction(simulation, trader);
        } else {
          // Regular trading action with aggressive strategy
          action = this.determineAggressiveTraderAction(simulation, trader);
        }
        
        const trade = this.createMaximumActivityTrade(simulation, trader, action);
        
        if (trade) {
          tradesGenerated.push(trade);
          
          // Create/update position for this trader
          this.updateTraderPosition(simulation, trader, trade);
          
          // Log first few and random samples for debugging
          if (index < 5 || (index < 20 && Math.random() < 0.3)) {
            console.log(`   🔥 Hyper Trader ${trader.trader.walletAddress.slice(0, 8)}: ${action.toUpperCase()} ${trade.quantity.toFixed(0)} @ $${trade.price.toFixed(6)} (trade ${i+1}/${tradesPerTrader})`);
          }
        }
      }
    });
    
    console.log(`✅ [ALL PARTICIPANTS] Generated trades from ${finalActiveCount} hyper-active participants`);
  }

  // MAXIMUM ACTIVITY: Determine aggressive trading actions
  private determineAggressiveTraderAction(simulation: ExtendedSimulationState, trader: TraderProfile): 'buy' | 'sell' {
    const { strategy } = trader;
    const { trend, volatility } = simulation.marketConditions;
    const priceHistory = simulation.priceHistory.slice(-10);
    
    // Use real trader's historical performance but with aggressive multipliers
    const traderWinRate = trader.trader.winRate || 0.5;
    const traderRisk = trader.trader.riskProfile || 'moderate';
    
    // MAXIMUM ACTIVITY: More aggressive strategy-based decisions
    switch (strategy) {
      case 'momentum':
        if (trend === 'bullish' && traderWinRate > 0.5) return 'buy';
        if (trend === 'bearish' && traderWinRate > 0.5) return 'sell';
        // AGGRESSIVE: Even moderate performers trade more
        return Math.random() > 0.3 ? 'buy' : 'sell'; // 70% chance to trade
        
      case 'contrarian':
        if (trend === 'bullish' && volatility > 0.02) return 'sell';
        if (trend === 'bearish' && volatility > 0.02) return 'buy';
        // AGGRESSIVE: Always trade in contrarian mode
        return Math.random() > 0.4 ? 'buy' : 'sell'; // 60% chance
        
      case 'scalper':
        // AGGRESSIVE: Scalpers trade on any movement
        return volatility > 0.005 ? (Math.random() > 0.4 ? 'buy' : 'sell') : 'buy';
        
      default:
        // AGGRESSIVE: Default behavior with high activity
        if (traderRisk === 'aggressive') {
          return trend === 'bullish' ? 'buy' : 'sell';
        } else if (traderRisk === 'conservative') {
          return Math.random() > 0.5 ? 'buy' : 'sell'; // More frequent trading
        } else {
          return Math.random() > 0.4 ? 'buy' : 'sell'; // 60% chance to trade
        }
    }
  }

  // Get action to close existing position
  private getPositionCloseAction(simulation: ExtendedSimulationState, trader: TraderProfile): 'buy' | 'sell' {
    const position = simulation.activePositions.find(p => 
      p.trader.walletAddress === trader.trader.walletAddress
    );
    
    if (!position) return 'buy';
    
    // Close position = opposite action
    return position.quantity > 0 ? 'sell' : 'buy';
  }

  // CRITICAL FIX: Enhanced trade creation with proper pool management
  private createMaximumActivityTrade(
    simulation: ExtendedSimulationState, 
    trader: TraderProfile, 
    action: 'buy' | 'sell'
  ): Trade | null {
    let trade: Trade | null = null;
    
    try {
      // CRITICAL FIX: Acquire trade from pool with error handling
      trade = this.tradePool.acquire();
      this.poolUsageMetrics.tradesAcquired++;
      
      const currentPrice = simulation.currentPrice;
      const baseSize = this.calculateMaximumTradeSize(trader, currentPrice);
      const priceVariation = (Math.random() - 0.5) * 0.003; // ±0.15% price variation (higher)
      const tradePrice = currentPrice * (1 + priceVariation);
      
      // CRITICAL FIX: Populate trade object safely
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
      
      // CRITICAL FIX: Release trade if acquired but failed to populate
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

  // MAXIMUM ACTIVITY: Calculate much larger trade sizes
  private calculateMaximumTradeSize(trader: TraderProfile, currentPrice: number): number {
    const traderVolume = trader.trader.totalVolume || 10000;
    const riskProfile = trader.trader.riskProfile || 'moderate';
    
    // MAXIMUM ACTIVITY: Much larger base trade sizes
    let basePercentage = 0.15; // 15% of total volume (was 5%)
    
    // AGGRESSIVE: Adjust based on risk profile with higher multipliers
    switch (riskProfile) {
      case 'aggressive':
        basePercentage = 0.30; // 30% of volume (was 15%)
        break;
      case 'conservative':
        basePercentage = 0.10; // 10% of volume (was 2%)
        break;
      default:
        basePercentage = 0.20; // 20% of volume (was 5%)
    }
    
    // Calculate token quantity with higher variation
    const dollarAmount = traderVolume * basePercentage * (0.5 + Math.random() * 1.0); // ±100% variation
    const tokenQuantity = dollarAmount / currentPrice;
    
    // MAXIMUM ACTIVITY: Higher minimum and maximum bounds
    const minTokens = 500; // Higher minimum (was 100)
    const maxTokens = currentPrice < 1 ? 100000 : currentPrice < 10 ? 25000 : 15000; // Higher maximums
    
    return Math.max(minTokens, Math.min(maxTokens, tokenQuantity));
  }

  // MAXIMUM ACTIVITY: Calculate higher trade impact
  private calculateMaximumTradeImpact(simulation: ExtendedSimulationState, tradeValue: number): number {
    const liquidity = simulation.parameters.initialLiquidity;
    const volatility = simulation.marketConditions.volatility;
    
    // MAXIMUM ACTIVITY: Higher base impact
    let impact = (tradeValue / liquidity) * 0.002; // Double the impact (was 0.001)
    
    // Increase impact in volatile conditions
    impact *= (1 + volatility * 8); // Higher volatility multiplier
    
    // MAXIMUM ACTIVITY: Higher maximum impact
    return Math.min(0.01, impact); // Max 1% impact per trade (was 0.5%)
  }

  // CRITICAL FIX: Enhanced position creation with proper pool management
  private updateTraderPosition(
    simulation: ExtendedSimulationState, 
    trader: TraderProfile, 
    trade: Trade
  ): void {
    let position = simulation.activePositions.find(p => 
      p.trader.walletAddress === trader.trader.walletAddress
    );
    
    if (!position) {
      // CRITICAL FIX: Acquire position from pool with error handling
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
      
      // CRITICAL FIX: Remove position if quantity is very small and release to pool
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

  // MAXIMUM ACTIVITY: Generate massive market maker activity
  private generateMaximumMarketMakerActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const mmTradeCount = Math.floor(mode.tradesPerTick * 0.4 * mode.marketMakerMultiplier); // Higher percentage
    
    for (let i = 0; i < mmTradeCount; i++) {
      const trade = this.createMaximumMarketMakerTrade(simulation);
      if (trade) {
        tradesGenerated.push(trade);
      }
    }
    
    console.log(`🏪 [MAXIMUM MARKET MAKERS] Generated ${mmTradeCount} massive market maker trades`);
  }

  // Create larger market maker trades
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
      trade.quantity = 1000 + Math.random() * 3000; // 1000-4000 tokens (larger)
      trade.value = trade.price * trade.quantity;
      trade.impact = 0.0002; // Higher impact for MM trades
      
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

  // Calculate market spread
  private calculateMarketSpread(simulation: ExtendedSimulationState): number {
    const volatility = simulation.marketConditions.volatility;
    const baseSpread = 0.002; // 0.2% (higher)
    return Math.min(0.008, baseSpread + volatility * 3); // Max 0.8% spread
  }

  // MAXIMUM ACTIVITY: Generate massive retail trading activity
  private generateMaximumRetailActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    const retailTradeCount = Math.floor(mode.tradesPerTick * 0.5); // Higher percentage
    
    for (let i = 0; i < retailTradeCount; i++) {
      const trade = this.createMaximumRetailTrade(simulation);
      if (trade) {
        tradesGenerated.push(trade);
      }
    }
    
    console.log(`🏪 [MAXIMUM RETAIL] Generated ${retailTradeCount} massive retail trades`);
  }

  // Create larger retail trades
  private createMaximumRetailTrade(simulation: ExtendedSimulationState): Trade | null {
    let trade: Trade | null = null;
    
    try {
      const currentPrice = simulation.currentPrice;
      const priceVariation = (Math.random() - 0.5) * 0.015; // ±0.75% variation (higher)
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
      trade.quantity = 200 + Math.random() * 1500; // 200-1700 tokens (larger)
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

  // MAXIMUM ACTIVITY: Generate aggressive position-related activity
  private generateMaximumPositionActivity(
    simulation: ExtendedSimulationState, 
    tradesGenerated: Trade[], 
    mode: any
  ): void {
    // Randomly close more existing positions
    const positionsToClose = simulation.activePositions
      .filter(() => Math.random() < mode.positionActivityRate)
      .slice(0, 15); // Allow more closures per tick
    
    positionsToClose.forEach(position => {
      const closeTrade = this.createMaximumPositionCloseTrade(simulation, position);
      if (closeTrade) {
        tradesGenerated.push(closeTrade);
        
        // Remove position from active list
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

  // Create position close trade
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

  // MAXIMUM ACTIVITY: Ensure overwhelming activity threshold
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

  // Create random trade with maximum parameters
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
      trade.price = currentPrice * (0.998 + Math.random() * 0.004); // ±0.2% variation
      trade.quantity = 500 + Math.random() * 2000; // 500-2500 tokens (larger)
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

  // MAXIMUM ACTIVITY: Update ALL trader stats from generated trades
  private updateAllTraderStatsFromTrades(
    simulation: ExtendedSimulationState, 
    trades: Trade[]
  ): void {
    trades.forEach(trade => {
      const trader = simulation.traders.find(t => 
        t.trader.walletAddress === trade.trader.walletAddress
      );
      
      if (trader) {
        // Update trader statistics with higher multipliers
        trader.trader.tradeCount = (trader.trader.tradeCount || 0) + 1;
        trader.trader.totalVolume = (trader.trader.totalVolume || 0) + trade.value;
        
        if (trade.action === 'buy') {
          trader.trader.buyVolume = (trader.trader.buyVolume || 0) + trade.value;
        } else {
          trader.trader.sellVolume = (trader.trader.sellVolume || 0) + trade.value;
        }
        
        // Update net PnL based on trade impact
        const pnlImpact = trade.value * trade.impact * (trade.action === 'buy' ? 1 : -1);
        trader.trader.netPnl = (trader.trader.netPnl || 0) + pnlImpact;
      }
    });
    
    // Update trader rankings
    this.updateTraderRankings(simulation);
  }

  // Existing methods adapted for maximum activity...
  processTraderActionsBatch(simulation: SimulationState, batchSize: number): void {
    // Use the enhanced processTraderActions instead
    this.processTraderActions(simulation as ExtendedSimulationState);
  }

  applyTraderBehaviorModifiers(simulationId: string, modifiers: any): void {
    console.log(`Applying MAXIMUM ACTIVITY trader behavior modifiers for simulation ${simulationId}:`, modifiers);
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

  // MAXIMUM ACTIVITY: More aggressive decision making
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
      
      // MAXIMUM ACTIVITY: More aggressive exit conditions
      if (this.shouldExitAggressively(trader, pnlPercentage, position)) {
        return {
          action: 'exit',
          walletAddress: trader.trader.walletAddress,
          reason: 'Maximum activity exit signal'
        };
      }
    } else {
      // MAXIMUM ACTIVITY: More aggressive entry conditions
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

  // MAXIMUM ACTIVITY: More aggressive entry conditions
  private shouldEnterAggressively(trader: TraderProfile, marketData: any): boolean {
    const { strategy } = trader;
    const { marketConditions } = marketData;

    switch (strategy) {
      case 'scalper':
        return Math.random() < 0.6 && marketConditions.volatility > 0.01; // Higher chance
      case 'momentum':
        return marketConditions.trend === 'bullish' && Math.random() < 0.7; // Higher chance
      case 'contrarian':
        return marketConditions.trend === 'bearish' && Math.random() < 0.7; // Higher chance
      default:
        return Math.random() < 0.5; // Much higher chance (was 0.2)
    }
  }

  // MAXIMUM ACTIVITY: More aggressive exit conditions
  private shouldExitAggressively(trader: TraderProfile, pnlPercentage: number, position: any): boolean {
    const { strategy } = trader;
    const timeInPosition = position.entryTime ? Date.now() - position.entryTime : 0;
    const minutesInPosition = timeInPosition / (60 * 1000);

    switch (strategy) {
      case 'scalper':
        return pnlPercentage > 0.003 || pnlPercentage < -0.002 || minutesInPosition > 15; // Faster exits
      case 'swing':
        return pnlPercentage > 0.015 || pnlPercentage < -0.008 || minutesInPosition > 90; // Faster exits
      default:
        return pnlPercentage > 0.008 || pnlPercentage < -0.004 || minutesInPosition > 30; // Faster exits
    }
  }

  private calculatePnL(position: any, currentPrice: number): number {
    const entryValue = Math.abs(position.quantity) * position.entryPrice;
    const currentValue = Math.abs(position.quantity) * currentPrice;
    const pnl = position.quantity > 0 ? currentValue - entryValue : entryValue - currentValue;
    return pnl / entryValue;
  }

  // MAXIMUM ACTIVITY: Calculate larger position sizes
  private calculateMaximumPositionSize(trader: TraderProfile, currentPrice: number): number {
    const { positionSizing } = trader;
    const baseSize = currentPrice < 1 ? 15000 : currentPrice < 10 ? 20000 : 25000; // Much larger base sizes
    const sizeMultiplier = positionSizing === 'aggressive' ? 5 : positionSizing === 'moderate' ? 3 : 2; // Higher multipliers
    const positionValue = baseSize * sizeMultiplier * (0.7 + Math.random() * 0.6); // Higher variation
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

  // CRITICAL FIX: Enhanced cleanup with proper pool release
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
    
    // CRITICAL FIX: Clean up cache and trades with proper pool management
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

  // CRITICAL FIX: Enhanced cleanup method
  cleanup(): void {
    console.log('🧹 POOL: Starting TraderEngine cleanup with pool release...');
    
    // Stop pool monitoring
    if (this.poolMonitoringInterval) {
      clearInterval(this.poolMonitoringInterval);
    }
    
    // Release all objects from pools
    try {
      this.tradePool.releaseAll();
      this.positionPool.releaseAll();
      console.log('✅ POOL: Released all pool objects');
    } catch (releaseError) {
      console.error('❌ POOL: Error releasing all pool objects:', releaseError);
    }
    
    // Clear caches
    this.processedTradesCache.clear();
    
    // Log final metrics
    this.logPoolMetrics();
    
    console.log('✅ POOL: TraderEngine cleanup completed');
    console.log(`📊 POOL: Final metrics - Acquired: ${this.poolUsageMetrics.tradesAcquired}, Released: ${this.poolUsageMetrics.tradesReleased}, Errors: ${this.poolUsageMetrics.errors}`);
  }

  // CRITICAL FIX: Get pool health status for monitoring
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