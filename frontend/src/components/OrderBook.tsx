// frontend/src/components/OrderBook.tsx - Compact Version
import React, { useEffect, useRef } from 'react';
import { OrderBook } from '../types';

interface OrderBookProps {
  orderBook: OrderBook;
}

const OrderBookComponent: React.FC<OrderBookProps> = ({ orderBook }) => {
  const { bids, asks } = orderBook;
  const previousOrderBookRef = useRef<OrderBook | null>(null);
  
  // Format price and quantity
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatQuantity = (quantity: number) => quantity.toFixed(2);
  
  // Calculate depth (cumulative quantity)
  const calculateDepth = (levels: { price: number; quantity: number }[]) => {
    let cumulative = 0;
    return levels.map(level => {
      cumulative += level.quantity;
      return {
        ...level,
        depth: cumulative
      };
    });
  };
  
  // Limit to exactly 10 sell and 10 buy orders
  const limitedAsks = asks.slice(0, 10);
  const limitedBids = bids.slice(0, 10);
  
  const bidsWithDepth = calculateDepth(limitedBids);
  const asksWithDepth = calculateDepth(limitedAsks);
  
  // Calculate max depth for visualization
  const maxDepth = Math.max(
    bidsWithDepth.length > 0 ? bidsWithDepth[bidsWithDepth.length - 1].depth : 0,
    asksWithDepth.length > 0 ? asksWithDepth[asksWithDepth.length - 1].depth : 0
  );
  
  // Calculate the spread
  const spread = asks.length > 0 && bids.length > 0
    ? asks[0].price - bids[0].price
    : 0;
  
  const spreadPercentage = asks.length > 0 && bids[0].price > 0
    ? (spread / bids[0].price) * 100
    : 0;
  
  // Check if price has changed from previous render
  const hasPriceChanged = (currentPrice: number, prevPrice: number | undefined) => {
    return prevPrice !== undefined && currentPrice !== prevPrice;
  };
  
  // Store previous orderbook for comparison
  useEffect(() => {
    previousOrderBookRef.current = orderBook;
  }, [orderBook]);
  
  return (
    <div className="bg-surface p-2 rounded-lg shadow-lg h-full overflow-hidden">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-base font-semibold text-text-primary">Order Book</h2>
        <div className="text-xs bg-panel px-2 py-0.5 rounded">
          <span className="text-text-secondary">Spread: </span>
          <span className="font-semibold text-text-primary">
            {formatPrice(spread)} ({spreadPercentage.toFixed(2)}%)
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 text-xs text-text-secondary py-0.5 border-b border-border">
        <div className="text-left">Price</div>
        <div className="text-right">Quantity</div>
        <div className="text-right">Total</div>
      </div>
      
      {/* Sell orders (asks) - Now fixed height to show exactly 10 asks */}
      <div>
        {asksWithDepth.map((ask, index) => {
          const prevAsk = previousOrderBookRef.current?.asks[index];
          const priceChanged = hasPriceChanged(ask.price, prevAsk?.price);
          
          return (
            <div 
              key={`ask-${index}`} 
              className={`flex justify-between text-xs py-0.5 ${priceChanged ? 'animate-flash-red' : ''}`}
            >
              <div className="w-1/3 text-left text-chart-down font-mono">
                {formatPrice(ask.price)}
              </div>
              <div className="w-1/3 text-right text-text-primary font-mono">
                {formatQuantity(ask.quantity)}
              </div>
              <div className="w-1/3 text-right relative">
                <div 
                  className="absolute top-0 right-0 h-full bg-chart-down bg-opacity-10"
                  style={{ width: `${(ask.depth / maxDepth) * 100}%` }}
                ></div>
                <span className="relative z-10 text-text-primary font-mono">
                  {formatQuantity(ask.depth)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="h-px bg-border my-0.5"></div>
      
      {/* Buy orders (bids) - Now fixed height to show exactly 10 bids */}
      <div>
        {bidsWithDepth.map((bid, index) => {
          const prevBid = previousOrderBookRef.current?.bids[index];
          const priceChanged = hasPriceChanged(bid.price, prevBid?.price);
          
          return (
            <div 
              key={`bid-${index}`} 
              className={`flex justify-between text-xs py-0.5 ${priceChanged ? 'animate-flash-green' : ''}`}
            >
              <div className="w-1/3 text-left text-chart-up font-mono">
                {formatPrice(bid.price)}
              </div>
              <div className="w-1/3 text-right text-text-primary font-mono">
                {formatQuantity(bid.quantity)}
              </div>
              <div className="w-1/3 text-right relative">
                <div 
                  className="absolute top-0 right-0 h-full bg-chart-up bg-opacity-10"
                  style={{ width: `${(bid.depth / maxDepth) * 100}%` }}
                ></div>
                <span className="relative z-10 text-text-primary font-mono">
                  {formatQuantity(bid.depth)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="text-xs text-text-muted text-right mt-0.5">
        Updated: {new Date(orderBook.lastUpdateTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })}
      </div>
    </div>
  );
};

export default OrderBookComponent;