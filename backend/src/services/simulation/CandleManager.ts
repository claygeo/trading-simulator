// backend/src/services/simulation/CandleManager.ts - FIXED: Enhanced OHLCV Support & Validation
import { PricePoint } from './types';

export class CandleManager {
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private lastCandleTime: number = 0;
  private simulationStartTime: number = 0;
  private baseTimeOffset: number = 0;
  
  private timestampCoordinator: TimestampCoordinator;
  private isResetting: boolean = false;
  private resetPromise: Promise<void> | null = null;
  
  private priceCategory: 'micro' | 'small' | 'mid' | 'large' | 'mega' = 'mid';
  private lastPriceUpdate: number = 0;
  private volumeAccumulator: number = 0;
  
  // 🔧 FIXED: Enhanced validation tracking
  private validationStats = {
    totalUpdates: 0,
    timestampFixes: 0,
    ohlcFixes: 0,
    invalidCandles: 0,
    lastValidationRun: 0
  };
  
  constructor(candleInterval: number = 10000) {
    this.candleInterval = Math.min(candleInterval, 15000);
    this.timestampCoordinator = new TimestampCoordinator(candleInterval);
    console.log(`🕯️ FIXED CandleManager: ${this.candleInterval/1000}s intervals with enhanced validation`);
  }
  
  initialize(simulationStartTime: number, initialPrice?: number): void {
    this.simulationStartTime = simulationStartTime;
    this.baseTimeOffset = simulationStartTime;
    this.timestampCoordinator.initialize(simulationStartTime);
    this.lastCandleTime = 0;
    
    // Reset validation stats
    this.validationStats = {
      totalUpdates: 0,
      timestampFixes: 0,
      ohlcFixes: 0,
      invalidCandles: 0,
      lastValidationRun: Date.now()
    };
    
    if (initialPrice) {
      this.updatePriceCategory(initialPrice);
      this.adjustIntervalForPriceCategory();
    }
    
    console.log(`🕯️ FIXED: CandleManager initialized with start time: ${new Date(simulationStartTime).toISOString()}, price category: ${this.priceCategory}`);
  }
  
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
  
  updateCandle(timestamp: number, price: number, volume: number = 0): void {
    if (this.isResetting) {
      console.warn(`⚠️ CandleManager is resetting, skipping update`);
      return;
    }
    
    this.validationStats.totalUpdates++;
    
    try {
      this.updatePriceCategory(price);
      
      // 🔧 FIXED: Enhanced timestamp coordination with validation
      const coordinatedTimestamp = this.timestampCoordinator.getCoordinatedTimestamp(timestamp);
      
      // 🔧 FIXED: Validate timestamp before processing
      if (!this.validateTimestamp(coordinatedTimestamp)) {
        console.warn(`⚠️ FIXED: Invalid timestamp ${coordinatedTimestamp}, generating sequential timestamp`);
        const sequentialTimestamp = this.generateSequentialTimestamp();
        this._updateCandleInternal(sequentialTimestamp, price, volume);
      } else {
        this._updateCandleInternal(coordinatedTimestamp, price, volume);
      }
      
    } catch (error) {
      console.error(`❌ Error in updateCandle:`, error);
      this.validationStats.invalidCandles++;
    }
  }
  
  // 🔧 FIXED: Enhanced timestamp validation
  private validateTimestamp(timestamp: number): boolean {
    // Check if timestamp is reasonable
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneHourFromNow = now + (60 * 60 * 1000);
    
    if (timestamp < oneHourAgo || timestamp > oneHourFromNow) {
      return false;
    }
    
    // Check if timestamp is sequential
    if (this.lastCandleTime > 0 && timestamp <= this.lastCandleTime) {
      return false;
    }
    
    return true;
  }
  
  // 🔧 FIXED: Generate guaranteed sequential timestamp
  private generateSequentialTimestamp(): number {
    if (this.lastCandleTime === 0) {
      this.lastCandleTime = this.simulationStartTime;
    }
    
    this.lastCandleTime += this.candleInterval;
    return this.lastCandleTime;
  }
  
  private _updateCandleInternal(timestamp: number, price: number, volume: number): void {
    // 🔧 FIXED: Ensure timestamps are always sequential
    if (this.lastCandleTime > 0 && timestamp <= this.lastCandleTime) {
      console.warn(`⚠️ FIXED: Non-sequential timestamp detected: ${timestamp} <= ${this.lastCandleTime}, auto-correcting`);
      timestamp = this.lastCandleTime + this.candleInterval;
      this.validationStats.timestampFixes++;
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
  
  private _alignTimestamp(timestamp: number): number {
    const aligned = Math.floor(timestamp / this.candleInterval) * this.candleInterval;
    
    // 🔧 FIXED: Ensure strict progression
    if (this.lastCandleTime > 0 && aligned <= this.lastCandleTime) {
      return this.lastCandleTime + this.candleInterval;
    }
    
    return aligned;
  }
  
  // 🔧 FIXED: Create new candle with enhanced OHLCV validation
  private _createNewCandle(candleTime: number, price: number, volume: number): void {
    const lastCandle = this.candles[this.candles.length - 1];
    let openPrice = price; // Default to current price
    
    // 🔧 FIXED: Better open price determination
    if (lastCandle) {
      // Use previous candle's close as this candle's open
      openPrice = lastCandle.close;
    }
    
    // 🔧 FIXED: Validate price values
    if (!this.isValidPrice(price) || !this.isValidPrice(openPrice)) {
      console.warn(`⚠️ FIXED: Invalid price values detected, using fallback`);
      price = lastCandle ? lastCandle.close : 1.0; // Fallback price
      openPrice = price;
    }
    
    this.currentCandle = {
      timestamp: candleTime,
      open: openPrice,
      high: price,
      low: price,
      close: price,
      volume: Math.max(0, volume || 0) // Ensure non-negative volume
    };
    
    this.volumeAccumulator = this.currentCandle.volume;
    
    console.log(`🆕 FIXED CANDLE #${this.candles.length + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} | O:${openPrice.toFixed(6)} | C:${price.toFixed(6)} | V:${volume.toFixed(0)} | ${this.priceCategory}-cap`);
  }
  
  // 🔧 FIXED: Enhanced price validation
  private isValidPrice(price: number): boolean {
    return typeof price === 'number' && 
           !isNaN(price) && 
           isFinite(price) && 
           price > 0 && 
           price < 1000000; // Reasonable upper bound
  }
  
  // 🔧 FIXED: Update existing candle with comprehensive validation
  private _updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    // 🔧 FIXED: Validate input price
    if (!this.isValidPrice(price)) {
      console.warn(`⚠️ FIXED: Invalid price ${price} for candle update, skipping`);
      return;
    }
    
    // 🔧 FIXED: Update OHLC with proper validation
    const originalHigh = this.currentCandle.high;
    const originalLow = this.currentCandle.low;
    
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    
    // Accumulate volume
    this.volumeAccumulator += Math.max(0, volume || 0);
    this.currentCandle.volume = this.volumeAccumulator;
    
    // 🔧 FIXED: Enhanced OHLC relationship validation
    if (!this.validateOHLCRelationships(this.currentCandle)) {
      console.warn(`⚠️ FIXED: OHLC validation failed, auto-correcting`);
      this.fixOHLCRelationships(this.currentCandle);
      this.validationStats.ohlcFixes++;
    }
  }
  
  // 🔧 FIXED: Comprehensive OHLC validation
  private validateOHLCRelationships(candle: PricePoint): boolean {
    // Check basic relationships
    if (candle.high < candle.low) {
      return false;
    }
    
    if (candle.high < candle.open || candle.high < candle.close) {
      return false;
    }
    
    if (candle.low > candle.open || candle.low > candle.close) {
      return false;
    }
    
    // Check for valid price values
    if (!this.isValidPrice(candle.open) || 
        !this.isValidPrice(candle.high) || 
        !this.isValidPrice(candle.low) || 
        !this.isValidPrice(candle.close)) {
      return false;
    }
    
    // Check volume
    if (candle.volume < 0 || !isFinite(candle.volume)) {
      return false;
    }
    
    return true;
  }
  
  // 🔧 FIXED: Auto-fix OHLC relationships
  private fixOHLCRelationships(candle: PricePoint): void {
    // Ensure all prices are valid numbers
    candle.open = this.isValidPrice(candle.open) ? candle.open : candle.close;
    candle.high = this.isValidPrice(candle.high) ? candle.high : candle.close;
    candle.low = this.isValidPrice(candle.low) ? candle.low : candle.close;
    candle.close = this.isValidPrice(candle.close) ? candle.close : candle.open;
    
    // Fix OHLC relationships
    candle.high = Math.max(candle.open, candle.high, candle.low, candle.close);
    candle.low = Math.min(candle.open, candle.high, candle.low, candle.close);
    
    // Ensure volume is non-negative
    candle.volume = Math.max(0, candle.volume || 0);
    
    console.log(`🔧 FIXED: Auto-corrected OHLC relationships for candle at ${new Date(candle.timestamp).toISOString()}`);
  }
  
  private _finalizeCurrentCandle(): void {
    if (!this.currentCandle) return;
    
    const candle = { ...this.currentCandle };
    
    // 🔧 FIXED: Final validation and auto-correction
    if (!this.validateOHLCRelationships(candle)) {
      this.fixOHLCRelationships(candle);
      this.validationStats.ohlcFixes++;
    }
    
    this.candles.push(candle);
    this.lastCandleTime = candle.timestamp;
    
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
  
  getCandles(limit?: number): PricePoint[] {
    const allCandles = [...this.candles];
    
    if (this.currentCandle) {
      allCandles.push({ ...this.currentCandle });
    }
    
    // 🔧 FIXED: Enhanced validation of returned candles
    const validCandles = this._validateCandleSequence(allCandles);
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  setCandles(candles: PricePoint[]): void {
    if (this.isResetting) {
      console.warn('⚠️ Cannot set candles during reset');
      return;
    }
    
    // 🔧 FIXED: Enhanced validation and sanitization
    const validCandles = this._validateCandleSequence(candles);
    this.candles = validCandles;
    
    if (validCandles.length > 0) {
      this.lastCandleTime = validCandles[validCandles.length - 1].timestamp;
    }
    
    console.log(`📊 FIXED: Set ${validCandles.length} validated candles`);
  }
  
  // 🔧 FIXED: Comprehensive candle sequence validation with auto-correction
  private _validateCandleSequence(candles: PricePoint[]): PricePoint[] {
    if (candles.length === 0) return [];
    
    const result: PricePoint[] = [];
    let lastTimestamp = 0;
    let fixedTimestamps = 0;
    let fixedOHLC = 0;
    let removedCandles = 0;
    
    for (const candle of candles) {
      // 🔧 FIXED: Create a working copy
      let workingCandle = { ...candle };
      
      // Fix timestamp if needed
      if (workingCandle.timestamp <= lastTimestamp) {
        workingCandle.timestamp = lastTimestamp + this.candleInterval;
        fixedTimestamps++;
      }
      
      // 🔧 FIXED: Validate and fix all price values
      if (!this.isValidPrice(workingCandle.open)) workingCandle.open = workingCandle.close || 1.0;
      if (!this.isValidPrice(workingCandle.high)) workingCandle.high = workingCandle.close || 1.0;
      if (!this.isValidPrice(workingCandle.low)) workingCandle.low = workingCandle.close || 1.0;
      if (!this.isValidPrice(workingCandle.close)) workingCandle.close = workingCandle.open || 1.0;
      
      // Fix volume
      if (typeof workingCandle.volume !== 'number' || isNaN(workingCandle.volume)) {
        workingCandle.volume = 0;
      }
      workingCandle.volume = Math.max(0, workingCandle.volume);
      
      // 🔧 FIXED: Fix OHLC relationships
      const originalOHLC = {
        open: workingCandle.open,
        high: workingCandle.high,
        low: workingCandle.low,
        close: workingCandle.close
      };
      
      this.fixOHLCRelationships(workingCandle);
      
      // Count OHLC fixes
      if (originalOHLC.high !== workingCandle.high || 
          originalOHLC.low !== workingCandle.low) {
        fixedOHLC++;
      }
      
      // 🔧 FIXED: Final validation before adding
      if (this.validateOHLCRelationships(workingCandle) && 
          this.isValidPrice(workingCandle.close) &&
          workingCandle.timestamp > lastTimestamp) {
        
        result.push(workingCandle);
        lastTimestamp = workingCandle.timestamp;
      } else {
        removedCandles++;
        console.warn(`⚠️ FIXED: Removed invalid candle at ${new Date(candle.timestamp).toISOString()}`);
      }
    }
    
    // Update validation stats
    this.validationStats.timestampFixes += fixedTimestamps;
    this.validationStats.ohlcFixes += fixedOHLC;
    this.validationStats.invalidCandles += removedCandles;
    
    if (fixedTimestamps > 0) {
      console.log(`🔧 FIXED: Corrected ${fixedTimestamps} timestamp issues`);
    }
    
    if (fixedOHLC > 0) {
      console.log(`🔧 FIXED: Corrected ${fixedOHLC} OHLC relationship issues`);
    }
    
    if (removedCandles > 0) {
      console.log(`🗑️ FIXED: Removed ${removedCandles} invalid candles`);
    }
    
    console.log(`📊 FIXED VALIDATION: ${result.length}/${candles.length} candles validated and corrected`);
    return result;
  }
  
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
    console.log('🔄 FIXED RESET: Starting coordinated reset with enhanced validation');
    
    // Clear all data
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    this.volumeAccumulator = 0;
    this.lastPriceUpdate = 0;
    
    // Reset price category to default
    this.priceCategory = 'mid';
    this.candleInterval = 10000;
    
    // Reset validation stats
    this.validationStats = {
      totalUpdates: 0,
      timestampFixes: 0,
      ohlcFixes: 0,
      invalidCandles: 0,
      lastValidationRun: Date.now()
    };
    
    // Reset timestamp coordinator
    this.timestampCoordinator.reset();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ FIXED RESET: Complete with enhanced validation');
  }
  
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
    
    // Reset validation stats
    this.validationStats = {
      totalUpdates: 0,
      timestampFixes: 0,
      ohlcFixes: 0,
      invalidCandles: 0,
      lastValidationRun: Date.now()
    };
    
    console.log('🧹 FIXED CLEARED: CandleManager reset with enhanced validation');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 FIXED SHUTDOWN: CandleManager closed');
  }
  
  // 🔧 FIXED: Enhanced statistics with validation metrics
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
      coordinatorStats: this.timestampCoordinator.getStats(),
      validationStats: {
        ...this.validationStats,
        successRate: this.validationStats.totalUpdates > 0 ? 
          (this.validationStats.totalUpdates - this.validationStats.invalidCandles) / this.validationStats.totalUpdates : 1,
        fixRate: this.validationStats.totalUpdates > 0 ?
          (this.validationStats.timestampFixes + this.validationStats.ohlcFixes) / this.validationStats.totalUpdates : 0
      }
    };
  }
  
  getCurrentCandleProgress(): {
    exists: boolean;
    timestamp?: number;
    duration?: number;
    progress?: number;
    priceRange?: { high: number; low: number; open: number; close: number };
    volume?: number;
    isValid?: boolean;
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
      volume: this.currentCandle.volume,
      isValid: this.validateOHLCRelationships(this.currentCandle)
    };
  }
  
  forceFinalizeCurrent(): boolean {
    if (this.currentCandle) {
      this._finalizeCurrentCandle();
      return true;
    }
    return false;
  }
  
  // 🔧 FIXED: Get validation report
  getValidationReport(): any {
    return {
      stats: this.validationStats,
      health: {
        successRate: this.validationStats.totalUpdates > 0 ? 
          (this.validationStats.totalUpdates - this.validationStats.invalidCandles) / this.validationStats.totalUpdates : 1,
        errorRate: this.validationStats.totalUpdates > 0 ?
          this.validationStats.invalidCandles / this.validationStats.totalUpdates : 0,
        autoFixRate: this.validationStats.totalUpdates > 0 ?
          (this.validationStats.timestampFixes + this.validationStats.ohlcFixes) / this.validationStats.totalUpdates : 0
      },
      recommendations: this.generateRecommendations()
    };
  }
  
  // 🔧 FIXED: Generate health recommendations
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.validationStats.totalUpdates === 0) {
      recommendations.push("No updates processed yet - system ready");
      return recommendations;
    }
    
    const errorRate = this.validationStats.invalidCandles / this.validationStats.totalUpdates;
    const fixRate = (this.validationStats.timestampFixes + this.validationStats.ohlcFixes) / this.validationStats.totalUpdates;
    
    if (errorRate > 0.1) {
      recommendations.push("High error rate detected - check input data quality");
    }
    
    if (fixRate > 0.2) {
      recommendations.push("High auto-fix rate - consider reviewing timestamp coordination");
    }
    
    if (this.validationStats.timestampFixes > this.validationStats.ohlcFixes * 3) {
      recommendations.push("Timestamp issues are primary concern - check clock synchronization");
    }
    
    if (this.validationStats.ohlcFixes > this.validationStats.timestampFixes * 3) {
      recommendations.push("OHLC data quality issues - check price calculation logic");
    }
    
    if (recommendations.length === 0) {
      recommendations.push("System operating optimally - no issues detected");
    }
    
    return recommendations;
  }
}

// 🔧 FIXED: Enhanced timestamp coordination with better validation
class TimestampCoordinator {
  private startTime: number = 0;
  private expectedInterval: number;
  private lastTimestamp: number = 0;
  private driftCorrection: number = 0;
  private updateCount: number = 0;
  private sequenceNumber: number = 0; // For guaranteed sequential timestamps
  
  constructor(interval: number) {
    this.expectedInterval = interval;
  }
  
  initialize(startTime: number): void {
    this.startTime = startTime;
    this.lastTimestamp = startTime;
    this.driftCorrection = 0;
    this.updateCount = 0;
    this.sequenceNumber = 0;
    
    console.log(`📅 FIXED TimestampCoordinator: initialized with start: ${new Date(startTime).toISOString()}, interval: ${this.expectedInterval}ms`);
  }
  
  updateInterval(newInterval: number): void {
    this.expectedInterval = newInterval;
    console.log(`⚡ FIXED TimestampCoordinator: interval updated to: ${newInterval}ms`);
  }
  
  getCoordinatedTimestamp(inputTimestamp: number): number {
    // 🔧 FIXED: Always ensure sequential progression
    this.sequenceNumber++;
    
    // If this is the first timestamp or after reset
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = Math.max(inputTimestamp, this.startTime);
      return this.lastTimestamp;
    }
    
    // Calculate expected next timestamp
    const expectedNext = this.lastTimestamp + this.expectedInterval;
    
    // 🔧 FIXED: Always use sequential timestamps to prevent any ordering issues
    const coordinatedTimestamp = Math.max(expectedNext, inputTimestamp);
    
    if (inputTimestamp !== coordinatedTimestamp) {
      const drift = coordinatedTimestamp - inputTimestamp;
      this.driftCorrection += drift;
      console.log(`🔧 FIXED Coordination: ${inputTimestamp} → ${coordinatedTimestamp} (drift: ${drift}ms, seq: ${this.sequenceNumber})`);
    }
    
    this.lastTimestamp = coordinatedTimestamp;
    return coordinatedTimestamp;
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
    this.sequenceNumber = 0;
    console.log('📅 FIXED TimestampCoordinator: reset');
  }
  
  getStats(): any {
    return {
      updateCount: this.updateCount,
      sequenceNumber: this.sequenceNumber,
      totalDriftCorrection: this.driftCorrection,
      averageDrift: this.updateCount > 0 ? this.driftCorrection / this.updateCount : 0,
      lastTimestamp: this.lastTimestamp,
      expectedInterval: this.expectedInterval,
      isHealthy: this.updateCount > 0 && Math.abs(this.driftCorrection / this.updateCount) < 1000 // Less than 1 second average drift
    };
  }
}