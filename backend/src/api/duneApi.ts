import { DuneClient } from "@duneanalytics/client-sdk";
import dotenv from 'dotenv';

dotenv.config();

class DuneApiClient {
  private client: DuneClient;
  
  constructor() {
    if (!process.env.DUNE_API_KEY) {
      throw new Error('DUNE_API_KEY is required');
    }
    
    this.client = new DuneClient(process.env.DUNE_API_KEY);
  }
  
  async getTraderData() {
    try {
      // Query ID for the pump.fun traders query
      const queryResult = await this.client.getLatestResult({ queryId: 4436353 });
      return queryResult;
    } catch (error) {
      console.error('Error fetching data from Dune:', error);
      throw error;
    }
  }
}

export default new DuneApiClient();