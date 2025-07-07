// frontend/src/components/mobile/mobile-sections/MobileRecentTrades.tsx - FIXED: Live Count Display
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

interface MobileRecentTradesProps {
  trades: Trade[];
}

const MobileRecentTrades: React.FC<MobileRecentTradesProps> = ({ trades }) => {
  const [displayCount, setDisplayCount] = useState<number>(30);
  const [showAllTrades, setShowAllTrades] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [filterSide, setFilterSide] = useState<'all' | 'buy' | 'sell'>('all');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const lastTradeCountRef = useRef<number>(trades.length);
  
  const actualTradeCount = trades.length;
  
  // Filter trades by side
  const filteredTrades = useMemo(() => {
    if (filterSide === 'all') return trades;
    return trades.filter(trade => trade.action === filterSide);
  }, [trades, filterSide]);
  
  const displayedTradeCount = showAllTrades ? filteredTrades.length : Math.min(displayCount, filteredTrades.length);
  
  // Calculate volume statistics for color intensity
  const volumeStats = useMemo(() => {
    if (filteredTrades.length === 0) return { min: 0, max: 0, avg: 0 };
    
    const values = filteredTrades.map(t => t.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    return { min, max, avg };
  }, [filteredTrades]);
  
  // Calculate color intensity for larger trades
  const getTradeColorIntensity = (trade: Trade) => {
    const { min, max } = volumeStats;
    if (max === min) return 0.5;
    
    const normalized = (trade.value - min) / (max - min);
    return 0.2 + (normalized * 0.8);
  };
  
  // Background color with darker shades for larger trades
  const getTradeBackgroundColor = (trade: Trade) => {
    const intensity = getTradeColorIntensity(trade);
    
    if (trade.action === 'buy') {
      return `rgba(34, 197, 94, ${intensity * 0.15})`;
    } else {
      return `rgba(239, 68, 68, ${intensity * 0.15})`;
    }
  };
  
  // Text color with intensity for larger trades
  const getTradeTextColor = (trade: Trade) => {
    const intensity = getTradeColorIntensity(trade);
    
    if (trade.action === 'buy') {
      const greenValue = Math.floor(150 + (intensity * 105));
      return `rgb(34, ${greenValue}, 94)`;
    } else {
      const redValue = Math.floor(150 + (intensity * 105));
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
  
  // Generate realistic trading times
  const formatTime = (timestamp: number) => {
    const baseTime = new Date(timestamp);
    const tradingHours = 9 + Math.floor(Math.random() * 8);
    const tradingMinutes = Math.floor(Math.random() * 60);
    const tradingSeconds = Math.floor(Math.random() * 60);
    
    return `${tradingHours.toString().padStart(2, '0')}:${tradingMinutes.toString().padStart(2, '0')}:${tradingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Generate market maker for liquidity
  const generateMaker = (trade: Trade): string => {
    if (Math.random() < 0.7) {
      return 'Market';
    } else {
      const traderIds = ['4Be9Cvxq', '7mKpLn2w', '9xQjR8vY', 'MnPkZt5s', 'HgFdS6wE', 'LqWxVb3n'];
      const availableIds = traderIds.filter(id => id !== trade.trader.walletAddress.slice(-8));
      return availableIds[Math.floor(Math.random() * availableIds.length)] || 'Market';
    }
  };
  
  // Generate taker ID from trader
  const getTakerId = (trader: Trader): string => {
    const walletId = trader.walletAddress.slice(-8);
    if (walletId.length >= 8) {
      return walletId;
    } else {
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      return Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }
  };
  
  const formatPrice = (price: number) => `$${price.toFixed(3)}`;
  const formatQuantity = (quantity: number) => quantity.toFixed(0);
  const formatValue = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };
  
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  
  // FIXED: Format trade count with full numbers for live count display
  const formatTradeCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toLocaleString(); // Show full numbers with commas
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
      setDisplayCount(30);
    } else {
      const newCount = displayCount + 30;
      if (newCount >= filteredTrades.length) {
        setShowAllTrades(true);
      } else {
        setDisplayCount(newCount);
      }
    }
  };
  
  // Trading velocity calculation
  const tradeVelocity = useMemo(() => {
    if (trades.length < 2) return 0;
    
    const recentTrades = trades.slice(0, Math.min(50, trades.length));
    if (recentTrades.length < 2) return 0;
    
    const timeSpan = recentTrades[0].timestamp - recentTrades[recentTrades.length - 1].timestamp;
    const timeSpanSeconds = timeSpan / 1000;
    
    if (timeSpanSeconds <= 0) return 0;
    return recentTrades.length / timeSpanSeconds;
  }, [trades]);
  
  // Trading statistics
  const tradingStats = useMemo(() => {
    const buyTrades = filteredTrades.filter(t => t.action === 'buy');
    const sellTrades = filteredTrades.filter(t => t.action === 'sell');
    const totalVolume = filteredTrades.reduce((sum, t) => sum + t.value, 0);
    
    return {
      buyCount: buyTrades.length,
      sellCount: sellTrades.length,
      totalVolume,
      avgTradeSize: filteredTrades.length > 0 ? totalVolume / filteredTrades.length : 0,
      velocity: tradeVelocity
    };
  }, [filteredTrades, tradeVelocity]);

  const renderCompactView = () => (
    <div className="space-y-1">
      {filteredTrades.slice(0, displayedTradeCount).map((trade, index) => {
        const isNewTrade = index < 3;
        const takerId = getTakerId(trade.trader);
        const makerId = generateMaker(trade);
        
        return (
          <div 
            key={trade.id} 
            className="p-2 rounded transition-all duration-300 border border-gray-800"
            style={{
              backgroundColor: getTradeBackgroundColor(trade),
              animation: isNewTrade ? 'slideIn 0.3s ease-out' : undefined
            }}
          >
            <div className="flex items-center justify-between">
              {/* Left: Trade Info */}
              <div className="flex items-center space-x-3">
                {/* Side Badge */}
                <div className={`px-2 py-1 rounded text-xs font-bold ${
                  trade.action === 'buy' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}>
                  {trade.action.toUpperCase()}
                </div>
                
                {/* Price & Quantity */}
                <div className="flex flex-col">
                  <div className="text-white font-mono text-sm">
                    {formatPrice(trade.price)}
                  </div>
                  <div className="text-gray-400 text-xs">
                    {formatQuantity(trade.quantity)}
                  </div>
                </div>
              </div>
              
              {/* Right: Value & Time */}
              <div className="flex flex-col items-end">
                <div className="text-white font-medium text-sm">
                  {formatValue(trade.value)}
                </div>
                <div className="text-gray-400 text-xs font-mono">
                  {formatTime(trade.timestamp)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderDetailedView = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-800 sticky top-0 z-10">
          <tr className="border-b border-gray-700">
            <th className="py-2 px-2 text-left text-gray-400">Time</th>
            <th className="py-2 px-2 text-right text-gray-400">Price</th>
            <th className="py-2 px-2 text-right text-gray-400">Qty</th>
            <th className="py-2 px-2 text-center text-gray-400">Side</th>
            <th className="py-2 px-2 text-center text-gray-400">Taker</th>
            <th className="py-2 px-2 text-center text-gray-400">Maker</th>
          </tr>
        </thead>
        <tbody>
          {filteredTrades.slice(0, displayedTradeCount).map((trade, index) => {
            const isNewTrade = index < 3;
            const takerId = getTakerId(trade.trader);
            const makerId = generateMaker(trade);
            
            return (
              <tr 
                key={trade.id} 
                className="border-b border-gray-800 transition-all duration-300"
                style={{
                  backgroundColor: getTradeBackgroundColor(trade),
                  animation: isNewTrade ? 'slideIn 0.3s ease-out' : undefined
                }}
              >
                <td className="py-2 px-2 text-gray-400 font-mono">
                  {formatTime(trade.timestamp)}
                </td>
                
                <td className="py-2 px-2 text-right text-white font-mono">
                  {formatPrice(trade.price)}
                </td>
                
                <td className="py-2 px-2 text-right text-white font-mono">
                  {formatQuantity(trade.quantity)}
                </td>
                
                <td className="py-2 px-2 text-center font-bold"
                    style={{ color: getTradeTextColor(trade) }}>
                  {trade.action.toUpperCase()}
                </td>
                
                <td className="py-2 px-2 text-center text-white font-mono">
                  {takerId}
                </td>
                
                <td className="py-2 px-2 text-center text-gray-400 font-mono">
                  {makerId}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* FIXED: Mobile Header with LIVE COUNT display */}
      <div className="p-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-medium">
            Recent Trades
          </h3>
          
          {/* FIXED: Live count display - ONLY here, not in tabs */}
          <div className="flex items-center space-x-2">
            <div className="bg-green-900 bg-opacity-50 px-2 py-1 rounded">
              <div className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-bold text-sm">
                  {formatTradeCount(actualTradeCount)}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-xs px-2 py-1 rounded ${
                autoScroll 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              {autoScroll ? 'Auto' : 'Manual'}
            </button>
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between space-x-2">
          {/* View Mode Toggle */}
          <div className="flex space-x-1">
            <button
              onClick={() => setViewMode('compact')}
              className={`px-2 py-1 text-xs rounded transition ${
                viewMode === 'compact'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Compact
            </button>
            <button
              onClick={() => setViewMode('detailed')}
              className={`px-2 py-1 text-xs rounded transition ${
                viewMode === 'detailed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Detailed
            </button>
          </div>

          {/* Filter Controls */}
          <div className="flex space-x-1">
            {['all', 'buy', 'sell'].map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterSide(filter as any)}
                className={`px-2 py-1 text-xs rounded transition ${
                  filterSide === filter
                    ? filter === 'buy' ? 'bg-green-600 text-white' :
                      filter === 'sell' ? 'bg-red-600 text-white' :
                      'bg-gray-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Activity indicator */}
        {actualTradeCount > 0 && (
          <div className="mt-2">
            <div className="h-1 bg-gray-700 rounded overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-1000 animate-pulse"
                style={{
                  width: `${Math.min(100, (actualTradeCount / 1000) * 100)}%`
                }}
              />
            </div>
            
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <div>
                <span className="text-green-400 font-semibold">{formatTradeCount(actualTradeCount)}</span> total
                {tradeVelocity > 0 && (
                  <span className="ml-2">
                    <span className="text-blue-400">{tradeVelocity.toFixed(1)}/sec</span>
                  </span>
                )}
              </div>
              <div>
                Showing: <span className="text-white font-medium">{displayedTradeCount}</span>
                {displayedTradeCount < filteredTrades.length && (
                  <span className="text-yellow-400 ml-1">
                    (+{filteredTrades.length - displayedTradeCount} more)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trades Content */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3"
        style={{ 
          scrollbarWidth: 'thin'
        }}
      >
        <style dangerouslySetInnerHTML={{
          __html: `
            .overflow-y-auto::-webkit-scrollbar {
              width: 4px;
            }
            .overflow-y-auto::-webkit-scrollbar-track {
              background: #374151;
            }
            .overflow-y-auto::-webkit-scrollbar-thumb {
              background: #6B7280;
              border-radius: 2px;
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
        
        {actualTradeCount === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">⚡</div>
              <p className="text-sm">Waiting for ultra-fast trades...</p>
              <p className="text-xs text-gray-500 mt-1">Live trading data will appear here</p>
            </div>
          </div>
        ) : (
          <>
            {viewMode === 'compact' ? renderCompactView() : renderDetailedView()}
          </>
        )}
      </div>

      {/* Load More */}
      {displayedTradeCount < filteredTrades.length && (
        <div className="p-3 border-t border-gray-700 bg-gray-800">
          <button 
            onClick={loadMore}
            className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
          >
            {showAllTrades ? 'Show Less' : 
             displayCount + 30 >= filteredTrades.length ? 
               `Show All ${formatTradeCount(filteredTrades.length)} Trades` :
               `Load More (+${Math.min(30, filteredTrades.length - displayedTradeCount)} trades)`
            }
          </button>
        </div>
      )}

      {/* Stats Footer */}
      {actualTradeCount > 0 && (
        <div className="p-3 border-t border-gray-700 bg-gray-800">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-gray-400">Buy/Sell</div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400 font-medium">
                  {formatTradeCount(tradingStats.buyCount)} Buy
                </span>
                <span className="text-gray-500">|</span>
                <span className="text-red-400 font-medium">
                  {formatTradeCount(tradingStats.sellCount)} Sell
                </span>
              </div>
            </div>
            
            <div>
              <div className="text-gray-400">Volume</div>
              <div className="text-blue-400 font-medium">
                {formatValue(tradingStats.totalVolume)}
              </div>
            </div>
          </div>
          
          {tradeVelocity > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="flex justify-between text-xs">
                <div className="text-purple-400">
                  ⚡ Velocity: {tradeVelocity.toFixed(2)} trades/sec
                </div>
                <div className="text-yellow-400">
                  📊 Avg Size: {formatValue(tradingStats.avgTradeSize)}
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-2 text-center text-xs text-gray-500">
            🚀 Live count: {formatTradeCount(actualTradeCount)} trades processed
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileRecentTrades;