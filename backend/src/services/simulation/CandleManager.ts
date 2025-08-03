// backend/src/services/simulation/CandleManager.ts - FIXED: Clean Singleton Pattern
import { PricePoint } from './types';

export class CandleManager {
  private static instances = new Map<string, CandleManager>();
  private static globalInstanceCounter = 0;
  
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private lastCandleTime: number = 0;
  private simulationStartTime: number = 0;
  private simulationId: string;
  private instanceId: string;
  
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
  
  // 🚨 CRITICAL FIX: Private constructor to enforce singleton pattern
  private constructor(simulationId: string, candleInterval: number = 10000) {
    this.simulationId = simulationId;
    this.instanceId = `${simulationId}-${++CandleManager.globalInstanceCounter}`;
    this.candleInterval = Math.min(candleInterval, 15000);
    this.timestampCoordinator = new TimestampCoordinator(candleInterval);
    
    console.log(`🕯️ SINGLETON: CandleManager CREATED: ${this.instanceId} with ${this.candleInterval/1000}s intervals`);
  }
  
  // 🚨 CRITICAL FIX: Singleton getInstance method with strict checking
  static getInstance(simulationId: string, candleInterval: number = 10000): CandleManager {
    // Check if instance already exists
    if (CandleManager.instances.has(simulationId)) {
      const existing = CandleManager.instances.get(simulationId)!;
      console.log(`🔄 SINGLETON: Reusing CandleManager for ${simulationId} (instance: ${existing.instanceId})`);
      return existing;
    }
    
    // Create new instance only if none exists
    const instance = new CandleManager(simulationId, candleInterval);
    CandleManager.instances.set(simulationId, instance);
    
    console.log(`🆕 SINGLETON: Created NEW CandleManager for ${simulationId} (instance: ${instance.instanceId})`);
    console.log(`📊 SINGLETON: Total active instances: ${CandleManager.instances.size}`);
    
    return instance;
  }
  
  // 🚨 CRITICAL FIX: Force cleanup method to remove instance
  static cleanup(simulationId: string): void {
    const instance = CandleManager.instances.get(simulationId);
    if (instance) {
      console.log(`🧹 SINGLETON: Cleaning up CandleManager for ${simulationId} (instance: ${instance.instanceId})`);
      instance.shutdown();
      CandleManager.instances.delete(simulationId);
      console.log(`📊 SINGLETON: Remaining instances: ${CandleManager.instances.size}`);
    } else {
      console.warn(`⚠️ SINGLETON: No CandleManager found for cleanup: ${simulationId}`);
    }
  }
  
  // 🚨 CRITICAL FIX: Check if instance exists
  static hasInstance(simulationId: string): boolean {
    return CandleManager.instances.has(simulationId);
  }
  
  // 🚨 CRITICAL FIX: Get debug info about all instances
  static getDebugInfo(): any {
    const instances = Array.from(CandleManager.instances.entries()).map(([simId, instance]) => ({
      simulationId: simId,
      instanceId: instance.instanceId,
      candleCount: instance.candles.length,
      isResetting: instance.isResetting,
      lastUpdate: instance.lastPriceUpdate,
      interval: instance.candleInterval
    }));
    
    return {
      totalInstances: CandleManager.instances.size,
      globalCounter: CandleManager.globalInstanceCounter,
      instances
    };
  }
  
  initialize(simulationStartTime: number, initialPrice?: number): void {
    console.log(`🔧 SINGLETON: Initializing ${this.instanceId} at ${new Date(simulationStartTime).toISOString()}`);
    
    this.simulationStartTime = simulationStartTime;
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
    
    console.log(`✅ SINGLETON: ${this.instanceId} initialized - price category: ${this.priceCategory}, interval: ${this.candleInterval}ms`);
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
      console.log(`📊 ${this.instanceId}: Price category: ${oldCategory} → ${this.priceCategory} (price: $${price})`);
      this.adjustIntervalForPriceCategory();
    }
  }
  
  private adjustIntervalForPriceCategory(): void {
    const oldInterval = this.candleInterval;
    
    switch (this.priceCategory) {
      case 'micro':
        this.candleInterval = 6000; // 6 seconds for micro-cap
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
        this.candleInterval = 15000; // 15 seconds for mega-cap
        break;
    }
    
    if (oldInterval !== this.candleInterval) {
      console.log(`⚡ ${this.instanceId}: Interval adjusted: ${oldInterval}ms → ${this.candleInterval}ms`);
      this.timestampCoordinator.updateInterval(this.candleInterval);
    }
  }
  
  updateCandle(timestamp: number, price: number, volume: number = 0): void {
    if (this.isResetting) {
      console.warn(`⚠️ ${this.instanceId}: Skipping update during reset`);
      return;
    }
    
    this.validationStats.totalUpdates++;
    
    try {
      this.updatePriceCategory(price);
      
      // 🔧 FIXED: Coordinated timestamp handling
      const coordinatedTimestamp = this.timestampCoordinator.getCoordinatedTimestamp(timestamp);
      
      if (!this.validateTimestamp(coordinatedTimestamp)) {
        console.warn(`⚠️ ${this.instanceId}: Invalid timestamp, using sequential`);
        const sequentialTimestamp = this.generateSequentialTimestamp();
        this._updateCandleInternal(sequentialTimestamp, price, volume);
      } else {
        this._updateCandleInternal(coordinatedTimestamp, price, volume);
      }
      
    } catch (error) {
      console.error(`❌ ${this.instanceId}: Update error:`, error);
      this.validationStats.invalidCandles++;
    }
  }
  
  private validateTimestamp(timestamp: number): boolean {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneHourFromNow = now + (60 * 60 * 1000);
    
    if (timestamp < oneHourAgo || timestamp > oneHourFromNow) {
      return false;
    }
    
    if (this.lastCandleTime > 0 && timestamp <= this.lastCandleTime) {
      return false;
    }
    
    return true;
  }
  
  private generateSequentialTimestamp(): number {
    if (this.lastCandleTime === 0) {
      this.lastCandleTime = this.simulationStartTime;
    }
    
    this.lastCandleTime += this.candleInterval;
    return this.lastCandleTime;
  }
  
  private _updateCandleInternal(timestamp: number, price: number, volume: number): void {
    // Ensure sequential timestamps
    if (this.lastCandleTime > 0 && timestamp <= this.lastCandleTime) {
      timestamp = this.lastCandleTime + this.candleInterval;
      this.validationStats.timestampFixes++;
    }
    
    const candleTime = this._alignTimestamp(timestamp);
    const isNewCandle = !this.currentCandle || this.currentCandle.timestamp !== candleTime;
    
    if (isNewCandle) {
      if (this.currentCandle) {
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
    
    if (this.lastCandleTime > 0 && aligned <= this.lastCandleTime) {
      return this.lastCandleTime + this.candleInterval;
    }
    
    return aligned;
  }
  
  private _createNewCandle(candleTime: number, price: number, volume: number): void {
    const lastCandle = this.candles[this.candles.length - 1];
    let openPrice = price;
    
    if (lastCandle) {
      openPrice = lastCandle.close;
    }
    
    if (!this.isValidPrice(price) || !this.isValidPrice(openPrice)) {
      price = lastCandle ? lastCandle.close : 1.0;
      openPrice = price;
    }
    
    this.currentCandle = {
      timestamp: candleTime,
      open: openPrice,
      high: price,
      low: price,
      close: price,
      volume: Math.max(0, volume || 0)
    };
    
    this.volumeAccumulator = this.currentCandle.volume;
    
    console.log(`🆕 ${this.instanceId}: CANDLE #${this.candles.length + 1}: ${new Date(candleTime).toISOString().substr(11, 8)} | O:${openPrice.toFixed(6)} | C:${price.toFixed(6)} | V:${volume.toFixed(0)}`);
  }
  
  private isValidPrice(price: number): boolean {
    return typeof price === 'number' && 
           !isNaN(price) && 
           isFinite(price) && 
           price > 0 && 
           price < 1000000;
  }
  
  private _updateExistingCandle(price: number, volume: number): void {
    if (!this.currentCandle || !this.isValidPrice(price)) return;
    
    this.currentCandle.high = Math.max(this.currentCandle.high, price);
    this.currentCandle.low = Math.min(this.currentCandle.low, price);
    this.currentCandle.close = price;
    
    this.volumeAccumulator += Math.max(0, volume || 0);
    this.currentCandle.volume = this.volumeAccumulator;
    
    if (!this.validateOHLCRelationships(this.currentCandle)) {
      this.fixOHLCRelationships(this.currentCandle);
      this.validationStats.ohlcFixes++;
    }
  }
  
  private validateOHLCRelationships(candle: PricePoint): boolean {
    if (candle.high < candle.low) return false;
    if (candle.high < candle.open || candle.high < candle.close) return false;
    if (candle.low > candle.open || candle.low > candle.close) return false;
    
    if (!this.isValidPrice(candle.open) || !this.isValidPrice(candle.high) || 
        !this.isValidPrice(candle.low) || !this.isValidPrice(candle.close)) return false;
    
    if (candle.volume < 0 || !isFinite(candle.volume)) return false;
    
    return true;
  }
  
  private fixOHLCRelationships(candle: PricePoint): void {
    candle.open = this.isValidPrice(candle.open) ? candle.open : candle.close;
    candle.high = this.isValidPrice(candle.high) ? candle.high : candle.close;
    candle.low = this.isValidPrice(candle.low) ? candle.low : candle.close;
    candle.close = this.isValidPrice(candle.close) ? candle.close : candle.open;
    
    candle.high = Math.max(candle.open, candle.high, candle.low, candle.close);
    candle.low = Math.min(candle.open, candle.high, candle.low, candle.close);
    candle.volume = Math.max(0, candle.volume || 0);
    
    console.log(`🔧 ${this.instanceId}: Auto-corrected OHLC for candle at ${new Date(candle.timestamp).toISOString()}`);
  }
  
  private _finalizeCurrentCandle(): void {
    if (!this.currentCandle) return;
    
    const candle = { ...this.currentCandle };
    
    if (!this.validateOHLCRelationships(candle)) {
      this.fixOHLCRelationships(candle);
      this.validationStats.ohlcFixes++;
    }
    
    this.candles.push(candle);
    this.lastCandleTime = candle.timestamp;
    
    if (this.candles.length > 2000) {
      this.candles = this.candles.slice(-2000);
    }
    
    const priceChange = ((candle.close - candle.open) / candle.open * 100);
    console.log(`✅ ${this.instanceId}: FINALIZED #${this.candles.length}: Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(3)}% | Vol: ${candle.volume.toFixed(0)}`);
    
    this.currentCandle = null;
    this.volumeAccumulator = 0;
  }
  
  getCandles(limit?: number): PricePoint[] {
    const allCandles = [...this.candles];
    
    if (this.currentCandle) {
      allCandles.push({ ...this.currentCandle });
    }
    
    const validCandles = this._validateCandleSequence(allCandles);
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  setCandles(candles: PricePoint[]): void {
    if (this.isResetting) {
      console.warn(`⚠️ ${this.instanceId}: Cannot set candles during reset`);
      return;
    }
    
    const validCandles = this._validateCandleSequence(candles);
    this.candles = validCandles;
    
    if (validCandles.length > 0) {
      this.lastCandleTime = validCandles[validCandles.length - 1].timestamp;
    }
    
    console.log(`📊 ${this.instanceId}: Set ${validCandles.length} validated candles`);
  }
  
  private _validateCandleSequence(candles: PricePoint[]): PricePoint[] {
    if (candles.length === 0) return [];
    
    const result: PricePoint[] = [];
    let lastTimestamp = 0;
    let fixedCount = 0;
    
    for (const candle of candles) {
      let workingCandle = { ...candle };
      
      if (workingCandle.timestamp <= lastTimestamp) {
        workingCandle.timestamp = lastTimestamp + this.candleInterval;
        fixedCount++;
      }
      
      if (!this.isValidPrice(workingCandle.open)) workingCandle.open = workingCandle.close || 1.0;
      if (!this.isValidPrice(workingCandle.high)) workingCandle.high = workingCandle.close || 1.0;
      if (!this.isValidPrice(workingCandle.low)) workingCandle.low = workingCandle.close || 1.0;
      if (!this.isValidPrice(workingCandle.close)) workingCandle.close = workingCandle.open || 1.0;
      
      workingCandle.volume = Math.max(0, workingCandle.volume || 0);
      
      this.fixOHLCRelationships(workingCandle);
      
      if (this.validateOHLCRelationships(workingCandle)) {
        result.push(workingCandle);
        lastTimestamp = workingCandle.timestamp;
      }
    }
    
    if (fixedCount > 0) {
      console.log(`🔧 ${this.instanceId}: Fixed ${fixedCount} validation issues`);
    }
    
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
    console.log(`🔄 ${this.instanceId}: Starting reset`);
    
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    this.volumeAccumulator = 0;
    this.lastPriceUpdate = 0;
    this.priceCategory = 'mid';
    this.candleInterval = 10000;
    
    this.validationStats = {
      totalUpdates: 0,
      timestampFixes: 0,
      ohlcFixes: 0,
      invalidCandles: 0,
      lastValidationRun: Date.now()
    };
    
    this.timestampCoordinator.reset();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`✅ ${this.instanceId}: Reset complete`);
  }
  
  clear(): void {
    if (this.isResetting) return;
    
    this.candles = [];
    this.currentCandle = null;
    this.lastCandleTime = 0;
    this.volumeAccumulator = 0;
    this.lastPriceUpdate = 0;
    this.timestampCoordinator.reset();
    
    this.validationStats = {
      totalUpdates: 0,
      timestampFixes: 0,
      ohlcFixes: 0,
      invalidCandles: 0,
      lastValidationRun: Date.now()
    };
    
    console.log(`🧹 ${this.instanceId}: Cleared`);
  }
  
  shutdown(): void {
    console.log(`🔌 ${this.instanceId}: Shutting down`);
    this.clear();
  }
  
  getStats(): any {
    const candleCount = this.candles.length + (this.currentCandle ? 1 : 0);
    const lastCandle = this.candles[this.candles.length - 1];
    
    return {
      instanceId: this.instanceId,
      simulationId: this.simulationId,
      candleCount: candleCount,
      lastCandleTime: this.lastCandleTime,
      currentCandle: !!this.currentCandle,
      isResetting: this.isResetting,
      priceCategory: this.priceCategory,
      candleInterval: this.candleInterval,
      lastPrice: lastCandle ? lastCandle.close : 0,
      totalVolume: this.candles.reduce((sum, c) => sum + (c.volume || 0), 0),
      validationStats: {
        ...this.validationStats,
        successRate: this.validationStats.totalUpdates > 0 ? 
          (this.validationStats.totalUpdates - this.validationStats.invalidCandles) / this.validationStats.totalUpdates : 1
      }
    };
  }
  
  forceFinalizeCurrent(): boolean {
    if (this.currentCandle) {
      this._finalizeCurrentCandle();
      return true;
    }
    return false;
  }
}

// 🔧 FIXED: Enhanced timestamp coordination
class TimestampCoordinator {
  private startTime: number = 0;
  private expectedInterval: number;
  private lastTimestamp: number = 0;
  private driftCorrection: number = 0;
  private updateCount: number = 0;
  private sequenceNumber: number = 0;
  
  constructor(interval: number) {
    this.expectedInterval = interval;
  }
  
  initialize(startTime: number): void {
    this.startTime = startTime;
    this.lastTimestamp = startTime;
    this.driftCorrection = 0;
    this.updateCount = 0;
    this.sequenceNumber = 0;
  }
  
  updateInterval(newInterval: number): void {
    this.expectedInterval = newInterval;
  }
  
  getCoordinatedTimestamp(inputTimestamp: number): number {
    this.sequenceNumber++;
    
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = Math.max(inputTimestamp, this.startTime);
      return this.lastTimestamp;
    }
    
    const expectedNext = this.lastTimestamp + this.expectedInterval;
    const coordinatedTimestamp = Math.max(expectedNext, inputTimestamp);
    
    if (inputTimestamp !== coordinatedTimestamp) {
      const drift = coordinatedTimestamp - inputTimestamp;
      this.driftCorrection += drift;
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
  }
  
  getStats(): any {
    return {
      updateCount: this.updateCount,
      sequenceNumber: this.sequenceNumber,
      totalDriftCorrection: this.driftCorrection,
      averageDrift: this.updateCount > 0 ? this.driftCorrection / this.updateCount : 0,
      lastTimestamp: this.lastTimestamp,
      expectedInterval: this.expectedInterval,
      isHealthy: this.updateCount > 0 && Math.abs(this.driftCorrection / this.updateCount) < 1000
    };
  }
}