// backend/src/services/simulation/types.ts - FIXED: Complete MarketAnalysis interface
import { TraderProfile } from '../../types/traders';

// Export TraderProfile from main types
export { TraderProfile };

// Add TPSMode enum with UPPERCASE values
export enum TPSMode {
  NORMAL = 'NORMAL',
  BURST = 'BURST', 
  STRESS = 'STRESS',
  HFT = 'HFT'
}

// Add ExternalTraderType enum
export enum ExternalTraderType {
  ARBITRAGE_BOT = 'ARBITRAGE_BOT',
  RETAIL_TRADER = 'RETAIL_TRADER',
  MARKET_MAKER = 'MARKET_MAKER',
  MEV_BOT = 'MEV_BOT',
  WHALE = 'WHALE',
  PANIC_SELLER = 'PANIC_SELLER'
}

// Add Timeframe type
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

// Add TimeframeConfig interface with candlesPerView
export interface TimeframeConfig {
  interval: number; // milliseconds
  updateFrequency: number;
  volatilityMultiplier: number;
  candlesPerView: number;
}

// FIXED: Complete MarketAnalysis interface with ALL required properties
export interface MarketAnalysis {
  trend: 'bullish' | 'bearish' | 'sideways';
  volatility: number; // FIXED: Property name (was volatilityScore)
  volume: number;
  priceMovement: number;
  recommendedTimeframe: Timeframe;
  reason: string;
  tradingIntensity: number; // FIXED: Add missing property
  priceLevel: 'micro' | 'small' | 'mid' | 'large' | 'mega'; // FIXED: Add missing property
  marketCondition: 'calm' | 'normal' | 'volatile' | 'extreme'; // FIXED: Add missing property
  shouldAdaptTimeframe: boolean; // FIXED: Add missing property
}

// Add ITimeframeManager interface
export interface ITimeframeManager {
  getTimeframeConfig(timeframe: Timeframe): TimeframeConfig;
  determineOptimalTimeframe(price: number): Timeframe;
  analyzeMarketConditions(simulationId: string, simulation: any): MarketAnalysis;
  shouldAdjustTimeframe(analysis: MarketAnalysis, currentTimeframe: Timeframe): boolean;
  clearCache(simulationId: string): void;
  updateTradesBuffer(simulationId: string, trades: Trade[]): void;
}

// Add ExternalMarketMetrics interface
export interface ExternalMarketMetrics {
  currentTPS: number;
  actualTPS: number;
  queueDepth: number;
  processedOrders: number;
  rejectedOrders: number;
  avgProcessingTime: number;
  dominantTraderType: ExternalTraderType;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  liquidationRisk: number;
}

// Add ExternalOrder interface
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

// Add Trade interface (extended from main types)
export interface Trade {
  id: string;
  timestamp: number;
  trader: {
    walletAddress: string;
    avatarUrl?: string;
    preferredName?: string;
    netPnl: number;
    // Add missing properties for trader
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
  value: number;
  impact: number;
}

// Add ExtendedTrade interface
export interface ExtendedTrade extends Trade {
  source?: 'internal' | 'external';
  externalTraderType?: ExternalTraderType;
}

// Add TraderPosition interface
export interface TraderPosition {
  trader: {
    walletAddress: string;
    avatarUrl?: string;
    preferredName?: string;
    netPnl: number;
    // Add missing properties for trader
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
  quantity: number;
  entryTime: number;
  currentPnl: number;
  currentPnlPercentage: number;
}

// Add PricePoint interface
export interface PricePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Add MarketConditions interface
export interface MarketConditions {
  volatility: number;
  trend: 'bullish' | 'bearish' | 'sideways';
  volume: number;
}

// Add OrderBookLevel interface
export interface OrderBookLevel {
  price: number;
  quantity: number;
}

// Add OrderBook interface
export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateTime: number;
}

// Add Trader interface (compatible with main types)
export interface Trader {
  position: number; // Make required to match main types
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
  simulationPnl?: number;
}

// Add SimulationParameters interface
export interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType?: string;
}

// Add SimulationState interface
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
  templateInfo?: any;
  _tickCounter?: number;
  lastUpdateTimestamp?: number;
  timestampOffset?: number;
}

// Add ExtendedSimulationState interface
export interface ExtendedSimulationState extends SimulationState {
  currentTPSMode?: TPSMode;
  externalMarketMetrics?: ExternalMarketMetrics;
}

// Add ActiveScenario interface
export interface ActiveScenario {
  phase: string;
  priceAction: {
    type: 'crash' | 'pump' | 'breakout' | 'trend' | 'consolidation' | 'accumulation' | 'distribution';
    direction?: 'up' | 'down' | 'sideways';
    intensity: number;
    volatility: number;
  };
}

// Add TraderDecision interface
export interface TraderDecision {
  action: 'enter' | 'exit' | 'hold';
  walletAddress: string;
  quantity?: number;
  reason: string; // Required property
}

// Add PerformanceConfig interface
export interface PerformanceConfig {
  workerPoolSize: number;
  objectPoolSizes: {
    trades: number;
    positions: number;
  };
  batchSize: number;
  highFrequencyMode: boolean;
}

// Add SIMULATION_CONSTANTS with all required properties
export const SIMULATION_CONSTANTS = {
  BASE_UPDATE_INTERVAL: 100, // milliseconds
  MAX_RECENT_TRADES: 1000,
  MIN_PRICE: 0.000001,
  DEFAULT_LIQUIDITY_PERCENTAGE: 0.1,
  PRICE_RANGES: [
    { min: 0.01, max: 0.1, weight: 0.2 },   // Micro cap
    { min: 0.1, max: 1, weight: 0.3 },      // Small cap
    { min: 1, max: 10, weight: 0.3 },       // Mid cap
    { min: 10, max: 50, weight: 0.2 }       // Large cap
  ]
};

// Add Engine interfaces
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

// Add SimulationEvent interface
export interface SimulationEvent {
  type: string;
  timestamp: number;
  data: any;
}