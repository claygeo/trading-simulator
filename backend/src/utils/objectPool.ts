// backend/src/utils/objectPool.ts
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;
  private created: number = 0;
  private metrics = {
    acquired: 0,
    released: 0,
    reused: 0,
    created: 0
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
    
    let obj = this.available.pop();
    
    if (obj) {
      // Reusing existing object
      this.metrics.reused++;
    } else {
      // Create new object if pool is empty
      obj = this.factory();
      this.created++;
      this.metrics.created++;
      
      if (this.created > this.maxSize) {
        console.warn(`Object pool size (${this.created}) exceeds max size (${this.maxSize})`);
      }
    }
    
    this.inUse.add(obj);
    return obj;
  }
  
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      console.warn('Attempting to release object not from this pool');
      return;
    }
    
    this.metrics.released++;
    this.inUse.delete(obj);
    
    // Reset the object
    try {
      this.reset(obj);
    } catch (error) {
      console.error('Error resetting object:', error);
      // Don't reuse objects that fail to reset
      return;
    }
    
    // Only keep objects up to maxSize
    if (this.available.length < this.maxSize) {
      this.available.push(obj);
    } else {
      // Let garbage collector handle excess objects
      this.created--;
    }
  }
  
  releaseAll(): void {
    // Release all objects currently in use
    const objectsToRelease = Array.from(this.inUse);
    objectsToRelease.forEach(obj => this.release(obj));
  }
  
  clear(): void {
    // Clear the pool completely
    this.available = [];
    this.inUse.clear();
    this.created = 0;
    
    // Reset metrics
    this.metrics = {
      acquired: 0,
      released: 0,
      reused: 0,
      created: 0
    };
  }
  
  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.created,
      maxSize: this.maxSize,
      metrics: { ...this.metrics },
      efficiency: this.metrics.acquired > 0 
        ? (this.metrics.reused / this.metrics.acquired * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  // Resize the pool
  resize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    
    // If we have too many available objects, trim the excess
    if (this.available.length > newMaxSize) {
      const excess = this.available.length - newMaxSize;
      this.available.splice(newMaxSize, excess);
      this.created -= excess;
    }
  }
  
  // Get current pool utilization
  getUtilization(): number {
    return this.created > 0 ? (this.inUse.size / this.created) : 0;
  }
}

// Factory functions for common objects
export const createObjectPools = () => {
  // Trade object pool
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
    5000,
    1000 // Pre-fill with 1000 objects
  );
  
  // Position object pool
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
    2000,
    500 // Pre-fill with 500 objects
  );
  
  // Price update object pool
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
    1000,
    200
  );
  
  return {
    tradePool,
    positionPool,
    priceUpdatePool
  };
};