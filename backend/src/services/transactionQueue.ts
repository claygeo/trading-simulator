// backend/src/services/transactionQueue.ts
import { Trade } from '../types';

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
    }, 100);
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
  private batchBuffer: Trade[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_TIMEOUT = 100; // ms
  private useRedis: boolean = false;
  
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
  
  private setupWorkers() {
    // Process trades in parallel with multiple workers
    const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '10');
    
    this.queue.process('batch-trades', concurrency, async (job: any) => {
      const { trades } = job.data;
      
      try {
        // Process trades in parallel chunks
        const chunkSize = 10;
        const chunks: Trade[][] = [];
        
        for (let i = 0; i < trades.length; i += chunkSize) {
          chunks.push(trades.slice(i, i + chunkSize));
        }
        
        const results = await Promise.all(
          chunks.map(chunk => this.processTradeChunk(chunk))
        );
        
        return {
          processed: trades.length,
          timestamp: Date.now(),
          results: results.flat()
        };
      } catch (error) {
        console.error('Error processing batch trades:', error);
        throw error;
      }
    });
    
    // Process high-priority trades immediately
    this.queue.process('priority-trade', 20, async (job: any) => {
      const { trade } = job.data;
      
      try {
        const result = await this.processSingleTrade(trade);
        
        // Update real-time metrics
        await this.updateMetrics(trade);
        
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
  
  async addTrade(trade: Trade): Promise<void> {
    // Add to batch buffer
    this.batchBuffer.push(trade);
    
    // Check if we should flush the batch
    if (this.batchBuffer.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    } else if (!this.batchTimer) {
      // Set a timer to flush after timeout
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.BATCH_TIMEOUT);
    }
  }
  
  async addTrades(trades: Trade[]): Promise<void> {
    // For bulk trades, create batches immediately
    const batches = this.createBatches(trades, this.BATCH_SIZE);
    
    const jobs = batches.map(batch => ({
      name: 'batch-trades',
      data: { trades: batch },
      opts: {
        priority: 0,
        delay: 0
      }
    }));
    
    await this.queue.addBulk(jobs);
  }
  
  async addPriorityTrade(trade: Trade): Promise<void> {
    // High-priority trades bypass batching
    await this.queue.add('priority-trade', { trade }, {
      priority: 10,
      delay: 0
    });
  }
  
  private async flushBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.batchBuffer.length === 0) return;
    
    const batch = [...this.batchBuffer];
    this.batchBuffer = [];
    
    await this.queue.add('batch-trades', { trades: batch }, {
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
  
  private async processTradeChunk(trades: Trade[]): Promise<any[]> {
    // Simulate trade processing logic
    const results = trades.map(trade => {
      // Apply trade to market state
      // Update order book
      // Calculate impact
      // etc.
      
      return {
        tradeId: trade.id,
        processed: true,
        timestamp: Date.now()
      };
    });
    
    return results;
  }
  
  private async processSingleTrade(trade: Trade): Promise<any> {
    // Process single high-priority trade
    return {
      tradeId: trade.id,
      processed: true,
      priority: true,
      timestamp: Date.now()
    };
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
  
  // Monitoring methods
  async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      health: active < 1000 ? 'healthy' : 'degraded'
    };
  }
  
  async clearQueue(): Promise<void> {
    await this.queue.empty();
    await this.queue.clean(0, 'completed');
    await this.queue.clean(0, 'failed');
  }
  
  async shutdown(): Promise<void> {
    // Flush any pending batches
    await this.flushBatch();
    
    // Close queue
    await this.queue.close();
    
    // Close Redis connection
    if (this.useRedis) {
      await this.redis.quit();
    }
    
    console.log('TransactionQueue shut down gracefully');
  }
}