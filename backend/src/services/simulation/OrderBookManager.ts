// backend/src/services/simulation/OrderBookManager.ts - FIXED: Price Synchronization
import { 
  SimulationState, 
  OrderBook, 
  OrderBookLevel, 
  IOrderBookManager,
  SIMULATION_CONSTANTS 
} from './types';

export class OrderBookManager implements IOrderBookManager {
  private readonly DEFAULT_SPREAD = 0.002; // 0.2%
  private readonly DEPTH_LEVELS = 20;
  private readonly MIN_ORDER_SIZE = 100;
  private readonly MAX_ORDER_SIZE = 10000;
  private readonly PRICE_SYNC_THRESHOLD = 0.01; // 1% price change threshold for re-centering

  generateInitialOrderBook(
    side: 'bids' | 'asks', 
    currentPrice: number, 
    liquidity: number
  ): OrderBookLevel[] {
    const levels: OrderBookLevel[] = [];
    const spreadDirection = side === 'bids' ? -1 : 1;
    const basePrice = currentPrice * (1 + spreadDirection * this.DEFAULT_SPREAD / 2);
    
    const totalQuantity = liquidity * 0.1;
    
    for (let i = 0; i < this.DEPTH_LEVELS; i++) {
      const priceStep = spreadDirection * (this.DEFAULT_SPREAD / this.DEPTH_LEVELS) * (i + 1);
      const price = basePrice * (1 + priceStep);
      
      // Decreasing quantity with distance from spread
      const quantityMultiplier = Math.exp(-i * 0.1);
      const quantity = (totalQuantity / this.DEPTH_LEVELS) * quantityMultiplier;
      
      levels.push({
        price,
        quantity: Math.max(this.MIN_ORDER_SIZE, quantity)
      });
    }
    
    // Sort bids descending, asks ascending
    if (side === 'bids') {
      levels.sort((a, b) => b.price - a.price);
    } else {
      levels.sort((a, b) => a.price - b.price);
    }
    
    return levels;
  }

  updateOrderBook(simulation: SimulationState): void {
    const { orderBook, currentPrice, recentTrades } = simulation;
    
    console.log(`📚 [ORDER BOOK UPDATE] Current price: $${currentPrice.toFixed(6)}`);
    
    // CRITICAL FIX: Check if price has moved significantly and re-center order book
    const lastOrderBookPrice = this.getOrderBookMidPrice(orderBook);
    const priceChangePercent = Math.abs((currentPrice - lastOrderBookPrice) / lastOrderBookPrice);
    
    console.log(`📚 [PRICE CHECK] Last OB price: $${lastOrderBookPrice.toFixed(6)}, Change: ${(priceChangePercent * 100).toFixed(2)}%`);
    
    if (priceChangePercent > this.PRICE_SYNC_THRESHOLD) {
      console.log(`🔄 [PRICE SYNC] Re-centering order book around $${currentPrice.toFixed(6)}`);
      this.recenterOrderBook(orderBook, currentPrice);
    }
    
    // Get recent trades to determine market pressure
    const recentTradeWindow = recentTrades.slice(0, 10);
    let buyPressure = 0;
    let sellPressure = 0;
    
    recentTradeWindow.forEach(trade => {
      if (trade.action === 'buy') {
        buyPressure += trade.value;
      } else {
        sellPressure += trade.value;
      }
    });
    
    const totalPressure = buyPressure + sellPressure;
    const pressureImbalance = totalPressure > 0 ? (buyPressure - sellPressure) / totalPressure : 0;
    
    console.log(`📊 [PRESSURE] Buy: ${buyPressure.toFixed(0)}, Sell: ${sellPressure.toFixed(0)}, Imbalance: ${(pressureImbalance * 100).toFixed(1)}%`);
    
    // Adjust order book based on market pressure
    this.adjustOrderBookPressure(orderBook, currentPrice, pressureImbalance);
    
    // Update timestamps
    orderBook.lastUpdateTime = simulation.currentTime;
    
    // Log final order book state
    const bestBid = orderBook.bids[0]?.price || 0;
    const bestAsk = orderBook.asks[0]?.price || 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = ((spread / currentPrice) * 100);
    
    console.log(`✅ [ORDER BOOK FINAL] Best Bid: $${bestBid.toFixed(6)}, Best Ask: $${bestAsk.toFixed(6)}, Spread: ${spreadPercent.toFixed(3)}%`);
  }

  // NEW: Get the mid price from current order book
  private getOrderBookMidPrice(orderBook: OrderBook): number {
    const bestBid = orderBook.bids[0]?.price || 0;
    const bestAsk = orderBook.asks[0]?.price || 0;
    
    if (bestBid > 0 && bestAsk > 0) {
      return (bestBid + bestAsk) / 2;
    }
    
    return bestBid > 0 ? bestBid : bestAsk > 0 ? bestAsk : 100; // Default fallback
  }

  // NEW: Re-center the entire order book around the current price
  private recenterOrderBook(orderBook: OrderBook, currentPrice: number): void {
    console.log(`🎯 [RECENTER START] Centering around $${currentPrice.toFixed(6)}`);
    
    // Calculate new bid and ask base prices
    const bidBasePrice = currentPrice * (1 - this.DEFAULT_SPREAD / 2);
    const askBasePrice = currentPrice * (1 + this.DEFAULT_SPREAD / 2);
    
    // Recenter bids
    for (let i = 0; i < orderBook.bids.length; i++) {
      const level = orderBook.bids[i];
      const priceStep = (this.DEFAULT_SPREAD / this.DEPTH_LEVELS) * (i + 1);
      level.price = bidBasePrice * (1 - priceStep);
      
      // Maintain realistic quantity distribution
      const quantityMultiplier = Math.exp(-i * 0.1);
      const baseQuantity = this.MIN_ORDER_SIZE * 5;
      level.quantity = Math.max(this.MIN_ORDER_SIZE, baseQuantity * quantityMultiplier);
    }
    
    // Recenter asks
    for (let i = 0; i < orderBook.asks.length; i++) {
      const level = orderBook.asks[i];
      const priceStep = (this.DEFAULT_SPREAD / this.DEPTH_LEVELS) * (i + 1);
      level.price = askBasePrice * (1 + priceStep);
      
      // Maintain realistic quantity distribution
      const quantityMultiplier = Math.exp(-i * 0.1);
      const baseQuantity = this.MIN_ORDER_SIZE * 5;
      level.quantity = Math.max(this.MIN_ORDER_SIZE, baseQuantity * quantityMultiplier);
    }
    
    // Ensure proper sorting
    orderBook.bids.sort((a, b) => b.price - a.price);
    orderBook.asks.sort((a, b) => a.price - b.price);
    
    console.log(`✅ [RECENTER COMPLETE] New spread: $${orderBook.bids[0]?.price.toFixed(6)} - $${orderBook.asks[0]?.price.toFixed(6)}`);
  }

  adjustOrderBookForPriceChange(orderBook: OrderBook, oldPrice: number, newPrice: number): void {
    console.log(`🔄 [ADJUST] Price change: $${oldPrice.toFixed(6)} → $${newPrice.toFixed(6)}`);
    
    const priceChangePercent = Math.abs((newPrice - oldPrice) / oldPrice);
    
    // If price change is significant, recenter the entire order book
    if (priceChangePercent > this.PRICE_SYNC_THRESHOLD) {
      this.recenterOrderBook(orderBook, newPrice);
      return;
    }
    
    // For smaller changes, proportionally adjust existing levels
    const priceRatio = newPrice / oldPrice;
    
    // Adjust all bid prices
    orderBook.bids.forEach(bid => {
      bid.price *= priceRatio;
    });
    
    // Adjust all ask prices
    orderBook.asks.forEach(ask => {
      ask.price *= priceRatio;
    });
    
    // Remove crossed orders
    this.removeCrossedOrders(orderBook);
    
    // Ensure minimum spread
    this.ensureMinimumSpread(orderBook, newPrice);
  }

  // NEW: Remove any crossed orders
  private removeCrossedOrders(orderBook: OrderBook): void {
    const bestBid = orderBook.bids[0]?.price || 0;
    const bestAsk = orderBook.asks[0]?.price || Infinity;
    
    if (bestBid >= bestAsk) {
      console.log(`⚠️ [CROSSED ORDERS] Removing crossed orders: bid ${bestBid.toFixed(6)} >= ask ${bestAsk.toFixed(6)}`);
      
      // Remove crossed orders
      orderBook.bids = orderBook.bids.filter(bid => bid.price < bestAsk);
      orderBook.asks = orderBook.asks.filter(ask => ask.price > bestBid);
    }
  }

  // NEW: Ensure minimum spread
  private ensureMinimumSpread(orderBook: OrderBook, currentPrice: number): void {
    const bestBid = orderBook.bids[0]?.price || 0;
    const bestAsk = orderBook.asks[0]?.price || 0;
    
    if (bestBid > 0 && bestAsk > 0) {
      const spread = bestAsk - bestBid;
      const minSpread = currentPrice * this.DEFAULT_SPREAD;
      
      if (spread < minSpread) {
        const spreadAdjustment = (minSpread - spread) / 2;
        
        console.log(`📏 [SPREAD FIX] Adjusting spread by ±${spreadAdjustment.toFixed(6)}`);
        
        orderBook.bids.forEach(bid => {
          bid.price -= spreadAdjustment;
        });
        
        orderBook.asks.forEach(ask => {
          ask.price += spreadAdjustment;
        });
      }
    }
  }

  getMarketDepth(simulation: SimulationState, levels: number): { bidDepth: number; askDepth: number } {
    const { orderBook } = simulation;
    
    const bidDepth = orderBook.bids
      .slice(0, levels)
      .reduce((sum, bid) => sum + bid.quantity * bid.price, 0);
    
    const askDepth = orderBook.asks
      .slice(0, levels)
      .reduce((sum, ask) => sum + ask.quantity * ask.price, 0);
    
    return { bidDepth, askDepth };
  }

  private adjustOrderBookPressure(
    orderBook: OrderBook, 
    currentPrice: number, 
    pressureImbalance: number
  ): void {
    // Adjust quantities based on pressure
    const pressureFactor = Math.abs(pressureImbalance);
    
    if (pressureImbalance > 0.1) {
      // Buy pressure - reduce ask quantities, increase bid quantities
      orderBook.asks.forEach(ask => {
        ask.quantity *= (1 - pressureFactor * 0.2);
      });
      
      orderBook.bids.forEach(bid => {
        bid.quantity *= (1 + pressureFactor * 0.1);
      });
    } else if (pressureImbalance < -0.1) {
      // Sell pressure - reduce bid quantities, increase ask quantities
      orderBook.bids.forEach(bid => {
        bid.quantity *= (1 - pressureFactor * 0.2);
      });
      
      orderBook.asks.forEach(ask => {
        ask.quantity *= (1 + pressureFactor * 0.1);
      });
    }
    
    // Remove orders with very low quantities
    orderBook.bids = orderBook.bids.filter(bid => bid.quantity >= this.MIN_ORDER_SIZE);
    orderBook.asks = orderBook.asks.filter(ask => ask.quantity >= this.MIN_ORDER_SIZE);
    
    // Ensure we have enough depth
    this.maintainOrderBookDepth(orderBook, currentPrice);
  }

  private maintainOrderBookDepth(orderBook: OrderBook, currentPrice: number): void {
    // Ensure minimum number of levels
    while (orderBook.bids.length < this.DEPTH_LEVELS) {
      const lastBid = orderBook.bids[orderBook.bids.length - 1];
      const newPrice = lastBid ? lastBid.price * 0.999 : currentPrice * 0.998;
      
      orderBook.bids.push({
        price: newPrice,
        quantity: this.MIN_ORDER_SIZE + Math.random() * (this.MAX_ORDER_SIZE - this.MIN_ORDER_SIZE)
      });
    }
    
    while (orderBook.asks.length < this.DEPTH_LEVELS) {
      const lastAsk = orderBook.asks[orderBook.asks.length - 1];
      const newPrice = lastAsk ? lastAsk.price * 1.001 : currentPrice * 1.002;
      
      orderBook.asks.push({
        price: newPrice,
        quantity: this.MIN_ORDER_SIZE + Math.random() * (this.MAX_ORDER_SIZE - this.MIN_ORDER_SIZE)
      });
    }
    
    // Sort to maintain order
    orderBook.bids.sort((a, b) => b.price - a.price);
    orderBook.asks.sort((a, b) => a.price - b.price);
  }

  simulateOrderFill(
    orderBook: OrderBook, 
    action: 'buy' | 'sell', 
    quantity: number, 
    price: number
  ): number {
    const targetLevels = action === 'buy' ? orderBook.asks : orderBook.bids;
    
    let remainingQuantity = quantity;
    let totalCost = 0;
    
    for (let i = 0; i < targetLevels.length && remainingQuantity > 0; i++) {
      const level = targetLevels[i];
      
      // Check if price is acceptable
      if (action === 'buy' && level.price > price) break;
      if (action === 'sell' && level.price < price) break;
      
      const fillQuantity = Math.min(remainingQuantity, level.quantity);
      totalCost += fillQuantity * level.price;
      remainingQuantity -= fillQuantity;
      
      // Reduce quantity at this level
      level.quantity -= fillQuantity;
    }
    
    // Remove empty levels
    const filteredLevels = targetLevels.filter(level => level.quantity > 0);
    
    if (action === 'buy') {
      orderBook.asks = filteredLevels;
    } else {
      orderBook.bids = filteredLevels;
    }
    
    return totalCost;
  }

  getBestBidAsk(orderBook: OrderBook): { bestBid: number; bestAsk: number; spread: number } {
    const bestBid = orderBook.bids[0]?.price || 0;
    const bestAsk = orderBook.asks[0]?.price || 0;
    const spread = bestAsk - bestBid;
    
    return { bestBid, bestAsk, spread };
  }
}