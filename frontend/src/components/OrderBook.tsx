import React, { useEffect, useRef, useState } from 'react';
import { OrderBook } from '../types';

interface OrderBookProps {
  orderBook: OrderBook;
}

const OrderBookComponent: React.FC<OrderBookProps> = ({ orderBook }) => {
  const { bids, asks } = orderBook;
  const previousOrderBookRef = useRef<OrderBook | null>(null);
  const [maxDepth, setMaxDepth] = useState<number>(0);
  
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
        depth: cumulative,
        individualPercent: 0 // Will be calculated based on max
      };
    });
  };
  
  // Limit to exactly 10 sell and 10 buy orders
  const limitedAsks = asks.slice(0, 10).reverse(); // Reverse asks to show best price at bottom
  const limitedBids = bids.slice(0, 10);
  
  const bidsWithDepth = calculateDepth(limitedBids);
  const asksWithDepth = calculateDepth(limitedAsks);
  
  // Update max depth dynamically
  useEffect(() => {
    const currentMaxBidDepth = bidsWithDepth.length > 0 ? Math.max(...bidsWithDepth.map(b => b.quantity)) : 0;
    const currentMaxAskDepth = asksWithDepth.length > 0 ? Math.max(...asksWithDepth.map(a => a.quantity)) : 0;
    const newMaxDepth = Math.max(currentMaxBidDepth, currentMaxAskDepth);
    
    // Smooth transition for max depth changes
    if (newMaxDepth > 0) {
      setMaxDepth(prevMax => {
        // If no previous max or significant change, update immediately
        if (prevMax === 0 || Math.abs(newMaxDepth - prevMax) / prevMax > 0.5) {
          return newMaxDepth;
        }
        // Otherwise, smooth the transition
        return prevMax * 0.9 + newMaxDepth * 0.1;
      });
    }
  }, [bidsWithDepth, asksWithDepth]);
  
  // Calculate the spread
  const spread = asks.length > 0 && bids.length > 0
    ? asks[0].price - bids[0].price
    : 0;
  
  const spreadPercentage = asks.length > 0 && bids.length > 0 && bids[0].price > 0
    ? (spread / bids[0].price) * 100
    : 0;
  
  // Check if a price level has changed
  const hasChanged = (
    current: { price: number; quantity: number },
    previous: { price: number; quantity: number } | undefined
  ): boolean => {
    if (!previous) return true;
    return current.quantity !== previous.quantity;
  };
  
  // Store previous orderbook for comparison
  useEffect(() => {
    previousOrderBookRef.current = orderBook;
  }, [orderBook]);
  
  return (
    <div className="bg-surface p-2 rounded-lg shadow-lg h-full overflow-hidden flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-sm font-semibold text-text-primary">Order Book</h2>
        <div className="text-[10px] bg-panel px-2 py-0.5 rounded">
          <span className="text-text-secondary">Spread: </span>
          <span className="font-semibold text-text-primary">
            {formatPrice(spread)} ({spreadPercentage.toFixed(2)}%)
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 text-[10px] text-text-secondary py-0.5 border-b border-border">
        <div className="text-left">Price</div>
        <div className="text-right">Quantity</div>
        <div className="text-right">Total</div>
      </div>
      
      {/* Sell orders (asks) - Best price at bottom */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-300 hover:scrollbar-thumb-gray-500">
        <div className="flex flex-col-reverse">
          {asksWithDepth.map((ask, index) => {
            const depthPercent = maxDepth > 0 ? (ask.quantity / maxDepth) * 100 : 0;
            const prevAsk = previousOrderBookRef.current?.asks[asks.length - 1 - index];
            const changed = hasChanged(ask, prevAsk);
            
            return (
              <div 
                key={`ask-${index}`} 
                className={`flex justify-between text-[10px] py-0.5 relative transition-all duration-300 ${
                  changed ? 'bg-chart-down bg-opacity-5' : ''
                }`}
              >
                {/* Depth visualization bar */}
                <div 
                  className="absolute inset-0 bg-gradient-to-l from-chart-down to-transparent opacity-20 transition-all duration-500"
                  style={{ 
                    width: `${depthPercent}%`,
                    maxWidth: '100%'
                  }}
                />
                
                <div className="w-1/3 text-left text-chart-down font-mono relative z-10">
                  {formatPrice(ask.price)}
                </div>
                <div className="w-1/3 text-right text-text-primary font-mono relative z-10">
                  {formatQuantity(ask.quantity)}
                </div>
                <div className="w-1/3 text-right text-text-primary font-mono relative z-10">
                  {formatQuantity(ask.depth)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Current Price / Mid Market */}
      <div className="flex items-center justify-center py-1 border-y border-border bg-panel">
        <span className="text-xs font-bold text-text-primary">
          ${(((asks[0]?.price || 0) + (bids[0]?.price || 0)) / 2).toFixed(2)}
        </span>
      </div>
      
      {/* Buy orders (bids) */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-300 hover:scrollbar-thumb-gray-500">
        {bidsWithDepth.map((bid, index) => {
          const depthPercent = maxDepth > 0 ? (bid.quantity / maxDepth) * 100 : 0;
          const prevBid = previousOrderBookRef.current?.bids[index];
          const changed = hasChanged(bid, prevBid);
          
          return (
            <div 
              key={`bid-${index}`} 
              className={`flex justify-between text-[10px] py-0.5 relative transition-all duration-300 ${
                changed ? 'bg-chart-up bg-opacity-5' : ''
              }`}
            >
              {/* Depth visualization bar */}
              <div 
                className="absolute inset-0 bg-gradient-to-l from-chart-up to-transparent opacity-20 transition-all duration-500"
                style={{ 
                  width: `${depthPercent}%`,
                  maxWidth: '100%'
                }}
              />
              
              <div className="w-1/3 text-left text-chart-up font-mono relative z-10">
                {formatPrice(bid.price)}
              </div>
              <div className="w-1/3 text-right text-text-primary font-mono relative z-10">
                {formatQuantity(bid.quantity)}
              </div>
              <div className="w-1/3 text-right text-text-primary font-mono relative z-10">
                {formatQuantity(bid.depth)}
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="text-[9px] text-text-muted text-right mt-0.5">
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