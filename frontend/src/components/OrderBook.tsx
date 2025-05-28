import React, { useEffect, useRef, useState } from 'react';
import { OrderBook } from '../types';

interface OrderBookProps {
  orderBook: OrderBook;
}

const OrderBookComponent: React.FC<OrderBookProps> = ({ orderBook }) => {
  const { bids, asks } = orderBook;
  const previousOrderBookRef = useRef<OrderBook | null>(null);
  const [maxQuantity, setMaxQuantity] = useState<number>(0);
  const [flashingPrices, setFlashingPrices] = useState<Map<string, 'up' | 'down'>>(new Map());
  
  // Format price and quantity
  const formatPrice = (price: number) => price.toFixed(2);
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
  const limitedAsks = asks.slice(0, 10).reverse(); // Reverse asks to show best price at bottom
  const limitedBids = bids.slice(0, 10);
  
  const bidsWithDepth = calculateDepth(limitedBids);
  const asksWithDepth = calculateDepth(limitedAsks);
  
  // Update max quantity for depth visualization
  useEffect(() => {
    const allQuantities = [...bidsWithDepth, ...asksWithDepth].map(level => level.quantity);
    const newMax = Math.max(...allQuantities, 0);
    setMaxQuantity(newMax);
  }, [bidsWithDepth, asksWithDepth]);
  
  // Calculate the spread
  const spread = asks.length > 0 && bids.length > 0
    ? asks[0].price - bids[0].price
    : 0;
  
  const spreadPercentage = asks.length > 0 && bids.length > 0 && bids[0].price > 0
    ? (spread / bids[0].price) * 100
    : 0;
  
  // Track price changes for subtle flashing
  useEffect(() => {
    const newFlashing = new Map<string, 'up' | 'down'>();
    
    // Check bids
    bids.forEach((bid, index) => {
      const prevBid = previousOrderBookRef.current?.bids[index];
      if (prevBid && bid.price === prevBid.price && bid.quantity !== prevBid.quantity) {
        const key = `bid-${bid.price}`;
        newFlashing.set(key, bid.quantity > prevBid.quantity ? 'up' : 'down');
      }
    });
    
    // Check asks
    asks.forEach((ask, index) => {
      const prevAsk = previousOrderBookRef.current?.asks[index];
      if (prevAsk && ask.price === prevAsk.price && ask.quantity !== prevAsk.quantity) {
        const key = `ask-${ask.price}`;
        newFlashing.set(key, ask.quantity > prevAsk.quantity ? 'up' : 'down');
      }
    });
    
    setFlashingPrices(newFlashing);
    
    // Clear flashing after animation
    const timer = setTimeout(() => {
      setFlashingPrices(new Map());
    }, 600);
    
    previousOrderBookRef.current = orderBook;
    
    return () => clearTimeout(timer);
  }, [orderBook, bids, asks]);
  
  return (
    <div className="bg-surface p-2 rounded-lg shadow-lg h-full overflow-hidden flex flex-col">
      <div className="grid grid-cols-3 text-[10px] text-text-secondary py-1 border-b border-border">
        <div className="text-left">Price</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Total</div>
      </div>
      
      {/* Container for both sells and buys with fixed heights */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sell orders (asks) - Fixed height for 10 orders */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            <div className="flex flex-col-reverse">
              {asksWithDepth.map((ask, index) => {
                const depthPercent = maxQuantity > 0 ? (ask.quantity / maxQuantity) * 100 : 0;
                const flashKey = `ask-${ask.price}`;
                const isFlashing = flashingPrices.get(flashKey);
                
                return (
                  <div 
                    key={`ask-${index}`} 
                    className="relative group hover:bg-surface-light transition-colors duration-200"
                  >
                    {/* Subtle depth bar */}
                    <div 
                      className="absolute inset-0 bg-red-500 opacity-[0.08] transition-all duration-500"
                      style={{ 
                        width: `${depthPercent}%`,
                        maxWidth: '100%'
                      }}
                    />
                    
                    {/* Flash overlay */}
                    {isFlashing && (
                      <div 
                        className={`absolute inset-0 ${
                          isFlashing === 'up' ? 'bg-green-400' : 'bg-red-400'
                        } opacity-20 animate-pulse`}
                      />
                    )}
                    
                    <div className="grid grid-cols-3 text-[10px] py-0.5 relative z-10">
                      <div className="text-left text-red-400 font-mono pl-1">
                        {formatPrice(ask.price)}
                      </div>
                      <div className="text-right text-text-primary font-mono">
                        {formatQuantity(ask.quantity)}
                      </div>
                      <div className="text-right text-text-secondary font-mono pr-1">
                        {formatQuantity(ask.depth)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Current Price / Mid Market with Spread */}
        <div className="flex items-center justify-between py-1 px-2 border-y border-border bg-panel">
          <div className="text-[10px] text-text-secondary">
            <span>Spread: </span>
            <span className="font-medium text-text-primary">
              {formatPrice(spread)} ({spreadPercentage.toFixed(2)}%)
            </span>
          </div>
          <span className="text-xs font-bold text-text-primary">
            ${(((asks[0]?.price || 0) + (bids[0]?.price || 0)) / 2).toFixed(2)}
          </span>
        </div>
        
        {/* Buy orders (bids) - Fixed height for 10 orders */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {bidsWithDepth.map((bid, index) => {
              const depthPercent = maxQuantity > 0 ? (bid.quantity / maxQuantity) * 100 : 0;
              const flashKey = `bid-${bid.price}`;
              const isFlashing = flashingPrices.get(flashKey);
              
              return (
                <div 
                  key={`bid-${index}`} 
                  className="relative group hover:bg-surface-light transition-colors duration-200"
                >
                  {/* Subtle depth bar */}
                  <div 
                    className="absolute inset-0 bg-green-500 opacity-[0.08] transition-all duration-500"
                    style={{ 
                      width: `${depthPercent}%`,
                      maxWidth: '100%'
                    }}
                  />
                  
                  {/* Flash overlay */}
                  {isFlashing && (
                    <div 
                      className={`absolute inset-0 ${
                        isFlashing === 'up' ? 'bg-green-400' : 'bg-red-400'
                      } opacity-20 animate-pulse`}
                    />
                  )}
                  
                  <div className="grid grid-cols-3 text-[10px] py-0.5 relative z-10">
                    <div className="text-left text-green-400 font-mono pl-1">
                      {formatPrice(bid.price)}
                    </div>
                    <div className="text-right text-text-primary font-mono">
                      {formatQuantity(bid.quantity)}
                    </div>
                    <div className="text-right text-text-secondary font-mono pr-1">
                      {formatQuantity(bid.depth)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="text-[9px] text-text-muted text-right mt-0.5">
        {new Date(orderBook.lastUpdateTime).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default OrderBookComponent;