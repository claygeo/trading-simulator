import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Trader {
  position: number;
  walletAddress: string;
  netPnl: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  tradeCount: number;
  feesUsd: number;
  winRate: number;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  portfolioEfficiency: number;
  simulationPnl?: number;
}

interface Trade {
  id: string;
  timestamp: number;
  trader: Trader;
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  value: number;
  impact: number;
}

interface RecentTradesProps {
  trades: Trade[];
}

const RecentTrades: React.FC<RecentTradesProps> = ({ trades }) => {
  const [displayCount, setDisplayCount] = useState<number>(50);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const lastTradeCountRef = useRef<number>(trades.length);
  
  // Calculate volume statistics for color scaling
  const volumeStats = useMemo(() => {
    if (trades.length === 0) return { min: 0, max: 0, avg: 0 };
    
    const values = trades.map(t => t.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    return { min, max, avg };
  }, [trades]);
  
  // Calculate color intensity based on trade value
  const getTradeColorIntensity = (trade: Trade) => {
    const { min, max } = volumeStats;
    if (max === min) return 0.5; // Default if all trades are same size
    
    // Normalize value between 0 and 1
    const normalized = (trade.value - min) / (max - min);
    
    // Scale between 0.2 (lightest) and 1.0 (darkest)
    // Larger trades get darker colors
    return 0.2 + (normalized * 0.8);
  };
  
  // Get background color with intensity for trade rows
  const getTradeBackgroundColor = (trade: Trade) => {
    const intensity = getTradeColorIntensity(trade);
    
    if (trade.action === 'buy') {
      // Green for buys - darker green for larger buys
      return `rgba(34, 197, 94, ${intensity * 0.3})`; // Tailwind green-500 with opacity
    } else {
      // Red for sells - darker red for larger sells
      return `rgba(239, 68, 68, ${intensity * 0.3})`; // Tailwind red-500 with opacity
    }
  };
  
  // Get text color with intensity
  const getTradeTextColor = (trade: Trade) => {
    const intensity = getTradeColorIntensity(trade);
    
    if (trade.action === 'buy') {
      // Brighter green for larger trades
      const greenValue = Math.floor(150 + (intensity * 105)); // 150-255
      return `rgb(34, ${greenValue}, 94)`;
    } else {
      // Brighter red for larger trades
      const redValue = Math.floor(150 + (intensity * 105)); // 150-255
      return `rgb(${redValue}, 68, 68)`;
    }
  };
  
  // Auto-scroll to bottom when new trades come in
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current && trades.length > lastTradeCountRef.current) {
      scrollContainerRef.current.scrollTop = 0; // Scroll to top since newest trades are first
    }
    lastTradeCountRef.current = trades.length;
  }, [trades, autoScroll]);
  
  // Format functions
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatQuantity = (quantity: number) => quantity.toFixed(2);
  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };
  
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };
  
  const formatImpact = (impact: number) => {
    const percentage = impact * 100;
    return `${percentage.toFixed(3)}%`;
  };
  
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  
  // Handle scroll to detect if user is manually scrolling
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current;
      // If user scrolls away from top, disable auto-scroll
      setAutoScroll(scrollTop < 50);
    }
  };
  
  const loadMore = () => {
    setDisplayCount(prev => Math.min(prev + 50, trades.length));
  };
  
  return (
    <div className="bg-surface p-2 rounded-lg shadow-lg h-full flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xs font-semibold text-text-primary">
          Recent Trades {trades.length > 0 && `(${trades.length})`}
        </h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              autoScroll 
                ? 'bg-accent text-white' 
                : 'bg-panel text-text-secondary'
            }`}
          >
            {autoScroll ? 'Auto' : 'Manual'}
          </button>
          <div className="flex space-x-1">
            <span className="text-[9px] text-chart-up">● Buys</span>
            <span className="text-[9px] text-chart-down">● Sells</span>
          </div>
        </div>
      </div>
      
      {/* Trade flow indicator - shows if trades are coming in */}
      {trades.length > 0 && (
        <div className="h-1 mb-1 bg-panel rounded overflow-hidden">
          <div 
            className="h-full bg-accent transition-all duration-1000 animate-pulse"
            style={{
              width: `${Math.min(100, (trades.length / 100) * 100)}%`
            }}
          />
        </div>
      )}
      
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-y-auto flex-1"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitScrollbar: { display: 'none' }
        } as React.CSSProperties}
      >
        <style dangerouslySetInnerHTML={{
          __html: `
            .overflow-y-auto::-webkit-scrollbar {
              display: none;
            }
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateY(-10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `
        }} />
        <div className="min-w-max">
          <table className="w-full text-[10px]">
            <thead className="bg-surface sticky top-0 z-10">
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
                  <td colSpan={7} className="text-center py-4 text-text-muted">
                    Waiting for trades...
                  </td>
                </tr>
              ) : (
                trades.slice(0, displayCount).map((trade, index) => {
                  const isNewTrade = index < 5; // Highlight most recent trades
                  
                  return (
                    <tr 
                      key={trade.id} 
                      className="border-b border-border transition-all duration-300"
                      style={{
                        backgroundColor: getTradeBackgroundColor(trade),
                        animation: isNewTrade ? 'slideIn 0.3s ease-out' : undefined
                      }}
                    >
                      <td className="py-0.5 px-1 text-[9px] text-text-muted font-mono">
                        {formatTime(trade.timestamp)}
                      </td>
                      <td className="py-0.5 px-1 text-text-primary">
                        <div className="flex items-center">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-0.5 ${
                            trade.trader.riskProfile === 'aggressive' ? 'bg-danger' : 
                            trade.trader.riskProfile === 'moderate' ? 'bg-warning' : 
                            'bg-success'
                          }`}></span>
                          {truncateAddress(trade.trader.walletAddress)}
                        </div>
                      </td>
                      <td className="py-0.5 px-1 text-center font-bold"
                          style={{ color: getTradeTextColor(trade) }}>
                        {trade.action.toUpperCase()}
                      </td>
                      <td className="py-0.5 px-1 text-right text-text-primary font-mono">
                        {formatPrice(trade.price)}
                      </td>
                      <td className="py-0.5 px-1 text-right text-text-primary font-mono">
                        {formatQuantity(trade.quantity)}
                      </td>
                      <td className="py-0.5 px-1 text-right font-mono font-semibold"
                          style={{ color: getTradeTextColor(trade) }}>
                        {formatValue(trade.value)}
                      </td>
                      <td className="py-0.5 px-1 text-right text-[9px] text-text-muted font-mono">
                        {formatImpact(trade.impact)}
                      </td>
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
            className="px-2 py-0.5 bg-panel hover:bg-panel-hover text-text-primary text-[10px] rounded transition-colors"
          >
            Load More ({trades.length - displayCount} remaining)
          </button>
        </div>
      )}
      
      {trades.length > 0 && (
        <div className="mt-1 text-[9px] text-text-secondary border-t border-border pt-1">
          <div className="flex justify-between">
            <div>
              <span className="text-chart-up">Buy: {trades.filter(t => t.action === 'buy').length}</span>
              <span className="mx-1">|</span>
              <span className="text-chart-down">Sell: {trades.filter(t => t.action === 'sell').length}</span>
            </div>
            <div>
              Volume: {formatValue(trades.reduce((sum, t) => sum + t.value, 0))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentTrades;