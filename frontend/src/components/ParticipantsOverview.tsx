// frontend/src/components/ParticipantsOverview.tsx - Without Leaderboard
import React, { useState, useEffect } from 'react';
import { Trader, TraderPosition } from '../types';

interface ParticipantsOverviewProps {
  traders: Trader[];
  activePositions: TraderPosition[];
}

interface TraderData extends Trader {
  activePosition?: TraderPosition;
  // Additional calculated fields for display
  entryPrice?: number;
  liquidationPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  totalBalance?: number;
}

const ParticipantsOverview: React.FC<ParticipantsOverviewProps> = ({ traders, activePositions }) => {
  const [isExpandedView, setIsExpandedView] = useState<boolean>(false);
  const [enrichedTraders, setEnrichedTraders] = useState<TraderData[]>([]);
  
  // Format numbers for display
  const formatUSD = (value: number | undefined) => {
    if (value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  
  const formatPercentage = (value: number | undefined) => {
    if (value === undefined) return '-';
    return `${(value * 100).toFixed(2)}%`;
  };
  
  // Truncate wallet address for display
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  
  // Calculate liquidation price (simplified model)
  const calculateLiquidationPrice = (position: TraderPosition) => {
    // A simple model - in a real application, this would be more complex
    // Assuming a 5x leverage and 20% maintenance margin
    const direction = position.quantity > 0 ? 1 : -1;
    const leverageMultiplier = 5;
    const maintenanceMargin = 0.2;
    
    // Simplified formula: entry price * (1 ± (1/leverage) * (1 - maintenance margin))
    // + for shorts, - for longs
    return position.entryPrice * (1 - direction * (1/leverageMultiplier) * (1 - maintenanceMargin));
  };
  
  // Enrich traders with additional data
  useEffect(() => {
    const enriched = traders.map(trader => {
      const activePosition = activePositions.find(pos => pos.trader.walletAddress === trader.walletAddress);
      
      let entryPrice, liquidationPrice, unrealizedPnl, realizedPnl, totalBalance;
      
      if (activePosition) {
        entryPrice = activePosition.entryPrice;
        liquidationPrice = calculateLiquidationPrice(activePosition);
        unrealizedPnl = activePosition.currentPnl;
        realizedPnl = trader.netPnl;
        totalBalance = (trader.netPnl || 0) + (activePosition.currentPnl || 0);
      } else {
        realizedPnl = trader.netPnl;
        totalBalance = trader.netPnl;
      }
      
      return {
        ...trader,
        activePosition,
        entryPrice,
        liquidationPrice,
        unrealizedPnl,
        realizedPnl,
        totalBalance
      };
    });
    
    setEnrichedTraders(enriched);
  }, [traders, activePositions]);
  
  // Sort the traders by total balance
  const sortedTraders = [...enrichedTraders].sort((a, b) => {
    const aBalance = a.totalBalance || 0;
    const bBalance = b.totalBalance || 0;
    return bBalance - aBalance;
  });
  
  if (traders.length === 0) {
    return (
      <div className="bg-surface p-3 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-text-primary">Participants</h2>
          <span className="text-text-secondary text-xs">
            Waiting for trader data...
          </span>
        </div>
        
        <div className="flex items-center justify-center h-32 text-text-muted">
          <p>No traders available yet. Please wait for data to load.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-surface p-3 rounded-lg shadow-lg h-full overflow-hidden">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-base font-semibold text-text-primary">Participants</h2>
        <div className="flex items-center">
          <span className="text-text-secondary text-xs mr-2">
            {traders.length} traders
          </span>
          <button 
            onClick={() => setIsExpandedView(!isExpandedView)}
            className="text-accent text-xs hover:text-accent-hover focus:outline-none"
          >
            {isExpandedView ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      
      {/* Main Participants Table - taking full height now */}
      <div className="overflow-y-auto h-[calc(100%-32px)] scrollbar-thin">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-xs border-b border-border">
              <th className="py-1 px-2 text-left text-text-secondary font-medium">#</th>
              <th className="py-1 px-2 text-left text-text-secondary font-medium">Trader</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Size</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Entry</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Liquidation</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Unrealized</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Realized</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {sortedTraders.map((trader, index) => {
              const isActive = !!trader.activePosition;
              const positionSize = isActive ? 
                Math.abs(trader.activePosition!.quantity).toFixed(2) : '-';
              const positionDirection = isActive && trader.activePosition!.quantity > 0 ? 'LONG' : 'SHORT';
              
              // Highlight the top 3 traders
              const isTopTrader = index < 3;
              const rankIndicator = isTopTrader ? 
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full mr-1 text-white text-[10px] ${
                  index === 0 ? 'bg-yellow-500' : 
                  index === 1 ? 'bg-gray-300' : 
                  'bg-amber-700'
                }`}>{index + 1}</span> : 
                <span className="text-xs text-text-muted mr-1">{index + 1}</span>;
              
              return (
                <tr key={trader.walletAddress} className={`text-xs border-b border-border hover:bg-panel-hover ${isTopTrader ? 'bg-panel-hover bg-opacity-25' : ''}`}>
                  <td className="py-1 px-2 text-center">
                    {rankIndicator}
                  </td>
                  <td className="py-1 px-2">
                    <div className="flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                        trader.riskProfile === 'aggressive' ? 'bg-danger' : 
                        trader.riskProfile === 'moderate' ? 'bg-warning' : 
                        'bg-success'
                      }`}></span>
                      <span className="text-text-primary">{truncateAddress(trader.walletAddress)}</span>
                      {isActive && (
                        <span className={`ml-1 text-[9px] px-1 rounded ${
                          positionDirection === 'LONG' ? 'bg-chart-up text-white' : 'bg-chart-down text-white'
                        }`}>
                          {positionDirection}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1 px-2 text-right font-mono">
                    {positionSize}
                  </td>
                  <td className="py-1 px-2 text-right font-mono">
                    {trader.entryPrice ? `$${trader.entryPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className="py-1 px-2 text-right font-mono text-danger">
                    {trader.liquidationPrice ? `$${trader.liquidationPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className={`py-1 px-2 text-right font-mono ${
                    (trader.unrealizedPnl || 0) >= 0 ? 'text-chart-up' : 'text-chart-down'
                  }`}>
                    {formatUSD(trader.unrealizedPnl)}
                  </td>
                  <td className={`py-1 px-2 text-right font-mono ${
                    (trader.realizedPnl || 0) >= 0 ? 'text-chart-up' : 'text-chart-down'
                  }`}>
                    {formatUSD(trader.realizedPnl)}
                  </td>
                  <td className={`py-1 px-2 text-right font-mono ${
                    (trader.totalBalance || 0) >= 0 ? 'text-chart-up' : 'text-chart-down'
                  }`}>
                    {formatUSD(trader.totalBalance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {isExpandedView && (
        <div className="mt-2 p-2 border border-border rounded bg-panel">
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-text-secondary">Total Traders</div>
              <div className="font-semibold text-text-primary">{traders.length}</div>
            </div>
            <div>
              <div className="text-text-secondary">Active Positions</div>
              <div className="font-semibold text-text-primary">{activePositions.length}</div>
            </div>
            <div>
              <div className="text-text-secondary">Avg. Win Rate</div>
              <div className="font-semibold text-text-primary">
                {formatPercentage(traders.reduce((sum, t) => sum + t.winRate, 0) / traders.length)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">Total Volume</div>
              <div className="font-semibold text-text-primary">
                {formatUSD(traders.reduce((sum, t) => sum + t.totalVolume, 0))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipantsOverview;