// backend/src/services/simulation/types.ts - ENHANCED: Your System + Candle Coordination Support
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

// ENHANCED: Price range types for dynamic pricing
export type PriceRangeCategory = 'micro' | 'small' | 'mid' | 'large' | 'mega';

export interface PriceRangeDefinition {
  min: number;
  max: number;
  weight: number;
  description: string;
  liquidityMultiplier: number;
  volatilityMultiplier: number;
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

// ENHANCED: PricePoint interface for OHLCV candle data with validation
export interface PricePoint {
  timestamp: number; // when the candle started
  open: number; // opening price
  high: number; // highest price in period
  low: number; // lowest price in period
  close: number; // closing price
  volume: number; // total volume traded
}

// NEW: CandleData interface for enhanced candle management
export interface CandleData extends PricePoint {
  // Additional metadata for candle coordination
  interval?: number; // candle interval in milliseconds
  priceCategory?: PriceRangeCategory; // price category for this candle
  isComplete?: boolean; // whether candle is finalized
  tradeCount?: number; // number of trades in this candle
  vwap?: number; // volume-weighted average price
}

// NEW: CandleUpdateCallback interface for coordination
export interface CandleUpdateCallback {
  queueUpdate(simulationId: string, timestamp: number, price: number, volume: number): void;
  setSimulationSpeed(simulationId: string, speedMultiplier: number): void;
  clearCandles(simulationId: string): void;
  ensureCleanStart(simulationId: string): void;
}

// NEW: CandleManagerStats interface
export interface CandleManagerStats {
  candleCount: number;
  lastCandleTime: number;
  currentCandle: boolean;
  isResetting: boolean;
  priceCategory: PriceRangeCategory;
  candleInterval: number;
  lastPrice: number;
  totalVolume: number;
  coordinatorStats: any;
}

// NEW: CandleProgress interface
export interface CandleProgress {
  exists: boolean;
  timestamp?: number;
  duration?: number;
  progress?: number;
  priceRange?: { 
    high: number; 
    low: number; 
    open: number; 
    close: number; 
  };
  volume?: number;
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

// ENHANCED: SimulationParameters interface with dynamic pricing support
export interface SimulationParameters {
  timeCompressionFactor: number; // how fast time moves (1x = real-time)
  initialPrice: number; // starting token price
  initialLiquidity: number; // starting liquidity pool
  volatilityFactor: number; // multiplier for price volatility
  duration: number; // simulation duration in minutes
  scenarioType?: string; // type of market scenario
  // NEW: Dynamic pricing parameters
  priceRange?: PriceRangeCategory | 'random'; // price range category
  customPrice?: number; // custom starting price override
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

// ENHANCED: SIMULATION_CONSTANTS with dynamic pricing definitions
export const SIMULATION_CONSTANTS = {
  BASE_UPDATE_INTERVAL: 50, // 50ms for ultra-fast updates (was 100ms)
  MAX_RECENT_TRADES: 5000, // keep more trades (was 1000)
  MIN_PRICE: 0.000001, // minimum token price
  DEFAULT_LIQUIDITY_PERCENTAGE: 0.2, // higher default liquidity (was 0.1)
  
  // ENHANCED: Dynamic price ranges with realistic distributions
  PRICE_RANGES: {
    micro: { 
      min: 0.0001, 
      max: 0.01, 
      weight: 0.25, 
      description: 'Micro-cap tokens',
      liquidityMultiplier: 0.5,
      volatilityMultiplier: 1.8
    },
    small: { 
      min: 0.01, 
      max: 1, 
      weight: 0.30, 
      description: 'Small-cap tokens',
      liquidityMultiplier: 0.8,
      volatilityMultiplier: 1.4
    },
    mid: { 
      min: 1, 
      max: 10, 
      weight: 0.25, 
      description: 'Mid-cap tokens',
      liquidityMultiplier: 1.0,
      volatilityMultiplier: 1.0
    },
    large: { 
      min: 10, 
      max: 100, 
      weight: 0.15, 
      description: 'Large-cap tokens',
      liquidityMultiplier: 1.5,
      volatilityMultiplier: 0.8
    },
    mega: { 
      min: 100, 
      max: 1000, 
      weight: 0.05, 
      description: 'Mega-cap tokens',
      liquidityMultiplier: 2.0,
      volatilityMultiplier: 0.6
    }
  } as Record<PriceRangeCategory, PriceRangeDefinition>,
  
  // ULTRA FAST: Enhanced constants for rapid trading
  ULTRA_FAST_MODE: {
    MIN_CANDLE_INTERVAL: 3000, // 3 seconds minimum
    MAX_CANDLE_INTERVAL: 15000, // 15 seconds maximum
    MIN_UPDATE_FREQUENCY: 100, // 100ms minimum update
    BASE_VOLATILITY_MULTIPLIER: 2.0, // double base volatility
    MAX_TRADES_PER_TICK: 500, // maximum trades per update
    AGGRESSIVE_TIME_COMPRESSION: 100 // maximum time compression factor
  },
  
  // NEW: Dynamic pricing constants
  DYNAMIC_PRICING: {
    LOG_NORMAL_DISTRIBUTION: true, // use log-normal for realistic clustering
    PRICE_VARIATION_FACTOR: 0.1, // ±10% variation within range
    MIN_CUSTOM_PRICE: 0.0001, // minimum custom price
    MAX_CUSTOM_PRICE: 10000, // maximum custom price
    DEFAULT_RANGE: 'random' as const, // default to random selection
    RANGE_TRANSITION_SMOOTHING: 0.05 // 5% smoothing between ranges
  },

  // NEW: Candle coordination constants
  CANDLE_COORDINATION: {
    DEFAULT_INTERVAL: 10000, // 10 second default
    MIN_INTERVAL: 3000, // 3 second minimum
    MAX_INTERVAL: 15000, // 15 second maximum
    COORDINATOR_FLUSH_INTERVAL: 25, // 25ms coordinator update interval
    MAX_CANDLE_HISTORY: 2000, // maximum candles to keep
    TIMESTAMP_TOLERANCE: 5000, // 5 second tolerance for timestamps
    VALIDATION_ENABLED: true, // enable OHLC validation
    AUTO_FIX_TIMESTAMPS: true // automatically fix timestamp issues
  }
};

// Enhanced Engine interfaces
export interface IMarketEngine {
  updatePrice(simulation: SimulationState): Promise<void>;
  updatePriceHighFrequency(simulation: SimulationState, volatilityFactor: number): Promise<void>;
  processExternalOrder(order: ExternalOrder, simulation: SimulationState): Trade | null;
  calculateBaseVolatility(price: number): number;
  generateRandomTokenPrice(priceRange?: PriceRangeCategory | 'random'): number;
  getPriceCategory(price: number): { category: string; description: string; range: string };
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

// NEW: CandleManager interface for coordination
export interface ICandleManager {
  initialize(simulationStartTime: number, initialPrice?: number): void;
  updateCandle(timestamp: number, price: number, volume: number): void;
  getCandles(limit?: number): PricePoint[];
  setCandles(candles: PricePoint[]): void;
  clear(): void;
  reset(): Promise<void>;
  shutdown(): void;
  getStats(): CandleManagerStats;
  getCurrentCandleProgress(): CandleProgress;
  forceFinalizeCurrent(): boolean;
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

// ENHANCED: Dynamic pricing configuration
export interface DynamicPricingConfig {
  enableLogNormalDistribution: boolean; // use log-normal distribution
  priceVariationFactor: number; // variation within range
  rangeTransitionSmoothing: number; // smoothing between ranges
  customPriceValidation: {
    min: number;
    max: number;
  };
  defaultPriceRange: PriceRangeCategory | 'random';
}

// NEW: Candle coordination configuration
export interface CandleCoordinationConfig {
  enableTimestampCoordination: boolean; // enable timestamp coordination
  enableOHLCValidation: boolean; // validate OHLC relationships
  enableAutoFix: boolean; // automatically fix issues
  flushInterval: number; // coordinator update frequency
  maxCandleHistory: number; // maximum candles to keep
  timestampTolerance: number; // tolerance for timestamp drift
}

// ULTRA FAST: Comprehensive configuration for maximum activity mode
export interface MaximumActivityConfig {
  candleConfig: UltraFastCandleConfig;
  tradingConfig: RapidTradingConfig;
  marketConfig: AggressiveMarketConfig;
  performanceConfig: PerformanceConfig;
  pricingConfig: DynamicPricingConfig;
  coordinationConfig: CandleCoordinationConfig; // NEW: Coordination config
}

// Export enhanced ultra-fast configuration with candle coordination
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
  },
  pricingConfig: {
    enableLogNormalDistribution: true,
    priceVariationFactor: 0.1, // ±10% variation
    rangeTransitionSmoothing: 0.05, // 5% smoothing
    customPriceValidation: {
      min: 0.0001,
      max: 10000
    },
    defaultPriceRange: 'random'
  },
  coordinationConfig: {
    enableTimestampCoordination: true,
    enableOHLCValidation: true,
    enableAutoFix: true,
    flushInterval: 25, // 25ms
    maxCandleHistory: 2000,
    timestampTolerance: 5000 // 5 seconds
  }
};

// NEW: Enhanced helper functions for dynamic pricing with candle coordination
export const PricingHelpers = {
  // Get price range definition by category
  getPriceRangeDefinition(category: PriceRangeCategory): PriceRangeDefinition {
    return SIMULATION_CONSTANTS.PRICE_RANGES[category];
  },
  
  // Validate custom price
  isValidCustomPrice(price: number): boolean {
    const config = ULTRA_FAST_CONFIG.pricingConfig;
    return price >= config.customPriceValidation.min && 
           price <= config.customPriceValidation.max;
  },
  
  // Get all available price range categories
  getAvailablePriceRanges(): PriceRangeCategory[] {
    return Object.keys(SIMULATION_CONSTANTS.PRICE_RANGES) as PriceRangeCategory[];
  },
  
  // Determine price category from price value
  categorizePriceValue(price: number): PriceRangeCategory {
    const ranges = SIMULATION_CONSTANTS.PRICE_RANGES;
    
    for (const [category, range] of Object.entries(ranges)) {
      if (price >= range.min && price <= range.max) {
        return category as PriceRangeCategory;
      }
    }
    
    // Fallback logic
    if (price < ranges.micro.min) return 'micro';
    if (price > ranges.mega.max) return 'mega';
    
    return 'mid'; // Default fallback
  },
  
  // Calculate appropriate liquidity for price
  calculateLiquidityForPrice(price: number, baseAmount: number = 1000000): number {
    const category = this.categorizePriceValue(price);
    const multiplier = SIMULATION_CONSTANTS.PRICE_RANGES[category].liquidityMultiplier;
    return baseAmount * multiplier;
  },
  
  // Calculate appropriate volatility for price
  calculateVolatilityForPrice(price: number, baseVolatility: number = 0.01): number {
    const category = this.categorizePriceValue(price);
    const multiplier = SIMULATION_CONSTANTS.PRICE_RANGES[category].volatilityMultiplier;
    return baseVolatility * multiplier;
  },

  // NEW: Calculate optimal candle interval for price category
  calculateOptimalCandleInterval(price: number): number {
    const category = this.categorizePriceValue(price);
    const baseInterval = 8000; // 8 second base
    const multiplier = SIMULATION_CONSTANTS.PRICE_RANGES[category].volatilityMultiplier;
    
    // Higher volatility = shorter intervals for better capture
    const interval = baseInterval / Math.sqrt(multiplier);
    
    // Clamp to reasonable range
    return Math.max(
      SIMULATION_CONSTANTS.CANDLE_COORDINATION.MIN_INTERVAL,
      Math.min(
        SIMULATION_CONSTANTS.CANDLE_COORDINATION.MAX_INTERVAL,
        interval
      )
    );
  },

  // NEW: Get candle interval by category
  getCandleIntervalForCategory(category: PriceRangeCategory): number {
    const intervals = {
      micro: 6000,   // 6 seconds for high volatility
      small: 8000,   // 8 seconds
      mid: 10000,    // 10 seconds
      large: 12000,  // 12 seconds
      mega: 15000    // 15 seconds for stable prices
    };
    return intervals[category];
  }
};

// NEW: WebSocket message types for candle coordination
export interface WebSocketMessage {
  type: 'price_update' | 'trade' | 'candle_update' | 'simulation_status' | 'tps_metrics' | 'connection_test';
  timestamp: number;
  data?: any;
  simulationId?: string;
}

export interface CandleUpdateMessage extends WebSocketMessage {
  type: 'candle_update';
  data: {
    priceHistory: PricePoint[];
    speed: number;
    candleCount: number;
    isLive: boolean;
    timestampCoordinated: boolean;
    connectedCoordination?: boolean;
    priceCategory?: PriceRangeCategory;
  };
}

export interface PriceUpdateMessage extends WebSocketMessage {
  type: 'price_update';
  data: {
    price: number;
    orderBook: OrderBook;
    priceHistory: PricePoint[];
    activePositions: TraderPosition[];
    recentTrades: Trade[];
    traderRankings: Trader[];
    timeframe?: Timeframe;
    externalMarketMetrics?: ExternalMarketMetrics;
    totalTradesProcessed: number;
    currentTPSMode?: TPSMode;
    priceCategory?: PriceRangeCategory;
  };
}

export interface TradeMessage extends WebSocketMessage {
  type: 'trade';
  data: Trade;
}

export interface SimulationStatusMessage extends WebSocketMessage {
  type: 'simulation_status';
  data: {
    isRunning: boolean;
    isPaused: boolean;
    speed: number;
    currentPrice: number;
    candleCount: number;
    tradeCount: number;
    currentTPSMode?: TPSMode;
    priceCategory?: PriceRangeCategory;
  };
}

// NEW: Validation and error types for candle coordination
export interface CandleValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fixedCandles?: PricePoint[];
  originalCount: number;
  validCount: number;
}

export interface SimulationError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  simulationId?: string;
  recoverable: boolean;
}

// NEW: Performance monitoring for candle coordination
export interface PerformanceMetrics {
  candleGenerationRate: number; // candles per second
  updateLatency: number; // milliseconds
  memoryUsage: number; // bytes
  cpuUsage: number; // percentage
  activeSimulations: number;
  totalCandles: number;
  errorRate: number; // errors per minute
  coordinationEfficiency: number; // coordination success rate
  timestamp: number;
}

// NEW: Market data aggregation with candle coordination
export interface MarketDataSummary {
  simulationId: string;
  currentPrice: number;
  priceCategory: PriceRangeCategory;
  priceChange24h: number;
  priceChangePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  candleCount: number;
  candleInterval: number;
  lastUpdated: number;
  marketConditions: MarketConditions;
  isActive: boolean;
  coordinationStatus: 'active' | 'inactive' | 'error';
}

// Export all enhanced types
export * from './types';