// backend/src/services/simulation/CandleManager.ts - FIXED: Shorter intervals for testing
import { PricePoint } from './types';

export class CandleManager {
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private updateLock: Promise<void> = Promise.resolve();
  private lastCandleTime: number = 0;
  private tradeBuffer: Array<{timestamp: number, price: number, volume: number}> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  
  // CRITICAL FIX: Much shorter default interval for testing
  constructor(candleInterval: number = 60000) { // 1 minute default instead of 15 minutes
    this.candleInterval = candleInterval;
    console.log(`🕯️ CandleManager initialized with ${candleInterval/1000}s intervals (${(candleInterval/60000).toFixed(1)}min)`);
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
    
    // ENHANCED LOGGING: Track time progression
    console.log(`🕐 Candle Time Calculation:`, {
      timestamp: new Date(timestamp).toISOString().substr(11, 8),
      candleInterval: this.candleInterval,
      calculatedCandleTime: new Date(candleTime).toISOString().substr(11, 8),
      existingCandleTime: this.currentCandle ? new Date(this.currentCandle.timestamp).toISOString().substr(11, 8) : 'none',
      willCreateNew: !this.currentCandle || this.currentCandle.timestamp !== candleTime,
      timeDiff: this.currentCandle ? candleTime - this.currentCandle.timestamp : 0
    });
    
    // Check if we need to create a new candle
    if (!this.currentCandle || this.currentCandle.timestamp !== candleTime) {
      // Finalize previous candle if it exists
      if (this.currentCandle && this.currentCandle.timestamp < candleTime) {
        console.log(`📊 FINALIZING previous candle: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)}`);
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
    
    // ENHANCED LOGGING: New candle creation with more details
    console.log(`🆕 NEW CANDLE CREATED:`, {
      time: new Date(candleTime).toISOString().substr(11, 8),
      open: openPrice.toFixed(6),
      current: price.toFixed(6),
      volume: volume.toFixed(2),
      totalCandles: this.candles.length + 1, // +1 for current
      intervalMinutes: (this.candleInterval / 60000).toFixed(1)
    });
  }
  
  private updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    // Track previous values for logging
    const prevHigh = this.currentCandle.high;
    const prevLow = this.currentCandle.low;
    const prevVolume = this.currentCandle.volume;
    
    // Update OHLC values
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    this.currentCandle.volume += volume;
    
    // Log significant updates
    if (price > prevHigh || price < prevLow || volume > 0) {
      console.log(`📈 CANDLE UPDATE:`, {
        time: new Date(this.currentCandle.timestamp).toISOString().substr(11, 8),
        O: this.currentCandle.open.toFixed(6),
        H: this.currentCandle.high.toFixed(6) + (price > prevHigh ? ' ↑' : ''),
        L: this.currentCandle.low.toFixed(6) + (price < prevLow ? ' ↓' : ''),
        C: this.currentCandle.close.toFixed(6),
        V: this.currentCandle.volume.toFixed(2) + (volume > 0 ? ` (+${volume.toFixed(2)})` : '')
      });
    }
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
    
    // ENHANCED LOGGING: Candle finalization with chart progress
    console.log(`✅ CANDLE FINALIZED:`, {
      time: new Date(this.currentCandle.timestamp).toISOString().substr(11, 8),
      OHLC: `${this.currentCandle.open.toFixed(6)}/${this.currentCandle.high.toFixed(6)}/${this.currentCandle.low.toFixed(6)}/${this.currentCandle.close.toFixed(6)}`,
      volume: this.currentCandle.volume.toFixed(2),
      totalCandles: this.candles.length,
      chartProgress: `${this.candles.length} candles created`
    });
    
    // CHART GROWTH TRACKING
    if (this.candles.length <= 10 || this.candles.length % 5 === 0) {
      console.log(`📊 CHART BUILDING: ${this.candles.length} candles now available for display`);
      
      if (this.candles.length >= 2) {
        const first = this.candles[0];
        const last = this.candles[this.candles.length - 1];
        const timeSpan = (last.timestamp - first.timestamp) / 60000; // minutes
        const priceRange = {
          low: Math.min(...this.candles.map(c => c.low)),
          high: Math.max(...this.candles.map(c => c.high))
        };
        
        console.log(`   📈 Chart span: ${timeSpan.toFixed(1)} minutes`);
        console.log(`   💰 Price range: $${priceRange.low.toFixed(6)} - $${priceRange.high.toFixed(6)}`);
        console.log(`   📊 Latest candle: ${new Date(last.timestamp).toISOString().substr(11, 8)}`);
      }
    }
    
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
    
    // ENHANCED LOGGING: Track candle retrieval
    if (Math.random() < 0.1) { // 10% chance to log
      console.log(`📊 CANDLES RETRIEVED: ${validCandles.length} valid candles returned (limit: ${limit || 'none'})`);
    }
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  // DEBUGGING METHOD: Force candle creation for testing
  forceCreateTestCandles(count: number, startTime: number, price: number): void {
    console.log(`🧪 FORCE CREATING ${count} test candles for debugging...`);
    
    this.clear(); // Start fresh
    
    for (let i = 0; i < count; i++) {
      const candleTime = startTime + (i * this.candleInterval);
      const priceVariation = price * (0.98 + Math.random() * 0.04); // ±2% variation
      
      const testCandle: PricePoint = {
        timestamp: candleTime,
        open: priceVariation,
        high: priceVariation * (1 + Math.random() * 0.01),
        low: priceVariation * (1 - Math.random() * 0.01),
        close: priceVariation * (0.995 + Math.random() * 0.01),
        volume: 1000 + Math.random() * 5000
      };
      
      this.candles.push(testCandle);
      console.log(`   🕯️ Test candle ${i + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} @ $${testCandle.close.toFixed(6)}`);
    }
    
    console.log(`✅ ${count} test candles created successfully`);
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
    console.log(`📥 Set ${this.candles.length} candles, last time: ${new Date(this.lastCandleTime).toISOString().substr(11, 8)}`);
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
      console.log(`🔧 FORCE COMPLETING current candle: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)}`);
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
  
  // Adjust timeframe by resampling existing candles
  adjustTimeframe(newInterval: number): void {
    if (newInterval === this.candleInterval) return;
    
    console.log(`🔄 Adjusting timeframe: ${this.candleInterval/1000}s → ${newInterval/1000}s`);
    
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
    
    console.log('🧹 CandleManager cleared - starting fresh');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 CandleManager shutdown complete');
  }
}