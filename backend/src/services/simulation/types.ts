// backend/src/services/simulation/types.ts - COMPLETE INTERFACE DEFINITIONS FOR ULTRA-FAST MODE
import { TraderProfile } from '../../types/traders';

// Export TraderProfile from main types
export { TraderProfile };

// TPSMode enum with UPPERCASE values
export enum TPSMode {
  NORMAL = 'NORMAL',
  BURST = 'BURST', 
  STRESS = 'STRESS',
  HFT = 'HFT'
}

// ExternalTraderType enum
export enum ExternalTraderType {
  ARBITRAGE_BOT = 'ARBITRAGE_BOT',
  RETAIL_TRADER = 'RETAIL_TRADER',
  MARKET_MAKER = 'MARKET_MAKER',
  MEV_BOT = 'MEV_BOT',
  WHALE = 'WHALE',
  PANIC_SELLER = 'PANIC_SELLER'
}

// ULTRA FAST: Enhanced Timeframe type with faster intervals
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

// ULTRA FAST: Enhanced TimeframeConfig interface
export interface TimeframeConfig {
  interval: number; // milliseconds - now much smaller for rapid candles
  updateFrequency: number; // milliseconds - now much faster
  volatilityMultiplier: number; // now higher for visible movement
  candlesPerView: number;
}

// COMPLETE: Enhanced MarketAnalysis interface with ALL required properties
export interface MarketAnalysis {
  trend: 'bullish' | 'bearish' | 'sideways';
  volatility: number; // 0-100 scale
  volume: number;
  priceMovement: number; // percentage change
  recommendedTimeframe: Timeframe;
  reason: string; // explanation for recommendation
  tradingIntensity: number; // trades per minute
  priceLevel: 'micro' | 'small' | 'mid' | 'large' | 'mega';
  marketCondition: 'calm' | 'normal' | 'volatile' | 'extreme';
  shouldAdaptTimeframe: boolean; // whether to change timeframe
}

// Enhanced ITimeframeManager interface
export interface ITimeframeManager {
  getTimeframeConfig(timeframe: Timeframe): TimeframeConfig;
  determineOptimalTimeframe(price: number): Timeframe;
  analyzeMarketConditions(simulationId: string, simulation: any): MarketAnalysis;
  shouldAdjustTimeframe(analysis: MarketAnalysis, currentTimeframe: Timeframe): boolean;
  clearCache(simulationId: string): void;
  updateTradesBuffer(simulationId: string, trades: Trade[]): void;
}

// Enhanced ExternalMarketMetrics interface
export interface ExternalMarketMetrics {
  currentTPS: number; // transactions per second
  actualTPS: number; // actual measured TPS
  queueDepth: number; // pending orders
  processedOrders: number; // completed orders
  rejectedOrders: number; // failed orders
  avgProcessingTime: number; // milliseconds
  dominantTraderType: ExternalTraderType;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  liquidationRisk: number; // 0-1 scale
}

// Enhanced ExternalOrder interface
export interface ExternalOrder {
  id: string;
  timestamp: number;
  traderType: ExternalTraderType;
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  priority: number; // execution priority
  strategy: string; // trading strategy name
}

// ENHANCED: Trade interface with comprehensive trader information
export interface Trade {
  id: string;
  timestamp: number;
  trader: {
    walletAddress: string;
    avatarUrl?: string;
    preferredName?: string;
    netPnl: number;
    // Enhanced trader properties for maximum activity
    position?: number;
    totalVolume?: number;
    buyVolume?: number;
    sellVolume?: number;
    tradeCount?: number;
    feesUsd?: number;
    winRate?: number;
    riskProfile?: 'conservative' | 'moderate' | 'aggressive';
    portfolioEfficiency?: number;
  };
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  value: number; // price * quantity
  impact: number; // price impact percentage
}

// Enhanced ExtendedTrade interface
export interface ExtendedTrade extends Trade {
  source?: 'internal' | 'external';
  externalTraderType?: ExternalTraderType;
}

// ENHANCED: TraderPosition interface with comprehensive tracking
export interface TraderPosition {
  trader: {
    walletAddress: string;
    avatarUrl?: string;
    preferredName?: string;
    netPnl: number;
    // Enhanced position tracking
    position?: number;
    totalVolume?: number;
    buyVolume?: number;
    sellVolume?: number;
    tradeCount?: number;
    feesUsd?: number;
    winRate?: number;
    riskProfile?: 'conservative' | 'moderate' | 'aggressive';
    portfolioEfficiency?: number;
  };
  entryPrice: number;
  quantity: number; // positive for long, negative for short
  entryTime: number;
  currentPnl: number; // unrealized P&L in USD
  currentPnlPercentage: number; // unrealized P&L as percentage
}

// ULTRA FAST: Enhanced PricePoint interface for rapid candle generation
export interface PricePoint {
  timestamp: number; // when the candle started
  open: number; // opening price
  high: number; // highest price in period
  low: number; // lowest price in period
  close: number; // closing price
  volume: number; // total volume traded
}

// Enhanced MarketConditions interface
export interface MarketConditions {
  volatility: number; // current market volatility (0-1)
  trend: 'bullish' | 'bearish' | 'sideways';
  volume: number; // total trading volume
}

// Enhanced OrderBookLevel interface
export interface OrderBookLevel {
  price: number;
  quantity: number;
}

// Enhanced OrderBook interface
export interface OrderBook {
  bids: OrderBookLevel[]; // buy orders (highest first)
  asks: OrderBookLevel[]; // sell orders (lowest first)
  lastUpdateTime: number;
}

// ENHANCED: Trader interface compatible with main types
export interface Trader {
  position: number; // required to match main types
  walletAddress: string;
  netPnl: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  tradeCount: number;
  feesUsd: number;
  avatarUrl?: string;
  preferredName?: string;
  winRate: number;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  portfolioEfficiency: number;
  simulationPnl?: number; // P&L specific to current simulation
}

// ULTRA FAST: Enhanced SimulationParameters interface
export interface SimulationParameters {
  timeCompressionFactor: number; // how fast time moves (1x = real-time)
  initialPrice: number; // starting token price
  initialLiquidity: number; // starting liquidity pool
  volatilityFactor: number; // multiplier for price volatility
  duration: number; // simulation duration in minutes
  scenarioType?: string; // type of market scenario
}

// ENHANCED: SimulationState interface with comprehensive state tracking
export interface SimulationState {
  id: string; // unique simulation identifier
  startTime: number; // when simulation started (timestamp)
  currentTime: number; // current simulation time (timestamp)
  endTime: number; // when simulation should end (timestamp)
  isRunning: boolean; // whether simulation is active
  isPaused: boolean; // whether simulation is paused
  parameters: SimulationParameters; // simulation configuration
  marketConditions: MarketConditions; // current market state
  priceHistory: PricePoint[]; // historical price candles
  currentPrice: number; // current token price
  orderBook: OrderBook; // current order book state
  traders: TraderProfile[]; // all participating traders
  activePositions: TraderPosition[]; // currently open positions
  closedPositions: (TraderPosition & { exitPrice: number; exitTime: number })[]; // closed positions
  recentTrades: Trade[]; // recent trade history
  traderRankings: Trader[]; // traders sorted by performance
  templateInfo?: any; // optional template configuration
  _tickCounter?: number; // internal counter for simulation ticks
  lastUpdateTimestamp?: number; // last time simulation was updated
  timestampOffset?: number; // time offset for simulation
}

// ULTRA FAST: ExtendedSimulationState interface with advanced features
export interface ExtendedSimulationState extends SimulationState {
  currentTPSMode?: TPSMode; // current transaction processing mode
  externalMarketMetrics?: ExternalMarketMetrics; // external market data
}

// Enhanced ActiveScenario interface
export interface ActiveScenario {
  phase: string; // current scenario phase
  priceAction: {
    type: 'crash' | 'pump' | 'breakout' | 'trend' | 'consolidation' | 'accumulation' | 'distribution';
    direction?: 'up' | 'down' | 'sideways';
    intensity: number; // how strong the action is (0-1)
    volatility: number; // volatility multiplier for this action
  };
}

// Enhanced TraderDecision interface
export interface TraderDecision {
  action: 'enter' | 'exit' | 'hold';
  walletAddress: string;
  quantity?: number; // how much to trade
  reason: string; // why this decision was made
}

// Enhanced PerformanceConfig interface
export interface PerformanceConfig {
  workerPoolSize: number;
  objectPoolSizes: {
    trades: number;
    positions: number;
  };
  batchSize: number;
  highFrequencyMode: boolean;
}

// ULTRA FAST: Enhanced SIMULATION_CONSTANTS with aggressive parameters
export const SIMULATION_CONSTANTS = {
  BASE_UPDATE_INTERVAL: 50, // 50ms for ultra-fast updates (was 100ms)
  MAX_RECENT_TRADES: 5000, // keep more trades (was 1000)
  MIN_PRICE: 0.000001, // minimum token price
  DEFAULT_LIQUIDITY_PERCENTAGE: 0.2, // higher default liquidity (was 0.1)
  PRICE_RANGES: [
    { min: 0.01, max: 0.1, weight: 0.2 },   // Micro cap
    { min: 0.1, max: 1, weight: 0.3 },      // Small cap
    { min: 1, max: 10, weight: 0.3 },       // Mid cap
    { min: 10, max: 50, weight: 0.2 }       // Large cap
  ],
  // ULTRA FAST: New constants for rapid trading
  ULTRA_FAST_MODE: {
    MIN_CANDLE_INTERVAL: 3000, // 3 seconds minimum
    MAX_CANDLE_INTERVAL: 15000, // 15 seconds maximum
    MIN_UPDATE_FREQUENCY: 100, // 100ms minimum update
    BASE_VOLATILITY_MULTIPLIER: 2.0, // double base volatility
    MAX_TRADES_PER_TICK: 500, // maximum trades per update
    AGGRESSIVE_TIME_COMPRESSION: 100 // maximum time compression factor
  }
};

// Enhanced Engine interfaces
export interface IMarketEngine {
  updatePrice(simulation: SimulationState): Promise<void>;
  updatePriceHighFrequency(simulation: SimulationState, volatilityFactor: number): Promise<void>;
  processExternalOrder(order: ExternalOrder, simulation: SimulationState): Trade | null;
  calculateBaseVolatility(price: number): number;
  generateRandomTokenPrice(): number;
}

export interface ITraderEngine {
  processTraderActions(simulation: ExtendedSimulationState): void;
  processTraderActionsBatch(simulation: SimulationState, batchSize: number): void;
  processTraderDecisionParallel(traders: TraderProfile[], marketData: any): TraderDecision[];
  updatePositionsPnL(simulation: SimulationState): void;
  updateTraderRankings(simulation: SimulationState): void;
  integrateProcessedTrades(simulation: ExtendedSimulationState, processedTrades: Trade[]): void;
  applyTraderBehaviorModifiers(simulationId: string, modifiers: any): void;
}

export interface IExternalMarketEngine {
  setTPSMode(mode: TPSMode): void;
  generateExternalOrders(simulation: SimulationState): ExternalOrder[];
  processExternalOrders(simulation: SimulationState): Trade[];
  detectMEVOpportunity(simulation: SimulationState, pendingOrder: any): ExternalOrder | null;
  getMarketPressureMetrics(): {
    currentTPS: number;
    queueDepth: number;
    dominantTraderType: ExternalTraderType;
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
  };
  triggerLiquidationCascade(simulation: SimulationState): ExternalOrder[];
  cleanup(): void;
}

export interface IOrderBookManager {
  updateOrderBook(simulation: SimulationState): void;
  generateInitialOrderBook(side: 'bids' | 'asks', currentPrice: number, liquidity: number): OrderBookLevel[];
  adjustOrderBookForPriceChange(orderBook: OrderBook, oldPrice: number, newPrice: number): void;
  getMarketDepth(simulation: SimulationState, levels: number): { bidDepth: number; askDepth: number };
}

// Enhanced SimulationEvent interface
export interface SimulationEvent {
  type: string;
  timestamp: number;
  data: any;
}

// ULTRA FAST: New interfaces for rapid candle generation
export interface UltraFastCandleConfig {
  minInterval: number; // minimum candle interval in ms
  maxInterval: number; // maximum candle interval in ms
  updateFrequency: number; // how often to update in ms
  volatilityBoost: number; // volatility multiplier
  volumeBoost: number; // volume multiplier
}

export interface RapidTradingConfig {
  maxTradesPerTick: number; // maximum trades per simulation tick
  participantActivityRate: number; // percentage of participants active per tick
  marketMakerMultiplier: number; // market maker activity multiplier
  retailActivityMultiplier: number; // retail trading multiplier
  positionActivityRate: number; // rate of position opening/closing
}

export interface AggressiveMarketConfig {
  baseVolatilityMultiplier: number; // multiplier for base volatility
  trendSensitivity: number; // how quickly trends change
  momentumAmplification: number; // how much momentum affects price
  impactMultiplier: number; // trade impact multiplier
  noiseLevel: number; // market microstructure noise level
}

// ULTRA FAST: Comprehensive configuration for maximum activity mode
export interface MaximumActivityConfig {
  candleConfig: UltraFastCandleConfig;
  tradingConfig: RapidTradingConfig;
  marketConfig: AggressiveMarketConfig;
  performanceConfig: PerformanceConfig;
}

// Export default ultra-fast configuration
export const ULTRA_FAST_CONFIG: MaximumActivityConfig = {
  candleConfig: {
    minInterval: 3000, // 3 seconds
    maxInterval: 15000, // 15 seconds
    updateFrequency: 100, // 100ms
    volatilityBoost: 2.0,
    volumeBoost: 1.5
  },
  tradingConfig: {
    maxTradesPerTick: 400,
    participantActivityRate: 1.0, // 100% of participants active
    marketMakerMultiplier: 8,
    retailActivityMultiplier: 5,
    positionActivityRate: 0.8
  },
  marketConfig: {
    baseVolatilityMultiplier: 2.5,
    trendSensitivity: 2.0,
    momentumAmplification: 1.8,
    impactMultiplier: 2.0,
    noiseLevel: 1.5
  },
  performanceConfig: {
    workerPoolSize: 4,
    objectPoolSizes: {
      trades: 10000,
      positions: 5000
    },
    batchSize: 100,
    highFrequencyMode: true
  }
};