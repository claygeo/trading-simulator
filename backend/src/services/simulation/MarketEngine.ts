// backend/src/services/simulation/MarketEngine.ts - FIXED: CandleManager constructor error
import { 
  SimulationState, 
  PricePoint, 
  IMarketEngine,
  Timeframe,
  TimeframeConfig,
  SIMULATION_CONSTANTS,
  ActiveScenario,
  ExternalOrder,
  Trade,
  ExtendedTrade,
  ExternalTraderType,
  TPSMode,
  ExtendedSimulationState
} from './types';
import { TechnicalIndicators } from './TechnicalIndicators';
import { IOrderBookManager } from './types';
// 🔧 CRITICAL FIX: Proper ES6 import instead of globalThis access
import { CandleManager } from './CandleManager';

export class MarketEngine implements IMarketEngine {
  private tradeCounter: number = 0;
  private lastCandleCreationLog: Map<string, number> = new Map();
  private simulationTimeframes: Map<string, Timeframe> = new Map();
  // 🔧 CRITICAL FIX: Proper typing instead of 'any'
  private candleManagers: Map<string, CandleManager> = new Map();

  constructor(
    private timeframeConfig: (timeframe: Timeframe) => TimeframeConfig,
    private getCurrentTimeframe: (simulationId: string) => Timeframe,
    private orderBookManager?: IOrderBookManager
  ) {}

  async updatePrice(simulation: SimulationState): Promise<void> {
    const extendedSim = simulation as ExtendedSimulationState;
    const { marketConditions, currentPrice } = extendedSim;
    const activeScenario = (extendedSim as any).activeScenario as ActiveScenario | undefined;

    // Get base volatility based on price level
    let baseVolatility = this.calculateBaseVolatility(currentPrice);

    // Calculate market momentum from recent trades
    const recentTrades = extendedSim.recentTrades.slice(0, 50);
    let buyVolume = 0;
    let sellVolume = 0;
    
    recentTrades.forEach(trade => {
      if (trade.action === 'buy') {
        buyVolume += trade.value;
      } else {
        sellVolume += trade.value;
      }
    });
    
    const totalVolume = buyVolume + sellVolume;
    const volumeImbalance = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;
    
    // MODIFY volatility based on external market pressure
    if (extendedSim.externalMarketMetrics) {
      const { marketSentiment, currentTPS } = extendedSim.externalMarketMetrics;
      
      // Higher TPS = more volatility
      const tpsMultiplier = Math.log10(Math.max(1, currentTPS)) / 2;
      baseVolatility *= (1 + tpsMultiplier);
      
      // Sentiment affects trend with volume imbalance consideration
      let sentimentBias = 0;
      if (marketSentiment === 'bullish') {
        sentimentBias = 0.0005 * (1 + volumeImbalance);
      } else if (marketSentiment === 'bearish') {
        sentimentBias = -0.0005 * (1 - volumeImbalance);
      } else {
        // Neutral sentiment follows volume imbalance
        sentimentBias = volumeImbalance * 0.0003;
      }
      
      // Apply sentiment to price movement
      const sentimentImpact = currentPrice * sentimentBias;
      extendedSim.currentPrice += sentimentImpact;
    }

    // Get timeframe config
    const timeframe = this.getCurrentTimeframe(extendedSim.id);
    const config = this.timeframeConfig(timeframe);

    // Adjust volatility based on timeframe and recent activity
    let adjustedVolatility = baseVolatility * config.volatilityMultiplier * 0.3;
    
    // Add momentum-based volatility
    if (Math.abs(volumeImbalance) > 0.3) {
      adjustedVolatility *= 1.5; // Increase volatility during strong trends
    }

    // Random walk model with trend bias
    let trendFactor = 0;

    // If there's an active scenario, use its price action
    if (activeScenario && activeScenario.phase) {
      const { priceAction } = activeScenario;

      // Apply scenario-specific price movements
      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.01 * priceAction.intensity;
          adjustedVolatility = baseVolatility * priceAction.volatility;
          break;

        case 'pump':
          trendFactor = 0.01 * priceAction.intensity;
          adjustedVolatility = baseVolatility * priceAction.volatility;
          break;

        case 'breakout':
          trendFactor = priceAction.direction === 'up' ? 0.005 * priceAction.intensity : -0.005 * priceAction.intensity;
          adjustedVolatility = baseVolatility * priceAction.volatility;
          break;

        case 'trend':
          if (priceAction.direction === 'up') trendFactor = 0.002 * priceAction.intensity;
          else if (priceAction.direction === 'down') trendFactor = -0.002 * priceAction.intensity;
          adjustedVolatility = baseVolatility * 0.5;
          break;

        case 'consolidation':
          trendFactor = 0;
          adjustedVolatility = baseVolatility * 0.2;
          break;

        case 'accumulation':
          trendFactor = 0.0005 * priceAction.intensity;
          adjustedVolatility = baseVolatility * 0.3;
          break;

        case 'distribution':
          trendFactor = -0.0005 * priceAction.intensity;
          adjustedVolatility = baseVolatility * 0.3;
          break;
      }

      // Apply direction override if specified
      if (priceAction.direction === 'sideways') {
        trendFactor = 0;
      }
    } else {
      // Enhanced default behavior based on market dynamics
      
      // Volume-weighted trend calculation
      if (totalVolume > 0) {
        trendFactor = volumeImbalance * 0.0005; // Direct correlation with volume imbalance
      }
      
      // Market condition adjustments
      if (marketConditions.trend === 'bullish') {
        trendFactor += 0.0001;
      } else if (marketConditions.trend === 'bearish') {
        trendFactor -= 0.0001;
      }
      
      // Mean reversion tendency
      const priceHistory = extendedSim.priceHistory.slice(-20);
      if (priceHistory.length >= 20) {
        const avgPrice = priceHistory.reduce((sum, p) => sum + p.close, 0) / priceHistory.length;
        const deviation = (currentPrice - avgPrice) / avgPrice;
        
        // Strong mean reversion at extreme deviations
        if (Math.abs(deviation) > 0.05) {
          trendFactor -= deviation * 0.001; // Pull back to mean
        }
      }
    }

    // Enhanced random component with realistic market microstructure
    const randomBase = Math.random() - 0.5;
    
    // Add occasional larger moves (fat tails)
    let randomFactor;
    const fatTailChance = Math.random();
    if (fatTailChance < 0.02) { // 2% chance of large move
      randomFactor = randomBase * adjustedVolatility * 3;
    } else if (fatTailChance < 0.1) { // 8% chance of medium move
      randomFactor = randomBase * adjustedVolatility * 1.5;
    } else {
      randomFactor = randomBase * adjustedVolatility;
    }
    
    // Add market microstructure noise
    const microNoise = (Math.random() - 0.5) * 0.00005;

    // Calculate price change with all factors
    const priceChange = currentPrice * (trendFactor + randomFactor + microNoise);
    const newPrice = currentPrice + priceChange;

    // Update the current price with bounds
    extendedSim.currentPrice = Math.max(SIMULATION_CONSTANTS.MIN_PRICE, newPrice);

    // UPDATED: Use enhanced async candle updates
    await this.updatePriceCandles(extendedSim);

    // Update market trend based on recent price movement
    this.updateMarketTrend(extendedSim);
    
    // Update volatility based on price change magnitude
    const changePercent = Math.abs(priceChange / currentPrice);
    marketConditions.volatility = marketConditions.volatility * 0.95 + changePercent * 0.05;
  }

  async updatePriceHighFrequency(simulation: SimulationState, volatilityFactor: number): Promise<void> {
    const extendedSim = simulation as ExtendedSimulationState;
    const { marketConditions, currentPrice } = extendedSim;
    const activeScenario = (extendedSim as any).activeScenario as ActiveScenario | undefined;

    // Get base volatility based on price level
    let baseVolatility = this.calculateBaseVolatility(currentPrice);

    // Account for external market pressure in HF mode
    if (extendedSim.externalMarketMetrics && extendedSim.currentTPSMode === TPSMode.HFT) {
      baseVolatility *= 2; // Double volatility in HFT mode
    }

    // Get timeframe config
    const timeframe = this.getCurrentTimeframe(extendedSim.id);
    const config = this.timeframeConfig(timeframe);

    // Reduced base volatility for high-frequency updates
    let adjustedVolatility = baseVolatility * config.volatilityMultiplier * 0.3 * volatilityFactor;

    // Random walk model with trend bias
    let trendFactor = 0;

    // Apply scenario effects if active
    if (activeScenario && activeScenario.phase) {
      const { priceAction } = activeScenario;

      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.005 * priceAction.intensity * volatilityFactor;
          adjustedVolatility = baseVolatility * priceAction.volatility * volatilityFactor;
          break;

        case 'pump':
          trendFactor = 0.005 * priceAction.intensity * volatilityFactor;
          adjustedVolatility = baseVolatility * priceAction.volatility * volatilityFactor;
          break;

        default:
          trendFactor *= volatilityFactor;
          adjustedVolatility *= volatilityFactor;
      }
    } else {
      if (marketConditions.trend === 'bullish') trendFactor = 0.00005;
      else if (marketConditions.trend === 'bearish') trendFactor = -0.00005;
    }

    // Smaller random component for stability
    const randomFactor = (Math.random() - 0.5) * adjustedVolatility;

    // Calculate price change
    const priceChange = currentPrice * (trendFactor + randomFactor);
    const newPrice = currentPrice + priceChange;

    // Update the current price with bounds
    extendedSim.currentPrice = Math.max(SIMULATION_CONSTANTS.MIN_PRICE, newPrice);

    // Update candles with async method
    await this.updatePriceCandles(extendedSim);
  }

  // FIXED: Critical bug fix on line 314 - was setting priceHistory = [], now gets candles from manager
  private async updatePriceCandles(simulation: ExtendedSimulationState): Promise<void> {
    const timeframe = this.simulationTimeframes.get(simulation.id) || this.getCurrentTimeframe(simulation.id);
    const config = this.timeframeConfig(timeframe);
    const candleManager = this.candleManagers.get(simulation.id);
    
    if (!candleManager) {
      console.error(`❌ No CandleManager found for simulation ${simulation.id}`);
      // Try to recreate it
      const newCandleManager = this.initializeCandleManager(simulation.id, config.interval);
      console.log(`🔄 Recreated CandleManager for simulation ${simulation.id}`);
      
      // Exit early if recreation failed
      if (!this.candleManagers.get(simulation.id)) {
        return;
      }
    }
    
    const manager = this.candleManagers.get(simulation.id)!;
    
    // CRITICAL: Use simulation time consistently and round to avoid sub-millisecond issues
    const roundedTime = Math.floor(simulation.currentTime / 1000) * 1000; // Round to nearest second
    const currentVolume = this.calculateCurrentVolume(simulation);
    
    // Store previous state for comparison
    const previousCandleCount = simulation.priceHistory.length;
    
    console.log(`📈 Updating candles: time=${new Date(roundedTime).toISOString().substr(11, 8)}, price=$${simulation.currentPrice.toFixed(6)}`);
    
    try {
      // CRITICAL: Update candle with rounded simulation time
      await manager.updateCandle(roundedTime, simulation.currentPrice, currentVolume);
      
      // FIXED: Line 314 bug - Get updated candles from manager instead of setting to empty array
      simulation.priceHistory = manager.getCandles(250);
      const finalCandleCount = simulation.priceHistory.length;
      
      // ENHANCED SUCCESS TRACKING
      if (finalCandleCount > previousCandleCount) {
        console.log(`📊 CHART GROWTH: ${previousCandleCount} → ${finalCandleCount} candles`);
      }
      
      // Progress tracking for initial chart building
      if (finalCandleCount <= 5 || finalCandleCount % 10 === 0) {
        console.log(`📊 Chart building progress: ${finalCandleCount} candles created`);
        
        if (simulation.priceHistory.length > 1) {
          const first = simulation.priceHistory[0];
          const last = simulation.priceHistory[simulation.priceHistory.length - 1];
          const duration = (last.timestamp - first.timestamp) / 60000; // minutes
          
          console.log(`   ⏱️ Chart span: ${duration.toFixed(1)} minutes`);
          console.log(`   📈 Price range: $${Math.min(...simulation.priceHistory.map(c => c.low)).toFixed(6)} - $${Math.max(...simulation.priceHistory.map(c => c.high)).toFixed(6)}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error updating candles:`, error);
      console.error(`   Simulation: ${simulation.id}`);
      console.error(`   Time: ${roundedTime}`);
      console.error(`   Price: ${simulation.currentPrice}`);
      console.error(`   Volume: ${currentVolume}`);
      
      // Don't let candle errors stop the simulation
      // The chart will just use the existing candles
    }
  }

  // ENHANCED: Better volume calculation with candle period awareness
  private calculateCurrentVolume(simulation: ExtendedSimulationState): number {
    const timeframe = this.simulationTimeframes.get(simulation.id) || this.getCurrentTimeframe(simulation.id);
    const config = this.timeframeConfig(timeframe);
    const currentCandleStart = Math.floor(simulation.currentTime / config.interval) * config.interval;
    
    // Get trades within the current candle period
    const volumeInCurrentCandle = simulation.recentTrades
      .filter(trade => trade.timestamp >= currentCandleStart && trade.timestamp <= simulation.currentTime)
      .reduce((sum, trade) => sum + trade.quantity, 0);
    
    // Ensure minimum volume for visibility
    const minVolume = 100;
    const finalVolume = Math.max(minVolume, volumeInCurrentCandle);
    
    return finalVolume;
  }

  // 🔧 CRITICAL FIX: Enhanced CandleManager initialization with proper ES6 imports
  private initializeCandleManager(simulationId: string, candleInterval: number): CandleManager {
    try {
      // 🔧 CRITICAL FIX: Use proper ES6 import instead of globalThis
      console.log(`🏭 Creating CandleManager for ${simulationId} with ${candleInterval}ms intervals...`);
      
      const manager = new CandleManager(candleInterval);
      this.candleManagers.set(simulationId, manager);
      
      console.log(`🏭 Initialized CandleManager for ${simulationId}:`);
      console.log(`   ⏰ Interval: ${candleInterval}ms (${(candleInterval/60000).toFixed(1)} minutes)`);
      console.log(`   🎯 Starting fresh - no historical data`);
      console.log(`   ✅ CONSTRUCTOR FIX APPLIED - Using ES6 import`);
      
      return manager;
    } catch (error) {
      console.error(`❌ CRITICAL ERROR: Failed to create CandleManager for ${simulationId}:`, error);
      console.error(`   This is the error that was crashing the server!`);
      console.error(`   Stack trace:`, error instanceof Error ? error.stack : 'No stack trace');
      
      // 🆘 EMERGENCY FALLBACK: Create a minimal candle manager to prevent crash
      console.log(`🆘 Creating emergency fallback CandleManager...`);
      
      try {
        const fallbackManager = new CandleManager(candleInterval);
        this.candleManagers.set(simulationId, fallbackManager);
        console.log(`✅ Emergency fallback CandleManager created successfully`);
        return fallbackManager;
      } catch (fallbackError) {
        console.error(`💥 CRITICAL: Even fallback CandleManager creation failed:`, fallbackError);
        
        // 🚨 LAST RESORT: Create a mock manager to prevent server crash
        const mockManager = {
          updateCandle: async () => { console.log('Mock candle update'); },
          getCandles: () => [],
          clear: () => { console.log('Mock candle clear'); },
          shutdown: () => { console.log('Mock candle shutdown'); }
        } as any;
        
        this.candleManagers.set(simulationId, mockManager);
        console.log(`🆘 Last resort mock manager created to prevent server crash`);
        return mockManager;
      }
    }
  }

  processExternalOrder(order: ExternalOrder, simulation: SimulationState): Trade | null {
    const extendedSim = simulation as ExtendedSimulationState;
    const { orderBook, currentPrice } = extendedSim;
    
    // Implement realistic order matching
    const targetLevels = order.action === 'buy' ? orderBook.asks : orderBook.bids;
    
    if (targetLevels.length === 0) {
      return null; // No liquidity
    }
    
    // Calculate slippage based on order size
    let remainingQuantity = order.quantity;
    let totalCost = 0;
    let executedQuantity = 0;
    let worstPrice = order.price;
    
    // Walk through order book levels
    for (const level of targetLevels) {
      // Check if price is acceptable to external trader
      if (order.action === 'buy' && level.price > order.price) break;
      if (order.action === 'sell' && level.price < order.price) break;
      
      // Calculate execution at this level
      const levelQuantity = Math.min(remainingQuantity, level.quantity);
      totalCost += levelQuantity * level.price;
      executedQuantity += levelQuantity;
      remainingQuantity -= levelQuantity;
      worstPrice = level.price;
      
      // Deplete liquidity at this level
      level.quantity -= levelQuantity;
      
      if (remainingQuantity <= 0) break;
    }
    
    // If no execution possible
    if (executedQuantity === 0) {
      return null;
    }
    
    // Calculate average execution price
    const avgExecutionPrice = totalCost / executedQuantity;
    
    // Apply market impact based on order size and current liquidity
    const marketImpact = this.calculateMarketImpact(
      order.action, 
      executedQuantity * avgExecutionPrice,
      extendedSim
    );
    
    // Update current price based on execution
    const priceImpact = order.action === 'buy' ? marketImpact : -marketImpact;
    extendedSim.currentPrice = currentPrice * (1 + priceImpact);
    
    // Create trade record with unique ID - using simulation time
    this.tradeCounter++;
    const tradeId = `ext_${order.traderType}_${extendedSim.currentTime}_${this.tradeCounter}_${Math.random().toString(36).substr(2, 6)}`;
    
    const trade: ExtendedTrade = {
      id: tradeId,
      timestamp: order.timestamp,
      trader: {
        walletAddress: `${order.traderType}_${order.id.slice(0, 8)}`,
        netPnl: 0,
        totalVolume: executedQuantity * avgExecutionPrice,
        buyVolume: order.action === 'buy' ? executedQuantity * avgExecutionPrice : 0,
        sellVolume: order.action === 'sell' ? executedQuantity * avgExecutionPrice : 0,
        tradeCount: 1,
        feesUsd: executedQuantity * avgExecutionPrice * 0.001, // 0.1% fee
        winRate: 0.5,
        riskProfile: 'aggressive' as const,
        portfolioEfficiency: 0
      },
      action: order.action,
      price: avgExecutionPrice,
      quantity: executedQuantity,
      value: executedQuantity * avgExecutionPrice,
      impact: priceImpact,
      source: 'external',
      externalTraderType: order.traderType
    };
    
    // Update market conditions based on external activity
    this.updateMarketConditionsFromExternal(extendedSim, trade);
    
    // Update volume on current candle
    const currentCandle = extendedSim.priceHistory[extendedSim.priceHistory.length - 1];
    if (currentCandle) {
      currentCandle.volume += executedQuantity;
    }
    
    return trade as Trade;
  }

  calculateBaseVolatility(price: number): number {
    // More consistent volatility across the $1-$50 range
    if (price < 5) return 0.015;        // 1.5% base volatility for $1-$5
    if (price < 10) return 0.012;       // 1.2% for $5-$10
    if (price < 20) return 0.010;       // 1.0% for $10-$20
    if (price < 35) return 0.008;       // 0.8% for $20-$35
    return 0.006;                       // 0.6% for $35-$50
  }

  generateRandomTokenPrice(): number {
    // Generate prices between $1 and $50 with a bias towards lower prices
    const priceRanges = SIMULATION_CONSTANTS.PRICE_RANGES;

    // Random selection based on weights
    const random = Math.random();
    let cumulative = 0;

    for (const range of priceRanges) {
      cumulative += range.weight;
      if (random <= cumulative) {
        // Generate price within this range
        return range.min + Math.random() * (range.max - range.min);
      }
    }

    // Fallback to mid-range
    return 10 + Math.random() * 10; // $10-$20
  }

  private calculateMarketImpact(
    action: 'buy' | 'sell',
    orderValue: number,
    simulation: ExtendedSimulationState
  ): number {
    const { marketConditions } = simulation;
    
    // Get order book depth if available
    let liquidityDepth = 1000000; // Default liquidity
    if (this.orderBookManager) {
      const depth = this.orderBookManager.getMarketDepth(simulation, 1);
      liquidityDepth = action === 'buy' ? depth.askDepth : depth.bidDepth;
    }
    
    // Base impact calculation
    let impact = orderValue / (liquidityDepth + orderValue) * 0.01; // Max 1% from liquidity
    
    // Adjust for market conditions
    impact *= (1 + marketConditions.volatility); // Higher volatility = higher impact
    
    // Adjust for TPS mode (higher TPS = more chaotic = higher impact)
    if (simulation.currentTPSMode === TPSMode.HFT) {
      impact *= 3;
    } else if (simulation.currentTPSMode === TPSMode.STRESS) {
      impact *= 2;
    }
    
    // Cap maximum impact
    return Math.min(impact, 0.05); // Max 5% price impact per order
  }

  private updateMarketConditionsFromExternal(
    simulation: ExtendedSimulationState,
    trade: ExtendedTrade
  ): void {
    const { marketConditions } = simulation;
    
    // Increase volume from external activity
    marketConditions.volume += trade.value;
    
    // Adjust volatility based on external trader type
    switch (trade.externalTraderType) {
      case ExternalTraderType.WHALE:
        marketConditions.volatility *= 1.2; // Whales increase volatility
        break;
      case ExternalTraderType.PANIC_SELLER:
        marketConditions.volatility *= 1.1;
        if (marketConditions.trend !== 'bearish') {
          marketConditions.trend = 'bearish'; // Panic selling creates bearish trend
        }
        break;
      case ExternalTraderType.MEV_BOT:
        marketConditions.volatility *= 1.05; // MEV adds some chaos
        break;
    }
    
    // Cap volatility
    marketConditions.volatility = Math.min(marketConditions.volatility, 0.1);
  }

  private updateMarketTrend(simulation: SimulationState): void {
    if (simulation.priceHistory.length >= 10) {
      const recentPrices = simulation.priceHistory.slice(-10);
      const firstPrice = recentPrices[0].close;
      const lastPrice = simulation.currentPrice;
      const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;

      // Adjust trend thresholds based on price level
      const currentPrice = simulation.currentPrice;
      const bullishThreshold = currentPrice < 1 ? 5 : 2;
      const bearishThreshold = currentPrice < 1 ? -3 : -1.5;

      if (percentChange > bullishThreshold) {
        simulation.marketConditions.trend = 'bullish';
      } else if (percentChange < bearishThreshold) {
        simulation.marketConditions.trend = 'bearish';
      } else {
        simulation.marketConditions.trend = 'sideways';
      }

      // Also update volatility based on recent price changes
      const volatility = TechnicalIndicators.calculateVolatility(recentPrices);
      simulation.marketConditions.volatility = volatility;
    }
  }
}