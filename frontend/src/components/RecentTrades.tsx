// frontend/src/components/RecentTrades.tsx - OPTIMIZED: Clean professional layout, exact dimensions
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
  const [showAllTrades, setShowAllTrades] = useState<boolean>(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const lastTradeCountRef = useRef<number>(trades.length);
  
  const actualTradeCount = trades.length;
  const displayedTradeCount = showAllTrades ? actualTradeCount : Math.min(displayCount, actualTradeCount);
  
  // Calculate volume statistics for color intensity
  const volumeStats = useMemo(() => {
    if (trades.length === 0) return { min: 0, max: 0, avg: 0 };
    
    const values = trades.map(t => t.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    return { min, max, avg };
  }, [trades]);
  
  // ENHANCED: Calculate color intensity for larger trades = darker colors
  const getTradeColorIntensity = (trade: Trade) => {
    const { min, max } = volumeStats;
    if (max === min) return 0.5;
    
    const normalized = (trade.value - min) / (max - min);
    return 0.2 + (normalized * 0.8); // 0.2 (lightest) to 1.0 (darkest)
  };
  
  // ENHANCED: Background color with darker shades for larger trades
  const getTradeBackgroundColor = (trade: Trade) => {
    const intensity = getTradeColorIntensity(trade);
    
    if (trade.action === 'buy') {
      return `rgba(34, 197, 94, ${intensity * 0.25})`; // Green with variable opacity
    } else {
      return `rgba(239, 68, 68, ${intensity * 0.25})`; // Red with variable opacity
    }
  };
  
  // ENHANCED: Text color with intensity for larger trades
  const getTradeTextColor = (trade: Trade) => {
    const intensity = getTradeColorIntensity(trade);
    
    if (trade.action === 'buy') {
      const greenValue = Math.floor(150 + (intensity * 105)); // 150-255
      return `rgb(34, ${greenValue}, 94)`;
    } else {
      const redValue = Math.floor(150 + (intensity * 105)); // 150-255
      return `rgb(${redValue}, 68, 68)`;
    }
  };
  
  // Auto-scroll to newest trades
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current && trades.length > lastTradeCountRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    lastTradeCountRef.current = trades.length;
  }, [trades, autoScroll]);
  
  // OPTIMIZED: Essential format functions only
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatQuantity = (quantity: number) => quantity.toFixed(0);
  const formatValue = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };
  
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };
  
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  
  // ENHANCED: Format impressive trade count
  const formatTradeCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };
  
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current;
      setAutoScroll(scrollTop < 50);
    }
  };
  
  const loadMore = () => {
    if (showAllTrades) {
      setShowAllTrades(false);
      setDisplayCount(50);
    } else {
      const newCount = displayCount + 50;
      if (newCount >= actualTradeCount) {
        setShowAllTrades(true);
      } else {
        setDisplayCount(newCount);
      }
    }
  };
  
  // Trading velocity calculation
  const tradeVelocity = useMemo(() => {
    if (trades.length < 2) return 0;
    
    const recentTrades = trades.slice(0, Math.min(100, trades.length));
    if (recentTrades.length < 2) return 0;
    
    const timeSpan = recentTrades[0].timestamp - recentTrades[recentTrades.length - 1].timestamp;
    const timeSpanSeconds = timeSpan / 1000;
    
    if (timeSpanSeconds <= 0) return 0;
    return recentTrades.length / timeSpanSeconds;
  }, [trades]);
  
  // ENHANCED: Trading statistics
  const tradingStats = useMemo(() => {
    const buyTrades = trades.filter(t => t.action === 'buy');
    const sellTrades = trades.filter(t => t.action === 'sell');
    const totalVolume = trades.reduce((sum, t) => sum + t.value, 0);
    
    return {
      buyCount: buyTrades.length,
      sellCount: sellTrades.length,
      totalVolume,
      avgTradeSize: trades.length > 0 ? totalVolume / trades.length : 0,
      velocity: tradeVelocity
    };
  }, [trades, tradeVelocity]);
  
  return (
    <div className="bg-surface p-2 rounded-lg shadow-lg h-full flex flex-col">
      {/* OPTIMIZED: Clean header with essential info only */}
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xs font-semibold text-text-primary">
          Recent Trades {actualTradeCount > 0 && (
            <span className="text-accent font-bold">
              ({formatTradeCount(actualTradeCount)})
            </span>
          )}
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
        </div>
      </div>
      
      {/* OPTIMIZED: Simplified activity indicator */}
      {actualTradeCount > 0 && (
        <div className="mb-1">
          <div className="h-1 bg-panel rounded overflow-hidden">
            <div 
              className="h-full bg-accent transition-all duration-1000 animate-pulse"
              style={{
                width: `${Math.min(100, (actualTradeCount / 500) * 100)}%`
              }}
            />
          </div>
          
          <div className="flex justify-between text-[9px] text-text-secondary mt-0.5">
            <div>
              <span className="text-accent font-semibold">{formatTradeCount(actualTradeCount)}</span> total
              {tradeVelocity > 0 && (
                <span className="ml-1">
                  • <span className="text-chart-up">{tradeVelocity.toFixed(1)}/sec</span>
                </span>
              )}
            </div>
            <div>
              Showing: <span className="text-white font-medium">{displayedTradeCount}</span>
              {displayedTradeCount < actualTradeCount && (
                <span className="text-warning ml-1">
                  (+{actualTradeCount - displayedTradeCount} more)
                </span>
              )}
            </div>
          </div>
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
          {/* OPTIMIZED: Essential columns only - Trader | Size | Price | Value */}
          <table className="w-full text-[10px]">
            <thead className="bg-surface sticky top-0 z-10">
              <tr className="border-b border-border">
                <th className="py-0.5 px-1 text-left text-text-secondary">Time</th>
                <th className="py-0.5 px-1 text-left text-text-secondary">Trader</th>
                <th className="py-0.5 px-1 text-center text-text-secondary">Type</th>
                <th className="py-0.5 px-1 text-right text-text-secondary">Size</th>
                <th className="py-0.5 px-1 text-right text-text-secondary">Price</th>
                <th className="py-0.5 px-1 text-right text-text-secondary">Value</th>
              </tr>
            </thead>
            <tbody>
              {actualTradeCount === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-text-muted">
                    Waiting for ultra-fast trades...
                  </td>
                </tr>
              ) : (
                trades.slice(0, displayedTradeCount).map((trade, index) => {
                  const isNewTrade = index < 5;
                  
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
                        {formatQuantity(trade.quantity)}
                      </td>
                      <td className="py-0.5 px-1 text-right text-text-primary font-mono">
                        {formatPrice(trade.price)}
                      </td>
                      <td className="py-0.5 px-1 text-right font-mono font-semibold"
                          style={{ color: getTradeTextColor(trade) }}>
                        {formatValue(trade.value)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* OPTIMIZED: Load more button */}
      {displayedTradeCount < actualTradeCount && (
        <div className="mt-1 text-center">
          <button 
            onClick={loadMore}
            className="px-2 py-0.5 bg-panel hover:bg-panel-hover text-text-primary text-[10px] rounded transition-colors"
          >
            {showAllTrades ? 'Show Paged View' : 
             displayCount + 50 >= actualTradeCount ? 
               `Show All ${formatTradeCount(actualTradeCount)} Trades` :
               `Load More (+${Math.min(50, actualTradeCount - displayedTradeCount)} trades)`
            }
          </button>
          <div className="text-[9px] text-text-secondary mt-0.5">
            {actualTradeCount - displayedTradeCount} more trades available
          </div>
        </div>
      )}
      
      {/* OPTIMIZED: Clean footer with essential stats */}
      {actualTradeCount > 0 && (
        <div className="mt-1 text-[9px] text-text-secondary border-t border-border pt-1">
          <div className="space-y-1">
            <div className="flex justify-between">
              <div>
                <span className="text-chart-up font-medium">Buy: {formatTradeCount(tradingStats.buyCount)}</span>
                <span className="mx-1 text-text-muted">|</span>
                <span className="text-chart-down font-medium">Sell: {formatTradeCount(tradingStats.sellCount)}</span>
              </div>
              <div className="text-accent font-medium">
                Volume: {formatValue(tradingStats.totalVolume)}
              </div>
            </div>
            
            {tradeVelocity > 0 && (
              <div className="flex justify-between">
                <div className="text-purple-400">
                  ⚡ Velocity: {tradeVelocity.toFixed(2)} trades/sec
                </div>
                <div className="text-blue-400">
                  📊 Avg Size: {formatValue(tradingStats.avgTradeSize)}
                </div>
              </div>
            )}
            
            <div className="text-center">
              <span className="text-yellow-400 font-medium">
                🚀 ULTRA-FAST MODE: {formatTradeCount(actualTradeCount)} total trades processed
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentTrades;