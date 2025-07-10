// backend/src/types/simulation.ts - FIXED: Export TraderProfile and add TPS support
import { Trader, TraderProfile } from './traders';

export { TraderProfile }; // FIXED: Export TraderProfile

// NEW: TPS Mode enumeration for stress testing
export enum TPSMode {
  NORMAL = 'NORMAL',   // 10 TPS - Market makers & retail traders
  BURST = 'BURST',     // 100 TPS - Increased retail & arbitrage activity  
  STRESS = 'STRESS',   // 1K TPS - Panic sellers & MEV bots
  HFT = 'HFT'          // 10K TPS - MEV bots, whales & arbitrage
}

// NEW: External trader types for stress testing
export enum ExternalTraderType {
  ARBITRAGE_BOT = 'ARBITRAGE_BOT',
  RETAIL_TRADER = 'RETAIL_TRADER', 
  MARKET_MAKER = 'MARKET_MAKER',
  MEV_BOT = 'MEV_BOT',
  WHALE = 'WHALE',
  PANIC_SELLER = 'PANIC_SELLER'
}

// NEW: External order interface for stress testing
export interface ExternalOrder {
  id: string;
  timestamp: number;
  traderType: ExternalTraderType;
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  priority: number;
  strategy: string;
}

// NEW: External market engine interface
export interface IExternalMarketEngine {
  setTPSMode(mode: TPSMode): void;
  generateExternalOrders(simulation: SimulationState): ExternalOrder[];
  processExternalOrders(simulation: SimulationState): Trade[];
  detectMEVOpportunity(simulation: SimulationState, pendingOrder: any): ExternalOrder | null;
  triggerLiquidationCascade(simulation: SimulationState): ExternalOrder[];
  getMarketPressureMetrics(): {
    currentTPS: number;
    queueDepth: number;
    dominantTraderType: ExternalTraderType;
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
  };
  cleanup(): void;
}

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
  
  // NEW: Stress testing properties
  tpsMode?: TPSMode; // Current TPS mode
  externalMarketEngine?: IExternalMarketEngine; // External market engine for stress testing
  externalMarketMetrics?: {
    currentTPS: number;
    queueDepth: number;
    dominantTraderType: ExternalTraderType;
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
    totalExternalOrders: number;
    successfulExecutions: number;
  };
  tpsMetrics?: {
    targetTPS: number;
    actualTPS: number;
    peakTPS: number;
    averageTPS: number;
    totalOrdersProcessed: number;
    marketPressureLevel: 'low' | 'medium' | 'high' | 'extreme';
  };
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
  // NEW: Stress testing summary fields
  tpsMode?: TPSMode;
  currentTPS?: number;
  marketPressure?: 'low' | 'medium' | 'high' | 'extreme';
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

// NEW: TPS mode change result interface
export interface TPSModeChangeResult {
  success: boolean;
  error?: string;
  previousMode?: TPSMode;
  newMode?: TPSMode;
  metrics?: {
    targetTPS: number;
    estimatedImpact: string;
    traderTypesActivated: ExternalTraderType[];
  };
}

// NEW: Liquidation cascade result interface
export interface LiquidationCascadeResult {
  success: boolean;
  error?: string;
  ordersGenerated?: number;
  estimatedImpact?: {
    priceDropPercentage: number;
    volumeImpact: number;
    timeToExecute: number;
  };
}