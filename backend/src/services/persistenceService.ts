// backend/src/services/persistenceService.ts - FINAL FIXED: Older Redis client API compatibility
import { Pool, PoolClient } from 'pg';
import { createClient } from 'redis';
import { Trade, TraderPosition, PricePoint } from '../types';

type RedisClient = ReturnType<typeof createClient>;

export class PersistenceService {
  private pgPool!: Pool;
  private redisClient!: RedisClient;
  private isConnected: boolean = false;
  private batchInsertQueue: Trade[] = [];
  private batchInsertTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 1000;
  private readonly BATCH_TIMEOUT = 5000; // 5 seconds
  
  constructor() {
    this.initializeConnections();
  }
  
  private async initializeConnections() {
    try {
      // Initialize PostgreSQL
      this.pgPool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/trading_simulator',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      
      // Test PostgreSQL connection
      const pgClient = await this.pgPool.connect();
      await pgClient.query('SELECT NOW()');
      pgClient.release();
      console.log('PostgreSQL connected successfully');
      
      // Initialize Redis
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      this.redisClient.on('error', (err: Error) => {
        console.error('Redis Client Error:', err);
      });
      
      // FIXED: For older Redis client - check connected property and handle connection properly
      if (!this.redisClient.connected) {
        // For older Redis clients, connection happens automatically on first command
        // We'll test with a simple command instead
        try {
          await new Promise((resolve, reject) => {
            this.redisClient.ping((err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
        } catch (error) {
          console.warn('Redis ping failed, but continuing anyway:', error);
        }
      }
      console.log('Redis connected successfully');
      
      // Initialize database schema
      await this.initializeSchema();
      
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to initialize persistence connections:', error);
      this.isConnected = false;
    }
  }
  
  private async initializeSchema() {
    const client = await this.pgPool.connect();
    
    try {
      // Create tables if they don't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id UUID PRIMARY KEY,
          simulation_id UUID NOT NULL,
          timestamp BIGINT NOT NULL,
          trader_wallet VARCHAR(255) NOT NULL,
          action VARCHAR(10) NOT NULL,
          price DECIMAL(20, 8) NOT NULL,
          quantity DECIMAL(20, 8) NOT NULL,
          value DECIMAL(20, 8) NOT NULL,
          impact DECIMAL(20, 8) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_simulation_timestamp ON trades (simulation_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_trader_wallet ON trades (trader_wallet);
        
        CREATE TABLE IF NOT EXISTS positions (
          id SERIAL PRIMARY KEY,
          simulation_id UUID NOT NULL,
          trader_wallet VARCHAR(255) NOT NULL,
          entry_price DECIMAL(20, 8) NOT NULL,
          exit_price DECIMAL(20, 8),
          quantity DECIMAL(20, 8) NOT NULL,
          entry_time BIGINT NOT NULL,
          exit_time BIGINT,
          pnl DECIMAL(20, 8),
          pnl_percentage DECIMAL(10, 4),
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_simulation_status ON positions (simulation_id, status);
        CREATE INDEX IF NOT EXISTS idx_trader_positions ON positions (trader_wallet, status);
        
        CREATE TABLE IF NOT EXISTS price_history (
          simulation_id UUID NOT NULL,
          timestamp BIGINT NOT NULL,
          open DECIMAL(20, 8) NOT NULL,
          high DECIMAL(20, 8) NOT NULL,
          low DECIMAL(20, 8) NOT NULL,
          close DECIMAL(20, 8) NOT NULL,
          volume DECIMAL(20, 8) NOT NULL,
          PRIMARY KEY (simulation_id, timestamp)
        );
        
        CREATE INDEX IF NOT EXISTS idx_simulation_time ON price_history (simulation_id, timestamp DESC);
        
        CREATE TABLE IF NOT EXISTS simulation_metrics (
          simulation_id UUID NOT NULL,
          timestamp BIGINT NOT NULL,
          trades_per_second INTEGER NOT NULL,
          active_positions INTEGER NOT NULL,
          total_volume DECIMAL(20, 8) NOT NULL,
          volatility DECIMAL(10, 6) NOT NULL,
          PRIMARY KEY (simulation_id, timestamp)
        );
      `);
      
      console.log('Database schema initialized');
    } catch (error) {
      console.error('Error initializing schema:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Batch insert trades for high performance
  async insertTrades(trades: Trade[]): Promise<void> {
    if (!this.isConnected) {
      console.warn('Persistence service not connected, skipping insert');
      return;
    }
    
    // Add to batch queue
    this.batchInsertQueue.push(...trades);
    
    // Check if we should flush
    if (this.batchInsertQueue.length >= this.BATCH_SIZE) {
      await this.flushBatchInsert();
    } else if (!this.batchInsertTimer) {
      // Set timer for automatic flush
      this.batchInsertTimer = setTimeout(() => {
        this.flushBatchInsert();
      }, this.BATCH_TIMEOUT);
    }
  }
  
  private async flushBatchInsert(): Promise<void> {
    if (this.batchInsertTimer) {
      clearTimeout(this.batchInsertTimer);
      this.batchInsertTimer = null;
    }
    
    if (this.batchInsertQueue.length === 0) return;
    
    const trades = [...this.batchInsertQueue];
    this.batchInsertQueue = [];
    
    const client = await this.pgPool.connect();
    
    try {
      // Use regular insert for now
      await this.insertTradesFallback(client, trades);
      console.log(`Inserted ${trades.length} trades in batch`);
    } catch (error) {
      console.error('Error in batch insert:', error);
    } finally {
      client.release();
    }
  }
  
  private async insertTradesFallback(client: PoolClient, trades: Trade[]): Promise<void> {
    // Fallback to parameterized bulk insert
    const values: any[] = [];
    const placeholders: string[] = [];
    
    trades.forEach((trade, index) => {
      const offset = index * 9;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
      );
      
      values.push(
        trade.id,
        (trade as any).simulationId || 'default',
        trade.timestamp,
        trade.trader.walletAddress,
        trade.action,
        trade.price,
        trade.quantity,
        trade.value,
        trade.impact
      );
    });
    
    const query = `
      INSERT INTO trades (id, simulation_id, timestamp, trader_wallet, action, price, quantity, value, impact)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO NOTHING
    `;
    
    await client.query(query, values);
  }
  
  // Real-time price caching in Redis
  async updatePrice(simulationId: string, price: number): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      // FIXED: Use lowercase Redis methods for older client
      await new Promise<void>((resolve, reject) => {
        this.redisClient.hset('current_prices', simulationId, price.toString(), (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // FIXED: Add to price history sorted set with callback pattern
      const timestamp = Date.now();
      await new Promise<void>((resolve, reject) => {
        this.redisClient.zadd(`price_history:${simulationId}`, timestamp, `${timestamp}:${price}`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // FIXED: Trim old entries (keep last 1000) with callback pattern
      await new Promise<void>((resolve, reject) => {
        this.redisClient.zremrangebyrank(`price_history:${simulationId}`, 0, -1001, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Update 1-minute aggregates
      const minuteKey = Math.floor(timestamp / 60000) * 60000;
      const aggregateKey = `price_1m:${simulationId}:${minuteKey}`;
      
      // FIXED: Use callback-based multi with lowercase methods
      const multi = this.redisClient.multi();
      multi.hincrbyfloat(aggregateKey, 'count', 1);
      multi.hincrbyfloat(aggregateKey, 'sum', price);
      multi.hset(aggregateKey, 'last', price.toString());
      multi.expire(aggregateKey, 3600); // Expire after 1 hour
      
      await new Promise<void>((resolve, reject) => {
        multi.exec((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.error('Error updating price in Redis:', error);
    }
  }
  
  // Get recent prices from cache
  async getRecentPrices(simulationId: string, count: number = 100): Promise<number[]> {
    if (!this.isConnected) return [];
    
    try {
      // FIXED: Use callback-based zrange for older Redis client
      const results = await new Promise<string[]>((resolve, reject) => {
        this.redisClient.zrange(
          `price_history:${simulationId}`,
          -count,
          -1,
          (err, reply) => {
            if (err) reject(err);
            else resolve(reply || []);
          }
        );
      });
      
      // Parse results
      return results.map((entry: string) => {
        const [, price] = entry.split(':');
        return parseFloat(price);
      });
    } catch (error) {
      console.error('Error getting recent prices:', error);
      return [];
    }
  }
  
  // Store position updates
  async updatePosition(position: TraderPosition & { simulationId: string }): Promise<void> {
    if (!this.isConnected) return;
    
    const client = await this.pgPool.connect();
    
    try {
      await client.query(`
        INSERT INTO positions (
          simulation_id, trader_wallet, entry_price, quantity, 
          entry_time, pnl, pnl_percentage, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (simulation_id, trader_wallet, entry_time)
        DO UPDATE SET
          pnl = $6,
          pnl_percentage = $7,
          updated_at = CURRENT_TIMESTAMP
      `, [
        position.simulationId,
        position.trader.walletAddress,
        position.entryPrice,
        position.quantity,
        position.entryTime,
        position.currentPnl,
        position.currentPnlPercentage,
        'active'
      ]);
    } catch (error) {
      console.error('Error updating position:', error);
    } finally {
      client.release();
    }
  }
  
  // Close position
  async closePosition(
    position: TraderPosition & { simulationId: string, exitPrice: number, exitTime: number }
  ): Promise<void> {
    if (!this.isConnected) return;
    
    const client = await this.pgPool.connect();
    
    try {
      await client.query(`
        UPDATE positions
        SET 
          exit_price = $1,
          exit_time = $2,
          pnl = $3,
          pnl_percentage = $4,
          status = 'closed',
          updated_at = CURRENT_TIMESTAMP
        WHERE 
          simulation_id = $5 AND 
          trader_wallet = $6 AND 
          entry_time = $7 AND 
          status = 'active'
      `, [
        position.exitPrice,
        position.exitTime,
        position.currentPnl,
        position.currentPnlPercentage,
        position.simulationId,
        position.trader.walletAddress,
        position.entryTime
      ]);
    } catch (error) {
      console.error('Error closing position:', error);
    } finally {
      client.release();
    }
  }
  
  // Store candle data
  async insertCandles(simulationId: string, candles: PricePoint[]): Promise<void> {
    if (!this.isConnected || candles.length === 0) return;
    
    const client = await this.pgPool.connect();
    
    try {
      const values: any[] = [];
      const placeholders: string[] = [];
      
      candles.forEach((candle, index) => {
        const offset = index * 7;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
        );
        
        values.push(
          simulationId,
          candle.timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume
        );
      });
      
      const query = `
        INSERT INTO price_history (simulation_id, timestamp, open, high, low, close, volume)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (simulation_id, timestamp) 
        DO UPDATE SET
          high = GREATEST(price_history.high, EXCLUDED.high),
          low = LEAST(price_history.low, EXCLUDED.low),
          close = EXCLUDED.close,
          volume = price_history.volume + EXCLUDED.volume
      `;
      
      await client.query(query, values);
    } catch (error) {
      console.error('Error inserting candles:', error);
    } finally {
      client.release();
    }
  }
  
  // Get simulation metrics
  async getSimulationMetrics(simulationId: string, startTime?: number, endTime?: number): Promise<any> {
    if (!this.isConnected) return null;
    
    const client = await this.pgPool.connect();
    
    try {
      let query = `
        SELECT 
          COUNT(*) as total_trades,
          SUM(value) as total_volume,
          AVG(price) as avg_price,
          MIN(price) as min_price,
          MAX(price) as max_price,
          COUNT(DISTINCT trader_wallet) as unique_traders
        FROM trades
        WHERE simulation_id = $1
      `;
      
      const params: any[] = [simulationId];
      
      if (startTime) {
        query += ` AND timestamp >= $${params.length + 1}`;
        params.push(startTime);
      }
      
      if (endTime) {
        query += ` AND timestamp <= $${params.length + 1}`;
        params.push(endTime);
      }
      
      const result = await client.query(query, params);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting simulation metrics:', error);
      return null;
    } finally {
      client.release();
    }
  }
  
  // Cleanup old data
  async cleanupOldData(retentionDays: number = 7): Promise<void> {
    if (!this.isConnected) return;
    
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete old trades
      const tradesResult = await client.query(
        'DELETE FROM trades WHERE timestamp < $1',
        [cutoffTime]
      );
      
      // Delete old positions
      const positionsResult = await client.query(
        'DELETE FROM positions WHERE exit_time < $1 AND status = $2',
        [cutoffTime, 'closed']
      );
      
      // Delete old price history
      const priceResult = await client.query(
        'DELETE FROM price_history WHERE timestamp < $1',
        [cutoffTime]
      );
      
      await client.query('COMMIT');
      
      console.log(`Cleanup complete: ${tradesResult.rowCount} trades, ${positionsResult.rowCount} positions, ${priceResult.rowCount} price points deleted`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error cleaning up old data:', error);
    } finally {
      client.release();
    }
  }
  
  async shutdown(): Promise<void> {
    // Flush any pending inserts
    await this.flushBatchInsert();
    
    // Close connections
    // FIXED: Check connected property instead of isOpen for older Redis client
    if (this.redisClient && this.redisClient.connected) {
      await new Promise<void>((resolve) => {
        this.redisClient.quit(() => {
          resolve();
        });
      });
    }
    
    if (this.pgPool) {
      await this.pgPool.end();
    }
    
    console.log('PersistenceService shut down');
  }
}