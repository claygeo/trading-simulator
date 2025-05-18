// frontend/src/components/OrderBook.tsx
import React from 'react';
import { OrderBook } from '../types';

interface OrderBookProps {
  orderBook: OrderBook;
}

const OrderBookComponent: React.FC<OrderBookProps> = ({ orderBook }) => {
  const { bids, asks } = orderBook;
  
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
  
  const bidsWithDepth = calculateDepth(bids);
  const asksWithDepth = calculateDepth(asks);
  
  // Calculate max depth for visualization
  const maxDepth = Math.max(
    bidsWithDepth.length > 0 ? bidsWithDepth[bidsWithDepth.length - 1].depth : 0,
    asksWithDepth.length > 0 ? asksWithDepth[asksWithDepth.length - 1].depth : 0
  );
  
  // Calculate the spread
  const spread = asks.length > 0 && bids.length > 0
    ? asks[0].price - bids[0].price
    : 0;
  
  const spreadPercentage = asks.length > 0 && bids.length > 0
    ? (spread / asks[0].price) * 100
    : 0;
  
  return (
    <div className="bg-white p-4 rounded-lg shadow h-full">
      <h2 className="text-xl font-semibold mb-4">Order Book</h2>
      
      <div className="mb-4 p-2 bg-gray-100 rounded">
        <div className="flex justify-between">
          <span className="text-gray-600">Spread</span>
          <span className="font-semibold">{formatPrice(spread)} ({spreadPercentage.toFixed(2)}%)</span>
        </div>
      </div>
      
      <div className="flex justify-between mb-2">
        <div className="w-1/3 text-left text-gray-600">Price</div>
        <div className="w-1/3 text-right text-gray-600">Quantity</div>
        <div className="w-1/3 text-right text-gray-600">Total</div>
      </div>
      
      {/* Sell orders (asks) */}
      <div className="mb-4">
        {asksWithDepth.slice(0, 7).map((ask, index) => (
          <div key={`ask-${index}`} className="flex justify-between mb-1">
            <div className="w-1/3 text-left text-red-500">{formatPrice(ask.price)}</div>
            <div className="w-1/3 text-right">{formatQuantity(ask.quantity)}</div>
            <div className="w-1/3 text-right relative">
              <div 
                className="absolute top-0 right-0 h-full bg-red-100"
                style={{ width: `${(ask.depth / maxDepth) * 100}%` }}
              ></div>
              <span className="relative z-10">{formatQuantity(ask.depth)}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="h-px bg-gray-300 my-2"></div>
      
      {/* Buy orders (bids) */}
      <div>
        {bidsWithDepth.slice(0, 7).map((bid, index) => (
          <div key={`bid-${index}`} className="flex justify-between mb-1">
            <div className="w-1/3 text-left text-green-500">{formatPrice(bid.price)}</div>
            <div className="w-1/3 text-right">{formatQuantity(bid.quantity)}</div>
            <div className="w-1/3 text-right relative">
              <div 
                className="absolute top-0 right-0 h-full bg-green-100"
                style={{ width: `${(bid.depth / maxDepth) * 100}%` }}
              ></div>
              <span className="relative z-10">{formatQuantity(bid.depth)}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-xs text-gray-500 text-right">
        Last Updated: {new Date(orderBook.lastUpdateTime).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default OrderBookComponent;