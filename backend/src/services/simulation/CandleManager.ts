// backend/src/services/simulation/CandleManager.ts - ENHANCED FOR FAST CANDLE GENERATION
import { PricePoint } from './types';

export class CandleManager {
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private updateLock: Promise<void> = Promise.resolve();
  private lastCandleTime: number = 0;
  private tradeBuffer: Array<{timestamp: number, price: number, volume: number}> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  
  // CRITICAL FIX: Much shorter default interval for fast candle generation
  constructor(candleInterval: number = 30000) { // 30 seconds default (was 900000 = 15 minutes)
    this.candleInterval = candleInterval;
    console.log(`🕯️ CandleManager initialized with ${candleInterval/1000}s intervals (${(candleInterval/60000).toFixed(1)}min) - FAST MODE`);
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
    
    // ENHANCED LOGGING: Track time progression for fast candles
    const isNewCandle = !this.currentCandle || this.currentCandle.timestamp !== candleTime;
    
    if (isNewCandle) {
      console.log(`🕐 [FAST CANDLE] New candle period:`, {
        timestamp: new Date(timestamp).toISOString().substr(11, 8),
        candleTime: new Date(candleTime).toISOString().substr(11, 8),
        intervalSeconds: this.candleInterval / 1000,
        volume: volume.toFixed(0),
        price: `$${price.toFixed(6)}`,
        totalCandles: this.candles.length + 1
      });
    }
    
    // Check if we need to create a new candle
    if (!this.currentCandle || this.currentCandle.timestamp !== candleTime) {
      // Finalize previous candle if it exists
      if (this.currentCandle && this.currentCandle.timestamp < candleTime) {
        console.log(`📊 [FINALIZING] Completing candle: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)}`);
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
    
    // ENHANCED: Faster flush for rapid candle updates
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTradeBuffer();
        this.flushTimer = null;
      }, 50); // Flush every 50ms (was 100ms)
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
    
    // ENHANCED LOGGING: New candle creation with chart growth tracking
    console.log(`🆕 [NEW CANDLE] Created #${this.candles.length + 1}:`, {
      time: new Date(candleTime).toISOString().substr(11, 8),
      open: openPrice.toFixed(6),
      current: price.toFixed(6),
      volume: volume.toFixed(0),
      totalCandles: this.candles.length + 1,
      intervalSeconds: this.candleInterval / 1000,
      chartProgress: `${this.candles.length + 1} candles building...`
    });
    
    // Special logging for chart milestones
    if ((this.candles.length + 1) % 5 === 0) {
      console.log(`🎯 [CHART MILESTONE] ${this.candles.length + 1} candles created - Chart building rapidly!`);
    }
  }
  
  private updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    // Track previous values for comparison
    const prevHigh = this.currentCandle.high;
    const prevLow = this.currentCandle.low;
    const prevVolume = this.currentCandle.volume;
    const prevClose = this.currentCandle.close;
    
    // Update OHLC values
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    this.currentCandle.volume += volume;
    
    // Log significant updates for fast candles
    const significantChange = 
      price > prevHigh || 
      price < prevLow || 
      volume > 500 || 
      Math.abs(price - prevClose) / prevClose > 0.001; // 0.1% price change
    
    if (significantChange) {
      console.log(`📈 [CANDLE UPDATE] Active trading:`, {
        time: new Date(this.currentCandle.timestamp).toISOString().substr(11, 8),
        O: this.currentCandle.open.toFixed(6),
        H: this.currentCandle.high.toFixed(6) + (price > prevHigh ? ' ↑NEW HIGH' : ''),
        L: this.currentCandle.low.toFixed(6) + (price < prevLow ? ' ↓NEW LOW' : ''),
        C: this.currentCandle.close.toFixed(6),
        V: this.currentCandle.volume.toFixed(0) + (volume > 500 ? ` (+${volume.toFixed(0)})` : ''),
        priceChange: `${((price - this.currentCandle.open) / this.currentCandle.open * 100).toFixed(2)}%`
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
    
    // ENHANCED LOGGING: Candle finalization with comprehensive tracking
    const candleNumber = this.candles.length;
    const priceChange = ((this.currentCandle.close - this.currentCandle.open) / this.currentCandle.open * 100);
    
    console.log(`✅ [CANDLE FINALIZED] #${candleNumber}:`, {
      time: new Date(this.currentCandle.timestamp).toISOString().substr(11, 8),
      OHLC: `${this.currentCandle.open.toFixed(6)}/${this.currentCandle.high.toFixed(6)}/${this.currentCandle.low.toFixed(6)}/${this.currentCandle.close.toFixed(6)}`,
      volume: this.currentCandle.volume.toFixed(0),
      change: `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
      totalCandles: candleNumber,
      chartStatus: `${candleNumber} candles available for display`
    });
    
    // ENHANCED CHART GROWTH TRACKING
    if (candleNumber <= 10 || candleNumber % 10 === 0) {
      console.log(`📊 [CHART BUILDING] ${candleNumber} candles created - Dynamic chart growing!`);
      
      if (this.candles.length >= 2) {
        const first = this.candles[0];
        const last = this.candles[this.candles.length - 1];
        const timeSpan = (last.timestamp - first.timestamp) / 60000; // minutes
        const totalVolume = this.candles.reduce((sum, c) => sum + c.volume, 0);
        const priceRange = {
          low: Math.min(...this.candles.map(c => c.low)),
          high: Math.max(...this.candles.map(c => c.high))
        };
        const totalPriceChange = ((last.close - first.open) / first.open * 100);
        
        console.log(`   📈 Chart Summary:`);
        console.log(`   ⏱️ Time span: ${timeSpan.toFixed(1)} minutes`);
        console.log(`   💰 Price range: $${priceRange.low.toFixed(6)} - $${priceRange.high.toFixed(6)}`);
        console.log(`   📊 Total volume: ${totalVolume.toFixed(0)} tokens`);
        console.log(`   📈 Overall change: ${totalPriceChange > 0 ? '+' : ''}${totalPriceChange.toFixed(2)}%`);
        console.log(`   🕐 Latest: ${new Date(last.timestamp).toISOString().substr(11, 8)}`);
      }
    }
    
    // Special milestone announcements
    if (candleNumber === 5) {
      console.log(`🎉 [MILESTONE] First 5 candles completed - Chart is live!`);
    } else if (candleNumber === 20) {
      console.log(`🎉 [MILESTONE] 20 candles completed - Full dynamic chart established!`);
    } else if (candleNumber === 50) {
      console.log(`🎉 [MILESTONE] 50 candles completed - Mature trading chart!`);
    }
    
    this.currentCandle = null;
  }
  
  private flushTradeBuffer(): void {
    if (this.tradeBuffer.length === 0) return;
    
    // Process all buffered trades
    const sortedTrades = this.tradeBuffer.sort((a, b) => a.timestamp - b.timestamp);
    let totalVolumeFlushed = 0;
    
    for (const trade of sortedTrades) {
      const candleTime = Math.floor(trade.timestamp / this.candleInterval) * this.candleInterval;
      
      if (this.currentCandle && this.currentCandle.timestamp === candleTime) {
        this.updateExistingCandle(trade.price, trade.volume);
        totalVolumeFlushed += trade.volume;
      }
    }
    
    // Log significant volume flushes
    if (totalVolumeFlushed > 1000) {
      console.log(`🔄 [BUFFER FLUSH] Processed ${sortedTrades.length} trades, volume: ${totalVolumeFlushed.toFixed(0)}`);
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
    
    // ENHANCED LOGGING: Track candle retrieval for fast mode
    if (Math.random() < 0.05) { // 5% chance to log
      console.log(`📊 [CANDLES RETRIEVED] ${validCandles.length} valid candles returned`, {
        limit: limit || 'none',
        totalAvailable: validCandles.length,
        hasCurrentCandle: !!this.currentCandle,
        intervalSeconds: this.candleInterval / 1000
      });
    }
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  // ENHANCED: Force faster candle creation for speed testing
  forceCreateMultipleCandles(count: number, startTime: number, basePrice: number): void {
    console.log(`🧪 [FORCE CANDLES] Creating ${count} rapid test candles...`);
    
    this.clear(); // Start fresh
    
    for (let i = 0; i < count; i++) {
      const candleTime = startTime + (i * this.candleInterval);
      const priceVariation = basePrice * (0.98 + Math.random() * 0.04); // ±2% variation
      const volumeVariation = 1000 + Math.random() * 3000; // 1000-4000 volume
      
      const testCandle: PricePoint = {
        timestamp: candleTime,
        open: priceVariation,
        high: priceVariation * (1 + Math.random() * 0.015), // Up to 1.5% higher
        low: priceVariation * (1 - Math.random() * 0.015),  // Up to 1.5% lower
        close: priceVariation * (0.995 + Math.random() * 0.01), // Small close variation
        volume: volumeVariation
      };
      
      this.candles.push(testCandle);
      
      if (i < 5 || i % 10 === 0) {
        console.log(`   🕯️ Force candle ${i + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} @ $${testCandle.close.toFixed(6)} vol:${testCandle.volume.toFixed(0)}`);
      }
    }
    
    console.log(`✅ [FORCE COMPLETE] ${count} candles created for rapid testing`);
  }
  
  // ENHANCED: Speed adjustment for different simulation modes
  adjustSpeed(simulationSpeed: number): void {
    let newInterval: number;
    
    // Adjust candle intervals based on simulation speed
    if (simulationSpeed <= 5) {
      newInterval = 60000;  // 1 minute for normal speed
    } else if (simulationSpeed <= 15) {
      newInterval = 30000;  // 30 seconds for medium speed
    } else {
      newInterval = 15000;  // 15 seconds for fast speed
    }
    
    if (newInterval !== this.candleInterval) {
      console.log(`⚡ [SPEED ADJUST] Candle interval: ${this.candleInterval/1000}s → ${newInterval/1000}s (Speed: ${simulationSpeed}x)`);
      this.candleInterval = newInterval;
    }
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
    console.log(`📥 [SET CANDLES] ${this.candles.length} candles loaded, last: ${new Date(this.lastCandleTime).toISOString().substr(11, 8)}`);
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
      console.log(`🔧 [FORCE COMPLETE] Finalizing current candle: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)}`);
      this.finalizeCandle();
    }
  }
  
  // Get enhanced candle statistics
  getStats(): {
    totalCandles: number;
    currentCandleAge: number;
    lastCandleTime: number;
    interval: number;
    hasCurrentCandle: boolean;
    candlesPerMinute: number;
    averageVolume: number;
  } {
    const now = Date.now();
    const currentCandleAge = this.currentCandle ? now - this.currentCandle.timestamp : 0;
    const candlesPerMinute = this.candles.length > 0 ? 
      (60000 / this.candleInterval) : 0; // Theoretical candles per minute
    const averageVolume = this.candles.length > 0 ?
      this.candles.reduce((sum, c) => sum + c.volume, 0) / this.candles.length : 0;
    
    return {
      totalCandles: this.candles.length,
      currentCandleAge,
      lastCandleTime: this.lastCandleTime,
      interval: this.candleInterval,
      hasCurrentCandle: !!this.currentCandle,
      candlesPerMinute,
      averageVolume
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
    
    console.log(`🔄 [TIMEFRAME ADJUST] ${this.candleInterval/1000}s → ${newInterval/1000}s`);
    
    const oldCandles = [...this.candles];
    this.candles = [];
    this.currentCandle = null;
    this.candleInterval = newInterval;
    this.lastCandleTime = 0;
    
    // Resample candles to new timeframe
    this.resampleCandles(oldCandles);
    
    console.log(`✅ [TIMEFRAME COMPLETE] ${this.candles.length} candles in new ${newInterval/1000}s timeframe`);
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
    
    console.log('🧹 [CLEAR] CandleManager cleared - starting fresh for rapid generation');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 [SHUTDOWN] CandleManager shutdown complete');
  }
}