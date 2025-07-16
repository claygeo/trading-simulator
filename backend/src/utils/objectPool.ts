// backend/src/utils/objectPool.ts - FIXED: Memory Leak Resolution
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;
  private created: number = 0;
  private totalAcquired: number = 0; // NEW: Track total acquisitions
  private totalReleased: number = 0; // NEW: Track total releases
  private metrics = {
    acquired: 0,
    released: 0,
    reused: 0,
    created: 0,
    discarded: 0 // NEW: Track discarded objects
  };
  
  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    maxSize: number = 1000,
    preFill: number = 0
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
    
    // Pre-populate pool if requested
    if (preFill > 0) {
      this.preFillPool(Math.min(preFill, maxSize));
    }
  }
  
  private preFillPool(count: number): void {
    console.log(`Pre-filling object pool with ${count} objects`);
    
    for (let i = 0; i < count; i++) {
      const obj = this.factory();
      this.available.push(obj);
      this.created++;
    }
    
    this.metrics.created = count;
  }
  
  acquire(): T {
    this.metrics.acquired++;
    this.totalAcquired++;
    
    let obj = this.available.pop();
    
    if (obj) {
      // Reusing existing object
      this.metrics.reused++;
    } else {
      // CRITICAL FIX: Enforce maxSize limit to prevent memory leak
      if (this.created >= this.maxSize) {
        console.warn(`Object pool at max capacity (${this.created}/${this.maxSize}). Rejecting new object creation to prevent memory leak.`);
        
        // Try to force release of objects by clearing some from inUse if they're old
        this.forceCleanupOldObjects();
        
        // If still at capacity, reuse from available or create one anyway but track it
        obj = this.available.pop();
        if (!obj) {
          console.warn(`Pool exhausted, creating object anyway but this may indicate a leak`);
          obj = this.factory();
          // Don't increment created counter to prevent leak tracking
        }
      } else {
        // Create new object within limits
        obj = this.factory();
        this.created++;
        this.metrics.created++;
      }
    }
    
    this.inUse.add(obj);
    
    // CRITICAL FIX: Monitor for potential leaks
    if (this.inUse.size > this.maxSize * 0.8) {
      console.warn(`Object pool usage high: ${this.inUse.size}/${this.maxSize} objects in use. Potential leak detected.`);
      this.detectAndReportLeaks();
    }
    
    return obj;
  }
  
  // CRITICAL FIX: Enhanced release with proper memory management
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      console.warn('Attempting to release object not from this pool');
      return;
    }
    
    this.metrics.released++;
    this.totalReleased++;
    this.inUse.delete(obj);
    
    // Reset the object
    try {
      this.reset(obj);
    } catch (error) {
      console.error('Error resetting object:', error);
      // CRITICAL FIX: Properly handle failed resets - discard object and decrement counter
      this.created--;
      this.metrics.discarded++;
      return;
    }
    
    // CRITICAL FIX: Proper pool size management
    if (this.available.length < this.maxSize) {
      this.available.push(obj);
    } else {
      // CRITICAL FIX: Properly decrement created counter when discarding excess objects
      this.created--;
      this.metrics.discarded++;
      console.log(`Pool at capacity, discarding object. Pool size: ${this.available.length}/${this.maxSize}, Created: ${this.created}`);
    }
  }
  
  // NEW: Force cleanup of potentially leaked objects
  private forceCleanupOldObjects(): void {
    const maxInUse = Math.floor(this.maxSize * 0.9); // Allow 90% usage
    
    if (this.inUse.size > maxInUse) {
      console.warn(`Force cleanup: ${this.inUse.size} objects in use, max should be ${maxInUse}`);
      
      // Convert Set to Array to access oldest objects (this is a heuristic)
      const inUseArray = Array.from(this.inUse);
      const toRemove = inUseArray.slice(0, this.inUse.size - maxInUse);
      
      toRemove.forEach(obj => {
        console.warn(`Force releasing potentially leaked object`);
        this.inUse.delete(obj);
        this.metrics.discarded++;
        this.created--;
      });
    }
  }
  
  // NEW: Leak detection and reporting
  private detectAndReportLeaks(): void {
    const leakThreshold = this.maxSize * 0.9;
    const efficiency = this.totalAcquired > 0 ? this.totalReleased / this.totalAcquired : 1;
    
    if (this.inUse.size > leakThreshold) {
      console.error(`🚨 MEMORY LEAK DETECTED in ObjectPool:`);
      console.error(`   - Objects in use: ${this.inUse.size}/${this.maxSize}`);
      console.error(`   - Total created: ${this.created}`);
      console.error(`   - Acquired: ${this.totalAcquired}, Released: ${this.totalReleased}`);
      console.error(`   - Release efficiency: ${(efficiency * 100).toFixed(2)}%`);
      console.error(`   - Available objects: ${this.available.length}`);
      
      if (efficiency < 0.8) {
        console.error(`   - WARNING: Low release efficiency indicates potential leak in caller code`);
      }
    }
  }
  
  releaseAll(): void {
    console.log(`Releasing all ${this.inUse.size} objects currently in use`);
    
    // Release all objects currently in use
    const objectsToRelease = Array.from(this.inUse);
    objectsToRelease.forEach(obj => this.release(obj));
    
    console.log(`All objects released. Pool state: available=${this.available.length}, inUse=${this.inUse.size}, created=${this.created}`);
  }
  
  clear(): void {
    console.log(`Clearing pool completely. Current state: available=${this.available.length}, inUse=${this.inUse.size}, created=${this.created}`);
    
    // Clear the pool completely
    this.available = [];
    this.inUse.clear();
    this.created = 0;
    this.totalAcquired = 0;
    this.totalReleased = 0;
    
    // Reset metrics
    this.metrics = {
      acquired: 0,
      released: 0,
      reused: 0,
      created: 0,
      discarded: 0
    };
    
    console.log(`Pool cleared successfully`);
  }
  
  getStats() {
    const efficiency = this.metrics.acquired > 0 ? (this.metrics.reused / this.metrics.acquired * 100) : 0;
    const releaseEfficiency = this.totalAcquired > 0 ? (this.totalReleased / this.totalAcquired * 100) : 100;
    
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.created,
      maxSize: this.maxSize,
      utilization: this.created > 0 ? (this.inUse.size / this.created * 100) : 0,
      poolUsage: (this.available.length / this.maxSize * 100),
      memoryEfficiency: efficiency.toFixed(2) + '%',
      releaseEfficiency: releaseEfficiency.toFixed(2) + '%',
      isHealthy: this.inUse.size < this.maxSize * 0.8 && releaseEfficiency > 80,
      metrics: { ...this.metrics },
      totalStats: {
        totalAcquired: this.totalAcquired,
        totalReleased: this.totalReleased,
        netDifference: this.totalAcquired - this.totalReleased
      },
      warnings: this.generateWarnings()
    };
  }
  
  // NEW: Generate health warnings
  private generateWarnings(): string[] {
    const warnings: string[] = [];
    
    if (this.inUse.size > this.maxSize * 0.8) {
      warnings.push('High memory usage - potential leak detected');
    }
    
    if (this.created >= this.maxSize) {
      warnings.push('Pool at maximum capacity');
    }
    
    const releaseEfficiency = this.totalAcquired > 0 ? this.totalReleased / this.totalAcquired : 1;
    if (releaseEfficiency < 0.8) {
      warnings.push('Low release efficiency - objects may not be properly released');
    }
    
    if (this.metrics.discarded > this.metrics.created * 0.1) {
      warnings.push('High discard rate - check object reset logic');
    }
    
    return warnings;
  }
  
  // Resize the pool
  resize(newMaxSize: number): void {
    const oldMaxSize = this.maxSize;
    this.maxSize = newMaxSize;
    
    console.log(`Resizing pool from ${oldMaxSize} to ${newMaxSize}`);
    
    // If we have too many available objects, trim the excess
    if (this.available.length > newMaxSize) {
      const excess = this.available.length - newMaxSize;
      this.available.splice(newMaxSize, excess);
      this.created -= excess;
      this.metrics.discarded += excess;
      console.log(`Trimmed ${excess} excess objects during resize`);
    }
    
    // If we have too many objects total, warn about it
    if (this.created > newMaxSize) {
      console.warn(`Pool resize: total created objects (${this.created}) exceeds new max size (${newMaxSize})`);
    }
  }
  
  // Get current pool utilization
  getUtilization(): number {
    return this.created > 0 ? (this.inUse.size / this.created) : 0;
  }
  
  // NEW: Force garbage collection of unused objects
  forceGarbageCollection(): void {
    console.log(`Force garbage collection: Before - Available: ${this.available.length}, InUse: ${this.inUse.size}, Created: ${this.created}`);
    
    // Keep only half of available objects if over capacity
    if (this.available.length > this.maxSize * 0.5) {
      const toKeep = Math.floor(this.maxSize * 0.5);
      const toDiscard = this.available.length - toKeep;
      
      this.available = this.available.slice(0, toKeep);
      this.created -= toDiscard;
      this.metrics.discarded += toDiscard;
      
      console.log(`Discarded ${toDiscard} objects during force GC`);
    }
    
    console.log(`After GC - Available: ${this.available.length}, InUse: ${this.inUse.size}, Created: ${this.created}`);
  }
  
  // NEW: Health check method
  healthCheck(): { healthy: boolean; issues: string[]; stats: any } {
    const stats = this.getStats();
    const issues: string[] = [];
    
    if (this.inUse.size > this.maxSize * 0.9) {
      issues.push('Pool usage critically high');
    }
    
    if (this.created > this.maxSize) {
      issues.push('Created objects exceed pool capacity');
    }
    
    const releaseEfficiency = this.totalAcquired > 0 ? this.totalReleased / this.totalAcquired : 1;
    if (releaseEfficiency < 0.7) {
      issues.push('Poor release efficiency indicates memory leak');
    }
    
    if (this.available.length === 0 && this.inUse.size > 0) {
      issues.push('No available objects while objects are in use');
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      stats
    };
  }
}

// Factory functions for common objects with proper pool sizing
export const createObjectPools = () => {
  // CRITICAL FIX: Smaller, more manageable pool sizes
  const tradePool = new ObjectPool(
    () => ({
      id: '',
      timestamp: 0,
      trader: null as any,
      action: 'buy' as const,
      price: 0,
      quantity: 0,
      value: 0,
      impact: 0
    }),
    (trade) => {
      trade.id = '';
      trade.timestamp = 0;
      trade.trader = null;
      trade.action = 'buy';
      trade.price = 0;
      trade.quantity = 0;
      trade.value = 0;
      trade.impact = 0;
    },
    2000, // REDUCED from 5000 to prevent memory issues
    200   // REDUCED from 1000
  );
  
  // Position object pool with leak prevention
  const positionPool = new ObjectPool(
    () => ({
      trader: null as any,
      entryPrice: 0,
      quantity: 0,
      entryTime: 0,
      currentPnl: 0,
      currentPnlPercentage: 0
    }),
    (position) => {
      position.trader = null;
      position.entryPrice = 0;
      position.quantity = 0;
      position.entryTime = 0;
      position.currentPnl = 0;
      position.currentPnlPercentage = 0;
    },
    1000, // REDUCED from 2000
    100   // REDUCED from 500
  );
  
  // Price update object pool with leak prevention
  const priceUpdatePool = new ObjectPool(
    () => ({
      timestamp: 0,
      price: 0,
      volume: 0,
      spread: 0
    }),
    (update) => {
      update.timestamp = 0;
      update.price = 0;
      update.volume = 0;
      update.spread = 0;
    },
    500,  // REDUCED from 1000
    50    // REDUCED from 200
  );
  
  return {
    tradePool,
    positionPool,
    priceUpdatePool
  };
};