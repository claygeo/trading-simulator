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
  // Add other properties as needed
}

class DuneApiClient {
  private client: DuneClient;
  private cachePath: string;
  private cacheTTL: number; // time to live in seconds
  
  constructor() {
    if (!process.env.DUNE_API_KEY) {
      throw new Error('DUNE_API_KEY is required');
    }
    
    this.client = new DuneClient(process.env.DUNE_API_KEY);
    this.cachePath = path.join(__dirname, '../../cache');
    this.cacheTTL = parseInt(process.env.CACHE_TTL || '3600', 10);
    
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
    return path.join(this.cachePath, `query_${queryId}.json`);
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
  
  async getTraderData(): Promise<DuneResult> {
    const queryId = 4436353; // Pump.fun traders query ID
    
    try {
      // Check cache first
      const cachedData = await this.readFromCache<DuneResult>(queryId);
      
      if (this.isCacheValid(cachedData)) {
        console.log('Returning cached data for query', queryId);
        return cachedData!.data; // Add non-null assertion
      }
      
      // If cache is invalid or doesn't exist, fetch from Dune
      console.log('Fetching fresh data from Dune for query', queryId);
      const queryResult = await this.client.getLatestResult({ queryId });
      
      // Cache the result
      await this.writeToCache(queryId, queryResult);
      
      return queryResult as DuneResult;
    } catch (error) {
      console.error('Error fetching data from Dune:', error);
      
      // If fetching fails, try to return potentially stale cache as fallback
      const cachedData = await this.readFromCache<DuneResult>(queryId);
      if (cachedData) {
        console.log('Returning stale cached data as fallback');
        return cachedData.data;
      }
      
      // If no cached data is available, return a default empty result
      return {
        result: {
          rows: [],
          metadata: {}
        }
      };
    }
  }
}

export default new DuneApiClient();