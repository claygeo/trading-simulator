// backend/src/services/transactionQueue.ts
import { Trade } from '../types';

interface TradeProcessedCallback {
  (trade: Trade, simulationId: string): void;
}

interface TradeResult {
  tradeId: string;
  processed: boolean;
  timestamp: number;
  simulationId: string;
}

// Fallback in-memory queue implementation
class InMemoryQueue {
  private queue: any[] = [];
  private processing: boolean = false;
  private stats = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0
  };

  async add(name: string, data: any, opts?: any): Promise<void> {
    this.queue.push({ name, data, opts });
    this.stats.waiting = this.queue.length;
  }

  async addBulk(jobs: any[]): Promise<void> {
    this.queue.push(...jobs);
    this.stats.waiting = this.queue.length;
  }

  async process(name: string, concurrency: number, processor: (job: any) => Promise<any>): Promise<void> {
    // Simple in-memory processing
    setInterval(async () => {
      if (this.processing || this.queue.length === 0) return;
      
      this.processing = true;
      this.stats.active++;
      
      const job = this.queue.shift();
      if (job && job.name === name) {
        try {
          await processor(job);
          this.stats.completed++;
        } catch (error) {
          this.stats.failed++;
          console.error('Job processing error:', error);
        }
      }
      
      this.stats.active--;
      this.stats.waiting = this.queue.length;
      this.processing = false;
    }, 10); // Faster processing for in-memory queue
  }

  async getWaitingCount(): Promise<number> { return this.stats.waiting; }
  async getActiveCount(): Promise<number> { return this.stats.active; }
  async getCompletedCount(): Promise<number> { return this.stats.completed; }
  async getFailedCount(): Promise<number> { return this.stats.failed; }
  
  async empty(): Promise<void> { this.queue = []; }
  async clean(grace: number, type: string): Promise<void> { /* no-op */ }
  async close(): Promise<void> { /* no-op */ }
  
  on(event: string, handler: Function): void { /* no-op for now */ }
}

// Redis client stub for fallback
class RedisStub {
  async multi() {
    return {
      hincrby: () => this,
      hincrbyfloat: () => this,
      expire: () => this,
      exec: async () => []
    };
  }
  
  async lpush(key: string, value: string): Promise<void> { /* no-op */ }
  async quit(): Promise<void> { /* no-op */ }
  on(event: string, handler: Function): void { /* no-op */ }
}

export class TransactionQueue {
  private queue: any;
  private redis: any;
  private batchBuffer: Map<string, Trade[]> = new Map(); // Separate buffers per simulation
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_SIZE = 50; // Smaller batches for faster processing
  private readonly BATCH_TIMEOUT = 10; // 10ms for near real-time
  private useRedis: boolean = false;
  private onTradeProcessed?: TradeProcessedCallback;
  private processedTradesBuffer: Map<string, TradeResult[]> = new Map();
  
  constructor() {
    // Check if Redis is enabled and available
    if (process.env.ENABLE_REDIS === 'true') {
      try {
        // Try to load Bull and Redis
        const Bull = require('bull');
        const Redis = require('ioredis');
        
        // Initialize Redis client
        this.redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          enableOfflineQueue: true,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          }
        });
        
        // Initialize Bull queue
        this.queue = new Bull('transactions', {
          redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
          },
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          }
        });
        
        this.useRedis = true;
        console.log('TransactionQueue initialized with Redis');
      } catch (error) {
        console.warn('Redis/Bull not available, using in-memory queue:', error);
        this.initializeFallback();
      }
    } else {
      this.initializeFallback();
    }
    
    // Setup workers
    this.setupWorkers();
    
    // Setup error handlers
    this.setupErrorHandlers();
  }
  
  private initializeFallback() {
    this.queue = new InMemoryQueue();
    this.redis = new RedisStub();
    this.useRedis = false;
    console.log('TransactionQueue initialized with in-memory fallback');
  }
  
  setTradeProcessedCallback(callback: TradeProcessedCallback): void {
    this.onTradeProcessed = callback;
  }
  
  private setupWorkers() {
    // Process trades in parallel with multiple workers
    const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '10');
    
    this.queue.process('batch-trades', concurrency, async (job: any) => {
      const { trades, simulationId } = job.data;
      
      try {
        // Process trades in parallel chunks
        const chunkSize = 10;
        const chunks: Trade[][] = [];
        
        for (let i = 0; i < trades.length; i += chunkSize) {
          chunks.push(trades.slice(i, i + chunkSize));
        }
        
        const results = await Promise.all(
          chunks.map(chunk => this.processTradeChunk(chunk, simulationId))
        );
        
        // Notify about all processed trades
        const flatResults = results.flat();
        flatResults.forEach((result, index) => {
          if (result.processed && this.onTradeProcessed) {
            this.onTradeProcessed(trades[index], simulationId);
          }
        });
        
        return {
          processed: trades.length,
          timestamp: Date.now(),
          results: flatResults
        };
      } catch (error) {
        console.error('Error processing batch trades:', error);
        throw error;
      }
    });
    
    // Process high-priority trades immediately
    this.queue.process('priority-trade', 20, async (job: any) => {
      const { trade, simulationId } = job.data;
      
      try {
        const result = await this.processSingleTrade(trade, simulationId);
        
        // Update real-time metrics
        await this.updateMetrics(trade);
        
        // Notify immediately
        if (result.processed && this.onTradeProcessed) {
          this.onTradeProcessed(trade, simulationId);
        }
        
        return result;
      } catch (error) {
        console.error('Error processing priority trade:', error);
        throw error;
      }
    });
  }
  
  private setupErrorHandlers() {
    this.queue.on('error', (error: any) => {
      console.error('Queue error:', error);
    });
    
    this.queue.on('failed', (job: any, err: any) => {
      console.error(`Job ${job.id} failed:`, err);
      
      // Implement retry logic or dead letter queue
      if (job.attemptsMade >= job.opts.attempts!) {
        this.handleFailedJob(job);
      }
    });
    
    this.redis.on('error', (error: any) => {
      console.error('Redis error:', error);
    });
  }
  
  async addTrade(trade: Trade, simulationId: string): Promise<void> {
    // Create a key for the simulation's batch buffer
    const bufferKey = simulationId;
    
    if (!this.batchBuffer.has(bufferKey)) {
      this.batchBuffer.set(bufferKey, []);
    }
    
    const buffer = this.batchBuffer.get(bufferKey)!;
    buffer.push(trade);
    
    // Check if we should flush the batch
    if (buffer.length >= this.BATCH_SIZE) {
      await this.flushBatch(simulationId);
    } else if (!this.batchTimers.has(bufferKey)) {
      // Set a timer to flush after timeout
      const timer = setTimeout(() => {
        this.flushBatch(simulationId);
      }, this.BATCH_TIMEOUT);
      this.batchTimers.set(bufferKey, timer);
    }
  }
  
  async addTrades(trades: Trade[], simulationId: string): Promise<void> {
    // For bulk trades, create batches immediately
    const batches = this.createBatches(trades, this.BATCH_SIZE);
    
    const jobs = batches.map(batch => ({
      name: 'batch-trades',
      data: { trades: batch, simulationId },
      opts: {
        priority: 0,
        delay: 0
      }
    }));
    
    await this.queue.addBulk(jobs);
  }
  
  async addPriorityTrade(trade: Trade, simulationId: string): Promise<void> {
    // High-priority trades bypass batching
    await this.queue.add('priority-trade', { trade, simulationId }, {
      priority: 10,
      delay: 0
    });
  }
  
  private async flushBatch(simulationId: string): Promise<void> {
    const timer = this.batchTimers.get(simulationId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(simulationId);
    }
    
    const buffer = this.batchBuffer.get(simulationId);
    if (!buffer || buffer.length === 0) return;
    
    const batch = [...buffer];
    buffer.length = 0; // Clear the buffer
    
    await this.queue.add('batch-trades', { trades: batch, simulationId }, {
      priority: 5,
      delay: 0
    });
  }
  
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }
  
  private async processTradeChunk(trades: Trade[], simulationId: string): Promise<TradeResult[]> {
    // Simulate trade processing logic with validation
    const results = trades.map(trade => {
      // Validate trade
      if (!trade.id || !trade.trader || !trade.price || !trade.quantity) {
        console.warn('Invalid trade data:', trade);
        return {
          tradeId: trade.id || 'unknown',
          processed: false,
          timestamp: Date.now(),
          simulationId
        };
      }
      
      // Apply trade to market state (in a real system, this would update the order book)
      // For now, we just mark it as processed
      return {
        tradeId: trade.id,
        processed: true,
        timestamp: Date.now(),
        simulationId
      };
    });
    
    // Store processed trades for retrieval
    if (!this.processedTradesBuffer.has(simulationId)) {
      this.processedTradesBuffer.set(simulationId, []);
    }
    
    const processedBuffer = this.processedTradesBuffer.get(simulationId)!;
    processedBuffer.push(...results);
    
    // Keep only last 1000 processed trades per simulation
    if (processedBuffer.length > 1000) {
      this.processedTradesBuffer.set(
        simulationId,
        processedBuffer.slice(-1000)
      );
    }
    
    return results;
  }
  
  private async processSingleTrade(trade: Trade, simulationId: string): Promise<TradeResult> {
    // Process single high-priority trade
    const result = {
      tradeId: trade.id,
      processed: true,
      priority: true,
      timestamp: Date.now(),
      simulationId
    };
    
    // Store in processed buffer
    if (!this.processedTradesBuffer.has(simulationId)) {
      this.processedTradesBuffer.set(simulationId, []);
    }
    
    this.processedTradesBuffer.get(simulationId)!.push(result);
    
    return result;
  }
  
  private async updateMetrics(trade: Trade): Promise<void> {
    if (!this.useRedis) return;
    
    // Update real-time metrics in Redis
    const key = `metrics:${new Date().toISOString().split('T')[0]}`;
    
    await this.redis.multi()
      .hincrby(key, 'tradeCount', 1)
      .hincrbyfloat(key, 'totalVolume', trade.value)
      .expire(key, 86400 * 7) // Keep for 7 days
      .exec();
  }
  
  private async handleFailedJob(job: any): Promise<void> {
    // Move to dead letter queue or log for manual processing
    console.error(`Job ${job.id} permanently failed after ${job.attemptsMade} attempts`);
    
    if (this.useRedis) {
      // Store failed job data for analysis
      await this.redis.lpush('failed_trades', JSON.stringify({
        jobId: job.id,
        data: job.data,
        error: job.failedReason,
        timestamp: Date.now()
      }));
    }
  }
  
  // Get processed trades for a simulation
  getProcessedTrades(simulationId: string, limit: number = 100): TradeResult[] {
    const buffer = this.processedTradesBuffer.get(simulationId);
    if (!buffer) return [];
    
    return buffer.slice(-limit);
  }
  
  // Clear processed trades buffer for a simulation
  clearProcessedTrades(simulationId: string): void {
    this.processedTradesBuffer.delete(simulationId);
  }
  
  // Monitoring methods
  async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ]);
    
    const bufferStats: Record<string, number> = {};
    this.batchBuffer.forEach((buffer, simId) => {
      bufferStats[simId] = buffer.length;
    });
    
    return {
      waiting,
      active,
      completed,
      failed,
      health: active < 1000 ? 'healthy' : 'degraded',
      bufferedTrades: bufferStats,
      processedBufferSizes: Array.from(this.processedTradesBuffer.entries()).map(
        ([simId, buffer]) => ({ simulationId: simId, size: buffer.length })
      )
    };
  }
  
  async clearQueue(): Promise<void> {
    await this.queue.empty();
    await this.queue.clean(0, 'completed');
    await this.queue.clean(0, 'failed');
    this.batchBuffer.clear();
    this.processedTradesBuffer.clear();
  }
  
  async shutdown(): Promise<void> {
    // Flush all pending batches
    const flushPromises = Array.from(this.batchBuffer.keys()).map(simId => 
      this.flushBatch(simId)
    );
    await Promise.all(flushPromises);
    
    // Clear all timers
    this.batchTimers.forEach(timer => clearTimeout(timer));
    this.batchTimers.clear();
    
    // Close queue
    await this.queue.close();
    
    // Close Redis connection
    if (this.useRedis) {
      await this.redis.quit();
    }
    
    console.log('TransactionQueue shut down gracefully');
  }
}