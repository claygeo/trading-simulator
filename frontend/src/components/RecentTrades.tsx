// frontend/src/components/RecentTrades.tsx - Compact version
import React, { useState, useRef } from 'react';
import { Trade } from '../types';

interface RecentTradesProps {
  trades: Trade[];
}

const RecentTrades: React.FC<RecentTradesProps> = ({ trades }) => {
  const [displayCount, setDisplayCount] = useState<number>(10);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Format trade data for display
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatQuantity = (quantity: number) => quantity.toFixed(2);
  const formatValue = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  // Format impact for display
  const formatImpact = (impact: number) => {
    const percentage = impact * 100;
    return `${percentage.toFixed(4)}%`;
  };
  
  // Truncate wallet address for display
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  
  // Load more trades
  const loadMore = () => {
    setDisplayCount(prev => Math.min(prev + 10, trades.length));
  };
  
  // Scroll left handler
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };
  
  // Scroll right handler
  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };
  
  return (
    <div className="bg-surface p-2 rounded-lg shadow-lg h-full">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xs font-semibold text-text-primary">Recent Trades</h2>
        <div className="flex space-x-1">
          <button 
            onClick={scrollLeft}
            className="text-accent hover:text-accent-hover focus:outline-none p-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button 
            onClick={scrollRight}
            className="text-accent hover:text-accent-hover focus:outline-none p-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      {/* Adding the scrollbar-hiding styles directly to the div using className */}
      <div 
        ref={scrollContainerRef}
        className="overflow-x-auto pb-1 hide-scrollbar"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none' 
        }}
      >
        <div className="min-w-max">
          <table className="w-full text-[10px]">
            <thead className="bg-surface z-10">
              <tr className="border-b border-border">
                <th className="py-0.5 px-1 text-left text-text-secondary">Time</th>
                <th className="py-0.5 px-1 text-left text-text-secondary">Trader</th>
                <th className="py-0.5 px-1 text-center text-text-secondary">Type</th>
                <th className="py-0.5 px-1 text-right text-text-secondary">Price</th>
                <th className="py-0.5 px-1 text-right text-text-secondary">Quantity</th>
                <th className="py-0.5 px-1 text-right text-text-secondary">Value</th>
                <th className="py-0.5 px-1 text-right text-text-secondary">Impact</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-2 text-text-muted">No trades yet</td>
                </tr>
              ) : (
                trades.slice(0, displayCount).map((trade) => {
                  // Ensure values are valid (no zero quantity trades)
                  const quantityDisplay = trade.quantity > 0 ? formatQuantity(trade.quantity) : "0.01";
                  
                  return (
                    <tr 
                      key={trade.id} 
                      className="border-b border-border hover:bg-panel transition-colors"
                    >
                      <td className="py-0.5 px-1 text-[9px] text-text-muted font-mono">{formatTime(trade.timestamp)}</td>
                      <td className="py-0.5 px-1 text-text-primary">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-0.5 ${
                          trade.trader.riskProfile === 'aggressive' ? 'bg-danger' : 
                          trade.trader.riskProfile === 'moderate' ? 'bg-warning' : 
                          'bg-success'
                        }`}></span>
                        {truncateAddress(trade.trader.walletAddress)}
                      </td>
                      <td className={`py-0.5 px-1 text-center ${
                        trade.action === 'buy' ? 'text-chart-up' : 'text-chart-down'
                      } font-semibold`}>
                        {trade.action.toUpperCase()}
                      </td>
                      <td className="py-0.5 px-1 text-right text-text-primary font-mono">{formatPrice(trade.price)}</td>
                      <td className="py-0.5 px-1 text-right text-text-primary font-mono">{quantityDisplay}</td>
                      <td className="py-0.5 px-1 text-right text-text-primary font-mono">{formatValue(trade.value)}</td>
                      <td className="py-0.5 px-1 text-right text-[9px] text-text-muted font-mono">{formatImpact(trade.impact)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {displayCount < trades.length && (
        <div className="mt-1 text-center">
          <button 
            onClick={loadMore}
            className="px-2 py-0.5 bg-panel hover:bg-panel-hover text-text-primary text-[10px] rounded"
          >
            Load More
          </button>
        </div>
      )}
      
      {trades.length > 0 && (
        <div className="mt-1 text-[9px] text-text-secondary">
          <div className="flex justify-between">
            <span>Total trades: {trades.length}</span>
            <span>
              Buy: <span className="text-chart-up">{trades.filter(t => t.action === 'buy').length}</span> | 
              Sell: <span className="text-chart-down">{trades.filter(t => t.action === 'sell').length}</span>
            </span>
          </div>
        </div>
      )}
      
      {/* Add the required CSS to your global styles instead of using jsx */}
      {/* This should be added to your global CSS file */}
      {/* 
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      */}
    </div>
  );
};

export default RecentTrades;