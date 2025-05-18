// frontend/src/components/ParticipantsOverview.tsx
import React from 'react';
import { Trader, TraderPosition } from '../types';

interface ParticipantsOverviewProps {
  traders: Trader[];
  activePositions: TraderPosition[];
}

const ParticipantsOverview: React.FC<ParticipantsOverviewProps> = ({ traders, activePositions }) => {
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
  
  // Check if trader has an active position
  const hasActivePosition = (walletAddress: string) => {
    return activePositions.some(pos => pos.trader.walletAddress === walletAddress);
  };
  
  // Get trader position if active
  const getTraderPosition = (walletAddress: string) => {
    return activePositions.find(pos => pos.trader.walletAddress === walletAddress);
  };
  
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Participants Overview</h2>
      
      <div className="overflow-x-auto">
        <div className="flex space-x-4 pb-2 overflow-x-auto">
          {traders.slice(0, 10).map((trader, index) => {
            const position = getTraderPosition(trader.walletAddress);
            const isActive = !!position;
            
            return (
              <div 
                key={trader.walletAddress} 
                className={`flex-shrink-0 w-64 p-4 rounded-lg border ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
              >
                <div className="flex items-center mb-3">
                  <div className="bg-gray-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mr-2">
                    {index + 1}
                  </div>
                  <div className="font-semibold truncate">
                    {truncateAddress(trader.walletAddress)}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <div className="text-gray-500">Net PnL</div>
                    <div className={`font-semibold ${trader.netPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatUSD(trader.netPnl)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-gray-500">Win Rate</div>
                    <div className="font-semibold">
                      {formatPercentage(trader.winRate)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-gray-500">Volume</div>
                    <div className="font-semibold">
                      {formatUSD(trader.totalVolume)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-gray-500">Trades</div>
                    <div className="font-semibold">
                      {trader.tradeCount}
                    </div>
                  </div>
                </div>
                
                <div className="mb-3">
                  <div className="text-gray-500 text-sm">Risk Profile</div>
                  <div className="flex mt-1 h-2 rounded overflow-hidden bg-gray-200">
                    <div 
                      className={`${
                        trader.riskProfile === 'aggressive' ? 'bg-red-500' : 
                        trader.riskProfile === 'moderate' ? 'bg-yellow-500' : 
                        'bg-green-500'
                      }`}
                      style={{ width: `${
                        trader.riskProfile === 'aggressive' ? '100%' : 
                        trader.riskProfile === 'moderate' ? '66%' : 
                        '33%'
                      }` }}
                    ></div>
                  </div>
                  <div className="text-right text-xs mt-1 capitalize">
                    {trader.riskProfile}
                  </div>
                </div>
                
                {isActive && position && (
                  <div className="p-2 bg-blue-100 rounded text-sm">
                    <div className="font-semibold mb-1">Active Position</div>
                    <div className="flex justify-between">
                      <span>Entry:</span>
                      <span>${position.entryPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current P&L:</span>
                      <span className={position.currentPnl >= 0 ? 'text-green-500' : 'text-red-500'}>
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
    </div>
  );
};

export default ParticipantsOverview;