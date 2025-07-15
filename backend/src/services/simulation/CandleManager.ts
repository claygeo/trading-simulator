// backend/src/services/simulation/CandleManager.ts - ENHANCED: Timestamp Coordination System
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
  
  constructor(candleInterval: number = 10000) {
    this.candleInterval = Math.min(candleInterval, 15000);
    this.timestampCoordinator = new TimestampCoordinator(candleInterval);
    console.log(`🕯️ ENHANCED CandleManager: ${this.candleInterval/1000}s intervals with timestamp coordination`);
  }
  
  // ENHANCED: Initialize with simulation time
  initialize(simulationStartTime: number): void {
    this.simulationStartTime = simulationStartTime;
    this.baseTimeOffset = simulationStartTime;
    this.timestampCoordinator.initialize(simulationStartTime);
    this.lastCandleTime = 0;
    
    console.log(`🕯️ CandleManager initialized with start time: ${new Date(simulationStartTime).toISOString()}`);
  }
  
  // ENHANCED: Safe update with timestamp coordination
  updateCandle(timestamp: number, price: number, volume: number = 0): void {
    if (this.isResetting) {
      console.warn(`⚠️ CandleManager is resetting, skipping update`);
      return;
    }
    
    try {
      // Get coordinated timestamp
      const coordinatedTimestamp = this.timestampCoordinator.getCoordinatedTimestamp(timestamp);
      this._updateCandleInternal(coordinatedTimestamp, price, volume);
    } catch (error) {
      console.error(`❌ Error in updateCandle:`, error);
    }
  }
  
  // ENHANCED: Internal update with enhanced validation
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
    
    console.log(`🆕 NEW CANDLE #${this.candles.length + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} | O:${openPrice.toFixed(6)} | C:${price.toFixed(6)}`);
  }
  
  private _updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle) return;
    
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    this.currentCandle.volume += volume;
  }
  
  private _finalizeCurrentCandle(): void {
    if (!this.currentCandle) return;
    
    this.candles.push({ ...this.currentCandle });
    this.lastCandleTime = this.currentCandle.timestamp;
    
    if (this.candles.length > 2000) {
      this.candles = this.candles.slice(-2000);
    }
    
    const candleNumber = this.candles.length;
    const priceChange = ((this.currentCandle.close - this.currentCandle.open) / this.currentCandle.open * 100);
    
    console.log(`✅ FINALIZED #${candleNumber}: ${new Date(this.currentCandle.timestamp).toISOString().substr(11, 8)} | Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(3)}% | Vol: ${this.currentCandle.volume.toFixed(0)}`);
    
    this.currentCandle = null;
  }
  
  // ENHANCED: Get candles with validation
  getCandles(limit?: number): PricePoint[] {
    const allCandles = [...this.candles];
    
    if (this.currentCandle) {
      allCandles.push({ ...this.currentCandle });
    }
    
    // Enhanced validation
    const validCandles = this._validateCandleSequence(allCandles);
    
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  // ENHANCED: Comprehensive candle validation
  private _validateCandleSequence(candles: PricePoint[]): PricePoint[] {
    if (candles.length === 0) return [];
    
    const result: PricePoint[] = [];
    let lastTimestamp = 0;
    let fixedCount = 0;
    
    for (const candle of candles) {
      // Fix timestamp if needed
      let timestamp = candle.timestamp;
      if (timestamp <= lastTimestamp) {
        timestamp = lastTimestamp + this.candleInterval;
        fixedCount++;
      }
      
      // Validate OHLC
      if (candle.high >= candle.low &&
          candle.high >= candle.open &&
          candle.high >= candle.close &&
          candle.low <= candle.open &&
          candle.low <= candle.close) {
        
        result.push({
          ...candle,
          timestamp: timestamp
        });
        lastTimestamp = timestamp;
      }
    }
    
    if (fixedCount > 0) {
      console.log(`🔧 Fixed ${fixedCount} timestamp issues in candle sequence`);
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
    console.log('🔄 ENHANCED RESET: Starting coordinated reset');
    
    // Clear all data
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    
    // Reset timestamp coordinator
    this.timestampCoordinator.reset();
    
    // Wait a moment to ensure any pending operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ ENHANCED RESET: Complete');
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
    this.timestampCoordinator.reset();
    
    console.log('🧹 CLEARED: CandleManager reset with timestamp coordination');
  }
  
  shutdown(): void {
    this.clear();
    console.log('🔌 SHUTDOWN: CandleManager closed');
  }
  
  // ENHANCED: Get coordination stats
  getCoordinationStats(): any {
    return {
      candleCount: this.candles.length,
      lastCandleTime: this.lastCandleTime,
      currentCandle: !!this.currentCandle,
      isResetting: this.isResetting,
      coordinatorStats: this.timestampCoordinator.getStats()
    };
  }
}

// ENHANCED: Timestamp coordination helper class
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
    
    console.log(`📅 TimestampCoordinator initialized with start: ${new Date(startTime).toISOString()}`);
  }
  
  getCoordinatedTimestamp(inputTimestamp: number): number {
    // If this is the first timestamp or after reset
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = inputTimestamp;
      return inputTimestamp;
    }
    
    // Calculate expected next timestamp
    const expectedNext = this.lastTimestamp + this.expectedInterval;
    
    // If input is reasonable, use it
    if (inputTimestamp >= expectedNext - 1000 && inputTimestamp <= expectedNext + 5000) {
      this.lastTimestamp = inputTimestamp;
      return inputTimestamp;
    }
    
    // Otherwise, use expected timestamp
    console.log(`🔧 Timestamp coordination: ${inputTimestamp} -> ${expectedNext}`);
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
      lastTimestamp: this.lastTimestamp
    };
  }
}