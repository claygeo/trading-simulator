// backend/src/api/duneApi.ts - ENHANCED WITH DEBUG LOGGING
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
    console.log('🔧 [DUNE] Initializing DuneApiClient...');
    
    const duneApiKey = process.env.DUNE_API_KEY;
    
    if (!duneApiKey) {
      console.error('❌ [DUNE] DUNE_API_KEY is not set in environment variables');
      throw new Error('DUNE_API_KEY is required');
    }
    
    // Log API key status (safely)
    console.log(`✅ [DUNE] API Key found: ${duneApiKey.slice(0, 8)}...${duneApiKey.slice(-4)}`);
    
    this.client = new DuneClient(duneApiKey);
    this.cachePath = path.join(__dirname, '../../cache');
    this.cacheTTL = parseInt(process.env.CACHE_TTL || '3600', 10); // Default: 1 hour
    
    console.log(`📁 [DUNE] Cache path: ${this.cachePath}`);
    console.log(`⏰ [DUNE] Cache TTL: ${this.cacheTTL} seconds`);
    
    // Ensure cache directory exists
    this.ensureCacheDirectory();
  }
  
  private async ensureCacheDirectory() {
    try {
      await fs.mkdir(this.cachePath, { recursive: true });
      console.log(`✅ [DUNE] Cache directory ensured: ${this.cachePath}`);
    } catch (error) {
      console.error('❌ [DUNE] Failed to create cache directory:', error);
    }
  }
  
  private getCacheFilePath(queryId: number): string {
    return path.join(this.cachePath, `dune_query_${queryId}.json`);
  }
  
  private async readFromCache<T>(queryId: number): Promise<CacheEntry<T> | null> {
    try {
      const filePath = this.getCacheFilePath(queryId);
      console.log(`📖 [DUNE] Attempting to read cache: ${filePath}`);
      
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data) as CacheEntry<T>;
      
      const ageInSeconds = (Date.now() - parsed.timestamp) / 1000;
      console.log(`📖 [DUNE] Cache found - Age: ${ageInSeconds.toFixed(0)}s, TTL: ${this.cacheTTL}s`);
      
      return parsed;
    } catch (error) {
      console.log(`📖 [DUNE] No cache found for query ${queryId}:`, error instanceof Error ? error.message : 'Unknown error');
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
      console.log(`💾 [DUNE] Data cached successfully: ${filePath}`);
    } catch (error) {
      console.error('❌ [DUNE] Failed to write to cache:', error);
    }
  }
  
  private isCacheValid<T>(cacheEntry: CacheEntry<T> | null): boolean {
    if (!cacheEntry) {
      console.log(`⏰ [DUNE] Cache validation: No cache entry`);
      return false;
    }
    
    const ageInSeconds = (Date.now() - cacheEntry.timestamp) / 1000;
    const isValid = ageInSeconds < this.cacheTTL;
    
    console.log(`⏰ [DUNE] Cache validation: Age ${ageInSeconds.toFixed(0)}s, Valid: ${isValid}`);
    return isValid;
  }
  
  /**
   * Fetch data for Pump.fun traders from Dune Analytics
   * FIXED: Using query ID 5153154 for top 118 traders
   */
  async getPumpFunTraders(): Promise<PumpFunTrader[]> {
    const queryId = 5153154; // FIXED: Updated query ID from 5152781 to 5153154
    
    console.log(`🚀 [DUNE] Starting getPumpFunTraders() with query ID: ${queryId}`);
    
    try {
      // Check cache first
      console.log(`🔍 [DUNE] Checking cache for query ${queryId}...`);
      const cachedData = await this.readFromCache<DuneResult>(queryId);
      
      if (this.isCacheValid(cachedData)) {
        console.log(`✅ [DUNE] Using CACHED data for Pump.fun traders (query ID: ${queryId})`);
        const traders = this.transformTraderData(cachedData!.data);
        console.log(`📊 [DUNE] CACHED: Returning ${traders.length} traders`);
        return traders;
      }
      
      // Cache is invalid or doesn't exist, fetch from Dune
      console.log(`🌐 [DUNE] Cache invalid/missing - Fetching FRESH data from Dune Analytics...`);
      console.log(`🌐 [DUNE] Query URL: https://dune.com/queries/${queryId}`);
      console.log(`⏳ [DUNE] API call starting...`);
      
      const startTime = Date.now();
      const queryResult = await this.client.getLatestResult({ queryId });
      const duration = Date.now() - startTime;
      
      console.log(`✅ [DUNE] API call completed in ${duration}ms`);
      console.log(`📊 [DUNE] Raw result structure:`, {
        hasResult: !!queryResult.result,
        hasRows: !!queryResult.result?.rows,
        rowCount: queryResult.result?.rows?.length || 0,
        hasMetadata: !!queryResult.result?.metadata
      });
      
      // Log first few rows for debugging
      if (queryResult.result?.rows?.length > 0) {
        console.log(`📋 [DUNE] First row sample:`, JSON.stringify(queryResult.result.rows[0], null, 2));
        console.log(`📋 [DUNE] Column names:`, Object.keys(queryResult.result.rows[0]));
      } else {
        console.warn(`⚠️ [DUNE] No rows returned from query ${queryId}`);
      }
      
      // Cache the result
      console.log(`💾 [DUNE] Caching result...`);
      await this.writeToCache(queryId, queryResult);
      
      const traders = this.transformTraderData(queryResult as DuneResult);
      console.log(`📊 [DUNE] FRESH: Returning ${traders.length} traders`);
      
      return traders;
      
    } catch (error) {
      console.error(`❌ [DUNE] ERROR fetching data from Dune Analytics:`, error);
      console.error(`❌ [DUNE] Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        queryId: queryId
      });
      
      // If fetching fails, try to return potentially stale cache as fallback
      console.log(`🔄 [DUNE] Attempting fallback to stale cache...`);
      const cachedData = await this.readFromCache<DuneResult>(queryId);
      
      if (cachedData) {
        console.log(`⚠️ [DUNE] Using STALE cached data as fallback`);
        const traders = this.transformTraderData(cachedData.data);
        console.log(`📊 [DUNE] STALE FALLBACK: Returning ${traders.length} traders`);
        return traders;
      }
      
      // If no cached data is available, return an empty array
      console.error(`💥 [DUNE] CRITICAL: No cached data available - returning EMPTY array`);
      console.error(`💥 [DUNE] This will cause simulation to use dummy traders!`);
      return [];
    }
  }
  
  /**
   * Backwards compatibility method for existing code
   */
  async getTraderData(): Promise<DuneResult> {
    console.log(`🔄 [DUNE] getTraderData() called (backwards compatibility)`);
    
    const traders = await this.getPumpFunTraders();
    
    // If no traders were found, return an empty result
    if (!traders || traders.length === 0) {
      console.warn(`⚠️ [DUNE] getTraderData() returning empty result - NO TRADERS FOUND`);
      return {
        result: {
          rows: [],
          metadata: {}
        }
      };
    }
    
    console.log(`📊 [DUNE] getTraderData() converting ${traders.length} traders to legacy format`);
    
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
    
    console.log(`✅ [DUNE] getTraderData() returning ${rows.length} rows in legacy format`);
    
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
    console.log(`🔄 [DUNE] Transforming trader data...`);
    
    if (!data || !data.result || !Array.isArray(data.result.rows)) {
      console.error(`❌ [DUNE] Invalid data format from Dune API:`, {
        hasData: !!data,
        hasResult: !!data?.result,
        hasRows: !!data?.result?.rows,
        isRowsArray: Array.isArray(data?.result?.rows)
      });
      return [];
    }
    
    console.log(`📊 [DUNE] Raw data has ${data.result.rows.length} rows`);
    
    try {
      // Map the raw data to our PumpFunTrader interface
      const traders = data.result.rows.map((row: any, index: number) => {
        const trader: PumpFunTrader = {
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
        };
        
        // Log first few traders for debugging
        if (index < 3) {
          console.log(`👤 [DUNE] Trader ${index + 1}:`, {
            wallet: trader.wallet_address.slice(0, 8) + '...',
            net_pnl: trader.net_pnl,
            total_volume: trader.total_volume,
            trade_count: trader.trade_count
          });
        }
        
        return trader;
      });
      
      console.log(`✅ [DUNE] Successfully transformed ${traders.length} traders`);
      
      // Log summary stats
      const totalVolume = traders.reduce((sum, t) => sum + t.total_volume, 0);
      const totalTrades = traders.reduce((sum, t) => sum + t.trade_count, 0);
      console.log(`📊 [DUNE] Summary: Total Volume: $${totalVolume.toLocaleString()}, Total Trades: ${totalTrades}`);
      
      return traders;
      
    } catch (error) {
      console.error(`❌ [DUNE] Error transforming trader data:`, error);
      console.error(`❌ [DUNE] Sample row that caused error:`, data.result.rows[0]);
      return [];
    }
  }
  
  // Helper function to extract wallet address from HTML link
  private extractWalletAddress(walletHtml: string): string {
    if (!walletHtml) {
      console.warn(`⚠️ [DUNE] Empty wallet HTML provided`);
      return 'unknown';
    }
    
    const match = walletHtml.match(/>([A-Za-z0-9]+)</);
    const result = match ? match[1] : walletHtml;
    
    if (!match) {
      console.log(`🔍 [DUNE] No HTML wallet format detected, using raw value: ${walletHtml.slice(0, 8)}...`);
    }
    
    return result;
  }
  
  /**
   * DEBUG: Method to test API connectivity
   */
  async testConnection(): Promise<void> {
    console.log(`🧪 [DUNE] Testing API connection...`);
    
    try {
      const startTime = Date.now();
      const result = await this.client.getLatestResult({ queryId: 5153154 });
      const duration = Date.now() - startTime;
      
      console.log(`✅ [DUNE] Connection test SUCCESS - ${duration}ms`);
      console.log(`📊 [DUNE] Test result: ${result.result?.rows?.length || 0} rows`);
      
    } catch (error) {
      console.error(`❌ [DUNE] Connection test FAILED:`, error);
    }
  }
}

// Create and export singleton instance
const duneApiClient = new DuneApiClient();

// Log initialization status
console.log(`🚀 [DUNE] DuneApiClient singleton created and ready`);

export default duneApiClient;