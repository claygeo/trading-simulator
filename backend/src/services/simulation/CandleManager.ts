// backend/src/services/simulation/CandleManager.ts - FIXED: Proper Timestamp Ordering
import { PricePoint } from './types';

export class CandleManager {
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private lastCandleTime: number = 0;
  private tradeBuffer: Array<{timestamp: number, price: number, volume: number}> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  
  // CRITICAL FIX: Remove async lock that was causing race conditions
  private isUpdating: boolean = false;
  
  constructor(candleInterval: number = 10000) {
    this.candleInterval = Math.min(candleInterval, 15000);
    console.log(`🕯️ CandleManager: ${this.candleInterval/1000}s intervals - TIMESTAMP ORDERED`);
  }
  
  // FIXED: Synchronous update to prevent race conditions
  updateCandle(timestamp: number, price: number, volume: number = 0): void {
    // CRITICAL FIX: Prevent concurrent updates that cause ordering issues
    if (this.isUpdating) {
      console.warn(`⚠️ Skipping concurrent candle update at ${timestamp}`);
      return;
    }
    
    this.isUpdating = true;
    
    try {
      this._updateCandleSync(timestamp, price, volume);
    } finally {
      this.isUpdating = false;
    }
  }
  
  // FIXED: Synchronous internal update with proper timestamp alignment
  private _updateCandleSync(timestamp: number, price: number, volume: number): void {
    // CRITICAL FIX: Ensure timestamp is properly aligned to prevent ordering issues
    const candleTime = this._alignTimestamp(timestamp);
    
    // FIXED: Validate timestamp ordering before proceeding
    if (this.lastCandleTime > 0 && candleTime < this.lastCandleTime) {
      console.warn(`⚠️ Out-of-order timestamp detected: ${candleTime} < ${this.lastCandleTime}, skipping`);
      return;
    }
    
    const isNewCandle = !this.currentCandle || this.currentCandle.timestamp !== candleTime;
    
    if (isNewCandle) {
      console.log(`📅 NEW CANDLE: ${new Date(candleTime).toISOString().substr(11, 8)} | Price: $${price.toFixed(6)} | Vol: ${volume.toFixed(0)}`);
    }
    
    // FIXED: Sequential candle creation - no async gaps
    if (!this.currentCandle || this.currentCandle.timestamp !== candleTime) {
      // Finalize previous candle if it exists and is older
      if (this.currentCandle && this.currentCandle.timestamp < candleTime) {
        this._finalizeCurrentCandle();
      }
      
      // Create new candle with proper ordering
      this._createNewCandleSync(candleTime, price, volume);
    } else {
      // Update existing candle
      this._updateExistingCandle(price, volume);
    }
    
    // FIXED: Update trade buffer without async complications
    this._updateTradeBufferSync(timestamp, price, volume);
  }
  
  // FIXED: Proper timestamp alignment that maintains ordering
  private _alignTimestamp(timestamp: number): number {
    // CRITICAL FIX: Always round down to interval boundary for consistent ordering
    const aligned = Math.floor(timestamp / this.candleInterval) * this.candleInterval;
    
    // VALIDATION: Ensure we never go backwards
    if (this.lastCandleTime > 0 && aligned < this.lastCandleTime) {
      // If alignment would cause backward movement, use next interval
      return this.lastCandleTime + this.candleInterval;
    }
    
    return aligned;
  }
  
  // FIXED: Synchronous candle creation with proper ordering
  private _createNewCandleSync(candleTime: number, price: number, volume: number): void {
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
    
    console.log(`🆕 CANDLE #${this.candles.length + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} | OHLC: ${openPrice.toFixed(6)}/${price.toFixed(6)}/${price.toFixed(6)}/${price.toFixed(6)}`);
  }
  
  private _updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    // Update OHLC values
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    this.currentCandle.volume += volume;
  }
  
  // FIXED: Immediate finalization to prevent ordering issues
  private _finalizeCurrentCandle(): void {
    if (!this.currentCandle) return;
    
    // CRITICAL FIX: Add completed candle to array immediately
    this.candles.push({ ...this.currentCandle });
    this.lastCandleTime = this.currentCandle.timestamp;
    
    // Maintain reasonable history size
    if (this.candles.length > 2000) {
      this.candles = this.candles.slice(-2000);
    }
    
    const candleNumber = this.candles.length;
    const priceChange = ((this.currentCandle.close - this.currentCandle.open) / this.currentCandle.open * 100);
    
    console.log(`✅ FINALIZED #${candleNumber}: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)} | Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(3)}% | Vol: ${this.currentCandle.volume.toFixed(0)}`);
    
    this.currentCandle = null;
  }
  
  // FIXED: Synchronous trade buffer without async complications
  private _updateTradeBufferSync(timestamp: number, price: number, volume: number): void {
    // Add trade to buffer
    this.tradeBuffer.push({ timestamp, price, volume });
    
    // FIXED: Immediate flush when buffer gets large to prevent ordering issues
    if (this.tradeBuffer.length >= 10) {
      this._flushTradeBufferSync();
    }
    
    // FIXED: Use shorter timer for smaller batches
    if (!this.flushTimer && this.tradeBuffer.length > 0) {
      this.flushTimer = setTimeout(() => {
        this._flushTradeBufferSync();
        this.flushTimer = null;
      }, 50); // Much shorter flush time
    }
  }
  
  // FIXED: Synchronous buffer flush with proper ordering
  private _flushTradeBufferSync(): void {
    if (this.tradeBuffer.length === 0) return;
    
    // CRITICAL FIX: Sort trades by timestamp before processing
    const sortedTrades = this.tradeBuffer.sort((a, b) => a.timestamp - b.timestamp);
    let totalVolumeFlushed = 0;
    
    for (const trade of sortedTrades) {
      const candleTime = this._alignTimestamp(trade.timestamp);
      
      if (this.currentCandle && this.currentCandle.timestamp === candleTime) {
        this._updateExistingCandle(trade.price, trade.volume);
        totalVolumeFlushed += trade.volume;
      }
    }
    
    // Clear the buffer
    this.tradeBuffer = [];
    
    if (totalVolumeFlushed > 0) {
      console.log(`💧 FLUSHED: ${sortedTrades.length} trades, vol: ${totalVolumeFlushed.toFixed(0)}`);
    }
  }
  
  // FIXED: Return properly ordered candles with validation
  getCandles(limit?: number): PricePoint[] {
    const allCandles = [...this.candles];
    
    // Include current candle if it exists
    if (this.currentCandle) {
      allCandles.push({ ...this.currentCandle });
    }
    
    // CRITICAL FIX: Ensure strict timestamp ordering
    allCandles.sort((a, b) => a.timestamp - b.timestamp);
    
    // FIXED: Remove duplicates and validate ordering
    const validCandles = this._validateAndFilterCandles(allCandles);
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  // CRITICAL FIX: Validate candle ordering and remove issues
  private _validateAndFilterCandles(candles: PricePoint[]): PricePoint[] {
    const result: PricePoint[] = [];
    let lastTimestamp = 0;
    
    for (const candle of candles) {
      // Skip if timestamp is not advancing
      if (candle.timestamp <= lastTimestamp) {
        console.warn(`⚠️ Skipping out-of-order candle: ${candle.timestamp} <= ${lastTimestamp}`);
        continue;
      }
      
      // Validate OHLC integrity
      if (candle.high >= candle.low &&
          candle.high >= candle.open &&
          candle.high >= candle.close &&
          candle.low <= candle.open &&
          candle.low <= candle.close) {
        result.push(candle);
        lastTimestamp = candle.timestamp;
      } else {
        console.warn(`⚠️ Skipping invalid OHLC candle at ${candle.timestamp}`);
      }
    }
    
    console.log(`📊 VALIDATED: ${result.length}/${candles.length} candles (${candles.length - result.length} filtered out)`);
    return result;
  }
  
  adjustSpeed(simulationSpeed: number): void {
    let newInterval: number;
    
    if (simulationSpeed <= 5) {
      newInterval = 15000;
    } else if (simulationSpeed <= 15) {
      newInterval = 10000;
    } else {
      newInterval = 5000;
    }
    
    if (newInterval !== this.candleInterval) {
      console.log(`⚡ SPEED CHANGE: ${this.candleInterval/1000}s → ${newInterval/1000}s (Speed: ${simulationSpeed}x)`);
      this.candleInterval = newInterval;
    }
  }
  
  setCandles(candles: PricePoint[]): void {
    // CRITICAL FIX: Validate and sort incoming candles
    const validCandles = this._validateAndFilterCandles([...candles]);
    this.candles = validCandles;
    
    // Update last candle time
    if (this.candles.length > 0) {
      this.lastCandleTime = this.candles[this.candles.length - 1].timestamp;
    }
    
    this.currentCandle = null;
    console.log(`📥 SET: ${this.candles.length} validated candles loaded`);
  }
  
  getCurrentCandle(): PricePoint | null {
    return this.currentCandle ? { ...this.currentCandle } : null;
  }
  
  getLastCompletedCandle(): PricePoint | null {
    return this.candles.length > 0 ? { ...this.candles[this.candles.length - 1] } : null;
  }
  
  forceCompleteCurrentCandle(): void {
    if (this.currentCandle) {
      console.log(`🔧 FORCE COMPLETE: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)}`);
      this._finalizeCurrentCandle();
    }
  }
  
  clear(): void {
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    this.tradeBuffer = [];
    this.isUpdating = false;
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    console.log('🧹 CLEARED: CandleManager reset with proper ordering');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 SHUTDOWN: CandleManager closed');
  }
}