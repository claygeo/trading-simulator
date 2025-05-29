// backend/src/services/persistenceService.ts
import { Pool, PoolClient } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { Trade, TraderPosition, PricePoint } from '../types';

export class PersistenceService {
  private pgPool: Pool;
  private redisClient: RedisClientType;
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
      }) as RedisClientType;
      
      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });
      
      await this.redisClient.connect();
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_simulation_timestamp (simulation_id, timestamp),
          INDEX idx_trader_wallet (trader_wallet)
        );
        
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
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_simulation_status (simulation_id, status),
          INDEX idx_trader_positions (trader_wallet, status)
        );
        
        CREATE TABLE IF NOT EXISTS price_history (
          simulation_id UUID NOT NULL,
          timestamp BIGINT NOT NULL,
          open DECIMAL(20, 8) NOT NULL,
          high DECIMAL(20, 8) NOT NULL,
          low DECIMAL(20, 8) NOT NULL,
          close DECIMAL(20, 8) NOT NULL,
          volume DECIMAL(20, 8) NOT NULL,
          PRIMARY KEY (simulation_id, timestamp),
          INDEX idx_simulation_time (simulation_id, timestamp DESC)
        );
        
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
      // Use COPY for ultra-fast bulk insert
      const copyQuery = `
        COPY trades (id, simulation_id, timestamp, trader_wallet, action, price, quantity, value, impact)
        FROM STDIN WITH (FORMAT csv)
      `;
      
      const stream = client.query(copyQuery);
      
      for (const trade of trades) {
        const row = [
          trade.id,
          (trade as any).simulationId || 'default',
          trade.timestamp,
          trade.trader.walletAddress,
          trade.action,
          trade.price,
          trade.quantity,
          trade.value,
          trade.impact
        ].join(',');
        
        stream.write(row + '\n');
      }
      
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
        stream.end();
      });
      
      console.log(`Inserted ${trades.length} trades in batch`);
    } catch (error) {
      console.error('Error in batch insert:', error);
      
      // Fallback to regular insert
      await this.insertTradesFallback(client, trades);
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
      // Update current price
      await this.redisClient.hSet('current_prices', simulationId, price.toString());
      
      // Add to price history sorted set
      const timestamp = Date.now();
      await this.redisClient.zAdd(`price_history:${simulationId}`, {
        score: timestamp,
        value: `${timestamp}:${price}`
      });
      
      // Trim old entries (keep last 1000)
      await this.redisClient.zRemRangeByRank(`price_history:${simulationId}`, 0, -1001);
      
      // Update 1-minute aggregates
      const minuteKey = Math.floor(timestamp / 60000) * 60000;
      const aggregateKey = `price_1m:${simulationId}:${minuteKey}`;
      
      await this.redisClient.multi()
        .hIncrByFloat(aggregateKey, 'count', 1)
        .hIncrByFloat(aggregateKey, 'sum', price)
        .hSet(aggregateKey, 'last', price.toString())
        .expire(aggregateKey, 3600) // Expire after 1 hour
        .exec();
    } catch (error) {
      console.error('Error updating price in Redis:', error);
    }
  }
  
  // Get recent prices from cache
  async getRecentPrices(simulationId: string, count: number = 100): Promise<number[]> {
    if (!this.isConnected) return [];
    
    try {
      const results = await this.redisClient.zRange(
        `price_history:${simulationId}`,
        -count,
        -1
      );
      
      return results.map(entry => {
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
        const offset = index * 6;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
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
      const query = `
        SELECT 
          COUNT(*) as total_trades,
          SUM(value) as total_volume,
          AVG(price) as avg_price,
          MIN(price) as min_price,
          MAX(price) as max_price,
          COUNT(DISTINCT trader_wallet) as unique_traders
        FROM trades
        WHERE simulation_id = $1
        ${startTime ? 'AND timestamp >= $2' : ''}
        ${endTime ? 'AND timestamp <= $3' : ''}
      `;
      
      const params = [simulationId];
      if (startTime) params.push(startTime.toString());
      if (endTime) params.push(endTime.toString());
      
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
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    
    if (this.pgPool) {
      await this.pgPool.end();
    }
    
    console.log('PersistenceService shut down');
  }
}