// backend/src/services/simulation/CandleManager.ts - CRITICAL FIX: True Singleton with Enhanced Race Condition Prevention
import { PricePoint } from './types';

export class CandleManager {
  // 🚨 CRITICAL FIX: Enhanced Promise-based singleton with better race condition prevention
  private static instances = new Map<string, CandleManager>();
  private static pendingInstances = new Map<string, Promise<CandleManager>>();
  private static creationLocks = new Map<string, boolean>();
  private static globalInstanceCounter = 0;
  
  private candles: PricePoint[] = [];
  private currentCandle: PricePoint | null = null;
  private candleInterval: number;
  private lastCandleTime: number = 0;
  private simulationStartTime: number = 0;
  private simulationId: string;
  private instanceId: string;
  private isDestroyed: boolean = false;
  private isInitialized: boolean = false;
  
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
  
  // 🚨 CRITICAL FIX: Enhanced async singleton getInstance with comprehensive race condition prevention
  static async getInstance(simulationId: string, candleInterval: number = 10000): Promise<CandleManager> {
    // CRITICAL: Check if instance already exists and is valid
    if (CandleManager.instances.has(simulationId)) {
      const existing = CandleManager.instances.get(simulationId)!;
      
      // Verify instance is not destroyed and is properly initialized
      if (!existing.isDestroyed && existing.simulationId === simulationId) {
        console.log(`🔄 SINGLETON: Reusing EXISTING CandleManager for ${simulationId} (instance: ${existing.instanceId})`);
        
        // Ensure it's initialized
        if (!existing.isInitialized) {
          console.log(`🔧 SINGLETON: Initializing existing instance ${existing.instanceId}`);
          existing.isInitialized = true;
        }
        
        return existing;
      } else {
        // Clean up invalid instance
        console.log(`🧹 SINGLETON: Cleaning up invalid instance for ${simulationId}`);
        CandleManager.instances.delete(simulationId);
        if (existing.isDestroyed) {
          console.log(`🗑️ SINGLETON: Instance was destroyed`);
        }
      }
    }
    
    // CRITICAL: Check if creation is already in progress (prevents race condition)
    if (CandleManager.pendingInstances.has(simulationId)) {
      console.log(`⏳ SINGLETON: Waiting for pending CandleManager creation for ${simulationId}`);
      try {
        const instance = await CandleManager.pendingInstances.get(simulationId)!;
        console.log(`✅ SINGLETON: Retrieved pending instance ${instance.instanceId} for ${simulationId}`);
        return instance;
      } catch (error) {
        console.error(`❌ SINGLETON: Error waiting for pending creation:`, error);
        // Clean up failed pending creation
        CandleManager.pendingInstances.delete(simulationId);
        CandleManager.creationLocks.delete(simulationId);
      }
    }
    
    // CRITICAL: Double-check lock to prevent multiple simultaneous creation
    if (CandleManager.creationLocks.get(simulationId)) {
      console.log(`🔒 SINGLETON: Creation locked for ${simulationId}, waiting...`);
      // Wait a bit and retry
      await new Promise(resolve => setTimeout(resolve, 50));
      return CandleManager.getInstance(simulationId, candleInterval);
    }
    
    // CRITICAL: Set creation lock
    CandleManager.creationLocks.set(simulationId, true);
    console.log(`🔒 SINGLETON: Locked creation for ${simulationId}`);
    
    try {
      // CRITICAL: Create promise for instance creation to prevent race conditions
      const creationPromise = CandleManager.createInstanceSafe(simulationId, candleInterval);
      CandleManager.pendingInstances.set(simulationId, creationPromise);
      
      const instance = await creationPromise;
      
      // Store the created instance
      CandleManager.instances.set(simulationId, instance);
      instance.isInitialized = true;
      
      console.log(`🆕 SINGLETON: Created NEW CandleManager for ${simulationId} (instance: ${instance.instanceId})`);
      console.log(`📊 SINGLETON: Total active instances: ${CandleManager.instances.size}`);
      
      return instance;
      
    } catch (error) {
      console.error(`❌ SINGLETON: Error creating CandleManager for ${simulationId}:`, error);
      throw error;
    } finally {
      // Clean up the pending promise and lock
      CandleManager.pendingInstances.delete(simulationId);
      CandleManager.creationLocks.delete(simulationId);
      console.log(`🔓 SINGLETON: Unlocked creation for ${simulationId}`);
    }
  }
  
  // 🚨 CRITICAL FIX: Safe instance creation method with additional checks
  private static async createInstanceSafe(simulationId: string, candleInterval: number): Promise<CandleManager> {
    // Small delay to ensure any cleanup operations complete
    await new Promise(resolve => setTimeout(resolve, 25));
    
    // Triple-check that no instance was created during the delay (race condition prevention)
    if (CandleManager.instances.has(simulationId)) {
      const existing = CandleManager.instances.get(simulationId)!;
      if (!existing.isDestroyed && existing.simulationId === simulationId) {
        console.log(`🔄 SINGLETON: Found existing during creation for ${simulationId} (${existing.instanceId})`);
        return existing;
      } else {
        console.log(`🧹 SINGLETON: Removing invalid instance found during creation`);
        CandleManager.instances.delete(simulationId);
      }
    }
    
    // Create new instance
    const instance = new CandleManager(simulationId, candleInterval);
    
    // Validate the instance was created correctly
    if (instance.simulationId !== simulationId) {
      throw new Error(`Instance simulationId mismatch: expected ${simulationId}, got ${instance.simulationId}`);
    }
    
    if (instance.isDestroyed) {
      throw new Error(`Instance was destroyed during creation`);
    }
    
    console.log(`✨ SINGLETON: Instance created and validated for ${simulationId}`);
    return instance;
  }
  
  // 🚨 CRITICAL FIX: Synchronous getInstance for backward compatibility with warnings
  static getInstanceSync(simulationId: string, candleInterval: number = 10000): CandleManager {
    console.warn(`⚠️ DEPRECATED: Using synchronous getInstance for ${simulationId}. Use async version to prevent race conditions.`);
    
    // Check if instance already exists
    if (CandleManager.instances.has(simulationId)) {
      const existing = CandleManager.instances.get(simulationId)!;
      if (!existing.isDestroyed && existing.simulationId === simulationId) {
        console.log(`🔄 SINGLETON: Reusing CandleManager for ${simulationId} (instance: ${existing.instanceId})`);
        return existing;
      } else {
        CandleManager.instances.delete(simulationId);
      }
    }
    
    // Check if creation is in progress
    if (CandleManager.pendingInstances.has(simulationId) || CandleManager.creationLocks.get(simulationId)) {
      console.error(`❌ SINGLETON: Cannot create sync instance while async creation in progress for ${simulationId}`);
      throw new Error(`Async creation in progress for ${simulationId} - use async getInstance`);
    }
    
    // Create new instance only if none exists
    const instance = new CandleManager(simulationId, candleInterval);
    CandleManager.instances.set(simulationId, instance);
    instance.isInitialized = true;
    
    console.log(`🆕 SINGLETON: Created NEW CandleManager for ${simulationId} (instance: ${instance.instanceId})`);
    console.log(`📊 SINGLETON: Total active instances: ${CandleManager.instances.size}`);
    
    return instance;
  }
  
  // 🚨 CRITICAL FIX: Enhanced cleanup method with comprehensive destruction
  static async cleanup(simulationId: string): Promise<void> {
    console.log(`🧹 SINGLETON: Starting comprehensive cleanup for ${simulationId}`);
    
    // Wait for any pending creation to complete first
    if (CandleManager.pendingInstances.has(simulationId)) {
      console.log(`⏳ SINGLETON: Waiting for pending creation to complete before cleanup`);
      try {
        await CandleManager.pendingInstances.get(simulationId);
        console.log(`✅ SINGLETON: Pending creation completed`);
      } catch (error) {
        console.warn(`⚠️ SINGLETON: Error waiting for pending creation:`, error);
      }
    }
    
    // Clear any creation locks
    if (CandleManager.creationLocks.get(simulationId)) {
      console.log(`🔓 SINGLETON: Clearing creation lock for ${simulationId}`);
      CandleManager.creationLocks.delete(simulationId);
    }
    
    const instance = CandleManager.instances.get(simulationId);
    if (instance) {
      console.log(`🧹 SINGLETON: Cleaning up CandleManager for ${simulationId} (instance: ${instance.instanceId})`);
      
      // Mark as destroyed first to prevent reuse
      instance.isDestroyed = true;
      instance.isInitialized = false;
      
      // Shutdown the instance
      try {
        await instance.shutdown();
        console.log(`✅ SINGLETON: Instance shutdown completed`);
      } catch (error) {
        console.error(`❌ SINGLETON: Error during instance shutdown:`, error);
      }
      
      // Remove from instances map
      CandleManager.instances.delete(simulationId);
      
      console.log(`✅ SINGLETON: Cleanup complete for ${simulationId}. Remaining instances: ${CandleManager.instances.size}`);
    } else {
      console.warn(`⚠️ SINGLETON: No CandleManager found for cleanup: ${simulationId}`);
    }
    
    // Clean up any orphaned pending instances
    if (CandleManager.pendingInstances.has(simulationId)) {
      console.log(`🧹 SINGLETON: Cleaning up orphaned pending instance for ${simulationId}`);
      CandleManager.pendingInstances.delete(simulationId);
    }
  }
  
  // 🚨 CRITICAL FIX: Force cleanup all instances (for system reset)
  static async cleanupAll(): Promise<void> {
    console.log(`🧹 SINGLETON: Starting cleanup of ALL instances (${CandleManager.instances.size} active, ${CandleManager.pendingInstances.size} pending)`);
    
    // Wait for all pending creations with timeout
    const pendingPromises = Array.from(CandleManager.pendingInstances.values());
    if (pendingPromises.length > 0) {
      console.log(`⏳ SINGLETON: Waiting for ${pendingPromises.length} pending creations (10s timeout)`);
      try {
        await Promise.race([
          Promise.allSettled(pendingPromises),
          new Promise(resolve => setTimeout(resolve, 10000)) // 10 second timeout
        ]);
      } catch (error) {
        console.warn(`⚠️ SINGLETON: Timeout waiting for pending creations:`, error);
      }
    }
    
    // Cleanup all instances
    const cleanupPromises = Array.from(CandleManager.instances.keys()).map(simId => 
      CandleManager.cleanup(simId)
    );
    
    await Promise.allSettled(cleanupPromises);
    
    // Force clear all maps
    CandleManager.instances.clear();
    CandleManager.pendingInstances.clear();
    CandleManager.creationLocks.clear();
    
    console.log(`✅ SINGLETON: All instances cleaned up. Total remaining: ${CandleManager.instances.size}`);
  }
  
  // 🚨 CRITICAL FIX: Enhanced instance existence check
  static hasInstance(simulationId: string): boolean {
    const exists = CandleManager.instances.has(simulationId);
    const pending = CandleManager.pendingInstances.has(simulationId);
    const locked = CandleManager.creationLocks.get(simulationId);
    
    if (exists) {
      const instance = CandleManager.instances.get(simulationId)!;
      const isValid = !instance.isDestroyed && instance.simulationId === simulationId;
      console.log(`🔍 SINGLETON: Instance check for ${simulationId} - exists: ${exists}, valid: ${isValid}, initialized: ${instance.isInitialized}`);
      return isValid;
    }
    
    if (pending || locked) {
      console.log(`🔍 SINGLETON: Instance check for ${simulationId} - pending: ${pending}, locked: ${!!locked}`);
      return true; // Will be available soon
    }
    
    return false;
  }
  
  // 🚨 CRITICAL FIX: Wait for instance to be available
  static async waitForInstance(simulationId: string, timeoutMs: number = 5000): Promise<CandleManager | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (CandleManager.instances.has(simulationId)) {
        const instance = CandleManager.instances.get(simulationId)!;
        if (!instance.isDestroyed && instance.isInitialized) {
          return instance;
        }
      }
      
      if (CandleManager.pendingInstances.has(simulationId)) {
        try {
          return await CandleManager.pendingInstances.get(simulationId)!;
        } catch (error) {
          console.warn(`⚠️ SINGLETON: Error waiting for pending instance:`, error);
        }
      }
      
      // Short wait before retry
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.warn(`⚠️ SINGLETON: Timeout waiting for instance ${simulationId} (${timeoutMs}ms)`);
    return null;
  }
  
  // 🚨 CRITICAL FIX: Get debug info about all instances
  static getDebugInfo(): any {
    const instances = Array.from(CandleManager.instances.entries()).map(([simId, instance]) => ({
      simulationId: simId,
      instanceId: instance.instanceId,
      candleCount: instance.candles.length,
      isResetting: instance.isResetting,
      isDestroyed: instance.isDestroyed,
      isInitialized: instance.isInitialized,
      lastUpdate: instance.lastPriceUpdate,
      interval: instance.candleInterval
    }));
    
    const pending = Array.from(CandleManager.pendingInstances.keys());
    const locked = Array.from(CandleManager.creationLocks.entries()).filter(([_, locked]) => locked).map(([id, _]) => id);
    
    return {
      totalInstances: CandleManager.instances.size,
      pendingInstances: CandleManager.pendingInstances.size,
      lockedCreations: locked.length,
      globalCounter: CandleManager.globalInstanceCounter,
      instances,
      pendingSimulations: pending,
      lockedSimulations: locked
    };
  }
  
  // 🚨 CRITICAL FIX: Check if this instance is destroyed or invalid
  isInstanceDestroyed(): boolean {
    return this.isDestroyed;
  }
  
  isInstanceInitialized(): boolean {
    return this.isInitialized && !this.isDestroyed;
  }
  
  initialize(simulationStartTime: number, initialPrice?: number): void {
    if (this.isDestroyed) {
      console.error(`❌ ${this.instanceId}: Cannot initialize destroyed instance`);
      return;
    }
    
    console.log(`🔧 SINGLETON: Initializing ${this.instanceId} at ${new Date(simulationStartTime).toISOString()}`);
    
    this.simulationStartTime = simulationStartTime;
    this.timestampCoordinator.initialize(simulationStartTime);
    this.lastCandleTime = 0;
    this.isInitialized = true;
    
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
    
    console.log(`✅ SINGLETON: ${this.instanceId} initialized - price category: ${this.priceCategory}, interval: ${this.candleInterval}ms, ready: ${this.isInitialized}`);
  }
  
  private updatePriceCategory(price: number): void {
    if (this.isDestroyed) return;
    
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
    if (this.isDestroyed) return;
    
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
    if (this.isDestroyed) {
      console.warn(`⚠️ ${this.instanceId}: Cannot update destroyed instance`);
      return;
    }
    
    if (!this.isInitialized) {
      console.warn(`⚠️ ${this.instanceId}: Cannot update uninitialized instance`);
      return;
    }
    
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
    if (this.isDestroyed || !this.isInitialized) return;
    
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
    if (this.isDestroyed || !this.isInitialized) return;
    
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
    if (!this.currentCandle || !this.isValidPrice(price) || this.isDestroyed || !this.isInitialized) return;
    
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
    if (!this.currentCandle || this.isDestroyed || !this.isInitialized) return;
    
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
    if (this.isDestroyed) {
      console.warn(`⚠️ ${this.instanceId}: Cannot get candles from destroyed instance`);
      return [];
    }
    
    if (!this.isInitialized) {
      console.warn(`⚠️ ${this.instanceId}: Cannot get candles from uninitialized instance`);
      return [];
    }
    
    const allCandles = [...this.candles];
    
    if (this.currentCandle) {
      allCandles.push({ ...this.currentCandle });
    }
    
    const validCandles = this._validateCandleSequence(allCandles);
    return limit ? validCandles.slice(-limit) : validCandles;
  }
  
  setCandles(candles: PricePoint[]): void {
    if (this.isDestroyed) {
      console.warn(`⚠️ ${this.instanceId}: Cannot set candles on destroyed instance`);
      return;
    }
    
    if (!this.isInitialized) {
      console.warn(`⚠️ ${this.instanceId}: Cannot set candles on uninitialized instance`);
      return;
    }
    
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
    if (this.isDestroyed) {
      console.warn(`⚠️ ${this.instanceId}: Cannot reset destroyed instance`);
      return;
    }
    
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
    this.isInitialized = false;
    
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
    if (this.isDestroyed) return;
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
  
  // 🚨 CRITICAL FIX: Async shutdown method with proper cleanup
  async shutdown(): Promise<void> {
    console.log(`🔌 ${this.instanceId}: Shutting down`);
    
    // Mark as destroyed to prevent new operations
    this.isDestroyed = true;
    this.isInitialized = false;
    
    // Wait for any reset operations to complete
    if (this.resetPromise) {
      try {
        await this.resetPromise;
      } catch (error) {
        console.warn(`⚠️ ${this.instanceId}: Error during reset completion:`, error);
      }
    }
    
    // Clear all data
    this.clear();
    
    console.log(`✅ ${this.instanceId}: Shutdown complete`);
  }
  
  getStats(): any {
    if (this.isDestroyed) {
      return {
        instanceId: this.instanceId,
        simulationId: this.simulationId,
        isDestroyed: true,
        isInitialized: false,
        candleCount: 0,
        error: 'Instance is destroyed'
      };
    }
    
    const candleCount = this.candles.length + (this.currentCandle ? 1 : 0);
    const lastCandle = this.candles[this.candles.length - 1];
    
    return {
      instanceId: this.instanceId,
      simulationId: this.simulationId,
      candleCount: candleCount,
      lastCandleTime: this.lastCandleTime,
      currentCandle: !!this.currentCandle,
      isResetting: this.isResetting,
      isDestroyed: this.isDestroyed,
      isInitialized: this.isInitialized,
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
    if (this.isDestroyed || !this.isInitialized) return false;
    
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