// backend/src/types/simulation.ts - FIXED: Export TraderProfile and add templateInfo
import { Trader, TraderProfile } from './traders';

export { TraderProfile }; // FIXED: Export TraderProfile

export interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number; // in minutes
  scenarioType?: string;
  // REMOVED: templateId - no more template support
}

// REMOVED: AssetTemplate interface - simplified system

export interface MarketConditions {
  volatility: number;
  trend: 'bullish' | 'bearish' | 'sideways';
  volume: number;
}

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
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  value: number;
  impact: number;
}

export interface TraderPosition {
  trader: Trader;
  entryPrice: number;
  quantity: number; // positive for long, negative for short
  entryTime: number;
  currentPnl: number;
  currentPnlPercentage: number;
}

export interface SimulationEvent {
  type: string;
  timestamp: number;
  data: any;
}

export interface TradeAction extends SimulationEvent {
  type: 'trade';
  data: Trade;
}

// REMOVED: TemplateInfo interface - no more template support

export interface SimulationState {
  id: string;
  startTime: number;
  currentTime: number;
  endTime: number;
  isRunning: boolean;
  isPaused: boolean;
  parameters: SimulationParameters;
  marketConditions: MarketConditions;
  priceHistory: PricePoint[]; // Starts empty, fills in real-time
  currentPrice: number;
  orderBook: OrderBook;
  traders: TraderProfile[];
  activePositions: TraderPosition[];
  closedPositions: (TraderPosition & { exitPrice: number; exitTime: number })[];
  recentTrades: Trade[];
  traderRankings: Trader[];
  // FIXED: Add templateInfo property to satisfy routes.ts
  templateInfo?: any;
  _tickCounter?: number;
  lastUpdateTimestamp?: number; // Track last update timestamp
  timestampOffset?: number; // Offset between real time and simulation time
}

// Additional interfaces for the SimulationManager methods
export interface SimulationSummary {
  id: string;
  isRunning: boolean;
  isPaused: boolean;
  currentPrice: number;
  startTime: number;
  currentTime: number;
  endTime: number;
  // REMOVED: templateInfo - no more template support
  parameters: SimulationParameters;
  type: 'real-time'; // Always real-time now
  chartStatus: 'empty-ready' | 'building';
  candleCount: number;
}

export interface TradesResponse {
  trades: Trade[];
  total: number;
  hasMore: boolean;
}

export interface PositionsResponse {
  active: TraderPosition[];
  closed: (TraderPosition & { exitPrice: number; exitTime: number })[];
}