// frontend/src/components/RecentTrades.tsx
import React from 'react';
import { Trade } from '../types';

interface RecentTradesProps {
  trades: Trade[];
}

const RecentTrades: React.FC<RecentTradesProps> = ({ trades }) => {
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
  
  return (
    <div className="bg-white p-4 rounded-lg shadow h-full">
      <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>
      
      <div className="overflow-auto max-h-[400px]">
        <table className="min-w-full">
          <thead>
            <tr className="border-b">
              <th className="py-2 px-1 text-left">Time</th>
              <th className="py-2 px-1 text-left">Trader</th>
              <th className="py-2 px-1 text-center">Type</th>
              <th className="py-2 px-1 text-right">Price</th>
              <th className="py-2 px-1 text-right">Quantity</th>
              <th className="py-2 px-1 text-right">Value</th>
              <th className="py-2 px-1 text-right">Impact</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-4 text-gray-500">No trades yet</td>
              </tr>
            ) : (
              trades.slice(0, 20).map((trade) => (
                <tr 
                  key={trade.id} 
                  className="border-b hover:bg-gray-50 transition-colors"
                >
                  <td className="py-2 px-1 text-xs">{formatTime(trade.timestamp)}</td>
                  <td className="py-2 px-1">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${trade.trader.riskProfile === 'aggressive' ? 'bg-red-500' : trade.trader.riskProfile === 'moderate' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                    {truncateAddress(trade.trader.walletAddress)}
                  </td>
                  <td className={`py-2 px-1 text-center ${trade.action === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                    {trade.action.toUpperCase()}
                  </td>
                  <td className="py-2 px-1 text-right">{formatPrice(trade.price)}</td>
                  <td className="py-2 px-1 text-right">{formatQuantity(trade.quantity)}</td>
                  <td className="py-2 px-1 text-right">{formatValue(trade.value)}</td>
                  <td className="py-2 px-1 text-right text-xs">{formatImpact(trade.impact)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentTrades;