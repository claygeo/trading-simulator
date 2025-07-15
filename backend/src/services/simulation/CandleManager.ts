// backend/src/services/simulation/CandleManager.ts - ENHANCED: Complete OHLCV Support with Dynamic Intervals
import { PricePoint } from './types';

export class CandleManager {
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private lastCandleTime: number = 0;
  private simulationStartTime: number = 0;
  private baseTimeOffset: number = 0;
  
  // ENHANCED: Timestamp coordination system
  private timestampCoordinator: TimestampCoordinator;
  private isResetting: boolean = false;
  private resetPromise: Promise<void> | null = null;
  
  // ENHANCED: Dynamic interval management
  private priceCategory: 'micro' | 'small' | 'mid' | 'large' | 'mega' = 'mid';
  private lastPriceUpdate: number = 0;
  private volumeAccumulator: number = 0;
  
  constructor(candleInterval: number = 10000) {
    this.candleInterval = Math.min(candleInterval, 15000);
    this.timestampCoordinator = new TimestampCoordinator(candleInterval);
    console.log(`🕯️ ENHANCED CandleManager: ${this.candleInterval/1000}s intervals with complete OHLCV support`);
  }
  
  // ENHANCED: Initialize with simulation time and price category detection
  initialize(simulationStartTime: number, initialPrice?: number): void {
    this.simulationStartTime = simulationStartTime;
    this.baseTimeOffset = simulationStartTime;
    this.timestampCoordinator.initialize(simulationStartTime);
    this.lastCandleTime = 0;
    
    // ENHANCED: Detect price category for dynamic intervals
    if (initialPrice) {
      this.updatePriceCategory(initialPrice);
      this.adjustIntervalForPriceCategory();
    }
    
    console.log(`🕯️ CandleManager initialized with start time: ${new Date(simulationStartTime).toISOString()}, price category: ${this.priceCategory}`);
  }
  
  // ENHANCED: Dynamic price category detection
  private updatePriceCategory(price: number): void {
    const oldCategory = this.priceCategory;
    
    if (price < 0.01) {
      this.priceCategory = 'micro';
    } else if (price < 1) {
      this.priceCategory = 'small';
    } else if (price < 10) {
      this.priceCategory = 'mid';
    } else if (price < 100) {
      this.priceCategory = 'large';
    } else {
      this.priceCategory = 'mega';
    }
    
    if (oldCategory !== this.priceCategory) {
      console.log(`📊 Price category changed: ${oldCategory} → ${this.priceCategory} (price: $${price})`);
      this.adjustIntervalForPriceCategory();
    }
  }
  
  // ENHANCED: Adjust candle intervals based on price category
  private adjustIntervalForPriceCategory(): void {
    const oldInterval = this.candleInterval;
    
    switch (this.priceCategory) {
      case 'micro':
        this.candleInterval = 6000; // 6 seconds for high volatility micro-cap
        break;
      case 'small':
        this.candleInterval = 8000; // 8 seconds for small-cap
        break;
      case 'mid':
        this.candleInterval = 10000; // 10 seconds for mid-cap
        break;
      case 'large':
        this.candleInterval = 12000; // 12 seconds for large-cap
        break;
      case 'mega':
        this.candleInterval = 15000; // 15 seconds for stable mega-cap
        break;
    }
    
    if (oldInterval !== this.candleInterval) {
      console.log(`⚡ Candle interval adjusted: ${oldInterval}ms → ${this.candleInterval}ms for ${this.priceCategory}-cap`);
      this.timestampCoordinator.updateInterval(this.candleInterval);
    }
  }
  
  // ENHANCED: Safe update with timestamp coordination and price category detection
  updateCandle(timestamp: number, price: number, volume: number = 0): void {
    if (this.isResetting) {
      console.warn(`⚠️ CandleManager is resetting, skipping update`);
      return;
    }
    
    try {
      // Update price category dynamically
      this.updatePriceCategory(price);
      
      // Get coordinated timestamp
      const coordinatedTimestamp = this.timestampCoordinator.getCoordinatedTimestamp(timestamp);
      this._updateCandleInternal(coordinatedTimestamp, price, volume);
    } catch (error) {
      console.error(`❌ Error in updateCandle:`, error);
    }
  }
  
  // ENHANCED: Internal update with enhanced validation and OHLCV structure
  private _updateCandleInternal(timestamp: number, price: number, volume: number): void {
    // Validate timestamp progression
    if (this.lastCandleTime > 0 && timestamp < this.lastCandleTime) {
      console.warn(`⚠️ Backward timestamp detected: ${timestamp} < ${this.lastCandleTime}, auto-correcting`);
      timestamp = this.lastCandleTime + this.candleInterval;
    }
    
    const candleTime = this._alignTimestamp(timestamp);
    const isNewCandle = !this.currentCandle || this.currentCandle.timestamp !== candleTime;
    
    if (isNewCandle) {
      if (this.currentCandle && this.currentCandle.timestamp < candleTime) {
        this._finalizeCurrentCandle();
      }
      this._createNewCandle(candleTime, price, volume);
    } else {
      this._updateExistingCandle(price, volume);
    }
    
    this.timestampCoordinator.recordUpdate(timestamp, candleTime);
    this.lastPriceUpdate = price;
  }
  
  // ENHANCED: Timestamp alignment with drift correction
  private _alignTimestamp(timestamp: number): number {
    const aligned = Math.floor(timestamp / this.candleInterval) * this.candleInterval;
    
    // Ensure progression
    if (this.lastCandleTime > 0 && aligned <= this.lastCandleTime) {
      return this.lastCandleTime + this.candleInterval;
    }
    
    return aligned;
  }
  
  // ENHANCED: Create new candle with proper OHLCV structure
  private _createNewCandle(candleTime: number, price: number, volume: number): void {
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
    
    this.volumeAccumulator = volume;
    
    console.log(`🆕 NEW CANDLE #${this.candles.length + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} | O:${openPrice.toFixed(6)} | C:${price.toFixed(6)} | V:${volume.toFixed(0)} | ${this.priceCategory}-cap`);
  }
  
  // ENHANCED: Update existing candle with proper OHLCV validation
  private _updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    // Update OHLC values
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    
    // Accumulate volume
    this.volumeAccumulator += volume;
    this.currentCandle.volume = this.volumeAccumulator;
    
    // Validate OHLC integrity
    if (this.currentCandle.high < this.currentCandle.low) {
      console.warn(`⚠️ OHLC validation failed: high ${this.currentCandle.high} < low ${this.currentCandle.low}`);
      this.currentCandle.high = Math.max(this.currentCandle.high, this.currentCandle.low);
    }
    
    if (this.currentCandle.high < this.currentCandle.open || this.currentCandle.high < this.currentCandle.close) {
      this.currentCandle.high = Math.max(this.currentCandle.open, this.currentCandle.close);
    }
    
    if (this.currentCandle.low > this.currentCandle.open || this.currentCandle.low > this.currentCandle.close) {
      this.currentCandle.low = Math.min(this.currentCandle.open, this.currentCandle.close);
    }
  }
  
  // ENHANCED: Finalize current candle with complete OHLCV validation
  private _finalizeCurrentCandle(): void {
    if (!this.currentCandle) return;
    
    // Final OHLCV validation
    const candle = { ...this.currentCandle };
    
    // Ensure OHLC relationships are valid
    candle.high = Math.max(candle.open, candle.high, candle.low, candle.close);
    candle.low = Math.min(candle.open, candle.high, candle.low, candle.close);
    
    // Ensure volume is non-negative
    candle.volume = Math.max(0, candle.volume || 0);
    
    this.candles.push(candle);
    this.lastCandleTime = candle.timestamp;
    
    // Manage candle history size
    if (this.candles.length > 2000) {
      this.candles = this.candles.slice(-2000);
    }
    
    const candleNumber = this.candles.length;
    const priceChange = ((candle.close - candle.open) / candle.open * 100);
    const wickInfo = `H:${candle.high.toFixed(6)} L:${candle.low.toFixed(6)}`;
    
    console.log(`✅ FINALIZED #${candleNumber}: ${new Date(candle.timestamp).toISOString().substr(11, 8)} | ${wickInfo} | Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(3)}% | Vol: ${candle.volume.toFixed(0)} | ${this.priceCategory}-cap`);
    
    this.currentCandle = null;
    this.volumeAccumulator = 0;
  }
  
  // ENHANCED: Get candles with comprehensive validation
  getCandles(limit?: number): PricePoint[] {
    const allCandles = [...this.candles];
    
    // Include current building candle if it exists
    if (this.currentCandle) {
      allCandles.push({ ...this.currentCandle });
    }
    
    // Enhanced validation
    const validCandles = this._validateCandleSequence(allCandles);
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  // ENHANCED: Set candles with validation (for loading existing data)
  setCandles(candles: PricePoint[]): void {
    if (this.isResetting) {
      console.warn('⚠️ Cannot set candles during reset');
      return;
    }
    
    // Validate and sort input candles
    const validCandles = this._validateCandleSequence(candles);
    this.candles = validCandles;
    
    // Update last candle time
    if (validCandles.length > 0) {
      this.lastCandleTime = validCandles[validCandles.length - 1].timestamp;
    }
    
    console.log(`📊 Set ${validCandles.length} validated candles`);
  }
  
  // ENHANCED: Comprehensive candle validation with OHLCV integrity checks
  private _validateCandleSequence(candles: PricePoint[]): PricePoint[] {
    if (candles.length === 0) return [];
    
    const result: PricePoint[] = [];
    let lastTimestamp = 0;
    let fixedCount = 0;
    let ohlcFixCount = 0;
    
    for (const candle of candles) {
      // Fix timestamp if needed
      let timestamp = candle.timestamp;
      if (timestamp <= lastTimestamp) {
        timestamp = lastTimestamp + this.candleInterval;
        fixedCount++;
      }
      
      // Validate and fix OHLCV structure
      let validCandle = { ...candle, timestamp };
      
      // Ensure all OHLC values are numbers
      if (typeof validCandle.open !== 'number' || isNaN(validCandle.open)) validCandle.open = validCandle.close || 0;
      if (typeof validCandle.high !== 'number' || isNaN(validCandle.high)) validCandle.high = validCandle.close || 0;
      if (typeof validCandle.low !== 'number' || isNaN(validCandle.low)) validCandle.low = validCandle.close || 0;
      if (typeof validCandle.close !== 'number' || isNaN(validCandle.close)) validCandle.close = validCandle.open || 0;
      if (typeof validCandle.volume !== 'number' || isNaN(validCandle.volume)) validCandle.volume = 0;
      
      // Fix OHLC relationships
      const originalHigh = validCandle.high;
      const originalLow = validCandle.low;
      
      validCandle.high = Math.max(validCandle.open, validCandle.high, validCandle.low, validCandle.close);
      validCandle.low = Math.min(validCandle.open, validCandle.high, validCandle.low, validCandle.close);
      
      if (validCandle.high !== originalHigh || validCandle.low !== originalLow) {
        ohlcFixCount++;
      }
      
      // Ensure volume is non-negative
      validCandle.volume = Math.max(0, validCandle.volume);
      
      // Validate final OHLC relationships
      if (validCandle.high >= validCandle.low &&
          validCandle.high >= validCandle.open &&
          validCandle.high >= validCandle.close &&
          validCandle.low <= validCandle.open &&
          validCandle.low <= validCandle.close &&
          validCandle.volume >= 0) {
        
        result.push(validCandle);
        lastTimestamp = timestamp;
      }
    }
    
    if (fixedCount > 0) {
      console.log(`🔧 Fixed ${fixedCount} timestamp issues in candle sequence`);
    }
    
    if (ohlcFixCount > 0) {
      console.log(`🔧 Fixed ${ohlcFixCount} OHLC relationship issues in candle sequence`);
    }
    
    console.log(`📊 VALIDATED: ${result.length}/${candles.length} candles (${candles.length - result.length} filtered)`);
    return result;
  }
  
  // ENHANCED: Reset with proper coordination
  async reset(): Promise<void> {
    if (this.isResetting) {
      return this.resetPromise || Promise.resolve();
    }
    
    this.isResetting = true;
    this.resetPromise = this._performReset();
    
    try {
      await this.resetPromise;
    } finally {
      this.isResetting = false;
      this.resetPromise = null;
    }
  }
  
  private async _performReset(): Promise<void> {
    console.log('🔄 ENHANCED RESET: Starting coordinated reset with OHLCV validation');
    
    // Clear all data
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    this.volumeAccumulator = 0;
    this.lastPriceUpdate = 0;
    
    // Reset price category to default
    this.priceCategory = 'mid';
    this.candleInterval = 10000;
    
    // Reset timestamp coordinator
    this.timestampCoordinator.reset();
    
    // Wait a moment to ensure any pending operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ ENHANCED RESET: Complete with OHLCV validation');
  }
  
  // ENHANCED: Clear with coordination
  clear(): void {
    if (this.isResetting) {
      console.warn('⚠️ Clear called during reset, skipping');
      return;
    }
    
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    this.volumeAccumulator = 0;
    this.lastPriceUpdate = 0;
    this.timestampCoordinator.reset();
    
    console.log('🧹 CLEARED: CandleManager reset with OHLCV validation');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 SHUTDOWN: CandleManager closed');
  }
  
  // ENHANCED: Get comprehensive statistics
  getStats(): any {
    const candleCount = this.candles.length + (this.currentCandle ? 1 : 0);
    const lastCandle = this.candles[this.candles.length - 1];
    
    return {
      candleCount: candleCount,
      lastCandleTime: this.lastCandleTime,
      currentCandle: !!this.currentCandle,
      isResetting: this.isResetting,
      priceCategory: this.priceCategory,
      candleInterval: this.candleInterval,
      lastPrice: lastCandle ? lastCandle.close : 0,
      totalVolume: this.candles.reduce((sum, c) => sum + (c.volume || 0), 0),
      coordinatorStats: this.timestampCoordinator.getStats()
    };
  }
  
  // ENHANCED: Get current candle progress
  getCurrentCandleProgress(): {
    exists: boolean;
    timestamp?: number;
    duration?: number;
    progress?: number;
    priceRange?: { high: number; low: number; open: number; close: number };
    volume?: number;
  } {
    if (!this.currentCandle) {
      return { exists: false };
    }
    
    const now = Date.now();
    const candleStart = this.currentCandle.timestamp;
    const candleEnd = candleStart + this.candleInterval;
    const duration = now - candleStart;
    const progress = Math.min(1, duration / this.candleInterval);
    
    return {
      exists: true,
      timestamp: this.currentCandle.timestamp,
      duration: duration,
      progress: progress,
      priceRange: {
        open: this.currentCandle.open,
        high: this.currentCandle.high,
        low: this.currentCandle.low,
        close: this.currentCandle.close
      },
      volume: this.currentCandle.volume
    };
  }
  
  // ENHANCED: Force finalize current candle (for manual control)
  forceFinalizeCurrent(): boolean {
    if (this.currentCandle) {
      this._finalizeCurrentCandle();
      return true;
    }
    return false;
  }
}

// ENHANCED: Timestamp coordination helper class with interval management
class TimestampCoordinator {
  private startTime: number = 0;
  private expectedInterval: number;
  private lastTimestamp: number = 0;
  private driftCorrection: number = 0;
  private updateCount: number = 0;
  
  constructor(interval: number) {
    this.expectedInterval = interval;
  }
  
  initialize(startTime: number): void {
    this.startTime = startTime;
    this.lastTimestamp = startTime;
    this.driftCorrection = 0;
    this.updateCount = 0;
    
    console.log(`📅 TimestampCoordinator initialized with start: ${new Date(startTime).toISOString()}, interval: ${this.expectedInterval}ms`);
  }
  
  updateInterval(newInterval: number): void {
    this.expectedInterval = newInterval;
    console.log(`⚡ TimestampCoordinator interval updated to: ${newInterval}ms`);
  }
  
  getCoordinatedTimestamp(inputTimestamp: number): number {
    // If this is the first timestamp or after reset
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = inputTimestamp;
      return inputTimestamp;
    }
    
    // Calculate expected next timestamp
    const expectedNext = this.lastTimestamp + this.expectedInterval;
    
    // If input is reasonable, use it (within 1 second before to 5 seconds after expected)
    if (inputTimestamp >= expectedNext - 1000 && inputTimestamp <= expectedNext + 5000) {
      this.lastTimestamp = inputTimestamp;
      return inputTimestamp;
    }
    
    // Otherwise, use expected timestamp
    console.log(`🔧 Timestamp coordination: ${inputTimestamp} -> ${expectedNext} (enforcing ${this.expectedInterval}ms interval)`);
    this.lastTimestamp = expectedNext;
    return expectedNext;
  }
  
  recordUpdate(originalTimestamp: number, coordinatedTimestamp: number): void {
    this.updateCount++;
    
    if (originalTimestamp !== coordinatedTimestamp) {
      const drift = coordinatedTimestamp - originalTimestamp;
      this.driftCorrection += drift;
    }
  }
  
  reset(): void {
    this.lastTimestamp = this.startTime;
    this.driftCorrection = 0;
    this.updateCount = 0;
    console.log('📅 TimestampCoordinator reset');
  }
  
  getStats(): any {
    return {
      updateCount: this.updateCount,
      totalDriftCorrection: this.driftCorrection,
      averageDrift: this.updateCount > 0 ? this.driftCorrection / this.updateCount : 0,
      lastTimestamp: this.lastTimestamp,
      expectedInterval: this.expectedInterval
    };
  }
}