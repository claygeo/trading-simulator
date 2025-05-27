// backend/src/api/duneApi.ts
import { DuneClient } from "@duneanalytics/client-sdk";
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

interface DuneResult {
  result: {
    rows: any[];
    metadata: any;
  };
}

interface PumpFunTrader {
  position: number;
  wallet_address: string;
  net_pnl: number;
  total_volume: number;
  buy_volume: number;
  sell_volume: number;
  trade_count: number;
  fees_usd: number;
  win_rate: number;
  avg_trade_size: number;
  largest_trade: number;
  last_active: string;
}

class DuneApiClient {
  private client: DuneClient;
  private cachePath: string;
  private cacheTTL: number; // time to live in seconds
  
  constructor() {
    const duneApiKey = process.env.DUNE_API_KEY;
    
    if (!duneApiKey) {
      console.error('DUNE_API_KEY is not set in environment variables');
      throw new Error('DUNE_API_KEY is required');
    }
    
    this.client = new DuneClient(duneApiKey);
    this.cachePath = path.join(__dirname, '../../cache');
    this.cacheTTL = parseInt(process.env.CACHE_TTL || '3600', 10); // Default: 1 hour
    
    // Ensure cache directory exists
    this.ensureCacheDirectory();
  }
  
  private async ensureCacheDirectory() {
    try {
      await fs.mkdir(this.cachePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create cache directory:', error);
    }
  }
  
  private getCacheFilePath(queryId: number): string {
    return path.join(this.cachePath, `dune_query_${queryId}.json`);
  }
  
  private async readFromCache<T>(queryId: number): Promise<CacheEntry<T> | null> {
    try {
      const filePath = this.getCacheFilePath(queryId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as CacheEntry<T>;
    } catch (error) {
      return null;
    }
  }
  
  private async writeToCache<T>(queryId: number, data: T): Promise<void> {
    try {
      const filePath = this.getCacheFilePath(queryId);
      const cacheEntry: CacheEntry<T> = {
        timestamp: Date.now(),
        data,
      };
      await fs.writeFile(filePath, JSON.stringify(cacheEntry), 'utf-8');
    } catch (error) {
      console.error('Failed to write to cache:', error);
    }
  }
  
  private isCacheValid<T>(cacheEntry: CacheEntry<T> | null): boolean {
    if (!cacheEntry) return false;
    
    const ageInSeconds = (Date.now() - cacheEntry.timestamp) / 1000;
    return ageInSeconds < this.cacheTTL;
  }
  
  /**
   * Fetch data for Pump.fun traders from Dune Analytics
   * Using query ID 5152781 for top 118 traders
   */
  async getPumpFunTraders(): Promise<PumpFunTrader[]> {
    const queryId = 5152781; // Query ID for Pump.fun top traders
    
    try {
      // Check cache first
      const cachedData = await this.readFromCache<DuneResult>(queryId);
      
      if (this.isCacheValid(cachedData)) {
        console.log('Using cached data for Pump.fun traders (query ID:', queryId, ')');
        return this.transformTraderData(cachedData!.data);
      }
      
      // Cache is invalid or doesn't exist, fetch from Dune
      console.log('Fetching fresh data from Dune Analytics for Pump.fun traders (query ID:', queryId, ')');
      
      const queryResult = await this.client.getLatestResult({ queryId });
      
      // Cache the result
      await this.writeToCache(queryId, queryResult);
      
      return this.transformTraderData(queryResult as DuneResult);
    } catch (error) {
      console.error('Error fetching data from Dune Analytics:', error);
      
      // If fetching fails, try to return potentially stale cache as fallback
      const cachedData = await this.readFromCache<DuneResult>(queryId);
      if (cachedData) {
        console.log('Using stale cached data as fallback');
        return this.transformTraderData(cachedData.data);
      }
      
      // If no cached data is available, return an empty array
      console.error('No cached data available, returning empty array');
      return [];
    }
  }
  
  /**
   * Backwards compatibility method for existing code
   */
  async getTraderData(): Promise<DuneResult> {
    const traders = await this.getPumpFunTraders();
    
    // If no traders were found, return an empty result
    if (!traders || traders.length === 0) {
      return {
        result: {
          rows: [],
          metadata: {}
        }
      };
    }
    
    // Convert the trader data back to a format compatible with the old API
    const rows = traders.map(trader => ({
      position: trader.position,
      wallet: `<a href="https://neo.bullx.io/portfolio/${trader.wallet_address}">${trader.wallet_address}</a>`,
      net_pnl: trader.net_pnl,
      total_volume: trader.total_volume,
      buy_volume: trader.buy_volume,
      sell_volume: trader.sell_volume,
      bullx_portfolio: `<a href="https://neo.bullx.io/portfolio/${trader.wallet_address}">Portfolio</a>`,
      trade_count: trader.trade_count,
      fees_usd: trader.fees_usd,
      win_rate: trader.win_rate,
      avg_trade_size: trader.avg_trade_size
    }));
    
    return {
      result: {
        rows,
        metadata: {
          column_names: [
            'position', 'wallet', 'net_pnl', 'total_volume', 'buy_volume', 
            'sell_volume', 'bullx_portfolio', 'trade_count', 'fees_usd',
            'win_rate', 'avg_trade_size'
          ]
        }
      }
    };
  }
  
  /**
   * Transform the raw data from Dune into a more usable format
   */
  private transformTraderData(data: DuneResult): PumpFunTrader[] {
    if (!data || !data.result || !Array.isArray(data.result.rows)) {
      console.error('Invalid data format from Dune API');
      return [];
    }
    
    try {
      // Map the raw data to our PumpFunTrader interface
      return data.result.rows.map((row: any, index: number) => ({
        position: index + 1,
        wallet_address: row.wallet_address || this.extractWalletAddress(row.wallet || ''),
        net_pnl: parseFloat(row.net_pnl) || 0,
        total_volume: parseFloat(row.total_volume) || 0,
        buy_volume: parseFloat(row.buy_volume) || 0,
        sell_volume: parseFloat(row.sell_volume) || 0,
        trade_count: parseInt(row.trade_count, 10) || 0,
        fees_usd: parseFloat(row.fees_usd) || 0,
        win_rate: parseFloat(row.win_rate) || 0,
        avg_trade_size: parseFloat(row.avg_trade_size) || row.total_volume / (row.trade_count || 1),
        largest_trade: parseFloat(row.largest_trade) || 0,
        last_active: row.last_active || 'unknown'
      }));
    } catch (error) {
      console.error('Error transforming trader data:', error);
      return [];
    }
  }
  
  // Helper function to extract wallet address from HTML link
  private extractWalletAddress(walletHtml: string): string {
    const match = walletHtml.match(/>([A-Za-z0-9]+)</);
    return match ? match[1] : walletHtml;
  }
}

export default new DuneApiClient();