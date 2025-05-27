// backend/src/types/simulation.ts - Updated to include TokenInfo
export interface PricePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateTime: number;
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
  winRate: number;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  portfolioEfficiency: number;
  simulationPnl?: number;
}

export interface TraderPosition {
  trader: Trader;
  entryPrice: number;
  quantity: number;
  entryTime: number;
  exitPrice?: number;
  exitTime?: number;
  currentPnl: number;
  currentPnlPercentage: number;
}

export type TradeAction = 'buy' | 'sell';

export interface Trade {
  id: string;
  timestamp: number;
  trader: Trader;
  action: TradeAction;
  price: number;
  quantity: number;
  value: number;
  impact: number;
}

export interface SimulationEvent {
  type: string;
  timestamp: number;
  data: any;
}

export interface MarketConditions {
  volatility: number;
  trend: 'bullish' | 'bearish' | 'sideways';
  volume: number;
}

export interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType: string;
}

// New interface for token information
export interface TokenInfo {
  symbol: string;
  name: string;
  totalSupply: number;
  marketCap: number;
}

export interface SimulationState {
  id: string;
  startTime: number;
  currentTime: number;
  endTime: number;
  isRunning: boolean;
  isPaused: boolean;
  parameters: SimulationParameters;
  marketConditions: MarketConditions;
  priceHistory: PricePoint[];
  currentPrice: number;
  orderBook: OrderBook;
  traders: any[]; // This is intentionally loose to accommodate various trader profile formats
  activePositions: TraderPosition[];
  closedPositions: (TraderPosition & { exitPrice: number, exitTime: number })[];
  recentTrades: Trade[];
  traderRankings: Trader[];
  // Add the token info to the simulation state
  tokenInfo?: TokenInfo;
}