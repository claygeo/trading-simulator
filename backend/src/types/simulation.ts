// backend/src/types/simulation.ts
import { Trader, TraderProfile } from './traders';

export interface PricePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  action: TradeAction;
  price: number;
  quantity: number;
  value: number;
  impact: number;
}

export type TradeAction = 'buy' | 'sell';

export interface TraderPosition {
  trader: Trader;
  entryPrice: number;
  quantity: number; // positive for long, negative for short
  entryTime: number;
  currentPnl: number;
  currentPnlPercentage: number;
}

export interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number; // in minutes
  scenarioType?: string;
}

export interface MarketConditions {
  volatility: number;
  trend: 'bullish' | 'bearish' | 'sideways';
  volume: number;
}

export interface SimulationEvent {
  type: string;
  timestamp: number;
  data: any;
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
  traders: TraderProfile[];
  activePositions: TraderPosition[];
  closedPositions: (TraderPosition & { exitPrice: number; exitTime: number })[];
  recentTrades: Trade[];
  traderRankings: Trader[];
}