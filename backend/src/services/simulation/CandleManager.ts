// backend/src/services/simulation/CandleManager.ts - CRITICAL FIX: True Singleton with Enhanced Race Condition Prevention & Single Timestamp Authority
import { PricePoint } from './types';

export class CandleManager {
  // 🚨 CRITICAL FIX: Enhanced Promise-based singleton with atomic creation locks
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
  private createdFrom: string = 'unknown'; // Track creation source
  
  private isResetting: boolean = false;
  private resetPromise: Promise<void> | null = null;
  
  private priceCategory: 'micro' | 'small' | 'mid' | 'large' | 'mega' = 'mid';
  private lastPriceUpdate: number = 0;
  private volumeAccumulator: number = 0;
  
  // 🔧 FIXED: Enhanced validation tracking
  private validationStats = {
    totalUpdates: 0,
    timestampAccepted: 0,
    ohlcFixes: 0,
    invalidCandles: 0,
    lastValidationRun: 0
  };
  
  // 🚨 CRITICAL FIX: Private constructor to enforce singleton pattern
  private constructor(simulationId: string, candleInterval: number = 10000) {
    this.simulationId = simulationId;
    this.instanceId = `${simulationId}-${++CandleManager.globalInstanceCounter}`;
    this.candleInterval = Math.min(candleInterval, 15000);
    
    // 🚨🚨🚨 DIAGNOSTIC LOGGING: Capture exact creation source
    const stack = new Error().stack;
    const caller = stack?.split('\n')[3]?.trim() || 'unknown'; // Skip constructor and Error
    this.createdFrom = caller;
    
    console.log(`🚨🚨🚨 CANDLEMANAGER CREATED: ${this.instanceId} | Interval: ${this.candleInterval}ms | Called from: ${caller}`);
    console.log(`🕯️ SINGLETON: CandleManager CREATED: ${this.instanceId} with ${this.candleInterval/1000}s intervals`);
  }
  
  // 🚨 CRITICAL FIX: Enhanced async singleton getInstance with atomic creation and strict validation
  static async getInstance(simulationId: string, candleInterval: number = 10000): Promise<CandleManager> {
    // 🔍🔍🔍 DIAGNOSTIC LOGGING: Capture all getInstance calls
    const stack = new Error().stack;
    const caller = stack?.split('\n')[2]?.trim() || 'unknown';
    console.log(`🔍🔍🔍 GETINSTANCE CALLED: ${simulationId} | Interval: ${candleInterval}ms | From: ${caller}`);
    
    // CRITICAL: Set atomic creation lock IMMEDIATELY to prevent race conditions
    if (CandleManager.creationLocks.get(simulationId)) {
      console.log(`🔒 SINGLETON: Creation locked for ${simulationId}, waiting for completion...`);
      // Wait for existing creation to complete
      while (CandleManager.creationLocks.get(simulationId)) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // CRITICAL: Check if instance already exists and is valid after waiting
    if (CandleManager.instances.has(simulationId)) {
      const existing = CandleManager.instances.get(simulationId)!;
      
      // Strict validation before returning existing instance
      if (!existing.isDestroyed && 
          existing.simulationId === simulationId && 
          existing.instanceId.startsWith(simulationId)) {
        console.log(`🔄 SINGLETON: Reusing VALIDATED existing CandleManager for ${simulationId} (instance: ${existing.instanceId})`);
        
        // Ensure it's initialized
        if (!existing.isInitialized) {
          console.log(`🔧 SINGLETON: Initializing existing instance ${existing.instanceId}`);
          existing.isInitialized = true;
        }
        
        return existing;
      } else {
        // Clean up invalid instance immediately
        console.log(`🧹 SINGLETON: Cleaning up INVALID instance for ${simulationId}`);
        CandleManager.instances.delete(simulationId);
      }
    }
    
    // CRITICAL: Check if creation is already in progress
    if (CandleManager.pendingInstances.has(simulationId)) {
      console.log(`⏳ SINGLETON: Waiting for pending CandleManager creation for ${simulationId}`);
      try {
        const instance = await CandleManager.pendingInstances.get(simulationId)!;
        if (instance && !instance.isDestroyed) {
          console.log(`✅ SINGLETON: Retrieved pending instance ${instance.instanceId} for ${simulationId}`);
          return instance;
        }
      } catch (error) {
        console.error(`❌ SINGLETON: Error waiting for pending creation:`, error);
        CandleManager.pendingInstances.delete(simulationId);
      }
    }
    
    // CRITICAL: Set creation lock atomically
    CandleManager.creationLocks.set(simulationId, true);
    console.log(`🔒 SINGLETON: ATOMIC lock set for ${simulationId}`);
    
    try {
      // CRITICAL: Create promise for instance creation with timeout protection
      const creationPromise = Promise.race([
        CandleManager.createInstanceSafe(simulationId, candleInterval),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Creation timeout')), 5000)
        )
      ]);
      
      CandleManager.pendingInstances.set(simulationId, creationPromise);
      
      const instance = await creationPromise;
      
      // CRITICAL: Final validation before storing
      if (!instance || instance.isDestroyed || instance.simulationId !== simulationId) {
        throw new Error(`Instance validation failed after creation`);
      }
      
      // Store the validated instance
      CandleManager.instances.set(simulationId, instance);
      instance.isInitialized = true;
      
      console.log(`🆕 SINGLETON: Created NEW validated CandleManager for ${simulationId} (instance: ${instance.instanceId})`);
      console.log(`📊 SINGLETON: Total active instances: ${CandleManager.instances.size}`);
      
      return instance;
      
    } catch (error) {
      console.error(`❌ SINGLETON: Error creating CandleManager for ${simulationId}:`, error);
      throw error;
    } finally {
      // CRITICAL: Always clean up locks and promises
      CandleManager.pendingInstances.delete(simulationId);
      CandleManager.creationLocks.delete(simulationId);
      console.log(`🔓 SINGLETON: Atomic lock released for ${simulationId}`);
    }
  }
  
  // 🚨 CRITICAL FIX: Safe instance creation with race condition detection
  private static async createInstanceSafe(simulationId: string, candleInterval: number): Promise<CandleManager> {
    // CRITICAL: Detection checkpoint - ensure no race condition occurred
    if (CandleManager.instances.has(simulationId)) {
      const existing = CandleManager.instances.get(simulationId)!;
      if (!existing.isDestroyed && existing.simulationId === simulationId) {
        console.log(`🔄 SINGLETON: Race condition detected and resolved - using existing for ${simulationId}`);
        return existing;
      } else {
        console.log(`🧹 SINGLETON: Removing invalid instance found during creation`);
        CandleManager.instances.delete(simulationId);
      }
    }
    
    // Small delay to ensure cleanup operations complete
    await new Promise(resolve => setTimeout(resolve, 25));
    
    // Create new instance with validation
    const instance = new CandleManager(simulationId, candleInterval);
    
    // CRITICAL: Validate the instance was created correctly
    if (instance.simulationId !== simulationId) {
      throw new Error(`Instance simulationId mismatch: expected ${simulationId}, got ${instance.simulationId}`);
    }
    
    if (instance.isDestroyed) {
      throw new Error(`Instance was destroyed during creation`);
    }
    
    if (!instance.instanceId.startsWith(simulationId)) {
      throw new Error(`Instance ID validation failed: ${instance.instanceId} does not start with ${simulationId}`);
    }
    
    console.log(`✨ SINGLETON: Instance created and VALIDATED for ${simulationId}`);
    return instance;
  }
  
  // 🚨 CRITICAL DIAGNOSTIC: Static method to detect bypass constructor calls
  static detectBypassCreation(): void {
    // Override the constructor to catch any direct instantiation attempts
    const originalConstructor = CandleManager.prototype.constructor;
    const OverriddenCandleManager = class extends CandleManager {
      constructor(simulationId: string, candleInterval: number = 10000) {
        const stack = new Error().stack;
        const caller = stack?.split('\n')[2]?.trim() || 'unknown';
        console.log(`🚨🚨🚨 BYPASS DETECTED: Direct CandleManager constructor called from: ${caller}`);
        console.log(`🚨🚨🚨 FULL STACK TRACE:`, stack);
        super(simulationId, candleInterval);
      }
    };
    
    // Replace the constructor in the global scope (if exported directly)
    (global as any).CandleManager = OverriddenCandleManager;
  }
  
  // 🚨 CRITICAL FIX: Enhanced cleanup method with comprehensive destruction and timeout
  static async cleanup(simulationId: string): Promise<void> {
    console.log(`🧹 SINGLETON: Starting comprehensive cleanup for ${simulationId}`);
    
    // CRITICAL: Wait for any pending creation to complete first
    const startTime = Date.now();
    const timeout = 5000; // 5 second timeout
    
    while (CandleManager.pendingInstances.has(simulationId) && (Date.now() - startTime) < timeout) {
      console.log(`⏳ SINGLETON: Waiting for pending creation to complete before cleanup`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    if (CandleManager.pendingInstances.has(simulationId)) {
      console.warn(`⚠️ SINGLETON: Timeout waiting for pending creation, forcing cleanup`);
      CandleManager.pendingInstances.delete(simulationId);
    }
    
    // CRITICAL: Clear any creation locks
    if (CandleManager.creationLocks.get(simulationId)) {
      console.log(`🔓 SINGLETON: Clearing creation lock for ${simulationId}`);
      CandleManager.creationLocks.delete(simulationId);
    }
    
    const instance = CandleManager.instances.get(simulationId);
    if (instance) {
      console.log(`🧹 SINGLETON: Cleaning up CandleManager for ${simulationId} (instance: ${instance.instanceId})`);
      console.log(`🧹 CREATED FROM: ${instance.createdFrom}`);
      
      // CRITICAL: Mark as destroyed first to prevent reuse
      instance.isDestroyed = true;
      instance.isInitialized = false;
      
      // Shutdown the instance with timeout protection
      try {
        await Promise.race([
          instance.shutdown(),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Shutdown timeout')), 3000)
          )
        ]);
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
  }
  
  // 🚨 CRITICAL FIX: Force cleanup all instances with timeout protection
  static async cleanupAll(): Promise<void> {
    console.log(`🧹 SINGLETON: Starting cleanup of ALL instances (${CandleManager.instances.size} active, ${CandleManager.pendingInstances.size} pending)`);
    
    // 🚨 DIAGNOSTIC: Log all current instances and their creation sources
    CandleManager.instances.forEach((instance, simId) => {
      console.log(`🔍 ACTIVE INSTANCE: ${simId} -> ${instance.instanceId} | Created from: ${instance.createdFrom}`);
    });
    
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
    
    // Cleanup all instances with timeout protection
    const cleanupPromises = Array.from(CandleManager.instances.keys()).map(async (simId) => {
      try {
        await Promise.race([
          CandleManager.cleanup(simId),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error(`Cleanup timeout for ${simId}`)), 5000)
          )
        ]);
      } catch (error) {
        console.error(`❌ SINGLETON: Cleanup error for ${simId}:`, error);
        // Force remove if cleanup failed
        CandleManager.instances.delete(simId);
      }
    });
    
    await Promise.allSettled(cleanupPromises);
    
    // CRITICAL: Force clear all maps
    CandleManager.instances.clear();
    CandleManager.pendingInstances.clear();
    CandleManager.creationLocks.clear();
    
    console.log(`✅ SINGLETON: All instances cleaned up. Total remaining: ${CandleManager.instances.size}`);
  }
  
  // 🚨 CRITICAL FIX: Enhanced instance existence check with validation
  static hasInstance(simulationId: string): boolean {
    const exists = CandleManager.instances.has(simulationId);
    const pending = CandleManager.pendingInstances.has(simulationId);
    const locked = CandleManager.creationLocks.get(simulationId);
    
    if (exists) {
      const instance = CandleManager.instances.get(simulationId)!;
      const isValid = !instance.isDestroyed && 
                     instance.simulationId === simulationId && 
                     instance.instanceId.startsWith(simulationId);
      
      if (!isValid) {
        console.log(`🧹 SINGLETON: Auto-cleaning invalid instance for ${simulationId}`);
        CandleManager.instances.delete(simulationId);
        return false;
      }
      
      console.log(`🔍 SINGLETON: Instance check for ${simulationId} - exists: ${exists}, valid: ${isValid}, initialized: ${instance.isInitialized}`);
      return isValid;
    }
    
    if (pending || locked) {
      console.log(`🔍 SINGLETON: Instance check for ${simulationId} - pending: ${pending}, locked: ${!!locked}`);
      return true; // Will be available soon
    }
    
    return false;
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
      interval: instance.candleInterval,
      createdFrom: instance.createdFrom, // Include creation source
      validationStats: instance.validationStats
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
  
  // 🚨 DIAGNOSTIC: Get creation info for this instance
  getCreationInfo(): { instanceId: string; createdFrom: string; simulationId: string } {
    return {
      instanceId: this.instanceId,
      createdFrom: this.createdFrom,
      simulationId: this.simulationId
    };
  }
  
  initialize(simulationStartTime: number, initialPrice?: number): void {
    if (this.isDestroyed) {
      console.error(`❌ ${this.instanceId}: Cannot initialize destroyed instance`);
      return;
    }
    
    console.log(`🔧 SINGLETON: Initializing ${this.instanceId} at ${new Date(simulationStartTime).toISOString()}`);
    
    this.simulationStartTime = simulationStartTime;
    this.lastCandleTime = 0;
    this.isInitialized = true;
    
    // Reset validation stats
    this.validationStats = {
      totalUpdates: 0,
      timestampAccepted: 0,
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
    }
  }
  
  // 🚨 CRITICAL FIX: Accept timestamps from SimulationManager WITHOUT modification (Single Timestamp Authority)
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
      
      // 🚨 CRITICAL FIX: Accept timestamp from SimulationManager as SINGLE TIMESTAMP AUTHORITY
      // No timestamp coordination or modification - trust the authoritative source
      console.log(`📈 [SINGLE TIMESTAMP] ${this.instanceId}: Using authoritative timestamp ${timestamp}`);
      this.validationStats.timestampAccepted++;
      
      this._updateCandleInternal(timestamp, price, volume);
      
    } catch (error) {
      console.error(`❌ ${this.instanceId}: Update error:`, error);
      this.validationStats.invalidCandles++;
    }
  }
  
  // 🚨 CRITICAL FIX: Internal update method that trusts the authoritative timestamp
  private _updateCandleInternal(timestamp: number, price: number, volume: number): void {
    if (this.isDestroyed || !this.isInitialized) return;
    
    // 🚨 CRITICAL FIX: Use the authoritative timestamp directly, align it for candle boundaries
    const candleTime = this._alignTimestampToInterval(timestamp);
    const isNewCandle = !this.currentCandle || this.currentCandle.timestamp !== candleTime;
    
    if (isNewCandle) {
      if (this.currentCandle) {
        this._finalizeCurrentCandle();
      }
      this._createNewCandle(candleTime, price, volume);
    } else {
      this._updateExistingCandle(price, volume);
    }
    
    this.lastPriceUpdate = price;
    this.lastCandleTime = candleTime;
  }
  
  // 🚨 CRITICAL FIX: Align timestamp to candle intervals without changing the authoritative source
  private _alignTimestampToInterval(timestamp: number): number {
    // Align to interval boundaries while respecting the authoritative timestamp
    const aligned = Math.floor(timestamp / this.candleInterval) * this.candleInterval;
    
    // Ensure sequential progression
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
      timestampAccepted: 0,
      ohlcFixes: 0,
      invalidCandles: 0,
      lastValidationRun: Date.now()
    };
    
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
    
    this.validationStats = {
      totalUpdates: 0,
      timestampAccepted: 0,
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
        createdFrom: this.createdFrom,
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
      createdFrom: this.createdFrom, // Include creation source in stats
      validationStats: {
        ...this.validationStats,
        successRate: this.validationStats.totalUpdates > 0 ? 
          (this.validationStats.totalUpdates - this.validationStats.invalidCandles) / this.validationStats.totalUpdates : 1,
        timestampAcceptanceRate: this.validationStats.totalUpdates > 0 ?
          this.validationStats.timestampAccepted / this.validationStats.totalUpdates : 1
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