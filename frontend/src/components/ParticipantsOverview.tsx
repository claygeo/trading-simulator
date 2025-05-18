// frontend/src/components/ParticipantsOverview.tsx
import React, { useEffect } from 'react';
import { Trader, TraderPosition } from '../types';

interface ParticipantsOverviewProps {
  traders: Trader[];
  activePositions: TraderPosition[];
}

const ParticipantsOverview: React.FC<ParticipantsOverviewProps> = ({ traders, activePositions }) => {
  // Add logging to debug the component data
  useEffect(() => {
    console.log(`Traders in ParticipantsOverview: ${traders.length}`);
    if (traders.length > 0) {
      console.log('First trader:', traders[0]);
    }
  }, [traders]);
  
  // Format numbers for display
  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  
  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };
  
  // Truncate wallet address for display
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  
  // Get trader position if active
  const getTraderPosition = (walletAddress: string) => {
    return activePositions.find(pos => pos.trader.walletAddress === walletAddress);
  };
  
  // If no traders, show a placeholder
  if (traders.length === 0) {
    return (
      <div className="bg-surface p-4 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-text-primary">Participants Overview</h2>
          <span className="text-text-secondary text-sm">
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
    <div className="bg-surface p-4 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-text-primary">Participants Overview</h2>
        <span className="text-text-secondary text-sm">
          {traders.length} traders competing
        </span>
      </div>
      
      <div className="overflow-x-auto pb-2">
        <div className="flex space-x-4 pb-2 min-w-full">
          {traders.slice(0, 10).map((trader, index) => {
            const position = getTraderPosition(trader.walletAddress);
            const isActive = !!position;
            
            return (
              <div 
                key={trader.walletAddress} 
                className={`flex-shrink-0 w-64 p-4 rounded-lg ${
                  isActive 
                    ? 'border-2 border-accent bg-panel' 
                    : 'border border-border bg-panel'
                }`}
              >
                <div className="flex items-center mb-3">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs font-semibold ${
                    index < 3 
                      ? 'bg-accent text-white' 
                      : 'bg-panel text-text-secondary border border-border'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="font-semibold truncate text-text-primary">
                    {truncateAddress(trader.walletAddress)}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <div className="text-text-secondary">Net PnL</div>
                    <div className={`font-semibold font-mono ${trader.netPnl >= 0 ? 'text-chart-up' : 'text-chart-down'}`}>
                      {formatUSD(trader.netPnl)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-text-secondary">Win Rate</div>
                    <div className="font-semibold font-mono text-text-primary">
                      {formatPercentage(trader.winRate)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-text-secondary">Volume</div>
                    <div className="font-semibold font-mono text-text-primary">
                      {formatUSD(trader.totalVolume)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-text-secondary">Trades</div>
                    <div className="font-semibold font-mono text-text-primary">
                      {trader.tradeCount}
                    </div>
                  </div>
                </div>
                
                <div className="mb-3">
                  <div className="text-text-secondary text-sm">Risk Profile</div>
                  <div className="flex mt-1 h-2 rounded overflow-hidden bg-panel">
                    <div 
                      className={`${
                        trader.riskProfile === 'aggressive' ? 'bg-danger' : 
                        trader.riskProfile === 'moderate' ? 'bg-warning' : 
                        'bg-success'
                      }`}
                      style={{ width: `${
                        trader.riskProfile === 'aggressive' ? '100%' : 
                        trader.riskProfile === 'moderate' ? '66%' : 
                        '33%'
                      }` }}
                    ></div>
                  </div>
                  <div className="text-right text-xs mt-1 capitalize text-text-secondary">
                    {trader.riskProfile}
                  </div>
                </div>
                
                {/* Show simulation PnL if available */}
                {trader.simulationPnl !== undefined && (
                  <div className="mb-3">
                    <div className="flex justify-between">
                      <span className="text-text-secondary text-sm">Simulation P&L:</span>
                      <span className={`font-mono font-semibold ${
                        (trader.simulationPnl || 0) >= 0 ? 'text-chart-up' : 'text-chart-down'
                      }`}>
                        {formatUSD(trader.simulationPnl || 0)}
                      </span>
                    </div>
                  </div>
                )}
                
                {isActive && position && (
                  <div className="p-2 bg-accent bg-opacity-10 rounded text-sm border border-accent border-opacity-30">
                    <div className="font-semibold mb-1 text-accent">Active Position</div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Entry:</span>
                      <span className="text-text-primary font-mono">${position.entryPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Current P&L:</span>
                      <span className={`font-mono ${position.currentPnl >= 0 ? 'text-chart-up' : 'text-chart-down'}`}>
                        {formatPercentage(position.currentPnlPercentage)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Show a note if there are more traders */}
      {traders.length > 10 && (
        <div className="mt-2 text-center text-text-secondary text-sm">
          Showing top 10 of {traders.length} traders
        </div>
      )}
      
      {/* Summary statistics */}
      <div className="mt-4 p-3 border border-border rounded bg-panel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-text-secondary text-sm">Total Traders</div>
            <div className="font-semibold text-text-primary">{traders.length}</div>
          </div>
          <div>
            <div className="text-text-secondary text-sm">Active Positions</div>
            <div className="font-semibold text-text-primary">{activePositions.length}</div>
          </div>
          <div>
            <div className="text-text-secondary text-sm">Avg. Win Rate</div>
            <div className="font-semibold text-text-primary">
              {formatPercentage(traders.reduce((sum, t) => sum + t.winRate, 0) / traders.length)}
            </div>
          </div>
          <div>
            <div className="text-text-secondary text-sm">Total Volume</div>
            <div className="font-semibold text-text-primary">
              {formatUSD(traders.reduce((sum, t) => sum + t.totalVolume, 0))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParticipantsOverview;