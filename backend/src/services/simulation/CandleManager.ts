// backend/src/services/simulation/CandleManager.ts - ULTRA FAST MODE FOR REALISTIC TRADING
import { PricePoint } from './types';

export class CandleManager {
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private updateLock: Promise<void> = Promise.resolve();
  private lastCandleTime: number = 0;
  private tradeBuffer: Array<{timestamp: number, price: number, volume: number}> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  
  // CRITICAL FIX: ULTRA FAST intervals for immediate chart building
  constructor(candleInterval: number = 10000) { // 10 seconds default (was 30000)
    this.candleInterval = Math.min(candleInterval, 15000); // Cap at 15 seconds max
    console.log(`🚀 ULTRA FAST CandleManager: ${this.candleInterval/1000}s intervals - RAPID CHART MODE`);
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
    
    // ENHANCED LOGGING: Track rapid candle creation
    const isNewCandle = !this.currentCandle || this.currentCandle.timestamp !== candleTime;
    
    if (isNewCandle) {
      console.log(`⚡ [RAPID CANDLE] NEW:`, {
        time: new Date(candleTime).toISOString().substr(11, 8),
        intervalSec: this.candleInterval / 1000,
        volume: volume.toFixed(0),
        price: `$${price.toFixed(6)}`,
        candleNumber: this.candles.length + 1,
        chartGrowth: `📈 ${this.candles.length} → ${this.candles.length + 1}`
      });
    }
    
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
    
    // Buffer the trade data for ultra-high-frequency updates
    this.tradeBuffer.push({ timestamp, price, volume });
    
    // ULTRA FAST: Flush every 25ms for rapid updates
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTradeBuffer();
        this.flushTimer = null;
      }, 25); // Ultra fast flush
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
    
    // RAPID CHART BUILDING LOGGING
    console.log(`🆕 [RAPID CHART] Candle #${this.candles.length + 1}:`, {
      time: new Date(candleTime).toISOString().substr(11, 8),
      OHLC: `O:${openPrice.toFixed(6)} H:${price.toFixed(6)} L:${price.toFixed(6)} C:${price.toFixed(6)}`,
      volume: volume.toFixed(0),
      intervalSec: this.candleInterval / 1000,
      progress: `🏁 ${this.candles.length + 1} candles building rapidly!`
    });
    
    // Rapid milestone tracking
    const nextCount = this.candles.length + 1;
    if (nextCount <= 10 || nextCount % 5 === 0) {
      console.log(`🎯 [RAPID MILESTONE] ${nextCount} candles - Chart accelerating!`);
    }
  }
  
  private updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    // Track significant changes
    const prevHigh = this.currentCandle.high;
    const prevLow = this.currentCandle.low;
    const prevClose = this.currentCandle.close;
    
    // Update OHLC values
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    this.currentCandle.volume += volume;
    
    // Log significant rapid updates
    const significantChange = 
      price > prevHigh || 
      price < prevLow || 
      volume > 200 || 
      Math.abs(price - prevClose) / prevClose > 0.0005; // 0.05% threshold
    
    if (significantChange) {
      console.log(`📊 [RAPID UPDATE] Active:`, {
        time: new Date(this.currentCandle.timestamp).toISOString().substr(11, 8),
        price: price.toFixed(6) + (price > prevHigh ? ' 🔼NEW HIGH' : price < prevLow ? ' 🔽NEW LOW' : ''),
        volume: this.currentCandle.volume.toFixed(0) + (volume > 200 ? ` (+${volume.toFixed(0)})⚡` : ''),
        change: `${((price - this.currentCandle.open) / this.currentCandle.open * 100).toFixed(3)}%`
      });
    }
  }
  
  private finalizeCandle(): void {
    if (!this.currentCandle) return;
    
    // Add the completed candle to the array
    this.candles.push({ ...this.currentCandle });
    this.lastCandleTime = this.currentCandle.timestamp;
    
    // Maintain reasonable history size
    if (this.candles.length > 2000) {
      this.candles = this.candles.slice(-2000);
    }
    
    // RAPID FINALIZATION LOGGING
    const candleNumber = this.candles.length;
    const priceChange = ((this.currentCandle.close - this.currentCandle.open) / this.currentCandle.open * 100);
    
    console.log(`✅ [RAPID COMPLETE] #${candleNumber}:`, {
      time: new Date(this.currentCandle.timestamp).toISOString().substr(11, 8),
      OHLC: `${this.currentCandle.open.toFixed(6)}|${this.currentCandle.high.toFixed(6)}|${this.currentCandle.low.toFixed(6)}|${this.currentCandle.close.toFixed(6)}`,
      volume: this.currentCandle.volume.toFixed(0),
      change: `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(3)}%`,
      totalCandles: candleNumber,
      intervalSec: this.candleInterval / 1000
    });
    
    // RAPID CHART PROGRESS TRACKING
    if (candleNumber <= 20 || candleNumber % 10 === 0) {
      console.log(`🚀 [RAPID PROGRESS] ${candleNumber} candles - Chart building at lightning speed!`);
      
      if (this.candles.length >= 2) {
        const first = this.candles[0];
        const last = this.candles[this.candles.length - 1];
        const timeSpan = (last.timestamp - first.timestamp) / 60000;
        const totalVolume = this.candles.reduce((sum, c) => sum + c.volume, 0);
        const priceRange = {
          low: Math.min(...this.candles.map(c => c.low)),
          high: Math.max(...this.candles.map(c => c.high))
        };
        const totalPriceChange = ((last.close - first.open) / first.open * 100);
        
        console.log(`   🏁 RAPID CHART STATUS:`);
        console.log(`   ⏱️ Time span: ${timeSpan.toFixed(1)} minutes (${this.candleInterval/1000}s intervals)`);
        console.log(`   💰 Price range: $${priceRange.low.toFixed(6)} - $${priceRange.high.toFixed(6)}`);
        console.log(`   📊 Total volume: ${totalVolume.toFixed(0)} tokens`);
        console.log(`   📈 Overall change: ${totalPriceChange > 0 ? '+' : ''}${totalPriceChange.toFixed(3)}%`);
      }
    }
    
    // Rapid milestone announcements
    if (candleNumber === 3) {
      console.log(`🎉 [RAPID MILESTONE] First 3 candles - Chart is LIVE and building fast!`);
    } else if (candleNumber === 10) {
      console.log(`🎉 [RAPID MILESTONE] 10 candles - Full speed chart development!`);
    } else if (candleNumber === 25) {
      console.log(`🎉 [RAPID MILESTONE] 25 candles - Professional trading chart established!`);
    } else if (candleNumber === 50) {
      console.log(`🎉 [RAPID MILESTONE] 50 candles - Mature high-frequency trading environment!`);
    }
    
    this.currentCandle = null;
  }
  
  private flushTradeBuffer(): void {
    if (this.tradeBuffer.length === 0) return;
    
    // Process all buffered trades rapidly
    const sortedTrades = this.tradeBuffer.sort((a, b) => a.timestamp - b.timestamp);
    let totalVolumeFlushed = 0;
    
    for (const trade of sortedTrades) {
      const candleTime = Math.floor(trade.timestamp / this.candleInterval) * this.candleInterval;
      
      if (this.currentCandle && this.currentCandle.timestamp === candleTime) {
        this.updateExistingCandle(trade.price, trade.volume);
        totalVolumeFlushed += trade.volume;
      }
    }
    
    // Log significant volume flushes for rapid mode
    if (totalVolumeFlushed > 500) {
      console.log(`⚡ [RAPID FLUSH] Processed ${sortedTrades.length} trades, vol: ${totalVolumeFlushed.toFixed(0)}`);
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
    
    // RAPID MODE LOGGING
    if (Math.random() < 0.02) { // 2% chance to log
      console.log(`📊 [RAPID CANDLES] ${validCandles.length} valid candles returned`, {
        limit: limit || 'none',
        intervalSec: this.candleInterval / 1000,
        hasCurrentCandle: !!this.currentCandle,
        rapidMode: 'ULTRA_FAST'
      });
    }
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  // RAPID MODE: Adjust for ultra-fast simulation speeds
  adjustSpeed(simulationSpeed: number): void {
    let newInterval: number;
    
    // ULTRA FAST intervals for all speeds
    if (simulationSpeed <= 5) {
      newInterval = 15000;  // 15 seconds for normal speed (was 60s)
    } else if (simulationSpeed <= 15) {
      newInterval = 10000;  // 10 seconds for medium speed (was 30s)
    } else {
      newInterval = 5000;   // 5 seconds for fast speed (was 15s)
    }
    
    if (newInterval !== this.candleInterval) {
      console.log(`⚡ [RAPID SPEED] Candle interval: ${this.candleInterval/1000}s → ${newInterval/1000}s (Speed: ${simulationSpeed}x)`);
      this.candleInterval = newInterval;
    }
  }
  
  // RAPID MODE: Force create test candles for immediate chart building
  forceRapidCandles(count: number, startTime: number, basePrice: number): void {
    console.log(`🧪 [FORCE RAPID] Creating ${count} ultra-fast test candles...`);
    
    this.clear(); // Start fresh
    
    for (let i = 0; i < count; i++) {
      const candleTime = startTime + (i * this.candleInterval);
      const priceVariation = basePrice * (0.995 + Math.random() * 0.01); // ±0.5% variation
      const volumeVariation = 500 + Math.random() * 2000; // 500-2500 volume
      
      const testCandle: PricePoint = {
        timestamp: candleTime,
        open: priceVariation,
        high: priceVariation * (1 + Math.random() * 0.008), // Up to 0.8% higher
        low: priceVariation * (1 - Math.random() * 0.008),  // Up to 0.8% lower
        close: priceVariation * (0.998 + Math.random() * 0.004), // Small close variation
        volume: volumeVariation
      };
      
      this.candles.push(testCandle);
      
      if (i < 5 || i % 10 === 0) {
        console.log(`   ⚡ Rapid candle ${i + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} @ $${testCandle.close.toFixed(6)} vol:${testCandle.volume.toFixed(0)}`);
      }
    }
    
    console.log(`🚀 [RAPID COMPLETE] ${count} candles created for ultra-fast testing`);
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
    console.log(`📥 [RAPID SET] ${this.candles.length} candles loaded - rapid mode ready`);
  }
  
  getCurrentCandle(): PricePoint | null {
    return this.currentCandle ? { ...this.currentCandle } : null;
  }
  
  getLastCompletedCandle(): PricePoint | null {
    return this.candles.length > 0 ? { ...this.candles[this.candles.length - 1] } : null;
  }
  
  // Force immediate candle completion for rapid testing
  forceCompleteCurrentCandle(): void {
    if (this.currentCandle) {
      console.log(`🔧 [RAPID FORCE] Finalizing candle: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)}`);
      this.finalizeCandle();
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
    
    console.log('🧹 [RAPID CLEAR] CandleManager cleared - ready for ultra-fast generation');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 [RAPID SHUTDOWN] Ultra-fast CandleManager shutdown complete');
  }
}