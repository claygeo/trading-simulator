// backend/src/services/simulation/BroadcastService.ts - FULLY FIXED TEXT FRAMES
import { WebSocket } from 'ws';
import { SimulationEvent, MarketAnalysis, ExternalMarketMetrics, Trade } from './types';
import { BroadcastManager } from '../broadcastManager';

interface BroadcastMetrics {
  totalBroadcasts: number;
  tradesBroadcast: number;
  priceUpdatesBroadcast: number;
  lastBroadcastTime: number;
}

export class BroadcastService {
  private clients: Set<WebSocket> = new Set();
  private broadcastManager?: BroadcastManager;
  private messageThrottleMap: Map<string, number> = new Map();
  private readonly THROTTLE_INTERVAL = 50; // ms
  private readonly HIGH_PRIORITY_TYPES = new Set(['trade', 'processed_trade', 'price_update']);
  private metrics: Map<string, BroadcastMetrics> = new Map();

  constructor(broadcastManager?: BroadcastManager) {
    this.broadcastManager = broadcastManager;
  }

  setBroadcastManager(broadcastManager: BroadcastManager): void {
    this.broadcastManager = broadcastManager;
    console.log('BroadcastManager connected to BroadcastService');
  }

  registerClient(client: WebSocket): void {
    this.clients.add(client);

    client.on('close', () => {
      this.clients.delete(client);
    });
  }

  broadcastEvent(simulationId: string, event: SimulationEvent): void {
    // Update metrics
    this.updateMetrics(simulationId, event.type);

    // High priority events bypass throttling
    if (this.HIGH_PRIORITY_TYPES.has(event.type)) {
      this.broadcastImmediately(simulationId, event);
      return;
    }

    // Throttle other events
    if (this.shouldThrottleEvent(simulationId, event)) {
      return;
    }

    // ALWAYS use broadcast manager to avoid direct WebSocket issues
    if (this.broadcastManager) {
      this.broadcastManager.queueUpdate(simulationId, event);
    } else {
      // CRITICAL FIX: Use safer direct broadcast with explicit text frame
      this.safeDirectBroadcast(simulationId, event);
    }
  }

  broadcastTradeEvent(simulationId: string, trade: Trade): void {
    const event: SimulationEvent = {
      type: 'trade',
      timestamp: trade.timestamp,
      data: trade
    };

    // Always broadcast trades immediately
    this.broadcastImmediately(simulationId, event);
  }

  broadcastPriceUpdate(
    simulationId: string,
    event: SimulationEvent,
    marketAnalysis?: MarketAnalysis
  ): void {
    // Include market analysis in price updates
    if (marketAnalysis && event.type === 'price_update') {
      event.data.marketAnalysis = marketAnalysis;
    }

    // Include external market metrics if available
    if (event.data.externalMarketMetrics) {
      this.aggregateTradeData(event);
    }

    // Add total trades processed metric
    if (event.data.totalTradesProcessed !== undefined) {
      event.data.totalTradesProcessed = event.data.totalTradesProcessed;
    }

    // Price updates are high priority
    this.broadcastImmediately(simulationId, event);
  }

  broadcastSimulationState(
    simulationId: string,
    state: any,
    marketAnalysis?: MarketAnalysis
  ): void {
    const event: SimulationEvent = {
      type: 'simulation_state',
      timestamp: Date.now(),
      data: {
        ...state,
        marketAnalysis,
        broadcastMetrics: this.getMetrics(simulationId)
      }
    };

    // Send immediately for state updates
    if (this.broadcastManager) {
      this.broadcastManager.sendDirectMessage(simulationId, event);
    } else {
      this.safeDirectBroadcast(simulationId, event);
    }
  }

  broadcastScenarioEvent(
    simulationId: string, 
    scenarioType: string, 
    eventType: 'applied' | 'cleared' | 'phase_changed',
    data: any
  ): void {
    const event: SimulationEvent = {
      type: `scenario_${eventType}`,
      timestamp: Date.now(),
      data: {
        scenarioType,
        ...data
      }
    };

    this.broadcastEvent(simulationId, event);
  }

  broadcastSimulationStatus(
    simulationId: string,
    isRunning: boolean,
    isPaused: boolean,
    speed: number,
    lastPrice?: number
  ): void {
    const event: SimulationEvent = {
      type: 'simulation_status',
      timestamp: Date.now(),
      data: {
        isRunning,
        isPaused,
        speed,
        lastPrice,
        metrics: this.getMetrics(simulationId)
      }
    };

    // Send immediately for status updates
    if (this.broadcastManager) {
      this.broadcastManager.sendDirectMessage(simulationId, event);
    } else {
      this.safeDirectBroadcast(simulationId, event);
    }
  }

  broadcastTimeframeChange(
    simulationId: string,
    oldTimeframe: string,
    newTimeframe: string,
    reason: string,
    marketAnalysis: MarketAnalysis
  ): void {
    const event: SimulationEvent = {
      type: 'timeframe_change',
      timestamp: Date.now(),
      data: {
        oldTimeframe,
        newTimeframe,
        reason,
        marketAnalysis
      }
    };

    this.broadcastEvent(simulationId, event);
  }

  broadcastBatchUpdate(
    simulationId: string,
    updates: any[],
    batchSize: number,
    timeframe: string,
    marketAnalysis: MarketAnalysis
  ): void {
    // Extract the latest data from batched updates
    const latestUpdate = updates[updates.length - 1] || {};
    
    const event: SimulationEvent = {
      type: 'price_update',
      timestamp: Date.now(),
      data: {
        price: latestUpdate.price,
        orderBook: latestUpdate.orderBook,
        priceHistory: latestUpdate.priceHistory,
        activePositions: latestUpdate.activePositions,
        recentTrades: latestUpdate.recentTrades || [],
        traderRankings: latestUpdate.traderRankings,
        batchSize,
        timeframe,
        marketAnalysis,
        externalMarketMetrics: latestUpdate.externalMarketMetrics,
        totalTradesProcessed: latestUpdate.totalTradesProcessed || 0,
        isBatched: true
      }
    };

    // Send batched updates immediately
    this.broadcastImmediately(simulationId, event);
  }

  broadcastExternalMarketMetrics(
    simulationId: string,
    metrics: ExternalMarketMetrics
  ): void {
    const event: SimulationEvent = {
      type: 'external_market_metrics',
      timestamp: Date.now(),
      data: metrics
    };

    // Send these updates less frequently to avoid overload
    const lastSent = this.messageThrottleMap.get(`${simulationId}_metrics`) || 0;
    if (Date.now() - lastSent > 100) { // Max 10 updates per second
      this.broadcastEvent(simulationId, event);
      this.messageThrottleMap.set(`${simulationId}_metrics`, Date.now());
    }
  }

  private broadcastImmediately(simulationId: string, event: SimulationEvent): void {
    // Update metrics
    this.updateMetrics(simulationId, event.type);

    // CRITICAL FIX: Always prefer broadcast manager to avoid Blob issues
    if (this.broadcastManager) {
      this.broadcastManager.sendDirectMessage(simulationId, event);
    } else {
      console.warn('No BroadcastManager available, using safe fallback');
      this.safeDirectBroadcast(simulationId, event);
    }
  }

  private shouldThrottleEvent(simulationId: string, event: SimulationEvent): boolean {
    // High priority events are never throttled
    if (this.HIGH_PRIORITY_TYPES.has(event.type)) {
      return false;
    }

    // Check if TPS is extreme
    const externalMetrics = event.data?.externalMarketMetrics as ExternalMarketMetrics;
    if (!externalMetrics || externalMetrics.currentTPS < 1000) {
      return false;
    }

    const key = `${simulationId}_${event.type}`;
    const lastSent = this.messageThrottleMap.get(key) || 0;
    const now = Date.now();

    if (now - lastSent < this.THROTTLE_INTERVAL) {
      return true; // Throttle this message
    }

    this.messageThrottleMap.set(key, now);
    return false;
  }

  private aggregateTradeData(event: SimulationEvent): void {
    // In extreme TPS modes, aggregate small trades
    if (!event.data.recentTrades || !event.data.externalMarketMetrics) {
      return;
    }

    const metrics = event.data.externalMarketMetrics as ExternalMarketMetrics;
    
    if (metrics.currentTPS >= 1000) {
      // Group trades by trader type for cleaner visualization
      const aggregatedTrades = this.aggregateTradesByType(event.data.recentTrades);
      event.data.aggregatedTrades = aggregatedTrades;
      
      // Keep all trades but mark as aggregated
      event.data.isAggregated = true;
    }
  }

  private aggregateTradesByType(trades: Trade[]): any {
    const aggregated: Record<string, any> = {};
    
    trades.forEach(trade => {
      const key = (trade as any).source === 'external' ? 
        (trade as any).externalTraderType : 'internal';
      
      if (!aggregated[key]) {
        aggregated[key] = {
          count: 0,
          totalVolume: 0,
          avgPrice: 0,
          buyVolume: 0,
          sellVolume: 0,
          trades: []
        };
      }
      
      aggregated[key].count++;
      aggregated[key].totalVolume += trade.value;
      aggregated[key].trades.push(trade);
      
      if (trade.action === 'buy') {
        aggregated[key].buyVolume += trade.value;
      } else {
        aggregated[key].sellVolume += trade.value;
      }
    });
    
    // Calculate average prices
    Object.keys(aggregated).forEach(key => {
      aggregated[key].avgPrice = aggregated[key].totalVolume / aggregated[key].count;
    });
    
    return aggregated;
  }

  // CRITICAL FIX: Enhanced safe direct broadcast method with explicit text frames
  private safeDirectBroadcast(simulationId: string, event: SimulationEvent): void {
    try {
      const message = {
        simulationId,
        event: {
          type: event.type,
          timestamp: event.timestamp,
          data: event.data
        }
      };

      // CRITICAL: Ensure we create a proper JSON string
      const messageStr = JSON.stringify(message);
      
      // CRITICAL: Verify it's actually a string before sending
      if (typeof messageStr !== 'string') {
        console.error('CRITICAL ERROR: messageStr is not a string!', typeof messageStr);
        return;
      }

      console.log(`📤 BroadcastService: Safe direct broadcast to ${this.clients.size} clients:`, {
        simulationId,
        eventType: event.type,
        messageSize: messageStr.length,
        messagePreview: messageStr.substring(0, 100) + '...'
      });

      // Broadcast to all connected clients with explicit text frame
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            // CRITICAL FIX: Send with explicit text frame options
            client.send(messageStr, { 
              binary: false,     // Explicitly specify text frame
              compress: false,   // Disable compression to prevent binary interpretation
              fin: true         // Complete frame
            });
            console.log('✅ Text message sent successfully to client');
          } catch (error) {
            console.error('❌ Error sending to client via safe broadcast:', error);
            // Remove failed client
            this.clients.delete(client);
          }
        }
      });
    } catch (error) {
      console.error('💥 Error in safeDirectBroadcast:', error);
    }
  }

  // DEPRECATED: Old method that might cause Blob issues
  private directBroadcast(simulationId: string, event: SimulationEvent): void {
    console.warn('⚠️ DEPRECATED: directBroadcast method used - should use safeDirectBroadcast or BroadcastManager');
    this.safeDirectBroadcast(simulationId, event);
  }

  private updateMetrics(simulationId: string, eventType: string): void {
    if (!this.metrics.has(simulationId)) {
      this.metrics.set(simulationId, {
        totalBroadcasts: 0,
        tradesBroadcast: 0,
        priceUpdatesBroadcast: 0,
        lastBroadcastTime: Date.now()
      });
    }

    const metrics = this.metrics.get(simulationId)!;
    metrics.totalBroadcasts++;
    metrics.lastBroadcastTime = Date.now();

    if (eventType === 'trade' || eventType === 'processed_trade') {
      metrics.tradesBroadcast++;
    } else if (eventType === 'price_update') {
      metrics.priceUpdatesBroadcast++;
    }
  }

  getMetrics(simulationId: string): BroadcastMetrics | undefined {
    return this.metrics.get(simulationId);
  }

  getConnectedClients(): number {
    return this.clients.size;
  }

  cleanup(): void {
    this.clients.clear();
    this.messageThrottleMap.clear();
    this.metrics.clear();
    console.log('BroadcastService cleanup complete');
  }
}