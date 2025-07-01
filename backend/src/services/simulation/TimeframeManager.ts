// backend/src/services/simulation/TimeframeManager.ts - FIXED: Complete MarketAnalysis interface compliance
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

  // Timeframe configurations with explicit interval calculations
  private readonly timeframeConfigs: Record<Timeframe, TimeframeConfig> = {
    '1m': {
      interval: 60 * 1000,           // 60,000ms = 1 minute
      candlesPerView: 60,
      updateFrequency: 1000,         // Update every second
      volatilityMultiplier: 2.0
    },
    '5m': {
      interval: 5 * 60 * 1000,       // 300,000ms = 5 minutes
      candlesPerView: 48,
      updateFrequency: 5000,         // Update every 5 seconds
      volatilityMultiplier: 1.5
    },
    '15m': {
      interval: 15 * 60 * 1000,      // 900,000ms = 15 minutes - PRIMARY TIMEFRAME
      candlesPerView: 48,
      updateFrequency: 15000,        // Update every 15 seconds
      volatilityMultiplier: 1.0
    },
    '30m': {
      interval: 30 * 60 * 1000,      // 1,800,000ms = 30 minutes - SECONDARY TIMEFRAME
      candlesPerView: 48,
      updateFrequency: 30000,        // Update every 30 seconds
      volatilityMultiplier: 0.8
    },
    '1h': {
      interval: 60 * 60 * 1000,      // 3,600,000ms = 1 hour
      candlesPerView: 24,
      updateFrequency: 60000,        // Update every minute
      volatilityMultiplier: 0.6
    },
    '4h': {
      interval: 4 * 60 * 60 * 1000,  // 14,400,000ms = 4 hours
      candlesPerView: 24,
      updateFrequency: 120000,       // Update every 2 minutes
      volatilityMultiplier: 0.4
    },
    '1d': {
      interval: 24 * 60 * 60 * 1000, // 86,400,000ms = 1 day
      candlesPerView: 30,
      updateFrequency: 300000,       // Update every 5 minutes
      volatilityMultiplier: 0.3
    }
  };

  constructor() {}

  analyzeMarketConditions(simulationId: string, simulation: SimulationState): MarketAnalysis {
    const now = Date.now();
    const cacheKey = simulationId;
    const lastAnalysis = this.lastAnalysisTime.get(cacheKey) || 0;

    // Cache analysis for 5 seconds to avoid excessive computation
    if (now - lastAnalysis < 5000 && this.marketAnalysisCache.has(cacheKey)) {
      return this.marketAnalysisCache.get(cacheKey)!;
    }

    // Analyze price level
    const priceLevel = this.categorizePriceLevel(simulation.currentPrice);

    // Calculate volatility (0-100 scale)
    const volatility = this.calculateVolatility(simulation);

    // Calculate trading intensity (trades per minute)
    const tradingIntensity = this.calculateTradingIntensity(simulation);

    // Determine market condition
    const marketCondition = this.determineMarketCondition(volatility, tradingIntensity);

    // Check for active scenarios
    const activeScenario = (simulation as any).activeScenario;
    const hasActiveScenario = !!activeScenario && activeScenario.phase === 'active';

    // Recommend timeframe based on all factors
    const recommendedTimeframe = this.recommendTimeframe(
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

    // FIXED: Create analysis result with ALL required properties from MarketAnalysis interface
    const analysis: MarketAnalysis = {
      trend: simulation.marketConditions.trend,
      volatility, // Required property
      volume: simulation.marketConditions.volume,
      priceMovement,
      recommendedTimeframe,
      reason: this.getAnalysisReason(priceLevel, volatility, tradingIntensity, marketCondition, hasActiveScenario),
      tradingIntensity, // FIXED: Include required property
      priceLevel, // FIXED: Include required property
      marketCondition, // FIXED: Include required property
      shouldAdaptTimeframe // FIXED: Include required property
    };

    // Cache the analysis
    this.marketAnalysisCache.set(cacheKey, analysis);
    this.lastAnalysisTime.set(cacheKey, now);

    return analysis;
  }

  determineOptimalTimeframe(price: number): Timeframe {
    // Always start with 15m for all tokens
    // The dynamic analysis will switch to 30m if needed
    return '15m';
  }

  getTimeframeConfig(timeframe: Timeframe): TimeframeConfig {
    return this.timeframeConfigs[timeframe];
  }

  shouldAdjustTimeframe(analysis: MarketAnalysis, currentTimeframe: Timeframe): boolean {
    return analysis.shouldAdaptTimeframe && analysis.recommendedTimeframe !== currentTimeframe;
  }

  updateTradesBuffer(simulationId: string, trades: Trade[]): void {
    const buffer = this.recentTradesBuffer.get(simulationId) || [];
    buffer.push(...trades);
    
    // Keep only last 500 trades
    if (buffer.length > 500) {
      this.recentTradesBuffer.set(simulationId, buffer.slice(-500));
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

  private calculateVolatility(simulation: SimulationState): number {
    const { priceHistory } = simulation;
    if (priceHistory.length < 10) return 50; // Default medium volatility

    // Get recent candles (last 20)
    const recentCandles = priceHistory.slice(-20);

    // Calculate percentage changes
    const changes: number[] = [];
    for (let i = 1; i < recentCandles.length; i++) {
      const change = Math.abs((recentCandles[i].close - recentCandles[i-1].close) / recentCandles[i-1].close) * 100;
      changes.push(change);
    }

    // Calculate average and max change
    const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;
    const maxChange = Math.max(...changes);

    // Score based on thresholds
    let score = 0;

    // Average change contribution (0-50 points)
    if (avgChange < 0.5) score += 10;
    else if (avgChange < 1) score += 20;
    else if (avgChange < 2) score += 30;
    else if (avgChange < 5) score += 40;
    else score += 50;

    // Max change contribution (0-50 points)
    if (maxChange < 2) score += 10;
    else if (maxChange < 5) score += 20;
    else if (maxChange < 10) score += 30;
    else if (maxChange < 20) score += 40;
    else score += 50;

    return Math.min(100, score);
  }

  private calculateTradingIntensity(simulation: SimulationState): number {
    const { recentTrades } = simulation;
    if (recentTrades.length === 0) return 0;

    // Get trades from last 5 minutes
    const fiveMinutesAgo = simulation.currentTime - (5 * 60 * 1000);
    const recentTradeCount = recentTrades.filter(t => t.timestamp >= fiveMinutesAgo).length;

    // Calculate trades per minute
    return recentTradeCount / 5;
  }

  private calculatePriceMovement(simulation: SimulationState): number {
    const { priceHistory, currentPrice } = simulation;
    
    if (priceHistory.length === 0) return 0;
    
    // Calculate price movement from first candle to current price
    const firstPrice = priceHistory[0].open;
    return ((currentPrice - firstPrice) / firstPrice) * 100;
  }

  private determineMarketCondition(
    volatility: number,
    tradingIntensity: number
  ): 'calm' | 'normal' | 'volatile' | 'extreme' {
    if (volatility < 20 && tradingIntensity < 5) return 'calm';
    if (volatility < 50 && tradingIntensity < 20) return 'normal';
    if (volatility < 80 || tradingIntensity < 50) return 'volatile';
    return 'extreme';
  }

  private recommendTimeframe(
    priceLevel: 'micro' | 'small' | 'mid' | 'large' | 'mega',
    volatility: number,
    tradingIntensity: number,
    marketCondition: 'calm' | 'normal' | 'volatile' | 'extreme',
    hasActiveScenario: boolean
  ): Timeframe {
    // Simplified logic - only use 15m and 30m timeframes

    // Use 15m for:
    // - High volatility situations
    // - Active scenarios (pumps/dumps)
    // - Extreme market conditions
    // - High trading intensity
    if (hasActiveScenario || 
        marketCondition === 'extreme' || 
        volatility > 70 || 
        tradingIntensity > 30) {
      return '15m';
    }

    // Use 30m for:
    // - Normal to calm market conditions
    // - Lower volatility
    // - Standard trading activity
    return '30m';
  }

  private getAnalysisReason(
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
    reasons.push(`${marketCondition} market`);

    if (volatility > 70) {
      reasons.push('High volatility');
    } else if (volatility < 30) {
      reasons.push('Low volatility');
    }

    if (tradingIntensity > 30) {
      reasons.push('High trading activity');
    } else if (tradingIntensity < 5) {
      reasons.push('Low trading activity');
    }

    return reasons.join(', ');
  }

  private getCurrentTimeframe(simulationId: string): Timeframe {
    // This would be stored somewhere - defaulting to 15m
    return '15m';
  }
}