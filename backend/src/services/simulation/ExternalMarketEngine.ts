// backend/src/services/simulation/ExternalMarketEngine.ts - FIXED: Complete traderMix
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
  // FIXED: Initialize in constructor
  private orderPool: ObjectPool<ExternalOrder>;
  private currentTPSMode: TPSMode = TPSMode.NORMAL;
  private externalOrderQueue: ExternalOrder[] = [];
  private lastProcessTime: number = 0;
  private orderGenerationWorkers: any[] = [];
  private orderCounter: number = 0;
  
  constructor(
    private processOrder: (order: ExternalOrder, simulation: SimulationState) => Trade | null,
    private broadcastEvent: (simulationId: string, event: any) => void
  ) {
    // FIXED: Initialize object pool in constructor
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
      50000 // Large pool for high TPS
    );
  }
  
  // External trader type configurations
  private readonly traderConfigs = {
    [ExternalTraderType.ARBITRAGE_BOT]: {
      baseFrequency: 0.3,
      sizeRange: { min: 5000, max: 50000 },
      priceDeviation: 0.001, // Tight spreads
      strategy: 'arbitrage',
      priority: 3
    },
    [ExternalTraderType.RETAIL_TRADER]: {
      baseFrequency: 0.2,
      sizeRange: { min: 100, max: 5000 },
      priceDeviation: 0.01, // Accepts more slippage
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
      baseFrequency: 0.05, // Only active in high TPS
      sizeRange: { min: 1000, max: 20000 },
      priceDeviation: 0.0001,
      strategy: 'sandwich',
      priority: 4
    },
    [ExternalTraderType.WHALE]: {
      baseFrequency: 0.02,
      sizeRange: { min: 100000, max: 1000000 },
      priceDeviation: 0.05, // Can move markets
      strategy: 'accumulation',
      priority: 2
    },
    [ExternalTraderType.PANIC_SELLER]: {
      baseFrequency: 0.03, // Increases in stress mode
      sizeRange: { min: 500, max: 10000 },
      priceDeviation: 0.1, // Will sell at any price
      strategy: 'panic',
      priority: 1
    }
  };

  // FIXED: TPS mode configurations with complete trader mix
  private readonly tpsModeConfigs = {
    [TPSMode.NORMAL]: {
      targetTPS: 10,
      traderMix: {
        [ExternalTraderType.MARKET_MAKER]: 0.4,
        [ExternalTraderType.RETAIL_TRADER]: 0.4,
        [ExternalTraderType.ARBITRAGE_BOT]: 0.2,
        [ExternalTraderType.MEV_BOT]: 0.0,
        [ExternalTraderType.WHALE]: 0.0,
        [ExternalTraderType.PANIC_SELLER]: 0.0
      },
      volatilityMultiplier: 1
    },
    [TPSMode.BURST]: {
      targetTPS: 100,
      traderMix: {
        [ExternalTraderType.RETAIL_TRADER]: 0.5,
        [ExternalTraderType.ARBITRAGE_BOT]: 0.3,
        [ExternalTraderType.MARKET_MAKER]: 0.2,
        [ExternalTraderType.MEV_BOT]: 0.0,
        [ExternalTraderType.WHALE]: 0.0,
        [ExternalTraderType.PANIC_SELLER]: 0.0
      },
      volatilityMultiplier: 1.5
    },
    [TPSMode.STRESS]: {
      targetTPS: 1000,
      traderMix: {
        [ExternalTraderType.PANIC_SELLER]: 0.3,
        [ExternalTraderType.ARBITRAGE_BOT]: 0.3,
        [ExternalTraderType.RETAIL_TRADER]: 0.2,
        [ExternalTraderType.MEV_BOT]: 0.1,
        [ExternalTraderType.WHALE]: 0.1,
        [ExternalTraderType.MARKET_MAKER]: 0.0
      },
      volatilityMultiplier: 3
    },
    [TPSMode.HFT]: {
      targetTPS: 10000,
      traderMix: {
        [ExternalTraderType.ARBITRAGE_BOT]: 0.4,
        [ExternalTraderType.MEV_BOT]: 0.3,
        [ExternalTraderType.MARKET_MAKER]: 0.2,
        [ExternalTraderType.WHALE]: 0.05,
        [ExternalTraderType.PANIC_SELLER]: 0.05,
        [ExternalTraderType.RETAIL_TRADER]: 0.0
      },
      volatilityMultiplier: 5
    }
  };

  setTPSMode(mode: TPSMode): void {
    this.currentTPSMode = mode;
    console.log(`External Market Engine: TPS mode set to ${TPSMode[mode]}`);
    
    // Reset timing when mode changes
    this.lastProcessTime = 0;
    
    // Worker scaling disabled for now
    console.log('External order generation will run in-process');
  }

  generateExternalOrders(simulation: SimulationState): ExternalOrder[] {
    const config = this.tpsModeConfigs[this.currentTPSMode];
    const now = Date.now();
    
    // Initialize lastProcessTime if not set
    if (this.lastProcessTime === 0) {
      this.lastProcessTime = now;
      return [];
    }
    
    const timeDelta = now - this.lastProcessTime;
    this.lastProcessTime = now;

    // Calculate number of orders to generate based on time elapsed
    const targetOrdersPerSecond = config.targetTPS;
    const ordersToGenerate = Math.max(
      this.currentTPSMode === TPSMode.NORMAL ? 1 : 0, // At least 1 order per tick in normal mode
      Math.ceil((targetOrdersPerSecond * timeDelta) / 1000)
    );
    
    const orders: ExternalOrder[] = [];

    // Cap orders per tick to prevent overwhelming the system
    const cappedOrders = Math.min(ordersToGenerate, this.getMaxOrdersPerTick());

    for (let i = 0; i < cappedOrders; i++) {
      const traderType = this.selectTraderType(config.traderMix);
      const order = this.generateOrderForTrader(traderType, simulation);
      if (order) {
        orders.push(order);
      }
    }

    return orders;
  }

  processExternalOrders(simulation: SimulationState): Trade[] {
    // Generate new orders
    const newOrders = this.generateExternalOrders(simulation);
    this.externalOrderQueue.push(...newOrders);

    // Sort by priority (higher priority first)
    this.externalOrderQueue.sort((a, b) => b.priority - a.priority);

    // Process orders based on TPS mode
    const maxOrdersPerTick = this.getMaxOrdersPerTick();
    const ordersToProcess = this.externalOrderQueue.splice(0, maxOrdersPerTick);
    const trades: Trade[] = [];

    for (const order of ordersToProcess) {
      try {
        const trade = this.processOrder(order, simulation);
        if (trade) {
          trades.push(trade);
        }
      } catch (error) {
        console.error('Error processing external order:', error);
      } finally {
        this.orderPool.release(order);
      }
    }

    // Broadcast market pressure metrics
    if (trades.length > 0 || this.externalOrderQueue.length > 0) {
      this.broadcastMarketPressure(simulation.id, trades.length, this.externalOrderQueue.length);
    }

    return trades;
  }

  detectMEVOpportunity(simulation: SimulationState, pendingOrder: any): ExternalOrder | null {
    if (this.currentTPSMode !== TPSMode.HFT && this.currentTPSMode !== TPSMode.STRESS) {
      return null;
    }

    // Simple MEV detection - sandwich attack opportunity
    const { currentPrice } = simulation;
    const orderSize = pendingOrder.quantity * pendingOrder.price;
    
    // If order is large enough to move price significantly
    if (orderSize > 10000) {
      const mevBot = this.orderPool.acquire();
      
      // Generate unique ID for MEV bot
      this.orderCounter++;
      const uniqueId = `mev_${Date.now()}_${this.orderCounter}_${Math.random().toString(36).substr(2, 9)}`;
      
      mevBot.id = uniqueId;
      mevBot.timestamp = Date.now();
      mevBot.traderType = ExternalTraderType.MEV_BOT;
      mevBot.action = pendingOrder.action; // Front-run in same direction
      mevBot.price = currentPrice * (pendingOrder.action === 'buy' ? 1.001 : 0.999);
      mevBot.quantity = orderSize * 0.3 / mevBot.price; // Take 30% of the size
      mevBot.priority = 5; // Highest priority
      mevBot.strategy = 'sandwich';
      
      return mevBot;
    }

    return null;
  }

  getMarketPressureMetrics(): {
    currentTPS: number;
    queueDepth: number;
    dominantTraderType: ExternalTraderType;
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
  } {
    const config = this.tpsModeConfigs[this.currentTPSMode];
    
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
      queueDepth: this.externalOrderQueue.length,
      dominantTraderType,
      marketSentiment
    };
  }

  triggerLiquidationCascade(simulation: SimulationState): ExternalOrder[] {
    // In stress/HFT mode, can trigger liquidation cascades
    if (this.currentTPSMode !== TPSMode.STRESS && this.currentTPSMode !== TPSMode.HFT) {
      return [];
    }

    const orders: ExternalOrder[] = [];
    const cascadeSize = Math.floor(Math.random() * 20) + 10; // 10-30 liquidations

    for (let i = 0; i < cascadeSize; i++) {
      const order = this.orderPool.acquire();
      
      // Generate unique ID for liquidation order
      this.orderCounter++;
      const uniqueId = `liq_${Date.now()}_${this.orderCounter}_${i}`;
      
      order.id = uniqueId;
      order.timestamp = Date.now() + i; // Stagger slightly
      order.traderType = ExternalTraderType.PANIC_SELLER;
      order.action = 'sell';
      order.price = simulation.currentPrice * (0.9 - i * 0.01); // Cascading lower prices
      order.quantity = (Math.random() * 50000 + 10000) / order.price;
      order.priority = 3;
      order.strategy = 'liquidation';
      
      orders.push(order);
    }

    // Add directly to queue
    this.externalOrderQueue.push(...orders);

    console.log(`Liquidation cascade triggered: ${cascadeSize} orders`);
    return orders;
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

  private generateOrderForTrader(
    traderType: ExternalTraderType, 
    simulation: SimulationState
  ): ExternalOrder | null {
    const config = this.traderConfigs[traderType];
    const { currentPrice, marketConditions } = simulation;

    // Decide action based on trader type and market conditions
    let action: 'buy' | 'sell' = 'buy';
    
    switch (traderType) {
      case ExternalTraderType.ARBITRAGE_BOT:
        // Arbitrage bots trade against price deviations
        action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
        
      case ExternalTraderType.RETAIL_TRADER:
        // Retail follows momentum
        if (marketConditions.trend === 'bullish') action = Math.random() > 0.3 ? 'buy' : 'sell';
        else if (marketConditions.trend === 'bearish') action = Math.random() > 0.7 ? 'buy' : 'sell';
        else action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
        
      case ExternalTraderType.MARKET_MAKER:
        // Market makers provide liquidity on both sides
        action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
        
      case ExternalTraderType.MEV_BOT:
        // MEV bots look for specific opportunities
        return null; // Generated separately via detectMEVOpportunity
        
      case ExternalTraderType.WHALE:
        // Whales accumulate on dips, distribute on pumps
        if (currentPrice < simulation.parameters.initialPrice * 0.9) {
          action = 'buy';
        } else if (currentPrice > simulation.parameters.initialPrice * 1.2) {
          action = 'sell';
        } else {
          return null; // Whales don't always trade
        }
        break;
        
      case ExternalTraderType.PANIC_SELLER:
        // Always sells
        action = 'sell';
        break;
    }

    // Generate order
    const order = this.orderPool.acquire();
    
    // Use a combination of timestamp, counter, and random component for unique IDs
    this.orderCounter++;
    const uniqueId = `${traderType}_${Date.now()}_${this.orderCounter}_${Math.random().toString(36).substr(2, 9)}`;
    
    order.id = uniqueId;
    order.timestamp = Date.now();
    order.traderType = traderType;
    order.action = action;
    
    // Price based on trader type and action
    const priceDeviation = config.priceDeviation * (Math.random() * 2 - 1);
    if (action === 'buy') {
      order.price = currentPrice * (1 + Math.abs(priceDeviation));
    } else {
      order.price = currentPrice * (1 - Math.abs(priceDeviation));
    }
    
    // Quantity based on trader type
    const orderValue = config.sizeRange.min + 
      Math.random() * (config.sizeRange.max - config.sizeRange.min);
    order.quantity = orderValue / order.price;
    
    order.priority = config.priority;
    order.strategy = config.strategy;
    
    return order;
  }

  private getMaxOrdersPerTick(): number {
    switch (this.currentTPSMode) {
      case TPSMode.NORMAL: return 1;
      case TPSMode.BURST: return 10;
      case TPSMode.STRESS: return 100;
      case TPSMode.HFT: return 1000;
      default: return 1;
    }
  }

  private scaleWorkerPool(size: number): void {
    // Worker pool scaling disabled until workers are implemented
    console.log(`Worker pool scaling disabled - would scale to ${size} workers`);
  }

  private broadcastMarketPressure(
    simulationId: string, 
    processedOrders: number, 
    queueDepth: number
  ): void {
    this.broadcastEvent(simulationId, {
      type: 'external_market_pressure',
      timestamp: Date.now(),
      data: {
        tpsMode: TPSMode[this.currentTPSMode],
        processedOrders,
        queueDepth,
        metrics: this.getMarketPressureMetrics()
      }
    });
  }

  cleanup(): void {
    this.externalOrderQueue = [];
    this.orderCounter = 0;
    this.lastProcessTime = 0;
    console.log('ExternalMarketEngine cleanup complete');
  }
}