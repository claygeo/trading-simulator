// backend/src/services/simulation/DataGenerator.ts - FIXED: Object Pool Cross-Contamination Prevention
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
  private tradePool: ObjectPool<Trade>;
  private positionPool: ObjectPool<TraderPosition>;

  // 🚨 CRITICAL FIX: Pool health tracking with unique identifiers
  private poolIdentifier: string;
  private tradePoolCreatedObjects = new WeakSet<Trade>();
  private positionPoolCreatedObjects = new WeakSet<TraderPosition>();
  
  // 🚨 CRITICAL FIX: Metrics for pool validation
  private poolMetrics = {
    tradesAcquired: 0,
    tradesReleased: 0,
    positionsAcquired: 0,
    positionsReleased: 0,
    crossPoolAttempts: 0,
    invalidReleases: 0,
    lastHealthCheck: Date.now()
  };

  constructor() {
    // 🚨 CRITICAL FIX: Create unique pool identifier for this DataGenerator instance
    this.poolIdentifier = `DataGen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🏭 DataGenerator: Initializing with unique identifier: ${this.poolIdentifier}`);

    // 🚨 CRITICAL FIX: Enhanced object factory with validation markers
    this.tradePool = new ObjectPool<Trade>(
      () => {
        const trade: Trade = {
          id: '',
          timestamp: 0,
          trader: {} as any,
          action: 'buy',
          price: 0,
          quantity: 0,
          value: 0,
          impact: 0,
          // 🚨 CRITICAL FIX: Add internal pool marker for validation
          __poolSource: this.poolIdentifier,
          __objectType: 'trade'
        } as any;
        
        // Track this object as created by this pool
        this.tradePoolCreatedObjects.add(trade);
        return trade;
      },
      (trade) => {
        // 🚨 CRITICAL FIX: Comprehensive reset with validation
        if (!this.isValidTradeObject(trade)) {
          console.error(`❌ POOL: Invalid trade object in reset`, Object.keys(trade || {}));
          return;
        }
        
        trade.id = '';
        trade.timestamp = 0;
        trade.trader = null as any;
        trade.action = 'buy';
        trade.price = 0;
        trade.quantity = 0;
        trade.value = 0;
        trade.impact = 0;
        
        // Reset internal markers
        (trade as any).__poolSource = this.poolIdentifier;
        (trade as any).__objectType = 'trade';
      },
      1500, // REDUCED pool size to prevent memory issues
      150   // REDUCED pre-fill
    );

    this.positionPool = new ObjectPool<TraderPosition>(
      () => {
        const position: TraderPosition = {
          trader: {} as any,
          entryPrice: 0,
          quantity: 0,
          entryTime: 0,
          currentPnl: 0,
          currentPnlPercentage: 0,
          // 🚨 CRITICAL FIX: Add internal pool marker for validation
          __poolSource: this.poolIdentifier,
          __objectType: 'position'
        } as any;
        
        // Track this object as created by this pool
        this.positionPoolCreatedObjects.add(position);
        return position;
      },
      (position) => {
        // 🚨 CRITICAL FIX: Comprehensive reset with validation
        if (!this.isValidPositionObject(position)) {
          console.error(`❌ POOL: Invalid position object in reset`, Object.keys(position || {}));
          return;
        }
        
        position.trader = null as any;
        position.entryPrice = 0;
        position.quantity = 0;
        position.entryTime = 0;
        position.currentPnl = 0;
        position.currentPnlPercentage = 0;
        
        // Reset internal markers
        (position as any).__poolSource = this.poolIdentifier;
        (position as any).__objectType = 'position';
      },
      750,  // REDUCED pool size
      75    // REDUCED pre-fill
    );
    
    // 🚨 CRITICAL FIX: Start periodic health monitoring
    this.startPoolHealthMonitoring();
    
    console.log(`✅ DataGenerator: Pools created with cross-contamination prevention`);
  }

  // 🚨 CRITICAL FIX: Object validation methods
  private isValidTradeObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    // Check required trade properties
    const requiredProps = ['id', 'timestamp', 'trader', 'action', 'price', 'quantity', 'value', 'impact'];
    for (const prop of requiredProps) {
      if (!(prop in obj)) return false;
    }
    
    // Check pool source
    const poolSource = (obj as any).__poolSource;
    const objectType = (obj as any).__objectType;
    
    if (poolSource && poolSource !== this.poolIdentifier) {
      console.warn(`⚠️ POOL: Trade object from different pool: ${poolSource} vs ${this.poolIdentifier}`);
      return false;
    }
    
    if (objectType && objectType !== 'trade') {
      console.warn(`⚠️ POOL: Wrong object type for trade: ${objectType}`);
      return false;
    }
    
    return true;
  }

  private isValidPositionObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    // Check required position properties
    const requiredProps = ['trader', 'entryPrice', 'quantity', 'entryTime', 'currentPnl', 'currentPnlPercentage'];
    for (const prop of requiredProps) {
      if (!(prop in obj)) return false;
    }
    
    // Check pool source
    const poolSource = (obj as any).__poolSource;
    const objectType = (obj as any).__objectType;
    
    if (poolSource && poolSource !== this.poolIdentifier) {
      console.warn(`⚠️ POOL: Position object from different pool: ${poolSource} vs ${this.poolIdentifier}`);
      return false;
    }
    
    if (objectType && objectType !== 'position') {
      console.warn(`⚠️ POOL: Wrong object type for position: ${objectType}`);
      return false;
    }
    
    return true;
  }

  // 🚨 CRITICAL FIX: Pool health monitoring
  private startPoolHealthMonitoring(): void {
    setInterval(() => {
      this.performPoolHealthCheck();
    }, 30000); // Every 30 seconds
  }

  private performPoolHealthCheck(): void {
    const now = Date.now();
    
    const tradeStats = this.tradePool.getStats();
    const positionStats = this.positionPool.getStats();
    
    // Check for potential issues
    const issues: string[] = [];
    
    if (!tradeStats.isHealthy) {
      issues.push(`Trade pool unhealthy: ${tradeStats.warnings?.join(', ')}`);
    }
    
    if (!positionStats.isHealthy) {
      issues.push(`Position pool unhealthy: ${positionStats.warnings?.join(', ')}`);
    }
    
    if (this.poolMetrics.crossPoolAttempts > 0) {
      issues.push(`Cross-pool contamination attempts: ${this.poolMetrics.crossPoolAttempts}`);
    }
    
    if (this.poolMetrics.invalidReleases > 0) {
      issues.push(`Invalid release attempts: ${this.poolMetrics.invalidReleases}`);
    }
    
    // Log health status
    if (issues.length > 0) {
      console.warn(`⚠️ POOL HEALTH [${this.poolIdentifier}]:`, issues);
    }
    
    // Update metrics
    this.poolMetrics.lastHealthCheck = now;
  }

  // 🚨 CRITICAL FIX: TRUE clean start - NO initial data generation
  generateInitialPositionsAndTrades(simulation: SimulationState): void {
    console.log(`🎯 CLEAN START [${this.poolIdentifier}]: NO initial positions or trades generated`);
    console.log('📊 Chart will build from ZERO when simulation starts running');
    
    // 🚨 CRITICAL: Ensure COMPLETELY empty start
    simulation.activePositions = [];
    simulation.closedPositions = [];
    simulation.recentTrades = [];
    
    // Only update trader rankings based on existing trader data (no new trades)
    this.updateTraderRankings(simulation);
    
    console.log(`✅ TRUE CLEAN START [${this.poolIdentifier}]:`);
    console.log(`   Active positions: ${simulation.activePositions.length}`);
    console.log(`   Closed positions: ${simulation.closedPositions.length}`);
    console.log(`   Recent trades: ${simulation.recentTrades.length}`);
    console.log(`   💡 Chart will build in real-time from simulation activity`);
  }

  // 🚨 CRITICAL FIX: Enhanced live position generation with pool validation
  generateLivePosition(
    simulation: SimulationState, 
    trader: TraderProfile, 
    timestamp: number, 
    currentPrice: number
  ): void {
    // Only generate positions during live simulation
    if (!simulation.isRunning) {
      return;
    }

    try {
      const isLong = Math.random() > 0.4; // 60% long bias
      const basePositionValue = 5000 + Math.random() * 45000; // $5K to $50K
      const quantity = basePositionValue / currentPrice;
      const positionQuantity = isLong ? quantity : -quantity;

      const entryPriceVariation = (Math.random() - 0.5) * 0.005; // ±0.25% variation
      const entryPrice = currentPrice * (1 + entryPriceVariation);

      const entryValue = Math.abs(positionQuantity) * entryPrice;
      const currentValue = Math.abs(positionQuantity) * currentPrice;
      const pnl = isLong ? 
        currentValue - entryValue :
        entryValue - currentValue;
      const pnlPercentage = pnl / entryValue;

      // 🚨 CRITICAL FIX: Safe pool acquisition with validation
      const position = this.acquirePosition();
      if (!position) {
        console.warn(`⚠️ POOL: Failed to acquire position for ${trader.trader.walletAddress}`);
        return;
      }

      position.trader = trader.trader;
      position.entryPrice = entryPrice;
      position.quantity = positionQuantity;
      position.entryTime = timestamp;
      position.currentPnl = pnl;
      position.currentPnlPercentage = pnlPercentage;

      simulation.activePositions.push(position);
      this.poolMetrics.positionsAcquired++;

      // Create corresponding trade record
      const trade = this.acquireTrade();
      if (!trade) {
        console.warn(`⚠️ POOL: Failed to acquire trade for position ${trader.trader.walletAddress}`);
        return;
      }

      trade.id = uuidv4();
      trade.timestamp = timestamp;
      trade.trader = trader.trader;
      trade.action = isLong ? 'buy' : 'sell';
      trade.price = entryPrice;
      trade.quantity = Math.abs(positionQuantity);
      trade.value = entryPrice * Math.abs(positionQuantity);
      trade.impact = 0.0001 * (entryPrice * Math.abs(positionQuantity)) / simulation.marketConditions.volume;

      simulation.recentTrades.unshift(trade);
      this.poolMetrics.tradesAcquired++;

      console.log(`💼 Live position [${this.poolIdentifier}]: ${trader.trader.walletAddress} ${isLong ? 'LONG' : 'SHORT'} ${Math.abs(positionQuantity).toFixed(2)} @ $${entryPrice.toFixed(4)}`);
      
    } catch (error) {
      console.error(`❌ POOL: Error generating live position:`, error);
    }
  }

  // 🚨 CRITICAL FIX: Enhanced trade generation with pool validation
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

    try {
      const priceVariation = (Math.random() - 0.5) * 0.002; // ±0.1% variation
      const price = currentPrice * (1 + priceVariation);
      
      // 🚨 CRITICAL FIX: Safe pool acquisition with validation
      const trade = this.acquireTrade();
      if (!trade) {
        console.warn(`⚠️ POOL: Failed to acquire trade for ${trader.trader.walletAddress}`);
        return null;
      }

      trade.id = uuidv4();
      trade.timestamp = timestamp;
      trade.trader = trader.trader;
      trade.action = action;
      trade.price = price;
      trade.quantity = Math.random() * 5000 + 500; // 500-5500 tokens
      trade.value = trade.price * trade.quantity;
      trade.impact = (trade.quantity / simulation.parameters.initialLiquidity) * 0.0001;
      
      this.poolMetrics.tradesAcquired++;
      
      console.log(`💰 Live trade [${this.poolIdentifier}]: ${trader.trader.walletAddress} ${action.toUpperCase()} ${trade.quantity.toFixed(2)} @ $${price.toFixed(4)}`);
      
      return trade;
      
    } catch (error) {
      console.error(`❌ POOL: Error generating live trade:`, error);
      return null;
    }
  }

  // 🚨 CRITICAL FIX: Safe object acquisition methods
  private acquireTrade(): Trade | null {
    try {
      const trade = this.tradePool.acquire();
      
      // Validate the acquired object
      if (!this.isValidTradeObject(trade)) {
        console.error(`❌ POOL: Acquired invalid trade object`);
        return null;
      }
      
      return trade;
    } catch (error) {
      console.error(`❌ POOL: Error acquiring trade:`, error);
      return null;
    }
  }

  private acquirePosition(): TraderPosition | null {
    try {
      const position = this.positionPool.acquire();
      
      // Validate the acquired object
      if (!this.isValidPositionObject(position)) {
        console.error(`❌ POOL: Acquired invalid position object`);
        return null;
      }
      
      return position;
    } catch (error) {
      console.error(`❌ POOL: Error acquiring position:`, error);
      return null;
    }
  }

  // 🚨 CRITICAL FIX: Generate dummy traders for fallback only
  generateDummyTraders(count: number = 10): Trader[] {
    console.log(`🎯 FALLBACK [${this.poolIdentifier}]: Generating ${count} dummy traders (Dune API unavailable)`);
    
    return Array.from({ length: count }, (_, i) => ({
      position: i + 1,
      walletAddress: `DummyTrader${i+1}`,
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

  // 🚨 CRITICAL FIX: Risk profiling based on trading data
  determineRiskProfile(trader: any): 'conservative' | 'moderate' | 'aggressive' {
    const buyToSellRatio = trader.buy_volume / (trader.sell_volume || 1);
    const avgTradeSize = trader.avg_trade_size || 0;
    const winRate = trader.win_rate || 0.5;

    let riskScore = 0;

    // Balanced buy/sell ratio = more conservative
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

    // Lower win rate = more aggressive trading
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

  // 🚨 CRITICAL FIX: Clean trader ranking update
  private updateTraderRankings(simulation: SimulationState): void {
    // Sort traders by net PnL (based on existing data only)
    simulation.traderRankings = [...simulation.traders]
      .map(profile => profile.trader)
      .sort((a, b) => (b.netPnl || 0) - (a.netPnl || 0));
    
    console.log(`📊 Trader rankings updated [${this.poolIdentifier}]: ${simulation.traderRankings.length} traders ranked by existing PnL`);
  }

  // 🚨 CRITICAL FIX: Enhanced object release with cross-pool prevention
  releasePosition(position: TraderPosition): void {
    try {
      // 🚨 CRITICAL: Validate object belongs to this pool before release
      if (!this.isValidPositionObject(position)) {
        console.error(`❌ POOL: Attempting to release invalid position object to ${this.poolIdentifier}`);
        this.poolMetrics.invalidReleases++;
        return;
      }
      
      // Check if this object was created by this pool
      if (!this.positionPoolCreatedObjects.has(position)) {
        const poolSource = (position as any).__poolSource;
        if (poolSource && poolSource !== this.poolIdentifier) {
          console.error(`❌ CROSS-POOL: Attempting to release position from pool ${poolSource} to ${this.poolIdentifier}`);
          this.poolMetrics.crossPoolAttempts++;
          return;
        }
      }
      
      this.positionPool.release(position);
      this.poolMetrics.positionsReleased++;
      
    } catch (error) {
      console.error(`❌ POOL: Error releasing position to ${this.poolIdentifier}:`, error);
      this.poolMetrics.invalidReleases++;
    }
  }

  releaseTrade(trade: Trade): void {
    try {
      // 🚨 CRITICAL: Validate object belongs to this pool before release
      if (!this.isValidTradeObject(trade)) {
        console.error(`❌ POOL: Attempting to release invalid trade object to ${this.poolIdentifier}`);
        this.poolMetrics.invalidReleases++;
        return;
      }
      
      // Check if this object was created by this pool
      if (!this.tradePoolCreatedObjects.has(trade)) {
        const poolSource = (trade as any).__poolSource;
        if (poolSource && poolSource !== this.poolIdentifier) {
          console.error(`❌ CROSS-POOL: Attempting to release trade from pool ${poolSource} to ${this.poolIdentifier}`);
          this.poolMetrics.crossPoolAttempts++;
          return;
        }
      }
      
      this.tradePool.release(trade);
      this.poolMetrics.tradesReleased++;
      
    } catch (error) {
      console.error(`❌ POOL: Error releasing trade to ${this.poolIdentifier}:`, error);
      this.poolMetrics.invalidReleases++;
    }
  }

  // 🚨 CRITICAL FIX: Enhanced pool health monitoring
  getPoolHealth(): {
    trade: { healthy: boolean; size: number; acquired: number; released: number; stats: any };
    position: { healthy: boolean; size: number; acquired: number; released: number; stats: any };
    metrics: any;
    poolIdentifier: string;
  } {
    const tradeStats = this.tradePool.getStats();
    const positionStats = this.positionPool.getStats();
    
    return {
      trade: {
        healthy: tradeStats.isHealthy,
        size: tradeStats.total,
        acquired: this.poolMetrics.tradesAcquired,
        released: this.poolMetrics.tradesReleased,
        stats: tradeStats
      },
      position: {
        healthy: positionStats.isHealthy,
        size: positionStats.total,
        acquired: this.poolMetrics.positionsAcquired,
        released: this.poolMetrics.positionsReleased,
        stats: positionStats
      },
      metrics: {
        ...this.poolMetrics,
        tradeLeakage: this.poolMetrics.tradesAcquired - this.poolMetrics.tradesReleased,
        positionLeakage: this.poolMetrics.positionsAcquired - this.poolMetrics.positionsReleased,
        overallHealth: tradeStats.isHealthy && positionStats.isHealthy && 
                       this.poolMetrics.crossPoolAttempts === 0 && 
                       this.poolMetrics.invalidReleases === 0
      },
      poolIdentifier: this.poolIdentifier
    };
  }

  // 🚨 CRITICAL FIX: Enhanced pool cleanup
  forcePoolCleanup(): void {
    console.log(`🧹 DataGenerator: Force cleaning object pools [${this.poolIdentifier}]`);
    
    try {
      // Force garbage collection on both pools
      this.tradePool.forceGarbageCollection();
      this.positionPool.forceGarbageCollection();
      
      // Reset metrics
      this.poolMetrics = {
        tradesAcquired: 0,
        tradesReleased: 0,
        positionsAcquired: 0,
        positionsReleased: 0,
        crossPoolAttempts: 0,
        invalidReleases: 0,
        lastHealthCheck: Date.now()
      };
      
      console.log(`✅ DataGenerator: Pool cleanup completed [${this.poolIdentifier}]`);
      
    } catch (error) {
      console.error(`❌ DataGenerator: Error during force cleanup [${this.poolIdentifier}]:`, error);
    }
  }

  // 🚨 CRITICAL FIX: Pool validation method
  validatePoolIntegrity(): boolean {
    const tradeHealthCheck = this.tradePool.healthCheck();
    const positionHealthCheck = this.positionPool.healthCheck();
    
    const issues: string[] = [];
    
    if (!tradeHealthCheck.healthy) {
      issues.push(...tradeHealthCheck.issues.map(issue => `Trade pool: ${issue}`));
    }
    
    if (!positionHealthCheck.healthy) {
      issues.push(...positionHealthCheck.issues.map(issue => `Position pool: ${issue}`));
    }
    
    if (this.poolMetrics.crossPoolAttempts > 0) {
      issues.push(`Cross-pool contamination detected: ${this.poolMetrics.crossPoolAttempts} attempts`);
    }
    
    if (this.poolMetrics.invalidReleases > 0) {
      issues.push(`Invalid releases detected: ${this.poolMetrics.invalidReleases} attempts`);
    }
    
    if (issues.length > 0) {
      console.error(`❌ POOL VALIDATION [${this.poolIdentifier}]:`, issues);
      return false;
    }
    
    return true;
  }

  cleanup(): void {
    console.log(`🧹 DataGenerator: Starting cleanup [${this.poolIdentifier}]`);
    
    try {
      // Final pool health report
      const health = this.getPoolHealth();
      if (!health.metrics.overallHealth) {
        console.warn(`⚠️ CLEANUP: Pool health issues detected [${this.poolIdentifier}]:`, health.metrics);
      }
      
      // Clear pools completely
      this.tradePool.clear();
      this.positionPool.clear();
      
      // Clear tracking sets
      this.tradePoolCreatedObjects = new WeakSet();
      this.positionPoolCreatedObjects = new WeakSet();
      
      // Reset metrics
      this.poolMetrics = {
        tradesAcquired: 0,
        tradesReleased: 0,
        positionsAcquired: 0,
        positionsReleased: 0,
        crossPoolAttempts: 0,
        invalidReleases: 0,
        lastHealthCheck: Date.now()
      };
      
      console.log(`✅ DataGenerator: Cleanup complete [${this.poolIdentifier}]`);
      
    } catch (error) {
      console.error(`❌ DataGenerator: Error during cleanup [${this.poolIdentifier}]:`, error);
    }
  }

  // 🚨 CRITICAL FIX: Debug method for pool analysis
  debugPoolState(): void {
    console.log(`🔍 POOL DEBUG [${this.poolIdentifier}]:`);
    
    const tradeStats = this.tradePool.getStats();
    const positionStats = this.positionPool.getStats();
    
    console.log(`  Trade Pool:`, {
      available: tradeStats.available,
      inUse: tradeStats.inUse,
      total: tradeStats.total,
      healthy: tradeStats.isHealthy,
      warnings: tradeStats.warnings
    });
    
    console.log(`  Position Pool:`, {
      available: positionStats.available,
      inUse: positionStats.inUse,
      total: positionStats.total,
      healthy: positionStats.isHealthy,
      warnings: positionStats.warnings
    });
    
    console.log(`  Metrics:`, this.poolMetrics);
    
    console.log(`  Cross-Pool Issues:`, {
      crossPoolAttempts: this.poolMetrics.crossPoolAttempts,
      invalidReleases: this.poolMetrics.invalidReleases,
      tradeLeakage: this.poolMetrics.tradesAcquired - this.poolMetrics.tradesReleased,
      positionLeakage: this.poolMetrics.positionsAcquired - this.poolMetrics.positionsReleased
    });
  }
}