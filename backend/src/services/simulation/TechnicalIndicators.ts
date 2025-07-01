// backend/src/services/simulation/TechnicalIndicators.ts
import { PricePoint } from './types';

export class TechnicalIndicators {
  /**
   * Calculate Simple Moving Average
   */
  static calculateSMA(prices: PricePoint[]): number {
    if (prices.length === 0) return 0;
    const sum = prices.reduce((acc, price) => acc + price.close, 0);
    return sum / prices.length;
  }

  /**
   * Calculate Exponential Moving Average
   */
  static calculateEMA(prices: PricePoint[], period: number): number {
    if (prices.length === 0) return 0;
    if (prices.length < period) return this.calculateSMA(prices);

    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period));

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i].close - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate Relative Strength Index
   */
  static calculateRSI(prices: PricePoint[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Default neutral RSI

    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i].close - prices[i - 1].close);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  static calculateMACD(prices: PricePoint[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
    macd: number;
    signal: number;
    histogram: number;
  } {
    if (prices.length < slowPeriod) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    const ema12 = this.calculateEMA(prices, fastPeriod);
    const ema26 = this.calculateEMA(prices, slowPeriod);
    const macd = ema12 - ema26;

    // For signal line, we'd need historical MACD values
    // Simplified version using current MACD
    const signal = macd * 0.9; // Approximation
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  /**
   * Calculate Bollinger Bands
   */
  static calculateBollingerBands(prices: PricePoint[], period: number = 20, stdDev: number = 2): {
    upper: number;
    middle: number;
    lower: number;
  } {
    if (prices.length < period) {
      const currentPrice = prices[prices.length - 1]?.close || 0;
      return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
    }

    const recentPrices = prices.slice(-period);
    const sma = this.calculateSMA(recentPrices);
    
    // Calculate standard deviation
    const squaredDiffs = recentPrices.map(p => Math.pow(p.close - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  /**
   * Calculate Volume Weighted Average Price (VWAP)
   */
  static calculateVWAP(prices: PricePoint[]): number {
    if (prices.length === 0) return 0;

    let totalVolume = 0;
    let totalVolumePrice = 0;

    prices.forEach(candle => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      totalVolumePrice += typicalPrice * candle.volume;
      totalVolume += candle.volume;
    });

    return totalVolume > 0 ? totalVolumePrice / totalVolume : prices[prices.length - 1].close;
  }

  /**
   * Calculate Average True Range (ATR)
   */
  static calculateATR(prices: PricePoint[], period: number = 14): number {
    if (prices.length < 2) return 0;

    const trueRanges: number[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      const high = prices[i].high;
      const low = prices[i].low;
      const prevClose = prices[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }

    if (trueRanges.length === 0) return 0;

    // Calculate average
    const recentTRs = trueRanges.slice(-period);
    return recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
  }

  /**
   * Calculate Stochastic Oscillator
   */
  static calculateStochastic(prices: PricePoint[], period: number = 14, smoothK: number = 3, smoothD: number = 3): {
    k: number;
    d: number;
  } {
    if (prices.length < period) return { k: 50, d: 50 };

    const recentPrices = prices.slice(-period);
    const highs = recentPrices.map(p => p.high);
    const lows = recentPrices.map(p => p.low);
    
    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);
    const currentClose = prices[prices.length - 1].close;

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    const d = k * 0.9; // Simplified calculation

    return { k, d };
  }

  /**
   * Calculate trend strength
   */
  static calculateTrendStrength(prices: PricePoint[], period: number = 20): number {
    if (prices.length < period) return 0;

    const recentPrices = prices.slice(-period);
    const firstPrice = recentPrices[0].close;
    const lastPrice = recentPrices[recentPrices.length - 1].close;
    
    const priceChange = (lastPrice - firstPrice) / firstPrice;
    const volatility = this.calculateVolatility(recentPrices);
    
    // Trend strength is price change divided by volatility
    return volatility > 0 ? Math.abs(priceChange) / volatility : 0;
  }

  /**
   * Calculate price volatility
   */
  static calculateVolatility(prices: PricePoint[]): number {
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

    // Scale to a reasonable volatility value based on price level
    const basePrice = prices[prices.length - 1].close;
    const volatilityScale = basePrice < 1 ? 10 : basePrice < 10 ? 5 : 2;

    return Math.max(0.005, Math.min(0.1, stdDev * volatilityScale));
  }

  /**
   * Detect support and resistance levels
   */
  static detectSupportResistance(prices: PricePoint[], lookback: number = 50): {
    support: number[];
    resistance: number[];
  } {
    if (prices.length < lookback) {
      const currentPrice = prices[prices.length - 1]?.close || 0;
      return {
        support: [currentPrice * 0.95],
        resistance: [currentPrice * 1.05]
      };
    }

    const recentPrices = prices.slice(-lookback);
    const support: number[] = [];
    const resistance: number[] = [];

    // Find local minima and maxima
    for (let i = 2; i < recentPrices.length - 2; i++) {
      const prev2 = recentPrices[i - 2];
      const prev1 = recentPrices[i - 1];
      const current = recentPrices[i];
      const next1 = recentPrices[i + 1];
      const next2 = recentPrices[i + 2];

      // Local minimum (potential support)
      if (current.low < prev1.low && current.low < prev2.low &&
          current.low < next1.low && current.low < next2.low) {
        support.push(current.low);
      }

      // Local maximum (potential resistance)
      if (current.high > prev1.high && current.high > prev2.high &&
          current.high > next1.high && current.high > next2.high) {
        resistance.push(current.high);
      }
    }

    // Sort and take most significant levels
    support.sort((a, b) => b - a);
    resistance.sort((a, b) => a - b);

    return {
      support: support.slice(0, 3),
      resistance: resistance.slice(0, 3)
    };
  }
}