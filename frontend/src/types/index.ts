// frontend/src/types/index.ts - Simplified without Template System
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

export interface TraderProfile {
  trader: Trader;
  entryThreshold: number;
  exitProfitThreshold: number;
  exitLossThreshold: number;
  positionSizing: number;
  holdingPeriod: {
    min: number;
    max: number;
    distribution: 'normal' | 'exponential';
  };
  tradingFrequency: number;
  sentimentSensitivity: number;
}

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

export interface Trade {
  id: string;
  timestamp: number;
  trader: Trader;
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  value: number;
  impact: number;
}

export interface TraderPosition {
  trader: Trader;
  entryPrice: number;
  quantity: number;
  entryTime: number;
  currentPnl: number;
  currentPnlPercentage: number;
  exitPrice?: number;
  exitTime?: number;
}

// SIMPLIFIED: Parameters without template complexity
export interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType: 'standard' | 'volatility_challenge' | 'black_swan' | 'volume_drought' | 'trend_reversal';
}

export interface MarketConditions {
  volatility: number;
  trend: 'bullish' | 'bearish' | 'sideways';
  volume: number;
}

// SIMPLIFIED: Simulation without template metadata
export interface Simulation {
  id: string;
  startTime: number;
  currentTime: number;
  endTime: number;
  isRunning: boolean;
  isPaused: boolean;
  parameters: SimulationParameters;
  marketConditions?: MarketConditions;
  currentPrice: number;
  priceHistory: PricePoint[];
  orderBook: OrderBook;
  traders: TraderProfile[];
  activePositions: TraderPosition[];
  closedPositions: TraderPosition[];
  recentTrades: Trade[];
  traderRankings: Trader[];
}

export interface WebSocketEvent {
  type: 'price_update' | 'trade' | 'position_open' | 'position_close' | 'market_event' | 'simulation_state';
  timestamp: number;
  data: any;
}

// SIMPLIFIED: Basic simulation creation state
export interface SimulationCreationState {
  parameters: Partial<SimulationParameters>;
  loading: boolean;
  error: string | null;
}