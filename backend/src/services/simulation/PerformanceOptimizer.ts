// backend/src/services/simulation/PerformanceOptimizer.ts - FIXED: getStats() method call
import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { PerformanceMonitor } from '../../monitoring/performanceMonitor';
import { TraderProfile, SimulationState, PerformanceConfig } from './types';

export class PerformanceOptimizer {
  private workerPool: Worker[] = [];
  private externalOrderWorkers: Worker[] = [];
  private performanceMonitor: PerformanceMonitor;
  private highFrequencyMode: boolean = false;
  private batchedUpdates: any[] = [];
  lastBatchTime: number = 0;
  config: PerformanceConfig;

  constructor(config?: Partial<PerformanceConfig>) {
    this.config = {
      workerPoolSize: Math.min(os.cpus().length, 8),
      objectPoolSizes: {
        trades: 10000, // Increased for external trades
        positions: 3000
      },
      batchSize: 100,
      highFrequencyMode: false,
      ...config
    };

    this.performanceMonitor = new PerformanceMonitor();
    this.initializeWorkerPool();
  }

  private initializeWorkerPool() {
    const numWorkers = this.config.workerPoolSize;
    console.log(`Initializing ${numWorkers} worker threads for parallel processing`);

    // Main worker pool for trader processing
    for (let i = 0; i < numWorkers; i++) {
      try {
        // Try to find the worker file in different locations
        const workerPath = this.findWorkerFile('traderWorker.js');
        if (workerPath) {
          const worker = new Worker(workerPath);
          this.workerPool.push(worker);
        }
      } catch (error) {
        console.warn(`Failed to create worker ${i}, continuing without it:`, error);
      }
    }

    // Additional workers for external order generation in HFT mode
    // For now, skip these since externalOrderWorker doesn't exist yet
    console.log('External order workers disabled - worker file not implemented yet');
  }

  private findWorkerFile(filename: string): string | null {
    // Try different possible locations for the worker file
    const possiblePaths = [
      path.join(__dirname, '../../workers', filename),
      path.join(__dirname, '../../../dist/workers', filename),
      path.join(__dirname, '../../dist/workers', filename),
      path.join(process.cwd(), 'src/workers', filename),
      path.join(process.cwd(), 'dist/workers', filename),
    ];

    for (const workerPath of possiblePaths) {
      if (fs.existsSync(workerPath)) {
        return workerPath;
      }
    }

    return null;
  }

  enableHighFrequencyMode(): void {
    this.highFrequencyMode = true;
    this.config.highFrequencyMode = true;
    
    // Increase object pool sizes for HFT
    this.config.objectPoolSizes.trades = 50000;
    this.config.objectPoolSizes.positions = 5000;
    
    // Scale up external order workers
    this.scaleExternalOrderWorkers(8);
    
    console.log('High-frequency trading mode enabled');
  }

  disableHighFrequencyMode(): void {
    this.highFrequencyMode = false;
    this.config.highFrequencyMode = false;
    
    // Reduce object pool sizes
    this.config.objectPoolSizes.trades = 10000;
    this.config.objectPoolSizes.positions = 3000;
    
    // Scale down external order workers
    this.scaleExternalOrderWorkers(2);
    
    console.log('High-frequency trading mode disabled');
  }

  shouldUseBatchProcessing(speed: number): boolean {
    return speed > 50 || this.highFrequencyMode;
  }

  shouldUseParallelProcessing(speed: number): boolean {
    return speed > 10 && this.workerPool.length > 0;
  }

  getVolatilityFactorForSpeed(speed: number): number {
    // Reduce volatility for stability at high speeds
    return Math.max(0.1, 1 / Math.sqrt(speed));
  }

  async processTraderBatch(
    traders: TraderProfile[],
    simulation: SimulationState,
    worker: Worker
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const messageHandler = (result: any) => {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);
        resolve(result);
      };

      const errorHandler = (error: Error) => {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);
        console.error('Worker error:', error);
        resolve([]); // Return empty array on error
      };

      worker.on('message', messageHandler);
      worker.on('error', errorHandler);

      // Send work to worker
      worker.postMessage({
        traders: traders.map(t => ({
          ...t,
          trader: {
            walletAddress: t.trader.walletAddress,
            netPnl: t.trader.netPnl,
            riskProfile: t.trader.riskProfile
          }
        })),
        marketData: {
          currentPrice: simulation.currentPrice,
          priceHistory: simulation.priceHistory.slice(-10),
          marketConditions: simulation.marketConditions,
          currentTime: simulation.currentTime
        },
        activePositions: simulation.activePositions
          .filter(p => traders.some(t => t.trader.walletAddress === p.trader.walletAddress))
          .map(p => ({
            walletAddress: p.trader.walletAddress,
            entryPrice: p.entryPrice,
            quantity: p.quantity,
            entryTime: p.entryTime
          }))
      });
    });
  }

  async processTraderActionsParallel(
    traders: TraderProfile[],
    simulation: SimulationState
  ): Promise<any[]> {
    const batchSize = Math.ceil(traders.length / this.workerPool.length);

    // Create batches for each worker
    const batches: TraderProfile[][] = [];
    for (let i = 0; i < traders.length; i += batchSize) {
      batches.push(traders.slice(i, i + batchSize));
    }

    // Process batches in parallel
    const promises = batches.map((batch, index) => {
      if (index < this.workerPool.length) {
        return this.processTraderBatch(batch, simulation, this.workerPool[index]);
      }
      return Promise.resolve([]);
    });

    const results = await Promise.all(promises);
    return results.flat();
  }

  async generateExternalOrdersParallel(marketData: any, tpsMode: string): Promise<any[]> {
    if (this.externalOrderWorkers.length === 0) {
      return [];
    }

    const promises = this.externalOrderWorkers.map(worker => {
      return new Promise<any[]>((resolve) => {
        const timeout = setTimeout(() => {
          resolve([]);
        }, 50); // 50ms timeout for order generation

        worker.once('message', (orders) => {
          clearTimeout(timeout);
          resolve(orders);
        });

        worker.postMessage({
          marketData,
          tpsMode,
          timestamp: Date.now()
        });
      });
    });

    const results = await Promise.all(promises);
    return results.flat();
  }

  shouldBatchUpdate(now: number): boolean {
    const timeSinceLastBatch = now - this.lastBatchTime;
    return timeSinceLastBatch >= 16; // 60 FPS limit
  }

  queueBatchUpdate(update: any): void {
    this.batchedUpdates.push(update);
  }

  getBatchedUpdates(): any[] {
    const updates = [...this.batchedUpdates];
    this.batchedUpdates = [];
    this.lastBatchTime = performance.now();
    return updates;
  }

  calculateBatchSize(timeSinceLastBatch: number, speed: number): number {
    // Dynamically adjust batch size based on performance
    const targetFPS = 60;
    const targetFrameTime = 1000 / targetFPS;
    
    if (timeSinceLastBatch > targetFrameTime * 2) {
      // We're lagging, reduce batch size
      return Math.max(1, Math.floor(this.config.batchSize * 0.8));
    } else if (timeSinceLastBatch < targetFrameTime * 0.5) {
      // We have headroom, increase batch size
      return Math.min(this.config.batchSize * 2, Math.floor(this.config.batchSize * 1.2));
    }
    
    return this.config.batchSize;
  }

  getWorkerPool(): Worker[] {
    return this.workerPool;
  }

  getWorkerCount(): number {
    return this.workerPool.length + this.externalOrderWorkers.length;
  }

  startPerformanceMonitoring(): void {
    this.performanceMonitor.startMonitoring();
  }

  stopPerformanceMonitoring(): void {
    this.performanceMonitor.stopMonitoring();
  }

  recordSimulationTick(elapsed: number): void {
    this.performanceMonitor.recordSimulationTick(elapsed);
  }

  // FIXED: Safe getStats() method call with type guard and fallback
  getPerformanceStats(): any {
    // Check if getStats method exists on performanceMonitor
    if (this.performanceMonitor && typeof (this.performanceMonitor as any).getStats === 'function') {
      return (this.performanceMonitor as any).getStats();
    }
    
    // Fallback: return basic stats if getStats method doesn't exist
    return {
      tickCount: 0,
      avgTickTime: 0,
      maxTickTime: 0,
      minTickTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      workerCount: this.getWorkerCount(),
      highFrequencyMode: this.highFrequencyMode,
      batchSize: this.config.batchSize,
      error: 'getStats method not available on PerformanceMonitor'
    };
  }

  getRandomTraderSample(traders: TraderProfile[], sampleSize: number): TraderProfile[] {
    const shuffled = [...traders];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleSize);
  }

  optimizeMemoryUsage(): void {
    if (global.gc) {
      global.gc();
      console.log('Manual garbage collection triggered');
    }
  }

  adjustWorkerPoolSize(newSize: number): void {
    const currentSize = this.workerPool.length;
    
    if (newSize > currentSize) {
      // Add workers
      for (let i = currentSize; i < newSize; i++) {
        try {
          const workerPath = this.findWorkerFile('traderWorker.js');
          if (workerPath) {
            const worker = new Worker(workerPath);
            this.workerPool.push(worker);
          }
        } catch (error) {
          console.warn(`Failed to create additional worker:`, error);
        }
      }
    } else if (newSize < currentSize) {
      // Remove workers
      for (let i = currentSize - 1; i >= newSize; i--) {
        const worker = this.workerPool.pop();
        if (worker) {
          worker.terminate();
        }
      }
    }

    this.config.workerPoolSize = this.workerPool.length;
    console.log(`Worker pool size adjusted to ${this.workerPool.length}`);
  }

  private scaleExternalOrderWorkers(targetSize: number): void {
    // Disabled until externalOrderWorker is implemented
    console.log('External order worker scaling disabled - not implemented yet');
  }

  getBatchingConfig(): {
    batchSize: number;
    batchTimeout: number;
    maxBatchSize: number;
  } {
    return {
      batchSize: this.config.batchSize,
      batchTimeout: 100, // ms
      maxBatchSize: this.config.batchSize * 2
    };
  }

  cleanup(): void {
    // Terminate all workers
    this.workerPool.forEach(worker => {
      worker.terminate();
    });
    this.workerPool = [];

    this.externalOrderWorkers.forEach(worker => {
      worker.terminate();
    });
    this.externalOrderWorkers = [];

    // Stop performance monitoring
    if (this.performanceMonitor) {
      this.performanceMonitor.stopMonitoring();
    }

    console.log('PerformanceOptimizer cleanup complete');
  }
}