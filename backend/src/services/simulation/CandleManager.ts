// backend/src/services/simulation/CandleManager.ts - ENHANCED REAL-TIME OHLC SYSTEM
import { PricePoint } from './types';

export class CandleManager {
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private updateLock: Promise<void> = Promise.resolve();
  private lastCandleTime: number = 0;
  private tradeBuffer: Array<{timestamp: number, price: number, volume: number}> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  
  constructor(candleInterval: number = 900000) { // 15 minutes default
    this.candleInterval = candleInterval;
    console.log(`🕯️ CandleManager initialized with ${candleInterval/60000}min intervals`);
  }
  
  async updateCandle(timestamp: number, price: number, volume: number = 0): Promise<void> {
    // Ensure sequential updates to prevent race conditions
    this.updateLock = this.updateLock.then(async () => {
      await this._updateCandleInternal(timestamp, price, volume);
    });
    
    return this.updateLock;
  }
  
  private async _updateCandleInternal(timestamp: number, price: number, volume: number): Promise<void> {
    // Calculate candle start time (aligned to interval boundaries)
    const candleTime = Math.floor(timestamp / this.candleInterval) * this.candleInterval;
    
    // Check if we need to create a new candle
    if (!this.currentCandle || this.currentCandle.timestamp !== candleTime) {
      // Finalize previous candle if it exists
      if (this.currentCandle && this.currentCandle.timestamp < candleTime) {
        this.finalizeCandle();
      }
      
      // Create new candle
      this.createNewCandle(candleTime, price, volume);
    } else {
      // Update existing candle
      this.updateExistingCandle(price, volume);
    }
    
    // Buffer the trade data for high-frequency updates
    this.tradeBuffer.push({ timestamp, price, volume });
    
    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTradeBuffer();
        this.flushTimer = null;
      }, 100); // Flush every 100ms
    }
  }
  
  private createNewCandle(candleTime: number, price: number, volume: number): void {
    // Get the last close price for the opening price
    const lastCandle = this.candles[this.candles.length - 1];
    const openPrice = lastCandle ? lastCandle.close : price;
    
    this.currentCandle = {
      timestamp: candleTime,
      open: openPrice,
      high: price,
      low: price,
      close: price,
      volume: volume
    };
    
    console.log(`🆕 New candle created: ${new Date(candleTime).toISOString()} | O:${openPrice.toFixed(4)} H:${price.toFixed(4)} L:${price.toFixed(4)} C:${price.toFixed(4)}`);
  }
  
  private updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    // Update OHLC values
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    this.currentCandle.volume += volume;
  }
  
  private finalizeCandle(): void {
    if (!this.currentCandle) return;
    
    // Add the completed candle to the array
    this.candles.push({ ...this.currentCandle });
    this.lastCandleTime = this.currentCandle.timestamp;
    
    // Maintain reasonable history size
    if (this.candles.length > 1000) {
      this.candles = this.candles.slice(-1000);
    }
    
    console.log(`✅ Candle finalized: ${new Date(this.currentCandle.timestamp).toISOString()} | Total candles: ${this.candles.length}`);
    
    this.currentCandle = null;
  }
  
  private flushTradeBuffer(): void {
    if (this.tradeBuffer.length === 0) return;
    
    // Process all buffered trades
    const sortedTrades = this.tradeBuffer.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const trade of sortedTrades) {
      const candleTime = Math.floor(trade.timestamp / this.candleInterval) * this.candleInterval;
      
      if (this.currentCandle && this.currentCandle.timestamp === candleTime) {
        this.updateExistingCandle(trade.price, trade.volume);
      }
    }
    
    // Clear the buffer
    this.tradeBuffer = [];
  }
  
  getCandles(limit?: number): PricePoint[] {
    const allCandles = [...this.candles];
    
    // Include current candle if it exists
    if (this.currentCandle) {
      allCandles.push({ ...this.currentCandle });
    }
    
    // Ensure proper ordering by timestamp
    allCandles.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove any potential duplicates
    const uniqueCandles = allCandles.filter((candle, index, arr) => 
      index === 0 || candle.timestamp !== arr[index - 1].timestamp
    );
    
    // Validate OHLC integrity
    const validCandles = uniqueCandles.filter(candle => 
      candle.high >= candle.low &&
      candle.high >= candle.open &&
      candle.high >= candle.close &&
      candle.low <= candle.open &&
      candle.low <= candle.close
    );
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  setCandles(candles: PricePoint[]): void {
    // Sort and validate incoming candles
    this.candles = [...candles]
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((candle, index, arr) => 
        index === 0 || candle.timestamp !== arr[index - 1].timestamp
      );
    
    // Update last candle time
    if (this.candles.length > 0) {
      this.lastCandleTime = this.candles[this.candles.length - 1].timestamp;
    }
    
    this.currentCandle = null;
    console.log(`📥 Set ${this.candles.length} candles, last time: ${new Date(this.lastCandleTime).toISOString()}`);
  }
  
  getCurrentCandle(): PricePoint | null {
    return this.currentCandle ? { ...this.currentCandle } : null;
  }
  
  getLastCompletedCandle(): PricePoint | null {
    return this.candles.length > 0 ? { ...this.candles[this.candles.length - 1] } : null;
  }
  
  // Force completion of current candle (useful for testing)
  forceCompleteCurrentCandle(): void {
    if (this.currentCandle) {
      this.finalizeCandle();
    }
  }
  
  // Get candle statistics
  getStats(): {
    totalCandles: number;
    currentCandleAge: number;
    lastCandleTime: number;
    interval: number;
    hasCurrentCandle: boolean;
  } {
    const now = Date.now();
    const currentCandleAge = this.currentCandle ? now - this.currentCandle.timestamp : 0;
    
    return {
      totalCandles: this.candles.length,
      currentCandleAge,
      lastCandleTime: this.lastCandleTime,
      interval: this.candleInterval,
      hasCurrentCandle: !!this.currentCandle
    };
  }
  
  // Validate candle data integrity
  validateCandles(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check timestamp ordering
    for (let i = 1; i < this.candles.length; i++) {
      if (this.candles[i].timestamp <= this.candles[i - 1].timestamp) {
        errors.push(`Timestamp order violation at index ${i}`);
      }
      
      // Check interval consistency
      const expectedTime = this.candles[i - 1].timestamp + this.candleInterval;
      if (this.candles[i].timestamp !== expectedTime) {
        const gap = (this.candles[i].timestamp - expectedTime) / this.candleInterval;
        if (gap > 1) {
          errors.push(`Gap of ${gap.toFixed(1)} intervals between candles ${i-1} and ${i}`);
        }
      }
    }
    
    // Check OHLC relationships
    this.candles.forEach((candle, index) => {
      if (candle.high < candle.low ||
          candle.high < candle.open ||
          candle.high < candle.close ||
          candle.low > candle.open ||
          candle.low > candle.close) {
        errors.push(`Invalid OHLC relationship at index ${index}`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  // Adjust timeframe by resampling existing candles
  adjustTimeframe(newInterval: number): void {
    if (newInterval === this.candleInterval) return;
    
    console.log(`🔄 Adjusting timeframe: ${this.candleInterval/60000}m → ${newInterval/60000}m`);
    
    const oldCandles = [...this.candles];
    this.candles = [];
    this.currentCandle = null;
    this.candleInterval = newInterval;
    this.lastCandleTime = 0;
    
    // Resample candles to new timeframe
    this.resampleCandles(oldCandles);
    
    console.log(`✅ Timeframe adjusted: ${this.candles.length} candles in new timeframe`);
  }
  
  private resampleCandles(oldCandles: PricePoint[]): void {
    if (oldCandles.length === 0) return;
    
    const startTime = Math.floor(oldCandles[0].timestamp / this.candleInterval) * this.candleInterval;
    const endTime = oldCandles[oldCandles.length - 1].timestamp;
    
    for (let time = startTime; time <= endTime; time += this.candleInterval) {
      const candlesInPeriod = oldCandles.filter(c => 
        c.timestamp >= time && c.timestamp < time + this.candleInterval
      );
      
      if (candlesInPeriod.length > 0) {
        const newCandle: PricePoint = {
          timestamp: time,
          open: candlesInPeriod[0].open,
          high: Math.max(...candlesInPeriod.map(c => c.high)),
          low: Math.min(...candlesInPeriod.map(c => c.low)),
          close: candlesInPeriod[candlesInPeriod.length - 1].close,
          volume: candlesInPeriod.reduce((sum, c) => sum + c.volume, 0)
        };
        
        this.candles.push(newCandle);
      }
    }
  }
  
  clear(): void {
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    this.tradeBuffer = [];
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    console.log('🧹 CandleManager cleared');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 CandleManager shutdown complete');
  }
}