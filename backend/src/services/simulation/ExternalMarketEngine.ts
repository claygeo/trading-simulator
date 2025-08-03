// backend/src/services/simulation/ExternalMarketEngine.ts - FIXED: Simplified Clean Architecture
import { v4 as uuidv4 } from 'uuid';
import { 
  SimulationState, 
  Trade,
  IExternalMarketEngine,
  ExternalTraderType,
  TPSMode,
  ExternalOrder,
  MarketConditions
} from './types';
import { ObjectPool } from '../../utils/objectPool';

export class ExternalMarketEngine implements IExternalMarketEngine {
  // 🚨 CRITICAL FIX: Simplified pool management - no complex over-engineering
  private orderPool: ObjectPool<ExternalOrder>;
  private currentTPSMode: TPSMode = TPSMode.NORMAL;
  private externalOrderQueue: ExternalOrder[] = [];
  private lastProcessTime: number = 0;
  private orderCounter: number = 0;
  
  // Simplified metrics tracking
  private processedOrdersCount: number = 0;
  private rejectedOrdersCount: number = 0;
  private tpsHistory: number[] = [];
  private lastTPSCalculation: number = 0;
  
  // 🔧 FIXED: Clean broadcast throttling
  private lastBroadcastTime: number = 0;
  private lastBroadcastData: string = '';
  private readonly BROADCAST_THROTTLE_MS = 3000;
  private readonly MIN_ACTIVITY_THRESHOLD = 5;
  
  constructor(
    private processOrder: (order: ExternalOrder, simulation: SimulationState) => Trade | null,
    private broadcastEvent: (simulationId: string, event: any) => void
  ) {
    // 🚨 CRITICAL FIX: Simple, clean pool initialization
    this.orderPool = new ObjectPool<ExternalOrder>(
      () => ({
        id: '',
        timestamp: 0,
        traderType: ExternalTraderType.RETAIL_TRADER,
        action: 'buy',
        price: 0,
        quantity: 0,
        priority: 1,
        strategy: 'momentum'
      }),
      (order) => {
        order.id = '';
        order.timestamp = 0;
        order.traderType = ExternalTraderType.RETAIL_TRADER;
        order.action = 'buy';
        order.price = 0;
        order.quantity = 0;
        order.priority = 1;
        order.strategy = 'momentum';
      },
      1000 // Reasonable pool size - not over-engineered
    );
    
    console.log('🏭 ExternalMarketEngine: Initialized with clean architecture');
  }
  
  // 🚨 CRITICAL FIX: Simplified trader configurations
  private readonly traderConfigs = {
    [ExternalTraderType.ARBITRAGE_BOT]: {
      baseFrequency: 0.3,
      sizeRange: { min: 5000, max: 50000 },
      priceDeviation: 0.001,
      strategy: 'arbitrage',
      priority: 3
    },
    [ExternalTraderType.RETAIL_TRADER]: {
      baseFrequency: 0.2,
      sizeRange: { min: 100, max: 5000 },
      priceDeviation: 0.01,
      strategy: 'momentum',
      priority: 1
    },
    [ExternalTraderType.MARKET_MAKER]: {
      baseFrequency: 0.4,
      sizeRange: { min: 10000, max: 100000 },
      priceDeviation: 0.002,
      strategy: 'liquidity',
      priority: 2
    },
    [ExternalTraderType.MEV_BOT]: {
      baseFrequency: 0.05,
      sizeRange: { min: 1000, max: 20000 },
      priceDeviation: 0.0001,
      strategy: 'sandwich',
      priority: 4
    },
    [ExternalTraderType.WHALE]: {
      baseFrequency: 0.02,
      sizeRange: { min: 100000, max: 1000000 },
      priceDeviation: 0.05,
      strategy: 'accumulation',
      priority: 2
    },
    [ExternalTraderType.PANIC_SELLER]: {
      baseFrequency: 0.03,
      sizeRange: { min: 500, max: 10000 },
      priceDeviation: 0.1,
      strategy: 'panic',
      priority: 1
    }
  };

  // 🚨 CRITICAL FIX: Clean TPS mode configurations
  private readonly tpsModeConfigs = {
    [TPSMode.NORMAL]: {
      targetTPS: 25,
      traderMix: {
        [ExternalTraderType.MARKET_MAKER]: 0.4,
        [ExternalTraderType.RETAIL_TRADER]: 0.4,
        [ExternalTraderType.ARBITRAGE_BOT]: 0.2,
        [ExternalTraderType.MEV_BOT]: 0.0,
        [ExternalTraderType.WHALE]: 0.0,
        [ExternalTraderType.PANIC_SELLER]: 0.0
      },
      volatilityMultiplier: 1,
      orderBurstSize: 1
    },
    [TPSMode.BURST]: {
      targetTPS: 150,
      traderMix: {
        [ExternalTraderType.RETAIL_TRADER]: 0.5,
        [ExternalTraderType.ARBITRAGE_BOT]: 0.3,
        [ExternalTraderType.MARKET_MAKER]: 0.2,
        [ExternalTraderType.MEV_BOT]: 0.0,
        [ExternalTraderType.WHALE]: 0.0,
        [ExternalTraderType.PANIC_SELLER]: 0.0
      },
      volatilityMultiplier: 1.5,
      orderBurstSize: 3
    },
    [TPSMode.STRESS]: {
      targetTPS: 1500,
      traderMix: {
        [ExternalTraderType.PANIC_SELLER]: 0.3,
        [ExternalTraderType.ARBITRAGE_BOT]: 0.3,
        [ExternalTraderType.RETAIL_TRADER]: 0.2,
        [ExternalTraderType.MEV_BOT]: 0.1,
        [ExternalTraderType.WHALE]: 0.1,
        [ExternalTraderType.MARKET_MAKER]: 0.0
      },
      volatilityMultiplier: 3,
      orderBurstSize: 10
    },
    [TPSMode.HFT]: {
      targetTPS: 15000,
      traderMix: {
        [ExternalTraderType.ARBITRAGE_BOT]: 0.4,
        [ExternalTraderType.MEV_BOT]: 0.3,
        [ExternalTraderType.MARKET_MAKER]: 0.2,
        [ExternalTraderType.WHALE]: 0.05,
        [ExternalTraderType.PANIC_SELLER]: 0.05,
        [ExternalTraderType.RETAIL_TRADER]: 0.0
      },
      volatilityMultiplier: 5,
      orderBurstSize: 50
    }
  };

  setTPSMode(mode: TPSMode): void {
    this.currentTPSMode = mode;
    console.log(`🔧 [EXTERNAL] TPS mode set to ${TPSMode[mode]}`);
    
    // Clean reset when mode changes
    this.lastProcessTime = 0;
    this.lastTPSCalculation = 0;
    this.processedOrdersCount = 0;
    this.rejectedOrdersCount = 0;
    this.tpsHistory = [];
    this.lastBroadcastTime = 0;
    this.lastBroadcastData = '';
    this.externalOrderQueue = [];
    
    console.log(`🎯 [EXTERNAL] Target TPS: ${this.tpsModeConfigs[mode].targetTPS}`);
  }

  // 🚨 CRITICAL FIX: Simplified order generation
  generateExternalOrders(simulation: SimulationState): ExternalOrder[] {
    const config = this.tpsModeConfigs[this.currentTPSMode];
    const now = Date.now();
    
    if (this.lastProcessTime === 0) {
      this.lastProcessTime = now;
      return [];
    }
    
    const timeDelta = now - this.lastProcessTime;
    this.lastProcessTime = now;

    // Clean TPS calculation
    const targetOrdersPerSecond = config.targetTPS;
    const baseOrdersToGenerate = (targetOrdersPerSecond * timeDelta) / 1000;
    
    const randomMultiplier = 0.8 + (Math.random() * 0.4); // 80% to 120%
    const ordersToGenerate = Math.max(
      this.currentTPSMode === TPSMode.NORMAL ? 1 : 2,
      Math.ceil(baseOrdersToGenerate * randomMultiplier)
    );
    
    const orders: ExternalOrder[] = [];
    const burstSize = config.orderBurstSize;
    const effectiveOrders = Math.min(ordersToGenerate * burstSize, this.getMaxOrdersPerTick());

    for (let i = 0; i < effectiveOrders; i++) {
      const traderType = this.selectTraderType(config.traderMix);
      const order = this.generateOrderForTrader(traderType, simulation);
      if (order) {
        orders.push(order);
      }
    }

    if (orders.length > 0) {
      console.log(`🏭 [ORDER GEN] Generated ${orders.length} orders in ${TPSMode[this.currentTPSMode]} mode`);
    }

    return orders;
  }

  // 🚨 CRITICAL FIX: Clean order processing
  processExternalOrders(simulation: SimulationState): Trade[] {
    const newOrders = this.generateExternalOrders(simulation);
    this.externalOrderQueue.push(...newOrders);

    // Sort by priority
    this.externalOrderQueue.sort((a, b) => b.priority - a.priority);

    const maxOrdersPerTick = this.getMaxOrdersPerTick();
    const ordersToProcess = this.externalOrderQueue.splice(0, maxOrdersPerTick);
    const trades: Trade[] = [];
    let processedCount = 0;
    let rejectedCount = 0;

    for (const order of ordersToProcess) {
      try {
        const trade = this.processOrder(order, simulation);
        if (trade) {
          trades.push(trade);
          processedCount++;
        } else {
          rejectedCount++;
        }
      } catch (error) {
        console.error('Error processing external order:', error);
        rejectedCount++;
      } finally {
        this.orderPool.release(order);
      }
    }

    // Update metrics
    this.processedOrdersCount += processedCount;
    this.rejectedOrdersCount += rejectedCount;
    
    // Calculate TPS
    const now = Date.now();
    if (now - this.lastTPSCalculation >= 1000) {
      const actualTPS = processedCount;
      this.tpsHistory.push(actualTPS);
      
      if (this.tpsHistory.length > 10) {
        this.tpsHistory.shift();
      }
      
      this.lastTPSCalculation = now;
    }

    // 🔧 FIXED: Clean broadcast logic
    if (this.shouldBroadcastMarketPressure(trades.length, this.externalOrderQueue.length)) {
      this.throttledBroadcastMarketPressure(simulation.id, trades.length, this.externalOrderQueue.length);
    }

    if (trades.length > 5) {
      console.log(`💹 [TRADES] Processed ${trades.length} external trades in ${TPSMode[this.currentTPSMode]} mode`);
    }

    return trades;
  }

  // 🚨 CRITICAL FIX: Simplified MEV detection
  detectMEVOpportunity(simulation: SimulationState, pendingOrder: any): ExternalOrder | null {
    if (this.currentTPSMode !== TPSMode.HFT && this.currentTPSMode !== TPSMode.STRESS) {
      return null;
    }

    const { currentPrice } = simulation;
    const orderSize = pendingOrder.quantity * pendingOrder.price;
    
    // Simple MEV detection for large orders
    if (orderSize > 10000) {
      const mevBot = this.orderPool.acquire();
      
      this.orderCounter++;
      const uniqueId = `mev_${Date.now()}_${this.orderCounter}`;
      
      mevBot.id = uniqueId;
      mevBot.timestamp = Date.now();
      mevBot.traderType = ExternalTraderType.MEV_BOT;
      mevBot.action = pendingOrder.action;
      mevBot.price = currentPrice * (pendingOrder.action === 'buy' ? 1.001 : 0.999);
      mevBot.quantity = orderSize * 0.3 / mevBot.price;
      mevBot.priority = 5;
      mevBot.strategy = 'sandwich';
      
      return mevBot;
    }

    return null;
  }

  // 🚨 CRITICAL FIX: Clean metrics calculation
  getMarketPressureMetrics(): {
    currentTPS: number;
    actualTPS: number;
    queueDepth: number;
    dominantTraderType: ExternalTraderType;
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
    processedOrders: number;
    rejectedOrders: number;
    avgTPS: number;
  } {
    const config = this.tpsModeConfigs[this.currentTPSMode];
    
    const avgTPS = this.tpsHistory.length > 0 
      ? Math.round(this.tpsHistory.reduce((sum, tps) => sum + tps, 0) / this.tpsHistory.length)
      : 0;
    
    // Analyze queue for sentiment
    let buyPressure = 0;
    let sellPressure = 0;
    const traderCounts: Record<ExternalTraderType, number> = {} as any;

    this.externalOrderQueue.forEach(order => {
      if (order.action === 'buy') {
        buyPressure += order.quantity * order.price;
      } else {
        sellPressure += order.quantity * order.price;
      }
      
      traderCounts[order.traderType] = (traderCounts[order.traderType] || 0) + 1;
    });

    const dominantTraderType = Object.entries(traderCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] as ExternalTraderType || ExternalTraderType.RETAIL_TRADER;

    let marketSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (buyPressure > sellPressure * 1.2) marketSentiment = 'bullish';
    else if (sellPressure > buyPressure * 1.2) marketSentiment = 'bearish';

    return {
      currentTPS: config.targetTPS,
      actualTPS: avgTPS,
      queueDepth: this.externalOrderQueue.length,
      dominantTraderType,
      marketSentiment,
      processedOrders: this.processedOrdersCount,
      rejectedOrders: this.rejectedOrdersCount,
      avgTPS: avgTPS
    };
  }

  // 🚨 CRITICAL FIX: Clean liquidation cascade
  triggerLiquidationCascade(simulation: SimulationState): ExternalOrder[] {
    if (this.currentTPSMode !== TPSMode.STRESS && this.currentTPSMode !== TPSMode.HFT) {
      return [];
    }

    const orders: ExternalOrder[] = [];
    const cascadeSize = Math.floor(Math.random() * 30) + 20; // 20-50 liquidations

    console.log(`💥 [LIQUIDATION] Generating ${cascadeSize} liquidation orders`);

    for (let i = 0; i < cascadeSize; i++) {
      const order = this.orderPool.acquire();
      
      this.orderCounter++;
      const uniqueId = `liq_${Date.now()}_${this.orderCounter}_${i}`;
      
      order.id = uniqueId;
      order.timestamp = Date.now() + i;
      order.traderType = ExternalTraderType.PANIC_SELLER;
      order.action = 'sell';
      order.price = simulation.currentPrice * (0.85 - i * 0.005);
      order.quantity = (Math.random() * 80000 + 20000) / order.price;
      order.priority = 3;
      order.strategy = 'liquidation';
      
      orders.push(order);
    }

    this.externalOrderQueue.unshift(...orders);

    console.log(`✅ [LIQUIDATION] Cascade queued: ${cascadeSize} orders`);
    return orders;
  }

  // 🔧 FIXED: Clean broadcast decision logic
  private shouldBroadcastMarketPressure(tradesProcessed: number, queueDepth: number): boolean {
    const now = Date.now();
    
    if (now - this.lastBroadcastTime < this.BROADCAST_THROTTLE_MS) {
      return false;
    }
    
    if (tradesProcessed === 0 && queueDepth < this.MIN_ACTIVITY_THRESHOLD) {
      return false;
    }
    
    const currentMetrics = this.getMarketPressureMetrics();
    const currentDataSnapshot = JSON.stringify({
      actualTPS: currentMetrics.actualTPS,
      queueDepth: currentMetrics.queueDepth,
      marketSentiment: currentMetrics.marketSentiment,
      dominantTraderType: currentMetrics.dominantTraderType
    });
    
    if (this.lastBroadcastData === currentDataSnapshot) {
      return false;
    }
    
    return true;
  }

  // 🔧 FIXED: Clean broadcast method
  private throttledBroadcastMarketPressure(
    simulationId: string, 
    processedOrders: number, 
    queueDepth: number
  ): void {
    const now = Date.now();
    
    this.lastBroadcastTime = now;
    
    const metrics = this.getMarketPressureMetrics();
    
    this.lastBroadcastData = JSON.stringify({
      actualTPS: metrics.actualTPS,
      queueDepth: metrics.queueDepth,
      marketSentiment: metrics.marketSentiment,
      dominantTraderType: metrics.dominantTraderType
    });
    
    console.log(`📊 [BROADCAST] Market pressure for ${simulationId}: actualTPS=${metrics.actualTPS}, queueDepth=${queueDepth}`);
    
    this.broadcastEvent(simulationId, {
      type: 'external_market_pressure',
      timestamp: now,
      data: {
        tpsMode: TPSMode[this.currentTPSMode],
        processedOrders,
        queueDepth,
        metrics: metrics
      }
    });
  }

  private selectTraderType(traderMix: Record<ExternalTraderType, number>): ExternalTraderType {
    const random = Math.random();
    let cumulative = 0;

    for (const [type, weight] of Object.entries(traderMix)) {
      cumulative += weight;
      if (random <= cumulative) {
        return type as ExternalTraderType;
      }
    }

    return ExternalTraderType.RETAIL_TRADER;
  }

  // 🚨 CRITICAL FIX: Simplified order generation
  private generateOrderForTrader(
    traderType: ExternalTraderType, 
    simulation: SimulationState
  ): ExternalOrder | null {
    const config = this.traderConfigs[traderType];
    const { currentPrice, marketConditions } = simulation;

    // Clean action selection
    let action: 'buy' | 'sell' = 'buy';
    
    switch (traderType) {
      case ExternalTraderType.ARBITRAGE_BOT:
        action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
        
      case ExternalTraderType.RETAIL_TRADER:
        if (marketConditions.trend === 'bullish') {
          action = Math.random() > 0.25 ? 'buy' : 'sell';
        } else if (marketConditions.trend === 'bearish') {
          action = Math.random() > 0.75 ? 'buy' : 'sell';
        } else {
          action = Math.random() > 0.5 ? 'buy' : 'sell';
        }
        break;
        
      case ExternalTraderType.MARKET_MAKER:
        action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
        
      case ExternalTraderType.MEV_BOT:
        return null;
        
      case ExternalTraderType.WHALE:
        const priceRatio = currentPrice / simulation.parameters.initialPrice;
        if (priceRatio < 0.9) {
          action = 'buy';
        } else if (priceRatio > 1.3) {
          action = 'sell';
        } else {
          if (Math.random() > 0.7) {
            action = Math.random() > 0.5 ? 'buy' : 'sell';
          } else {
            return null;
          }
        }
        break;
        
      case ExternalTraderType.PANIC_SELLER:
        action = 'sell';
        break;
    }

    // Generate order
    const order = this.orderPool.acquire();
    
    this.orderCounter++;
    const uniqueId = `${traderType}_${Date.now()}_${this.orderCounter}`;
    
    order.id = uniqueId;
    order.timestamp = Date.now();
    order.traderType = traderType;
    order.action = action;
    
    // Clean price calculation
    let priceDeviation = config.priceDeviation;
    const volatilityMultiplier = Math.min(3, 1 + (marketConditions.volatility || 1));
    priceDeviation *= volatilityMultiplier;
    
    const tpsConfig = this.tpsModeConfigs[this.currentTPSMode];
    priceDeviation *= tpsConfig.volatilityMultiplier;
    
    const randomDeviation = (Math.random() * 2 - 1) * priceDeviation;
    
    if (action === 'buy') {
      order.price = currentPrice * (1 + Math.abs(randomDeviation));
    } else {
      order.price = currentPrice * (1 - Math.abs(randomDeviation));
    }
    
    // Clean quantity calculation
    const baseOrderValue = config.sizeRange.min + 
      Math.random() * (config.sizeRange.max - config.sizeRange.min);
    
    const sizeMultiplier = tpsConfig.volatilityMultiplier;
    const finalOrderValue = baseOrderValue * sizeMultiplier;
    
    order.quantity = finalOrderValue / order.price;
    order.priority = config.priority;
    order.strategy = config.strategy;
    
    return order;
  }

  // Clean max orders calculation
  private getMaxOrdersPerTick(): number {
    switch (this.currentTPSMode) {
      case TPSMode.NORMAL: return 5;
      case TPSMode.BURST: return 25;
      case TPSMode.STRESS: return 200;
      case TPSMode.HFT: return 1000;
      default: return 5;
    }
  }

  // 🚨 CRITICAL FIX: Clean cleanup
  cleanup(): void {
    console.log('🧹 ExternalMarketEngine: Starting cleanup');
    
    this.externalOrderQueue = [];
    this.orderCounter = 0;
    this.lastProcessTime = 0;
    this.processedOrdersCount = 0;
    this.rejectedOrdersCount = 0;
    this.tpsHistory = [];
    this.lastTPSCalculation = 0;
    this.lastBroadcastTime = 0;
    this.lastBroadcastData = '';
    
    console.log('✅ ExternalMarketEngine: Cleanup complete');
  }
}