// backend/src/services/simulation/ExternalMarketEngine.ts - FIXED: TPS Broadcasting Spam Eliminated
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
  // Initialize in constructor
  private orderPool: ObjectPool<ExternalOrder>;
  private currentTPSMode: TPSMode = TPSMode.NORMAL;
  private externalOrderQueue: ExternalOrder[] = [];
  private lastProcessTime: number = 0;
  private orderGenerationWorkers: any[] = [];
  private orderCounter: number = 0;
  
  // Add metrics tracking
  private processedOrdersCount: number = 0;
  private rejectedOrdersCount: number = 0;
  private lastTPSCalculation: number = 0;
  private tpsHistory: number[] = [];
  
  // 🔧 FIXED: Add broadcast throttling to prevent TPS spam
  private lastBroadcastTime: number = 0;
  private lastBroadcastData: string = '';
  private readonly BROADCAST_THROTTLE_MS = 3000; // Only broadcast every 3 seconds
  private readonly MIN_ACTIVITY_THRESHOLD = 5; // Minimum activity to trigger broadcast
  
  constructor(
    private processOrder: (order: ExternalOrder, simulation: SimulationState) => Trade | null,
    private broadcastEvent: (simulationId: string, event: any) => void
  ) {
    // Initialize object pool in constructor
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

  // TPS mode configurations with complete trader mix
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
    console.log(`🔧 [EXTERNAL MARKET] TPS mode set to ${TPSMode[mode]}`);
    
    // Reset timing when mode changes
    this.lastProcessTime = 0;
    this.lastTPSCalculation = 0;
    this.processedOrdersCount = 0;
    this.rejectedOrdersCount = 0;
    this.tpsHistory = [];
    
    // 🔧 FIXED: Reset broadcast throttling on mode change
    this.lastBroadcastTime = 0;
    this.lastBroadcastData = '';
    
    // Clear any backlogged orders when switching modes
    this.externalOrderQueue = [];
    
    console.log(`🎯 [EXTERNAL MARKET] Target TPS: ${this.tpsModeConfigs[mode].targetTPS}`);
  }

  // Enhanced order generation with better TPS distribution
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

    // Better TPS calculation - more consistent order generation
    const targetOrdersPerSecond = config.targetTPS;
    const baseOrdersToGenerate = (targetOrdersPerSecond * timeDelta) / 1000;
    
    // Add some randomness but ensure minimum activity
    const randomMultiplier = 0.8 + (Math.random() * 0.4); // 80% to 120% of target
    const ordersToGenerate = Math.max(
      this.currentTPSMode === TPSMode.NORMAL ? 1 : 2, // Minimum orders per tick
      Math.ceil(baseOrdersToGenerate * randomMultiplier)
    );
    
    const orders: ExternalOrder[] = [];

    // Use burst size for high TPS modes
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
      console.log(`🏭 [ORDER GEN] Generated ${orders.length} orders in ${TPSMode[this.currentTPSMode]} mode (target: ${targetOrdersPerSecond} TPS)`);
    }

    return orders;
  }

  // Enhanced order processing with better metrics tracking
  processExternalOrders(simulation: SimulationState): Trade[] {
    const startTime = Date.now();
    
    // Generate new orders
    const newOrders = this.generateExternalOrders(simulation);
    this.externalOrderQueue.push(...newOrders);

    // Sort by priority (higher priority first)
    this.externalOrderQueue.sort((a, b) => b.priority - a.priority);

    // Process orders based on TPS mode
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

    // Update metrics tracking
    this.processedOrdersCount += processedCount;
    this.rejectedOrdersCount += rejectedCount;
    
    // Calculate TPS every second
    const now = Date.now();
    if (now - this.lastTPSCalculation >= 1000) {
      const actualTPS = processedCount;
      this.tpsHistory.push(actualTPS);
      
      // Keep only last 10 seconds of TPS data
      if (this.tpsHistory.length > 10) {
        this.tpsHistory.shift();
      }
      
      this.lastTPSCalculation = now;
    }

    // 🔧 FIXED: Enhanced market pressure broadcasting with throttling to prevent spam
    if (this.shouldBroadcastMarketPressure(trades.length, this.externalOrderQueue.length)) {
      this.throttledBroadcastMarketPressure(simulation.id, trades.length, this.externalOrderQueue.length);
    }

    // Debug logging for high activity
    if (trades.length > 5) {
      console.log(`💹 [TRADES] Processed ${trades.length} external trades in ${TPSMode[this.currentTPSMode]} mode`);
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

  // Enhanced market pressure metrics
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
    
    // Calculate average TPS from history
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

  triggerLiquidationCascade(simulation: SimulationState): ExternalOrder[] {
    // In stress/HFT mode, can trigger liquidation cascades
    if (this.currentTPSMode !== TPSMode.STRESS && this.currentTPSMode !== TPSMode.HFT) {
      return [];
    }

    const orders: ExternalOrder[] = [];
    const cascadeSize = Math.floor(Math.random() * 30) + 20; // 20-50 liquidations

    console.log(`💥 [LIQUIDATION] Generating ${cascadeSize} liquidation orders`);

    for (let i = 0; i < cascadeSize; i++) {
      const order = this.orderPool.acquire();
      
      // Generate unique ID for liquidation order
      this.orderCounter++;
      const uniqueId = `liq_${Date.now()}_${this.orderCounter}_${i}`;
      
      order.id = uniqueId;
      order.timestamp = Date.now() + i; // Stagger slightly
      order.traderType = ExternalTraderType.PANIC_SELLER;
      order.action = 'sell';
      order.price = simulation.currentPrice * (0.85 - i * 0.005); // Cascading lower prices
      order.quantity = (Math.random() * 80000 + 20000) / order.price; // Larger liquidation sizes
      order.priority = 3;
      order.strategy = 'liquidation';
      
      orders.push(order);
    }

    // Add directly to queue with high priority
    this.externalOrderQueue.unshift(...orders);

    console.log(`✅ [LIQUIDATION] Liquidation cascade queued: ${cascadeSize} orders`);
    return orders;
  }

  // 🔧 FIXED: Enhanced broadcast decision logic to prevent spam
  private shouldBroadcastMarketPressure(tradesProcessed: number, queueDepth: number): boolean {
    const now = Date.now();
    
    // Throttle broadcasts to prevent spam
    if (now - this.lastBroadcastTime < this.BROADCAST_THROTTLE_MS) {
      return false;
    }
    
    // Only broadcast if there's meaningful activity
    if (tradesProcessed === 0 && queueDepth < this.MIN_ACTIVITY_THRESHOLD) {
      return false;
    }
    
    // 🔧 FIXED: Don't broadcast if nothing significant has changed
    const currentMetrics = this.getMarketPressureMetrics();
    const currentDataSnapshot = JSON.stringify({
      actualTPS: currentMetrics.actualTPS,
      queueDepth: currentMetrics.queueDepth,
      marketSentiment: currentMetrics.marketSentiment,
      dominantTraderType: currentMetrics.dominantTraderType
    });
    
    // Only broadcast if data has meaningfully changed
    if (this.lastBroadcastData === currentDataSnapshot) {
      return false;
    }
    
    return true;
  }

  // 🔧 FIXED: Throttled broadcast method to prevent TPS spam
  private throttledBroadcastMarketPressure(
    simulationId: string, 
    processedOrders: number, 
    queueDepth: number
  ): void {
    const now = Date.now();
    
    // Update last broadcast time
    this.lastBroadcastTime = now;
    
    const metrics = this.getMarketPressureMetrics();
    
    // Store current data snapshot to detect changes
    this.lastBroadcastData = JSON.stringify({
      actualTPS: metrics.actualTPS,
      queueDepth: metrics.queueDepth,
      marketSentiment: metrics.marketSentiment,
      dominantTraderType: metrics.dominantTraderType
    });
    
    console.log(`📊 [THROTTLED BROADCAST] Broadcasting market pressure for ${simulationId}: actualTPS=${metrics.actualTPS}, queueDepth=${queueDepth}, processed=${processedOrders}`);
    
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

  // Enhanced order generation with better price logic
  private generateOrderForTrader(
    traderType: ExternalTraderType, 
    simulation: SimulationState
  ): ExternalOrder | null {
    const config = this.traderConfigs[traderType];
    const { currentPrice, marketConditions } = simulation;

    // More sophisticated action selection based on trader type and market conditions
    let action: 'buy' | 'sell' = 'buy';
    
    switch (traderType) {
      case ExternalTraderType.ARBITRAGE_BOT:
        // Arbitrage bots trade against price deviations
        action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
        
      case ExternalTraderType.RETAIL_TRADER:
        // Retail follows momentum with some contrarian behavior
        if (marketConditions.trend === 'bullish') {
          action = Math.random() > 0.25 ? 'buy' : 'sell'; // 75% buy in bull market
        } else if (marketConditions.trend === 'bearish') {
          action = Math.random() > 0.75 ? 'buy' : 'sell'; // 25% buy in bear market
        } else {
          action = Math.random() > 0.5 ? 'buy' : 'sell';
        }
        break;
        
      case ExternalTraderType.MARKET_MAKER:
        // Market makers provide liquidity on both sides
        action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
        
      case ExternalTraderType.MEV_BOT:
        // MEV bots are generated separately
        return null;
        
      case ExternalTraderType.WHALE:
        // Whales accumulate on dips, distribute on pumps
        const priceRatio = currentPrice / simulation.parameters.initialPrice;
        if (priceRatio < 0.9) {
          action = 'buy'; // Accumulate on dips
        } else if (priceRatio > 1.3) {
          action = 'sell'; // Distribute on pumps
        } else {
          // Less active in middle ranges
          if (Math.random() > 0.7) {
            action = Math.random() > 0.5 ? 'buy' : 'sell';
          } else {
            return null;
          }
        }
        break;
        
      case ExternalTraderType.PANIC_SELLER:
        // Always sells, with increasing urgency
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
    
    // Better price calculation based on trader type and market conditions
    let priceDeviation = config.priceDeviation;
    
    // Increase deviation in high volatility
    const volatilityMultiplier = Math.min(3, 1 + (marketConditions.volatility || 1));
    priceDeviation *= volatilityMultiplier;
    
    // Apply TPS mode multiplier
    const tpsConfig = this.tpsModeConfigs[this.currentTPSMode];
    priceDeviation *= tpsConfig.volatilityMultiplier;
    
    const randomDeviation = (Math.random() * 2 - 1) * priceDeviation;
    
    if (action === 'buy') {
      // Buyers willing to pay more
      order.price = currentPrice * (1 + Math.abs(randomDeviation));
    } else {
      // Sellers willing to accept less
      order.price = currentPrice * (1 - Math.abs(randomDeviation));
    }
    
    // Better quantity calculation with TPS mode scaling
    const baseOrderValue = config.sizeRange.min + 
      Math.random() * (config.sizeRange.max - config.sizeRange.min);
    
    // Scale order sizes based on TPS mode
    const sizeMultiplier = tpsConfig.volatilityMultiplier;
    const finalOrderValue = baseOrderValue * sizeMultiplier;
    
    order.quantity = finalOrderValue / order.price;
    order.priority = config.priority;
    order.strategy = config.strategy;
    
    return order;
  }

  // Better max orders calculation for different TPS modes
  private getMaxOrdersPerTick(): number {
    switch (this.currentTPSMode) {
      case TPSMode.NORMAL: return 5;
      case TPSMode.BURST: return 25;
      case TPSMode.STRESS: return 200;
      case TPSMode.HFT: return 1000;
      default: return 5;
    }
  }

  private scaleWorkerPool(size: number): void {
    // Worker pool scaling disabled until workers are implemented
    console.log(`Worker pool scaling disabled - would scale to ${size} workers`);
  }

  cleanup(): void {
    this.externalOrderQueue = [];
    this.orderCounter = 0;
    this.lastProcessTime = 0;
    this.processedOrdersCount = 0;
    this.rejectedOrdersCount = 0;
    this.tpsHistory = [];
    this.lastTPSCalculation = 0;
    
    // 🔧 FIXED: Clean up broadcast throttling
    this.lastBroadcastTime = 0;
    this.lastBroadcastData = '';
    
    console.log('ExternalMarketEngine cleanup complete');
  }
}