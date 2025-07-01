// backend/src/services/traderService.ts - FIXED: positionSizing type
import { RawTrader, Trader, TraderProfile } from '../types/traders';

export class TraderService {
  transformRawTraders(rawTraders: RawTrader[]): Trader[] {
    return rawTraders.map(raw => {
      // Calculate derived metrics
      const winRate = this.calculateWinRate(raw);
      const riskProfile = this.determineRiskProfile(raw);
      const portfolioEfficiency = this.calculatePortfolioEfficiency(raw);
      
      // Remove HTML links from wallet address
      const walletAddress = this.extractWalletAddress(raw.wallet);
      
      return {
        position: raw.position,
        walletAddress,
        netPnl: raw.net_pnl,
        totalVolume: raw.total_volume,
        buyVolume: raw.buy_volume,
        sellVolume: raw.sell_volume,
        tradeCount: raw.trade_count,
        feesUsd: raw.fees_usd,
        winRate,
        riskProfile,
        portfolioEfficiency
      };
    });
  }
  
  extractWalletAddress(walletHtml: string): string {
    // Extract wallet address from HTML link
    const match = walletHtml.match(/>([A-Za-z0-9]+)</);
    return match ? match[1] : walletHtml;
  }
  
  calculateWinRate(raw: RawTrader): number {
    // Estimate win rate based on net PnL and trade count
    // This is a simplification; in reality, we'd need trade-by-trade data
    if (raw.trade_count === 0) return 0;
    
    const estimatedWinRate = raw.net_pnl > 0 
      ? 0.5 + (Math.min(raw.net_pnl / raw.total_volume, 0.5) * 0.5)
      : 0.5 - (Math.min(Math.abs(raw.net_pnl) / raw.total_volume, 0.5) * 0.5);
    
    return Math.max(0, Math.min(1, estimatedWinRate));
  }
  
  determineRiskProfile(raw: RawTrader): 'conservative' | 'moderate' | 'aggressive' {
    // Determine risk profile based on trading behavior
    const buyToSellRatio = raw.buy_volume / (raw.sell_volume || 1);
    const volumePerTrade = raw.total_volume / (raw.trade_count || 1);
    const feePercentage = raw.fees_usd / (raw.total_volume || 1);
    
    // Higher scores = more aggressive
    let riskScore = 0;
    
    // More balanced buy/sell ratio = more conservative
    if (buyToSellRatio > 0.8 && buyToSellRatio < 1.2) {
      riskScore += 1;
    } else if (buyToSellRatio > 0.5 && buyToSellRatio < 1.5) {
      riskScore += 2;
    } else {
      riskScore += 3;
    }
    
    // Higher volume per trade = more aggressive
    if (volumePerTrade > 10000) {
      riskScore += 3;
    } else if (volumePerTrade > 5000) {
      riskScore += 2;
    } else {
      riskScore += 1;
    }
    
    // Higher fee percentage = more aggressive (more frequent trading)
    if (feePercentage > 0.005) {
      riskScore += 3;
    } else if (feePercentage > 0.002) {
      riskScore += 2;
    } else {
      riskScore += 1;
    }
    
    // Categorize based on total score
    if (riskScore <= 4) return 'conservative';
    if (riskScore <= 7) return 'moderate';
    return 'aggressive';
  }
  
  calculatePortfolioEfficiency(raw: RawTrader): number {
    if (raw.total_volume === 0) return 0;
    return raw.net_pnl / raw.total_volume;
  }
  
  generateTraderProfiles(traders: Trader[]): TraderProfile[] {
    return traders.map(trader => {
      // Generate profile based on trader metrics
      const profile = this.createTraderProfile(trader);
      return {
        trader,
        ...profile
      };
    });
  }
  
  private createTraderProfile(trader: Trader): Omit<TraderProfile, 'trader'> {
    // The values here are derived from the trader's historical performance
    // In a real system, these would be calculated through more sophisticated analysis
    
    // More aggressive traders have higher thresholds and position sizing
    const aggressionFactor = trader.riskProfile === 'aggressive' ? 1 :
                            trader.riskProfile === 'moderate' ? 0.7 : 0.4;
    
    // Successful traders have more favorable risk/reward
    const successFactor = trader.winRate;
    
    return {
      entryThreshold: 0.005 + (aggressionFactor * 0.02),
      exitProfitThreshold: 0.01 + (successFactor * 0.04),
      exitLossThreshold: 0.005 + (aggressionFactor * 0.025),
      // FIXED: positionSizing should be string type, not number
      positionSizing: trader.riskProfile, // Use the riskProfile directly as it's already the correct type
      holdingPeriod: {
        min: 10 * (1 - aggressionFactor), // minutes
        max: 60 * (2 - aggressionFactor), // minutes
        distribution: trader.riskProfile === 'conservative' ? 'normal' : 'exponential'
      },
      tradingFrequency: 0.2 + (aggressionFactor * 0.6),
      sentimentSensitivity: 0.3 + (aggressionFactor * 0.5),
      // FIXED: Add missing strategy property
      strategy: this.determineStrategy(trader),
      // FIXED: Add missing stopLoss and takeProfit properties
      stopLoss: 0.02 + (aggressionFactor * 0.03), // 2-5% stop loss
      takeProfit: 0.03 + (successFactor * 0.07) // 3-10% take profit
    };
  }
  
  // FIXED: Add missing strategy determination method
  private determineStrategy(trader: Trader): 'scalper' | 'swing' | 'momentum' | 'contrarian' {
    const { riskProfile, winRate, portfolioEfficiency } = trader;
    
    // Determine strategy based on trader characteristics
    if (riskProfile === 'aggressive' && winRate > 0.6) {
      return 'scalper'; // High-frequency, aggressive traders
    } else if (portfolioEfficiency > 0.1) {
      return 'momentum'; // Efficient traders who follow trends
    } else if (winRate < 0.4) {
      return 'contrarian'; // Traders who bet against the trend
    } else {
      return 'swing'; // Default swing trading strategy
    }
  }
}

export default new TraderService();