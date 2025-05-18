// backend/src/types/simulation.ts
import { Trader, TraderProfile } from './traders';

export type MarketTrend = 'bullish' | 'bearish' | 'sideways';

export interface MarketConditions {
  volatility: number; // 0-1 scale
  trend: MarketTrend;
  volume: number; // Base volume in USD
}

export interface SimulationParameters {
  timeCompressionFactor: number; // How many real seconds = 1 simulated day
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number; // Multiplier on base volatility
  duration: number; // In simulated minutes
  scenarioType: SimulationScenario;
  randomSeed?: number; // For reproducible simulations
}

export type SimulationScenario = 
  'standard' | 
  'volatility_challenge' | 
  'black_swan' | 
  'volume_drought' | 
  'trend_reversal';

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
  bids: OrderBookLevel[]; // Buy orders, sorted by price desc
  asks: OrderBookLevel[]; // Sell orders, sorted by price asc
  lastUpdateTime: number;
}

export type TradeAction = 'buy' | 'sell';

export interface Trade {
  id: string;
  timestamp: number;
  trader: Trader;
  action: TradeAction;
  price: number;
  quantity: number;
  value: number; // price * quantity
  impact: number; // How much this moved the price
}

export interface TraderPosition {
  trader: Trader;
  entryPrice: number;
  quantity: number;
  entryTime: number;
  currentPnl: number;
  currentPnlPercentage: number;
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
  closedPositions: TraderPosition[];
  recentTrades: Trade[];
  traderRankings: Trader[]; // Sorted by performance
}

export interface SimulationEvent {
  type: 'price_update' | 'trade' | 'position_open' | 'position_close' | 'market_event';
  timestamp: number;
  data: any;
}