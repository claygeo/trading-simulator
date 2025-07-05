// backend/src/services/simulation/TimeframeManager.ts - ULTRA FAST TIMEFRAMES FOR RAPID CANDLE GENERATION
import { 
  Timeframe, 
  TimeframeConfig, 
  MarketAnalysis, 
  SimulationState,
  Trade,
  ITimeframeManager 
} from './types';

export class TimeframeManager implements ITimeframeManager {
  private marketAnalysisCache: Map<string, MarketAnalysis> = new Map();
  private lastAnalysisTime: Map<string, number> = new Map();
  private recentTradesBuffer: Map<string, Trade[]> = new Map();

  // ULTRA FAST TIMEFRAMES: Dramatically reduced intervals for rapid candle generation
  private readonly timeframeConfigs: Record<Timeframe, TimeframeConfig> = {
    '1m': {
      interval: 5 * 1000,            // 5,000ms = 5 seconds (was 60,000ms = 1 minute)
      candlesPerView: 60,
      updateFrequency: 250,          // Update every 250ms (was 1000ms)
      volatilityMultiplier: 3.0      // Higher volatility for visible action
    },
    '5m': {
      interval: 10 * 1000,           // 10,000ms = 10 seconds (was 300,000ms = 5 minutes)
      candlesPerView: 48,
      updateFrequency: 500,          // Update every 500ms (was 5000ms)
      volatilityMultiplier: 2.5
    },
    '15m': {
      interval: 15 * 1000,           // 15,000ms = 15 seconds (was 900,000ms = 15 minutes)
      candlesPerView: 48,
      updateFrequency: 750,          // Update every 750ms (was 15000ms)
      volatilityMultiplier: 2.0
    },
    '30m': {
      interval: 30 * 1000,           // 30,000ms = 30 seconds (was 1,800,000ms = 30 minutes)
      candlesPerView: 48,
      updateFrequency: 1000,         // Update every 1000ms (was 30000ms)
      volatilityMultiplier: 1.5
    },
    '1h': {
      interval: 60 * 1000,           // 60,000ms = 1 minute (was 3,600,000ms = 1 hour)
      candlesPerView: 24,
      updateFrequency: 2000,         // Update every 2000ms (was 60000ms)
      volatilityMultiplier: 1.2
    },
    '4h': {
      interval: 4 * 60 * 1000,       // 240,000ms = 4 minutes (was 14,400,000ms = 4 hours)
      candlesPerView: 24,
      updateFrequency: 5000,         // Update every 5000ms (was 120000ms)
      volatilityMultiplier: 1.0
    },
    '1d': {
      interval: 15 * 60 * 1000,      // 900,000ms = 15 minutes (was 86,400,000ms = 1 day)
      candlesPerView: 30,
      updateFrequency: 10000,        // Update every 10000ms (was 300000ms)
      volatilityMultiplier: 0.8
    }
  };

  constructor() {
    console.log('🚀 ULTRA FAST TimeframeManager initialized with rapid candle intervals:');
    Object.entries(this.timeframeConfigs).forEach(([timeframe, config]) => {
      console.log(`   ${timeframe}: ${config.interval/1000}s intervals (${config.updateFrequency}ms updates)`);
    });
  }

  analyzeMarketConditions(simulationId: string, simulation: SimulationState): MarketAnalysis {
    const now = Date.now();
    const cacheKey = simulationId;
    const lastAnalysis = this.lastAnalysisTime.get(cacheKey) || 0;

    // ULTRA FAST: Cache analysis for only 1 second for rapid updates
    if (now - lastAnalysis < 1000 && this.marketAnalysisCache.has(cacheKey)) {
      return this.marketAnalysisCache.get(cacheKey)!;
    }

    // Analyze price level
    const priceLevel = this.categorizePriceLevel(simulation.currentPrice);

    // Calculate volatility (0-100 scale)
    const volatility = this.calculateUltraFastVolatility(simulation);

    // Calculate trading intensity (trades per minute)
    const tradingIntensity = this.calculateUltraFastTradingIntensity(simulation);

    // Determine market condition
    const marketCondition = this.determineUltraFastMarketCondition(volatility, tradingIntensity);

    // Check for active scenarios
    const activeScenario = (simulation as any).activeScenario;
    const hasActiveScenario = !!activeScenario && activeScenario.phase === 'active';

    // Recommend timeframe based on all factors (always ultra-fast)
    const recommendedTimeframe = this.recommendUltraFastTimeframe(
      priceLevel,
      volatility,
      tradingIntensity,
      marketCondition,
      hasActiveScenario
    );

    // Determine if we should adapt
    const currentTimeframe = this.getCurrentTimeframe(simulationId);
    const shouldAdaptTimeframe = recommendedTimeframe !== currentTimeframe;

    // Calculate price movement from recent candles
    const priceMovement = this.calculatePriceMovement(simulation);

    // Create analysis result with ALL required properties
    const analysis: MarketAnalysis = {
      trend: simulation.marketConditions.trend,
      volatility,
      volume: simulation.marketConditions.volume,
      priceMovement,
      recommendedTimeframe,
      reason: this.getUltraFastAnalysisReason(priceLevel, volatility, tradingIntensity, marketCondition, hasActiveScenario),
      tradingIntensity,
      priceLevel,
      marketCondition,
      shouldAdaptTimeframe
    };

    // Cache the analysis
    this.marketAnalysisCache.set(cacheKey, analysis);
    this.lastAnalysisTime.set(cacheKey, now);

    return analysis;
  }

  // ULTRA FAST: Always start with fastest timeframe
  determineOptimalTimeframe(price: number): Timeframe {
    // Always start with 1m (which is now 5-second intervals) for maximum speed
    return '1m';
  }

  getTimeframeConfig(timeframe: Timeframe): TimeframeConfig {
    const config = this.timeframeConfigs[timeframe];
    
    // Log the ultra-fast configuration being used
    if (Math.random() < 0.01) { // 1% chance to log
      console.log(`⚡ [ULTRA FAST] Using ${timeframe} = ${config.interval/1000}s intervals (${config.updateFrequency}ms updates)`);
    }
    
    return config;
  }

  shouldAdjustTimeframe(analysis: MarketAnalysis, currentTimeframe: Timeframe): boolean {
    // ULTRA FAST: Less frequent timeframe changes to maintain consistency
    return analysis.shouldAdaptTimeframe && analysis.recommendedTimeframe !== currentTimeframe;
  }

  updateTradesBuffer(simulationId: string, trades: Trade[]): void {
    const buffer = this.recentTradesBuffer.get(simulationId) || [];
    buffer.push(...trades);
    
    // ULTRA FAST: Keep larger buffer for high-frequency trading
    if (buffer.length > 2000) {
      this.recentTradesBuffer.set(simulationId, buffer.slice(-2000));
    } else {
      this.recentTradesBuffer.set(simulationId, buffer);
    }
  }

  clearCache(simulationId: string): void {
    this.marketAnalysisCache.delete(simulationId);
    this.lastAnalysisTime.delete(simulationId);
    this.recentTradesBuffer.delete(simulationId);
  }

  private categorizePriceLevel(price: number): 'micro' | 'small' | 'mid' | 'large' | 'mega' {
    // Adjusted for $1-$50 range
    if (price < 5) return 'micro';      // $1-$5
    if (price < 10) return 'small';     // $5-$10
    if (price < 20) return 'mid';       // $10-$20
    if (price < 35) return 'large';     // $20-$35
    return 'mega';                       // $35-$50
  }

  // ULTRA FAST: Enhanced volatility calculation for rapid updates
  private calculateUltraFastVolatility(simulation: SimulationState): number {
    const { priceHistory } = simulation;
    if (priceHistory.length < 5) return 60; // Default higher volatility for rapid action

    // ULTRA FAST: Use more recent candles (last 10 instead of 20)
    const recentCandles = priceHistory.slice(-10);

    // Calculate percentage changes
    const changes: number[] = [];
    for (let i = 1; i < recentCandles.length; i++) {
      const change = Math.abs((recentCandles[i].close - recentCandles[i-1].close) / recentCandles[i-1].close) * 100;
      changes.push(change);
    }

    // Calculate average and max change
    const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;
    const maxChange = Math.max(...changes);

    // ULTRA FAST: More aggressive scoring for visible movement
    let score = 0;

    // Average change contribution (0-50 points) - more aggressive thresholds
    if (avgChange < 0.1) score += 20;        // Lower threshold
    else if (avgChange < 0.3) score += 35;   // Lower threshold
    else if (avgChange < 0.8) score += 45;   // Lower threshold
    else if (avgChange < 2) score += 55;     // Higher score
    else score += 70;                        // Much higher score

    // Max change contribution (0-50 points) - more aggressive thresholds
    if (maxChange < 0.5) score += 20;        // Lower threshold
    else if (maxChange < 1.5) score += 35;   // Lower threshold
    else if (maxChange < 4) score += 45;     // Lower threshold
    else if (maxChange < 10) score += 55;    // Higher score
    else score += 70;                        // Much higher score

    return Math.min(100, score);
  }

  // ULTRA FAST: Enhanced trading intensity calculation
  private calculateUltraFastTradingIntensity(simulation: SimulationState): number {
    const { recentTrades } = simulation;
    if (recentTrades.length === 0) return 0;

    // ULTRA FAST: Use shorter time window (1 minute instead of 5)
    const oneMinuteAgo = simulation.currentTime - (1 * 60 * 1000);
    const recentTradeCount = recentTrades.filter(t => t.timestamp >= oneMinuteAgo).length;

    // Return trades per minute with higher scaling
    return recentTradeCount * 2; // Double the intensity score
  }

  private calculatePriceMovement(simulation: SimulationState): number {
    const { priceHistory, currentPrice } = simulation;
    
    if (priceHistory.length === 0) return 0;
    
    // Calculate price movement from first candle to current price
    const firstPrice = priceHistory[0].open;
    return ((currentPrice - firstPrice) / firstPrice) * 100;
  }

  // ULTRA FAST: More aggressive market condition determination
  private determineUltraFastMarketCondition(
    volatility: number,
    tradingIntensity: number
  ): 'calm' | 'normal' | 'volatile' | 'extreme' {
    // ULTRA FAST: Lower thresholds for more exciting market conditions
    if (volatility < 30 && tradingIntensity < 10) return 'calm';     // Lower thresholds
    if (volatility < 50 && tradingIntensity < 30) return 'normal';   // Lower thresholds
    if (volatility < 70 || tradingIntensity < 60) return 'volatile'; // Lower thresholds
    return 'extreme';
  }

  // ULTRA FAST: Recommend fastest timeframes for rapid candle generation
  private recommendUltraFastTimeframe(
    priceLevel: 'micro' | 'small' | 'mid' | 'large' | 'mega',
    volatility: number,
    tradingIntensity: number,
    marketCondition: 'calm' | 'normal' | 'volatile' | 'extreme',
    hasActiveScenario: boolean
  ): Timeframe {
    // ULTRA FAST: Always prefer fastest timeframes for rapid candle building

    // Use 1m (5-second intervals) for:
    // - Active scenarios
    // - High volatility
    // - Extreme market conditions
    // - High trading intensity
    if (hasActiveScenario || 
        marketCondition === 'extreme' || 
        volatility > 60 || 
        tradingIntensity > 40) {
      return '1m'; // 5-second intervals
    }

    // Use 5m (10-second intervals) for:
    // - Volatile conditions
    // - Moderate activity
    if (marketCondition === 'volatile' || 
        volatility > 40 || 
        tradingIntensity > 20) {
      return '5m'; // 10-second intervals
    }

    // Use 15m (15-second intervals) for:
    // - Normal conditions
    // - Default case
    return '15m'; // 15-second intervals (still much faster than original)
  }

  // ULTRA FAST: Enhanced analysis reasoning
  private getUltraFastAnalysisReason(
    priceLevel: string,
    volatility: number,
    tradingIntensity: number,
    marketCondition: string,
    hasActiveScenario: boolean
  ): string {
    const reasons: string[] = [];

    if (hasActiveScenario) {
      reasons.push('Active market scenario');
    }

    reasons.push(`${priceLevel}-cap token`);
    reasons.push(`${marketCondition} ultra-fast market`);

    if (volatility > 60) {
      reasons.push('High volatility (ultra-fast mode)');
    } else if (volatility < 30) {
      reasons.push('Low volatility (ultra-fast mode)');
    }

    if (tradingIntensity > 40) {
      reasons.push('High trading activity (ultra-fast)');
    } else if (tradingIntensity < 10) {
      reasons.push('Low trading activity (ultra-fast)');
    }

    return reasons.join(', ');
  }

  private getCurrentTimeframe(simulationId: string): Timeframe {
    // Default to fastest timeframe
    return '1m';
  }

  // ULTRA FAST: Force fastest possible timeframe for any simulation
  forceUltraFastTimeframe(): Timeframe {
    return '1m'; // 5-second intervals
  }

  // ULTRA FAST: Get configuration for fastest possible trading
  getUltraFastConfig(): TimeframeConfig {
    return {
      interval: 3000,        // 3 seconds - even faster than 1m
      candlesPerView: 100,   // More candles for better visualization
      updateFrequency: 100,  // Update every 100ms
      volatilityMultiplier: 4.0 // Maximum volatility for visible action
    };
  }

  // ULTRA FAST: Override timeframe configs for maximum speed mode
  enableMaximumSpeedMode(): void {
    // Override all timeframes to be ultra-fast
    this.timeframeConfigs['1m'].interval = 3000;   // 3 seconds
    this.timeframeConfigs['5m'].interval = 5000;   // 5 seconds
    this.timeframeConfigs['15m'].interval = 8000;  // 8 seconds
    this.timeframeConfigs['30m'].interval = 12000; // 12 seconds
    
    // Make all update frequencies ultra-fast
    Object.values(this.timeframeConfigs).forEach(config => {
      config.updateFrequency = Math.min(config.updateFrequency, 200); // Max 200ms updates
      config.volatilityMultiplier *= 1.5; // Increase volatility for all timeframes
    });
    
    console.log('🚀 MAXIMUM SPEED MODE enabled - all timeframes now ultra-fast!');
    Object.entries(this.timeframeConfigs).forEach(([timeframe, config]) => {
      console.log(`   ${timeframe}: ${config.interval/1000}s intervals (${config.updateFrequency}ms updates)`);
    });
  }

  // ULTRA FAST: Get statistics about rapid candle generation
  getUltraFastStats(): {
    fastestInterval: number;
    averageInterval: number;
    fastestUpdate: number;
    totalSpeedIncrease: string;
  } {
    const intervals = Object.values(this.timeframeConfigs).map(c => c.interval);
    const updates = Object.values(this.timeframeConfigs).map(c => c.updateFrequency);
    
    const fastestInterval = Math.min(...intervals);
    const averageInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const fastestUpdate = Math.min(...updates);
    
    // Calculate speed increase (original 1m was 60000ms, now it's much less)
    const originalInterval = 60000; // Original 1-minute interval
    const speedIncrease = ((originalInterval - fastestInterval) / originalInterval * 100).toFixed(1);
    
    return {
      fastestInterval,
      averageInterval,
      fastestUpdate,
      totalSpeedIncrease: `${speedIncrease}% faster`
    };
  }
}