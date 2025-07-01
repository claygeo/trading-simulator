// backend/src/types/index.ts - FIXED: Selective exports to avoid conflicts
// Re-export all types from simulation and traders

export * from './simulation';
export * from './traders';

// FIXED: Only export simulation-specific types that don't conflict
export {
  TPSMode,
  ExternalTraderType,
  Timeframe,
  TimeframeConfig,
  MarketAnalysis,
  ITimeframeManager,
  ExternalMarketMetrics,
  ExternalOrder,
  ExtendedTrade,
  ActiveScenario,
  TraderDecision,
  PerformanceConfig,
  SIMULATION_CONSTANTS,
  IMarketEngine,
  ITraderEngine,
  IExternalMarketEngine,
  IOrderBookManager,
  ExtendedSimulationState
} from '../services/simulation/types';