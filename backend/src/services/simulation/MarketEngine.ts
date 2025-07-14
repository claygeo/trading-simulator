// backend/src/services/simulation/MarketEngine.ts - FIXED: Proper Timestamp Handling
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
    console.log('🚀 MarketEngine initialized with FIXED timestamp handling');
  }

  async updatePrice(simulation: SimulationState): Promise<void> {
    const extendedSim = simulation as ExtendedSimulationState;
    const { marketConditions, currentPrice } = extendedSim;
    const activeScenario = (extendedSim as any).activeScenario as ActiveScenario | undefined;

    let baseVolatility = this.calculateAggressiveBaseVolatility(currentPrice);

    // Calculate market momentum from recent trades with higher impact
    const recentTrades = extendedSim.recentTrades.slice(0, 100);
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
    
    if (extendedSim.externalMarketMetrics) {
      const { marketSentiment, currentTPS } = extendedSim.externalMarketMetrics;
      
      const tpsMultiplier = Math.log10(Math.max(1, currentTPS)) / 1.5;
      baseVolatility *= (1 + tpsMultiplier);
      
      let sentimentBias = 0;
      if (marketSentiment === 'bullish') {
        sentimentBias = 0.001 * (1 + volumeImbalance * 2);
      } else if (marketSentiment === 'bearish') {
        sentimentBias = -0.001 * (1 - volumeImbalance * 2);
      } else {
        sentimentBias = volumeImbalance * 0.0008;
      }
      
      const sentimentImpact = currentPrice * sentimentBias;
      extendedSim.currentPrice += sentimentImpact;
    }

    const timeframe = this.getCurrentTimeframe(extendedSim.id);
    const config = this.timeframeConfig(timeframe);

    let adjustedVolatility = baseVolatility * config.volatilityMultiplier * 0.5;
    
    if (Math.abs(volumeImbalance) > 0.2) {
      adjustedVolatility *= 2.0;
    }

    let trendFactor = 0;

    if (activeScenario && activeScenario.phase) {
      const { priceAction } = activeScenario;

      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.02 * priceAction.intensity;
          adjustedVolatility = baseVolatility * priceAction.volatility * 1.5;
          break;

        case 'pump':
          trendFactor = 0.02 * priceAction.intensity;
          adjustedVolatility = baseVolatility * priceAction.volatility * 1.5;
          break;

        case 'breakout':
          trendFactor = priceAction.direction === 'up' ? 0.01 * priceAction.intensity : -0.01 * priceAction.intensity;
          adjustedVolatility = baseVolatility * priceAction.volatility * 1.2;
          break;

        case 'trend':
          if (priceAction.direction === 'up') trendFactor = 0.004 * priceAction.intensity;
          else if (priceAction.direction === 'down') trendFactor = -0.004 * priceAction.intensity;
          adjustedVolatility = baseVolatility * 0.6;
          break;

        case 'consolidation':
          trendFactor = 0;
          adjustedVolatility = baseVolatility * 0.3;
          break;

        case 'accumulation':
          trendFactor = 0.001 * priceAction.intensity;
          adjustedVolatility = baseVolatility * 0.4;
          break;

        case 'distribution':
          trendFactor = -0.001 * priceAction.intensity;
          adjustedVolatility = baseVolatility * 0.4;
          break;
      }

      if (priceAction.direction === 'sideways') {
        trendFactor = 0;
      }
    } else {
      if (totalVolume > 0) {
        trendFactor = volumeImbalance * 0.001;
      }
      
      if (marketConditions.trend === 'bullish') {
        trendFactor += 0.0002;
      } else if (marketConditions.trend === 'bearish') {
        trendFactor -= 0.0002;
      }
      
      const priceHistory = extendedSim.priceHistory.slice(-15);
      if (priceHistory.length >= 15) {
        const avgPrice = priceHistory.reduce((sum, p) => sum + p.close, 0) / priceHistory.length;
        const deviation = (currentPrice - avgPrice) / avgPrice;
        
        if (Math.abs(deviation) > 0.03) {
          trendFactor -= deviation * 0.002;
        }
      }
    }

    const randomBase = Math.random() - 0.5;
    
    let randomFactor;
    const fatTailChance = Math.random();
    if (fatTailChance < 0.05) {
      randomFactor = randomBase * adjustedVolatility * 4;
    } else if (fatTailChance < 0.2) {
      randomFactor = randomBase * adjustedVolatility * 2;
    } else {
      randomFactor = randomBase * adjustedVolatility;
    }
    
    const microNoise = (Math.random() - 0.5) * 0.0001;

    const priceChange = currentPrice * (trendFactor + randomFactor + microNoise);
    const newPrice = currentPrice + priceChange;

    extendedSim.currentPrice = Math.max(SIMULATION_CONSTANTS.MIN_PRICE, newPrice);

    // CRITICAL FIX: Use synchronous candle updates with proper timestamp handling
    this.updatePriceCandlesSync(extendedSim);

    this.updateAggressiveMarketTrend(extendedSim);
    
    const changePercent = Math.abs(priceChange / currentPrice);
    marketConditions.volatility = marketConditions.volatility * 0.9 + changePercent * 0.1;
  }

  async updatePriceHighFrequency(simulation: SimulationState, volatilityFactor: number): Promise<void> {
    const extendedSim = simulation as ExtendedSimulationState;
    const { marketConditions, currentPrice } = extendedSim;
    const activeScenario = (extendedSim as any).activeScenario as ActiveScenario | undefined;

    let baseVolatility = this.calculateAggressiveBaseVolatility(currentPrice);

    if (extendedSim.externalMarketMetrics && extendedSim.currentTPSMode === TPSMode.HFT) {
      baseVolatility *= 3;
    }

    const timeframe = this.getCurrentTimeframe(extendedSim.id);
    const config = this.timeframeConfig(timeframe);

    let adjustedVolatility = baseVolatility * config.volatilityMultiplier * 0.5 * volatilityFactor;

    let trendFactor = 0;

    if (activeScenario && activeScenario.phase) {
      const { priceAction } = activeScenario;

      switch (priceAction.type) {
        case 'crash':
          trendFactor = -0.01 * priceAction.intensity * volatilityFactor;
          adjustedVolatility = baseVolatility * priceAction.volatility * volatilityFactor * 1.5;
          break;

        case 'pump':
          trendFactor = 0.01 * priceAction.intensity * volatilityFactor;
          adjustedVolatility = baseVolatility * priceAction.volatility * volatilityFactor * 1.5;
          break;

        default:
          trendFactor *= volatilityFactor * 1.5;
          adjustedVolatility *= volatilityFactor * 1.2;
      }
    } else {
      if (marketConditions.trend === 'bullish') trendFactor = 0.0001;
      else if (marketConditions.trend === 'bearish') trendFactor = -0.0001;
    }

    const randomFactor = (Math.random() - 0.5) * adjustedVolatility * 1.2;

    const priceChange = currentPrice * (trendFactor + randomFactor);
    const newPrice = currentPrice + priceChange;

    extendedSim.currentPrice = Math.max(SIMULATION_CONSTANTS.MIN_PRICE, newPrice);

    // CRITICAL FIX: Use synchronous candle updates
    this.updatePriceCandlesSync(extendedSim);
  }

  // CRITICAL FIX: Synchronous candle update method to prevent ordering issues
  private updatePriceCandlesSync(simulation: ExtendedSimulationState): void {
    const timeframe = this.simulationTimeframes.get(simulation.id) || this.getCurrentTimeframe(simulation.id);
    const config = this.timeframeConfig(timeframe);
    const candleManager = this.candleManagers.get(simulation.id);
    
    if (!candleManager) {
      console.error(`❌ No CandleManager found for simulation ${simulation.id}`);
      const newCandleManager = this.initializeCandleManager(simulation.id, config.interval);
      console.log(`🔄 Recreated CandleManager for simulation ${simulation.id}`);
      
      if (!this.candleManagers.get(simulation.id)) {
        console.error(`💥 Failed to recreate CandleManager`);
        return;
      }
    }
    
    const manager = this.candleManagers.get(simulation.id)!;
    
    // CRITICAL FIX: Use simulation time directly without rounding
    // The CandleManager will handle proper alignment internally
    const currentTime = simulation.currentTime;
    const currentVolume = this.calculateCurrentVolume(simulation);
    
    const previousCandleCount = simulation.priceHistory.length;
    
    console.log(`📈 PRICE UPDATE: time=${new Date(currentTime).toISOString().substr(11, 8)}, price=$${simulation.currentPrice.toFixed(6)}, vol=${currentVolume.toFixed(0)}`);
    
    try {
      // CRITICAL FIX: Synchronous candle update
      manager.updateCandle(currentTime, simulation.currentPrice, currentVolume);
      
      // Get updated candles from manager
      simulation.priceHistory = manager.getCandles(500);
      const finalCandleCount = simulation.priceHistory.length;
      
      if (finalCandleCount > previousCandleCount) {
        console.log(`🚀 CHART GROWTH: ${previousCandleCount} → ${finalCandleCount} candles`);
      }
      
      if (finalCandleCount <= 10 || finalCandleCount % 5 === 0) {
        console.log(`📊 CHART STATUS: ${finalCandleCount} candles | Interval: ${config.interval/1000}s`);
        
        if (simulation.priceHistory.length > 1) {
          const first = simulation.priceHistory[0];
          const last = simulation.priceHistory[simulation.priceHistory.length - 1];
          const duration = (last.timestamp - first.timestamp) / 60000;
          const priceChange = ((last.close - first.open) / first.open * 100);
          
          console.log(`   ⏱️ Span: ${duration.toFixed(1)}min | Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
          console.log(`   📈 Range: $${Math.min(...simulation.priceHistory.map(c => c.low)).toFixed(6)} - $${Math.max(...simulation.priceHistory.map(c => c.high)).toFixed(6)}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Candle update failed:`, error);
      console.error(`   Simulation: ${simulation.id} | Time: ${currentTime} | Price: ${simulation.currentPrice} | Volume: ${currentVolume}`);
    }
  }

  private calculateCurrentVolume(simulation: ExtendedSimulationState): number {
    const timeframe = this.simulationTimeframes.get(simulation.id) || this.getCurrentTimeframe(simulation.id);
    const config = this.timeframeConfig(timeframe);
    const currentCandleStart = Math.floor(simulation.currentTime / config.interval) * config.interval;
    
    const volumeInCurrentCandle = simulation.recentTrades
      .filter(trade => trade.timestamp >= currentCandleStart && trade.timestamp <= simulation.currentTime)
      .reduce((sum, trade) => sum + trade.quantity, 0);
    
    const minVolume = 500;
    const baseVolume = Math.max(minVolume, volumeInCurrentCandle);
    
    const volumeBoost = simulation.recentTrades.length < 10 ? 1000 : 0;
    
    return baseVolume + volumeBoost;
  }

  private initializeCandleManager(simulationId: string, candleInterval: number): CandleManager {
    try {
      console.log(`🏭 Creating CandleManager for ${simulationId}...`);
      
      const aggressiveInterval = Math.min(candleInterval, 8000);
      
      const manager = new CandleManager(aggressiveInterval);
      this.candleManagers.set(simulationId, manager);
      
      console.log(`🏭 CREATED: CandleManager for ${simulationId}:`);
      console.log(`   ⚡ Interval: ${aggressiveInterval}ms (${(aggressiveInterval/1000).toFixed(1)}s)`);
      console.log(`   🎯 Starting fresh for chart building`);
      
      return manager;
    } catch (error) {
      console.error(`❌ Failed to create CandleManager for ${simulationId}:`, error);
      
      try {
        const fallbackManager = new CandleManager(5000);
        this.candleManagers.set(simulationId, fallbackManager);
        console.log(`✅ Emergency CandleManager created successfully`);
        return fallbackManager;
      } catch (fallbackError) {
        console.error(`💥 Even fallback creation failed:`, fallbackError);
        
        const mockManager = {
          updateCandle: () => { console.log('Mock candle update'); },
          getCandles: () => [],
          clear: () => { console.log('Mock candle clear'); },
          shutdown: () => { console.log('Mock candle shutdown'); }
        } as any;
        
        this.candleManagers.set(simulationId, mockManager);
        console.log(`🆘 Mock manager created to prevent crash`);
        return mockManager;
      }
    }
  }

  processExternalOrder(order: ExternalOrder, simulation: SimulationState): Trade | null {
    const extendedSim = simulation as ExtendedSimulationState;
    const { orderBook, currentPrice } = extendedSim;
    
    const targetLevels = order.action === 'buy' ? orderBook.asks : orderBook.bids;
    
    if (targetLevels.length === 0) {
      return null;
    }
    
    let remainingQuantity = order.quantity;
    let totalCost = 0;
    let executedQuantity = 0;
    let worstPrice = order.price;
    
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
    
    const marketImpact = this.calculateAggressiveMarketImpact(
      order.action, 
      executedQuantity * avgExecutionPrice,
      extendedSim
    );
    
    const priceImpact = order.action === 'buy' ? marketImpact : -marketImpact;
    extendedSim.currentPrice = currentPrice * (1 + priceImpact);
    
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
        feesUsd: executedQuantity * avgExecutionPrice * 0.0015,
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
    
    this.updateAggressiveMarketConditionsFromExternal(extendedSim, trade);
    
    const currentCandle = extendedSim.priceHistory[extendedSim.priceHistory.length - 1];
    if (currentCandle) {
      currentCandle.volume += executedQuantity;
    }
    
    return trade as Trade;
  }

  calculateAggressiveBaseVolatility(price: number): number {
    if (price < 5) return 0.025;
    if (price < 10) return 0.020;
    if (price < 20) return 0.018;
    if (price < 35) return 0.015;
    return 0.012;
  }

  calculateBaseVolatility(price: number): number {
    return this.calculateAggressiveBaseVolatility(price);
  }

  generateRandomTokenPrice(priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega'): number {
    const priceCategories = {
      micro: { min: 0.0001, max: 0.01, weight: 0.25, description: 'Micro-cap (< $0.01)' },
      small: { min: 0.01, max: 1, weight: 0.30, description: 'Small-cap ($0.01 - $1)' },
      mid: { min: 1, max: 10, weight: 0.25, description: 'Mid-cap ($1 - $10)' },
      large: { min: 10, max: 100, weight: 0.15, description: 'Large-cap ($10 - $100)' },
      mega: { min: 100, max: 1000, weight: 0.05, description: 'Mega-cap ($100 - $1000)' }
    };

    let selectedCategory;

    if (priceRange && priceCategories[priceRange]) {
      selectedCategory = priceCategories[priceRange];
      console.log(`🎯 PRICE: Using specified range '${priceRange}' - ${selectedCategory.description}`);
    } else {
      const random = Math.random();
      let cumulative = 0;

      for (const [categoryName, category] of Object.entries(priceCategories)) {
        cumulative += category.weight;
        if (random <= cumulative) {
          selectedCategory = category;
          console.log(`🎲 PRICE: Randomly selected '${categoryName}' - ${category.description}`);
          break;
        }
      }

      if (!selectedCategory) {
        selectedCategory = priceCategories.mid;
        console.log(`🔄 PRICE: Fallback to mid-cap range`);
      }
    }

    const logMin = Math.log(selectedCategory.min);
    const logMax = Math.log(selectedCategory.max);
    const logPrice = logMin + Math.random() * (logMax - logMin);
    let price = Math.exp(logPrice);

    const variationFactor = 0.9 + Math.random() * 0.2;
    price *= variationFactor;

    price = Math.max(selectedCategory.min, Math.min(selectedCategory.max, price));

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

    console.log(`💰 PRICE GENERATED: $${price} (${selectedCategory.description})`);
    
    return price;
  }

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

  private calculateAggressiveMarketImpact(
    action: 'buy' | 'sell',
    orderValue: number,
    simulation: ExtendedSimulationState
  ): number {
    const { marketConditions } = simulation;
    
    let liquidityDepth = 1000000;
    if (this.orderBookManager) {
      const depth = this.orderBookManager.getMarketDepth(simulation, 1);
      liquidityDepth = action === 'buy' ? depth.askDepth : depth.bidDepth;
    }
    
    let impact = orderValue / (liquidityDepth + orderValue) * 0.02;
    
    impact *= (1 + marketConditions.volatility * 2);
    
    if (simulation.currentTPSMode === TPSMode.HFT) {
      impact *= 4;
    } else if (simulation.currentTPSMode === TPSMode.STRESS) {
      impact *= 3;
    }
    
    return Math.min(impact, 0.08);
  }

  private updateAggressiveMarketConditionsFromExternal(
    simulation: ExtendedSimulationState,
    trade: ExtendedTrade
  ): void {
    const { marketConditions } = simulation;
    
    marketConditions.volume += trade.value * 1.5;
    
    switch (trade.externalTraderType) {
      case ExternalTraderType.WHALE:
        marketConditions.volatility *= 1.4;
        break;
      case ExternalTraderType.PANIC_SELLER:
        marketConditions.volatility *= 1.3;
        if (marketConditions.trend !== 'bearish') {
          marketConditions.trend = 'bearish';
        }
        break;
      case ExternalTraderType.MEV_BOT:
        marketConditions.volatility *= 1.1;
        break;
    }
    
    marketConditions.volatility = Math.min(marketConditions.volatility, 0.15);
  }

  private updateAggressiveMarketTrend(simulation: SimulationState): void {
    if (simulation.priceHistory.length >= 5) {
      const recentPrices = simulation.priceHistory.slice(-5);
      const firstPrice = recentPrices[0].close;
      const lastPrice = simulation.currentPrice;
      const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;

      const currentPrice = simulation.currentPrice;
      const bullishThreshold = currentPrice < 1 ? 2 : 1;
      const bearishThreshold = currentPrice < 1 ? -1.5 : -0.75;

      if (percentChange > bullishThreshold) {
        simulation.marketConditions.trend = 'bullish';
      } else if (percentChange < bearishThreshold) {
        simulation.marketConditions.trend = 'bearish';
      } else {
        simulation.marketConditions.trend = 'sideways';
      }

      const volatility = TechnicalIndicators.calculateVolatility(recentPrices);
      simulation.marketConditions.volatility = volatility * 1.2;
    }
  }
}