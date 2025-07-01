// backend/src/services/simulation/index.ts
import { SimulationManager } from './SimulationManager';

// Create and export singleton instance
const simulationManager = new SimulationManager();

// Export the instance as default and named export for compatibility
export default simulationManager;
export { simulationManager };

// Also export the class for testing purposes
export { SimulationManager };

// Export all types
export * from './types';

// Export individual engines if needed elsewhere
export { MarketEngine } from './MarketEngine';
export { TraderEngine } from './TraderEngine';
export { OrderBookManager } from './OrderBookManager';
export { TimeframeManager } from './TimeframeManager';
export { ScenarioEngine } from './ScenarioEngine';
export { PerformanceOptimizer } from './PerformanceOptimizer';
export { BroadcastService } from './BroadcastService';
export { DataGenerator } from './DataGenerator';
export { TechnicalIndicators } from './TechnicalIndicators';
export { ExternalMarketEngine } from './ExternalMarketEngine';