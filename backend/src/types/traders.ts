// backend/src/types/traders.ts - FIXED: Added missing properties
export interface RawTrader {
  position: number;
  wallet: string;
  net_pnl: number;
  total_volume: number;
  buy_volume: number;
  sell_volume: number;
  bullx_portfolio: string;
  trade_count: number;
  fees_usd: number;
}

export interface Trader {
  position: number;
  walletAddress: string;
  netPnl: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  tradeCount: number;
  feesUsd: number;
  // FIXED: Added missing properties
  avatarUrl?: string;
  preferredName?: string;
  // Derived metrics
  winRate: number;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  portfolioEfficiency: number; // PnL relative to volume
  simulationPnl?: number;
}

export interface TraderProfile {
  trader: Trader;
  entryThreshold: number;       // Price deviation triggering entry
  exitProfitThreshold: number;  // Take profit percentage
  exitLossThreshold: number;    // Stop loss percentage
  positionSizing: 'conservative' | 'moderate' | 'aggressive';
  holdingPeriod: {
    min: number;
    max: number;
    distribution: 'normal' | 'exponential';
  };
  tradingFrequency: number;     // 0-1 scale of activity
  sentimentSensitivity: number; // How much market sentiment affects decisions
  strategy: 'scalper' | 'swing' | 'momentum' | 'contrarian';
  // Additional properties for better simulation
  stopLoss: number;
  takeProfit: number;
}