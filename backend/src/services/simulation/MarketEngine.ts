// backend/src/services/simulation/MarketEngine.ts - ENHANCED: Dynamic Starting Price Generation
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
import { CandleManager } from './CandleManager';

export class MarketEngine implements IMarketEngine {
  private tradeCounter: number = 0;
  private lastCandleCreationLog: Map<string, number> = new Map();
  private simulationTimeframes: Map<string, Timeframe> = new Map();
  private candleManagers: Map<string, CandleManager> = new Map();

  constructor(
    private timeframeConfig: (timeframe: Timeframe) => TimeframeConfig,
    private getCurrentTimeframe: (simulationId: string) => Timeframe,
    private orderBookManager?: IOrderBookManager
  ) {
    console.log('🚀 AGGRESSIVE MarketEngine initialized with ultra-fast dynamics');
  }

  async updatePrice(simulation: SimulationState): Promise<void> {
    const extendedSim = simulation as ExtendedSimulationState;
    const { marketConditions, currentPrice } = extendedSim;
    const activeScenario = (extendedSim as any).activeScenario as ActiveScenario | undefined;

    // AGGRESSIVE: Enhanced base volatility for visible movement
    let baseVolatility = this.calculateAggressiveBaseVolatility(currentPrice);

    // Calculate market momentum from recent trades with higher impact
    const recentTrades = extendedSim.recentTrades.slice(0, 100); // Use more trades
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
    
    // AGGRESSIVE: Higher external market pressure effects
    if (extendedSim.externalMarketMetrics) {
      const { marketSentiment, currentTPS } = extendedSim.externalMarketMetrics;
      
      // AGGRESSIVE: Higher TPS multiplier for more volatility
      const tpsMultiplier = Math.log10(Math.max(1, currentTPS)) / 1.5; // Increased effect
      baseVolatility *= (1 + tpsMultiplier);
      
      // AGGRESSIVE: Stronger sentiment effects
      let sentimentBias = 0;
      if (marketSentiment === 'bullish') {
        sentimentBias = 0.001 * (1 + volumeImbalance * 2); // Double the effect
      } else if (marketSentiment === 'bearish') {
        sentimentBias = -0.001 * (1 - volumeImbalance * 2); // Double the effect
      } else {
        sentimentBias = volumeImbalance * 0.0008; // Higher neutral sentiment effect
      }
      
      // Apply stronger sentiment to price movement
      const sentimentImpact = currentPrice * sentimentBias;
      extendedSim.currentPrice += sentimentImpact;
    }

    // Get timeframe config
    const timeframe = this.getCurrentTimeframe(extendedSim.id);
    const config = this.timeframeConfig(timeframe);

    // AGGRESSIVE: Higher adjusted volatility with momentum amplification
    let adjustedVolatility = baseVolatility * config.volatilityMultiplier * 0.5; // Higher base (was 0.3)
    
    // AGGRESSIVE: Add stronger momentum-based volatility
    if (Math.abs(volumeImbalance) > 0.2) { // Lower threshold
      adjustedVolatility *= 2.0; // Higher multiplier (was 1.5)
    }

    // Random walk model with stronger trend bias
    let trendFactor = 0;

    // AGGRESSIVE: Apply scenario-specific price movements with higher intensity
    if (activeScenario && activeScenario.phase) {
      const { priceAction } = activeScenario;

      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.02 * priceAction.intensity; // Double the intensity
          adjustedVolatility = baseVolatility * priceAction.volatility * 1.5; // Higher volatility
          break;

        case 'pump':
          trendFactor = 0.02 * priceAction.intensity; // Double the intensity
          adjustedVolatility = baseVolatility * priceAction.volatility * 1.5; // Higher volatility
          break;

        case 'breakout':
          trendFactor = priceAction.direction === 'up' ? 0.01 * priceAction.intensity : -0.01 * priceAction.intensity; // Double
          adjustedVolatility = baseVolatility * priceAction.volatility * 1.2;
          break;

        case 'trend':
          if (priceAction.direction === 'up') trendFactor = 0.004 * priceAction.intensity; // Double
          else if (priceAction.direction === 'down') trendFactor = -0.004 * priceAction.intensity; // Double
          adjustedVolatility = baseVolatility * 0.6; // Slightly higher
          break;

        case 'consolidation':
          trendFactor = 0;
          adjustedVolatility = baseVolatility * 0.3; // Higher than before
          break;

        case 'accumulation':
          trendFactor = 0.001 * priceAction.intensity; // Double
          adjustedVolatility = baseVolatility * 0.4; // Higher
          break;

        case 'distribution':
          trendFactor = -0.001 * priceAction.intensity; // Double
          adjustedVolatility = baseVolatility * 0.4; // Higher
          break;
      }

      if (priceAction.direction === 'sideways') {
        trendFactor = 0;
      }
    } else {
      // AGGRESSIVE: Enhanced default behavior with stronger market dynamics
      
      // Stronger volume-weighted trend calculation
      if (totalVolume > 0) {
        trendFactor = volumeImbalance * 0.001; // Double the correlation (was 0.0005)
      }
      
      // Stronger market condition adjustments
      if (marketConditions.trend === 'bullish') {
        trendFactor += 0.0002; // Double the adjustment
      } else if (marketConditions.trend === 'bearish') {
        trendFactor -= 0.0002; // Double the adjustment
      }
      
      // AGGRESSIVE: Enhanced mean reversion with higher thresholds
      const priceHistory = extendedSim.priceHistory.slice(-15); // Use fewer candles for faster reaction
      if (priceHistory.length >= 15) {
        const avgPrice = priceHistory.reduce((sum, p) => sum + p.close, 0) / priceHistory.length;
        const deviation = (currentPrice - avgPrice) / avgPrice;
        
        // Stronger mean reversion at lower deviation thresholds
        if (Math.abs(deviation) > 0.03) { // Lower threshold (was 0.05)
          trendFactor -= deviation * 0.002; // Stronger pull (was 0.001)
        }
      }
    }

    // AGGRESSIVE: Enhanced random component with more dramatic moves
    const randomBase = Math.random() - 0.5;
    
    // AGGRESSIVE: More frequent and larger moves (fat tails)
    let randomFactor;
    const fatTailChance = Math.random();
    if (fatTailChance < 0.05) { // 5% chance of large move (was 2%)
      randomFactor = randomBase * adjustedVolatility * 4; // Higher multiplier (was 3)
    } else if (fatTailChance < 0.2) { // 15% chance of medium move (was 8%)
      randomFactor = randomBase * adjustedVolatility * 2; // Higher multiplier (was 1.5)
    } else {
      randomFactor = randomBase * adjustedVolatility;
    }
    
    // AGGRESSIVE: Higher market microstructure noise
    const microNoise = (Math.random() - 0.5) * 0.0001; // Double the noise (was 0.00005)

    // Calculate price change with all factors
    const priceChange = currentPrice * (trendFactor + randomFactor + microNoise);
    const newPrice = currentPrice + priceChange;

    // Update the current price with bounds
    extendedSim.currentPrice = Math.max(SIMULATION_CONSTANTS.MIN_PRICE, newPrice);

    // AGGRESSIVE: Use enhanced async candle updates with detailed logging
    await this.updateAggressivePriceCandles(extendedSim);

    // Update market trend based on recent price movement
    this.updateAggressiveMarketTrend(extendedSim);
    
    // AGGRESSIVE: Update volatility with higher sensitivity
    const changePercent = Math.abs(priceChange / currentPrice);
    marketConditions.volatility = marketConditions.volatility * 0.9 + changePercent * 0.1; // Higher sensitivity (was 0.05)
  }

  async updatePriceHighFrequency(simulation: SimulationState, volatilityFactor: number): Promise<void> {
    const extendedSim = simulation as ExtendedSimulationState;
    const { marketConditions, currentPrice } = extendedSim;
    const activeScenario = (extendedSim as any).activeScenario as ActiveScenario | undefined;

    // AGGRESSIVE: Much higher base volatility for HF mode
    let baseVolatility = this.calculateAggressiveBaseVolatility(currentPrice);

    // AGGRESSIVE: Account for external market pressure in HF mode with higher multipliers
    if (extendedSim.externalMarketMetrics && extendedSim.currentTPSMode === TPSMode.HFT) {
      baseVolatility *= 3; // Triple volatility in HFT mode (was double)
    }

    const timeframe = this.getCurrentTimeframe(extendedSim.id);
    const config = this.timeframeConfig(timeframe);

    // AGGRESSIVE: Higher volatility for high-frequency updates
    let adjustedVolatility = baseVolatility * config.volatilityMultiplier * 0.5 * volatilityFactor; // Higher (was 0.3)

    let trendFactor = 0;

    // AGGRESSIVE: Apply stronger scenario effects if active
    if (activeScenario && activeScenario.phase) {
      const { priceAction } = activeScenario;

      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.01 * priceAction.intensity * volatilityFactor; // Higher intensity (was 0.005)
          adjustedVolatility = baseVolatility * priceAction.volatility * volatilityFactor * 1.5; // Higher multiplier
          break;

        case 'pump':
          trendFactor = 0.01 * priceAction.intensity * volatilityFactor; // Higher intensity (was 0.005)
          adjustedVolatility = baseVolatility * priceAction.volatility * volatilityFactor * 1.5; // Higher multiplier
          break;

        default:
          trendFactor *= volatilityFactor * 1.5; // Higher multiplier
          adjustedVolatility *= volatilityFactor * 1.2; // Higher multiplier
      }
    } else {
      // AGGRESSIVE: Stronger default trend factors
      if (marketConditions.trend === 'bullish') trendFactor = 0.0001; // Double (was 0.00005)
      else if (marketConditions.trend === 'bearish') trendFactor = -0.0001; // Double (was -0.00005)
    }

    // AGGRESSIVE: Larger random component for more dramatic moves
    const randomFactor = (Math.random() - 0.5) * adjustedVolatility * 1.2; // Higher multiplier

    // Calculate price change
    const priceChange = currentPrice * (trendFactor + randomFactor);
    const newPrice = currentPrice + priceChange;

    // Update the current price with bounds
    extendedSim.currentPrice = Math.max(SIMULATION_CONSTANTS.MIN_PRICE, newPrice);

    // Update candles with aggressive async method
    await this.updateAggressivePriceCandles(extendedSim);
  }

  // AGGRESSIVE: Enhanced candle update method with detailed logging
  private async updateAggressivePriceCandles(simulation: ExtendedSimulationState): Promise<void> {
    const timeframe = this.simulationTimeframes.get(simulation.id) || this.getCurrentTimeframe(simulation.id);
    const config = this.timeframeConfig(timeframe);
    const candleManager = this.candleManagers.get(simulation.id);
    
    if (!candleManager) {
      console.error(`❌ AGGRESSIVE: No CandleManager found for simulation ${simulation.id}`);
      // Try to recreate it with aggressive parameters
      const newCandleManager = this.initializeAggressiveCandleManager(simulation.id, config.interval);
      console.log(`🔄 AGGRESSIVE: Recreated CandleManager for simulation ${simulation.id}`);
      
      if (!this.candleManagers.get(simulation.id)) {
        console.error(`💥 AGGRESSIVE: Failed to recreate CandleManager - using fallback`);
        return;
      }
    }
    
    const manager = this.candleManagers.get(simulation.id)!;
    
    // AGGRESSIVE: Use simulation time with precise rounding for ultra-fast intervals
    const roundedTime = Math.floor(simulation.currentTime / 100) * 100; // Round to nearest 100ms for precision
    const currentVolume = this.calculateAggressiveCurrentVolume(simulation);
    
    // Store previous state for aggressive comparison
    const previousCandleCount = simulation.priceHistory.length;
    
    console.log(`📈 AGGRESSIVE UPDATE: time=${new Date(roundedTime).toISOString().substr(11, 8)}, price=$${simulation.currentPrice.toFixed(6)}, vol=${currentVolume.toFixed(0)}`);
    
    try {
      // AGGRESSIVE: Update candle with rounded simulation time and higher volume
      await manager.updateCandle(roundedTime, simulation.currentPrice, currentVolume);
      
      // Get updated candles from manager
      simulation.priceHistory = manager.getCandles(500); // Keep more candles
      const finalCandleCount = simulation.priceHistory.length;
      
      // AGGRESSIVE: Enhanced success tracking with milestones
      if (finalCandleCount > previousCandleCount) {
        console.log(`🚀 AGGRESSIVE CHART GROWTH: ${previousCandleCount} → ${finalCandleCount} candles (${finalCandleCount <= 20 ? 'BUILDING' : 'MATURE'})`);
      }
      
      // AGGRESSIVE: Progress tracking for rapid chart building
      if (finalCandleCount <= 10 || finalCandleCount % 5 === 0) {
        console.log(`📊 AGGRESSIVE CHART: ${finalCandleCount} candles | Interval: ${config.interval/1000}s`);
        
        if (simulation.priceHistory.length > 1) {
          const first = simulation.priceHistory[0];
          const last = simulation.priceHistory[simulation.priceHistory.length - 1];
          const duration = (last.timestamp - first.timestamp) / 60000; // minutes
          const priceChange = ((last.close - first.open) / first.open * 100);
          
          console.log(`   ⏱️ Span: ${duration.toFixed(1)}min | Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
          console.log(`   📈 Range: $${Math.min(...simulation.priceHistory.map(c => c.low)).toFixed(6)} - $${Math.max(...simulation.priceHistory.map(c => c.high)).toFixed(6)}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ AGGRESSIVE ERROR: Candle update failed:`, error);
      console.error(`   Simulation: ${simulation.id} | Time: ${roundedTime} | Price: ${simulation.currentPrice} | Volume: ${currentVolume}`);
      
      // AGGRESSIVE: Don't let candle errors stop the aggressive simulation
    }
  }

  // AGGRESSIVE: Enhanced volume calculation with higher base volume
  private calculateAggressiveCurrentVolume(simulation: ExtendedSimulationState): number {
    const timeframe = this.simulationTimeframes.get(simulation.id) || this.getCurrentTimeframe(simulation.id);
    const config = this.timeframeConfig(timeframe);
    const currentCandleStart = Math.floor(simulation.currentTime / config.interval) * config.interval;
    
    // Get trades within the current candle period
    const volumeInCurrentCandle = simulation.recentTrades
      .filter(trade => trade.timestamp >= currentCandleStart && trade.timestamp <= simulation.currentTime)
      .reduce((sum, trade) => sum + trade.quantity, 0);
    
    // AGGRESSIVE: Higher minimum volume for better visibility
    const minVolume = 500; // Higher minimum (was 100)
    const baseVolume = Math.max(minVolume, volumeInCurrentCandle);
    
    // AGGRESSIVE: Add artificial volume boost for empty periods
    const volumeBoost = simulation.recentTrades.length < 10 ? 1000 : 0;
    
    return baseVolume + volumeBoost;
  }

  // AGGRESSIVE: Enhanced CandleManager initialization with ultra-fast intervals
  private initializeAggressiveCandleManager(simulationId: string, candleInterval: number): CandleManager {
    try {
      console.log(`🏭 AGGRESSIVE: Creating ultra-fast CandleManager for ${simulationId}...`);
      
      // AGGRESSIVE: Force even faster intervals
      const aggressiveInterval = Math.min(candleInterval, 8000); // Cap at 8 seconds max
      
      const manager = new CandleManager(aggressiveInterval);
      this.candleManagers.set(simulationId, manager);
      
      console.log(`🏭 AGGRESSIVE INIT: CandleManager for ${simulationId}:`);
      console.log(`   ⚡ Interval: ${aggressiveInterval}ms (${(aggressiveInterval/1000).toFixed(1)}s) - ULTRA FAST`);
      console.log(`   🎯 Starting fresh for rapid chart building`);
      console.log(`   ✅ CONSTRUCTOR FIXED - Using proper ES6 import`);
      
      return manager;
    } catch (error) {
      console.error(`❌ AGGRESSIVE CRITICAL: Failed to create CandleManager for ${simulationId}:`, error);
      console.error(`   This error was crashing the server - applying emergency fix`);
      
      // AGGRESSIVE: Emergency fallback with mock manager
      console.log(`🆘 AGGRESSIVE FALLBACK: Creating emergency mock CandleManager...`);
      
      try {
        const fallbackManager = new CandleManager(5000); // 5-second fallback
        this.candleManagers.set(simulationId, fallbackManager);
        console.log(`✅ AGGRESSIVE FALLBACK: Emergency CandleManager created successfully`);
        return fallbackManager;
      } catch (fallbackError) {
        console.error(`💥 AGGRESSIVE CRITICAL: Even fallback creation failed:`, fallbackError);
        
        // Last resort mock to prevent server crash
        const mockManager = {
          updateCandle: async () => { console.log('Mock aggressive candle update'); },
          getCandles: () => [],
          clear: () => { console.log('Mock aggressive candle clear'); },
          shutdown: () => { console.log('Mock aggressive candle shutdown'); }
        } as any;
        
        this.candleManagers.set(simulationId, mockManager);
        console.log(`🆘 AGGRESSIVE LAST RESORT: Mock manager created to prevent crash`);
        return mockManager;
      }
    }
  }

  processExternalOrder(order: ExternalOrder, simulation: SimulationState): Trade | null {
    const extendedSim = simulation as ExtendedSimulationState;
    const { orderBook, currentPrice } = extendedSim;
    
    // AGGRESSIVE: Implement more realistic order matching with higher impact
    const targetLevels = order.action === 'buy' ? orderBook.asks : orderBook.bids;
    
    if (targetLevels.length === 0) {
      return null;
    }
    
    let remainingQuantity = order.quantity;
    let totalCost = 0;
    let executedQuantity = 0;
    let worstPrice = order.price;
    
    // Walk through order book levels
    for (const level of targetLevels) {
      if (order.action === 'buy' && level.price > order.price) break;
      if (order.action === 'sell' && level.price < order.price) break;
      
      const levelQuantity = Math.min(remainingQuantity, level.quantity);
      totalCost += levelQuantity * level.price;
      executedQuantity += levelQuantity;
      remainingQuantity -= levelQuantity;
      worstPrice = level.price;
      
      level.quantity -= levelQuantity;
      
      if (remainingQuantity <= 0) break;
    }
    
    if (executedQuantity === 0) {
      return null;
    }
    
    const avgExecutionPrice = totalCost / executedQuantity;
    
    // AGGRESSIVE: Apply stronger market impact
    const marketImpact = this.calculateAggressiveMarketImpact(
      order.action, 
      executedQuantity * avgExecutionPrice,
      extendedSim
    );
    
    const priceImpact = order.action === 'buy' ? marketImpact : -marketImpact;
    extendedSim.currentPrice = currentPrice * (1 + priceImpact);
    
    // Create trade record with unique ID
    this.tradeCounter++;
    const tradeId = `aggressive_ext_${order.traderType}_${extendedSim.currentTime}_${this.tradeCounter}_${Math.random().toString(36).substr(2, 6)}`;
    
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
        feesUsd: executedQuantity * avgExecutionPrice * 0.0015, // Higher fee (was 0.001)
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
    
    // AGGRESSIVE: Update market conditions based on external activity
    this.updateAggressiveMarketConditionsFromExternal(extendedSim, trade);
    
    // Update volume on current candle
    const currentCandle = extendedSim.priceHistory[extendedSim.priceHistory.length - 1];
    if (currentCandle) {
      currentCandle.volume += executedQuantity;
    }
    
    return trade as Trade;
  }

  // AGGRESSIVE: Enhanced base volatility calculation
  calculateAggressiveBaseVolatility(price: number): number {
    // AGGRESSIVE: Higher base volatility across all price ranges
    if (price < 5) return 0.025;        // 2.5% base volatility (was 1.5%)
    if (price < 10) return 0.020;       // 2.0% (was 1.2%)
    if (price < 20) return 0.018;       // 1.8% (was 1.0%)
    if (price < 35) return 0.015;       // 1.5% (was 0.8%)
    return 0.012;                       // 1.2% (was 0.6%)
  }

  // Keep the existing method name for compatibility
  calculateBaseVolatility(price: number): number {
    return this.calculateAggressiveBaseVolatility(price);
  }

  // ENHANCED: Dynamic price generation with realistic distributions
  generateRandomTokenPrice(priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega'): number {
    // Enhanced price ranges with more realistic distributions
    const priceCategories = {
      micro: { min: 0.0001, max: 0.01, weight: 0.25, description: 'Micro-cap (< $0.01)' },
      small: { min: 0.01, max: 1, weight: 0.30, description: 'Small-cap ($0.01 - $1)' },
      mid: { min: 1, max: 10, weight: 0.25, description: 'Mid-cap ($1 - $10)' },
      large: { min: 10, max: 100, weight: 0.15, description: 'Large-cap ($10 - $100)' },
      mega: { min: 100, max: 1000, weight: 0.05, description: 'Mega-cap ($100 - $1000)' }
    };

    let selectedCategory;

    if (priceRange && priceCategories[priceRange]) {
      // Use specified range
      selectedCategory = priceCategories[priceRange];
      console.log(`🎯 DYNAMIC PRICE: Using specified range '${priceRange}' - ${selectedCategory.description}`);
    } else {
      // Weighted random selection for realistic distribution
      const random = Math.random();
      let cumulative = 0;

      for (const [categoryName, category] of Object.entries(priceCategories)) {
        cumulative += category.weight;
        if (random <= cumulative) {
          selectedCategory = category;
          console.log(`🎲 DYNAMIC PRICE: Randomly selected '${categoryName}' - ${category.description}`);
          break;
        }
      }

      // Fallback to mid-cap if selection fails
      if (!selectedCategory) {
        selectedCategory = priceCategories.mid;
        console.log(`🔄 DYNAMIC PRICE: Fallback to mid-cap range`);
      }
    }

    // Generate price within the selected range using log-normal distribution
    // This creates more realistic price clustering at lower values
    const logMin = Math.log(selectedCategory.min);
    const logMax = Math.log(selectedCategory.max);
    const logPrice = logMin + Math.random() * (logMax - logMin);
    let price = Math.exp(logPrice);

    // Add some additional randomness to avoid too much clustering
    const variationFactor = 0.9 + Math.random() * 0.2; // ±10% variation
    price *= variationFactor;

    // Ensure price stays within bounds
    price = Math.max(selectedCategory.min, Math.min(selectedCategory.max, price));

    // Round to appropriate decimal places based on price range
    if (price < 0.001) {
      price = parseFloat(price.toFixed(6));
    } else if (price < 0.01) {
      price = parseFloat(price.toFixed(5));
    } else if (price < 0.1) {
      price = parseFloat(price.toFixed(4));
    } else if (price < 1) {
      price = parseFloat(price.toFixed(3));
    } else if (price < 10) {
      price = parseFloat(price.toFixed(2));
    } else {
      price = parseFloat(price.toFixed(1));
    }

    console.log(`💰 DYNAMIC PRICE GENERATED: $${price} (${selectedCategory.description})`);
    
    return price;
  }

  // NEW: Get price category for a given price
  getPriceCategory(price: number): { category: string; description: string; range: string } {
    if (price < 0.01) {
      return { category: 'micro', description: 'Micro-cap', range: '< $0.01' };
    } else if (price < 1) {
      return { category: 'small', description: 'Small-cap', range: '$0.01 - $1' };
    } else if (price < 10) {
      return { category: 'mid', description: 'Mid-cap', range: '$1 - $10' };
    } else if (price < 100) {
      return { category: 'large', description: 'Large-cap', range: '$10 - $100' };
    } else {
      return { category: 'mega', description: 'Mega-cap', range: '$100+' };
    }
  }

  // AGGRESSIVE: Enhanced market impact calculation
  private calculateAggressiveMarketImpact(
    action: 'buy' | 'sell',
    orderValue: number,
    simulation: ExtendedSimulationState
  ): number {
    const { marketConditions } = simulation;
    
    let liquidityDepth = 1000000; // Default liquidity
    if (this.orderBookManager) {
      const depth = this.orderBookManager.getMarketDepth(simulation, 1);
      liquidityDepth = action === 'buy' ? depth.askDepth : depth.bidDepth;
    }
    
    // AGGRESSIVE: Higher base impact calculation
    let impact = orderValue / (liquidityDepth + orderValue) * 0.02; // Double max impact (was 0.01)
    
    // AGGRESSIVE: Stronger market condition adjustments
    impact *= (1 + marketConditions.volatility * 2); // Higher volatility multiplier
    
    // AGGRESSIVE: Higher TPS mode adjustments
    if (simulation.currentTPSMode === TPSMode.HFT) {
      impact *= 4; // Quadruple impact (was triple)
    } else if (simulation.currentTPSMode === TPSMode.STRESS) {
      impact *= 3; // Triple impact (was double)
    }
    
    // AGGRESSIVE: Higher maximum impact cap
    return Math.min(impact, 0.08); // Max 8% price impact (was 5%)
  }

  // AGGRESSIVE: Enhanced market conditions update from external trades
  private updateAggressiveMarketConditionsFromExternal(
    simulation: ExtendedSimulationState,
    trade: ExtendedTrade
  ): void {
    const { marketConditions } = simulation;
    
    // AGGRESSIVE: Higher volume increase from external activity
    marketConditions.volume += trade.value * 1.5; // Higher multiplier
    
    // AGGRESSIVE: Stronger volatility adjustments based on trader type
    switch (trade.externalTraderType) {
      case ExternalTraderType.WHALE:
        marketConditions.volatility *= 1.4; // Higher impact (was 1.2)
        break;
      case ExternalTraderType.PANIC_SELLER:
        marketConditions.volatility *= 1.3; // Higher impact (was 1.1)
        if (marketConditions.trend !== 'bearish') {
          marketConditions.trend = 'bearish';
        }
        break;
      case ExternalTraderType.MEV_BOT:
        marketConditions.volatility *= 1.1; // Higher impact (was 1.05)
        break;
    }
    
    // AGGRESSIVE: Higher volatility cap
    marketConditions.volatility = Math.min(marketConditions.volatility, 0.15); // Higher cap (was 0.1)
  }

  // AGGRESSIVE: Enhanced market trend update
  private updateAggressiveMarketTrend(simulation: SimulationState): void {
    if (simulation.priceHistory.length >= 5) { // Use fewer candles for faster reaction
      const recentPrices = simulation.priceHistory.slice(-5); // Fewer candles (was 10)
      const firstPrice = recentPrices[0].close;
      const lastPrice = simulation.currentPrice;
      const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;

      // AGGRESSIVE: Lower thresholds for more sensitive trend detection
      const currentPrice = simulation.currentPrice;
      const bullishThreshold = currentPrice < 1 ? 2 : 1; // Lower thresholds
      const bearishThreshold = currentPrice < 1 ? -1.5 : -0.75; // Lower thresholds

      if (percentChange > bullishThreshold) {
        simulation.marketConditions.trend = 'bullish';
      } else if (percentChange < bearishThreshold) {
        simulation.marketConditions.trend = 'bearish';
      } else {
        simulation.marketConditions.trend = 'sideways';
      }

      // AGGRESSIVE: Update volatility with higher sensitivity
      const volatility = TechnicalIndicators.calculateVolatility(recentPrices);
      simulation.marketConditions.volatility = volatility * 1.2; // Higher base volatility
    }
  }
}