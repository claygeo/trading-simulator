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
    <div className="bg-surface p-4 rounded-lg shadow-lg h-full">
      <h2 className="text-xl font-semibold mb-4 text-text-primary">Recent Trades</h2>
      
      <div className="overflow-auto max-h-[400px] scrollbar-thin scrollbar-thumb-border scrollbar-track-panel">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 px-1 text-left text-text-secondary text-sm">Time</th>
              <th className="py-2 px-1 text-left text-text-secondary text-sm">Trader</th>
              <th className="py-2 px-1 text-center text-text-secondary text-sm">Type</th>
              <th className="py-2 px-1 text-right text-text-secondary text-sm">Price</th>
              <th className="py-2 px-1 text-right text-text-secondary text-sm">Quantity</th>
              <th className="py-2 px-1 text-right text-text-secondary text-sm">Value</th>
              <th className="py-2 px-1 text-right text-text-secondary text-sm">Impact</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-4 text-text-muted">No trades yet</td>
              </tr>
            ) : (
              trades.slice(0, 20).map((trade) => (
                <tr 
                  key={trade.id} 
                  className={`border-b border-border hover:bg-panel transition-colors ${
                    trade.action === 'buy' ? 'animate-flash-green' : 'animate-flash-red'
                  }`}
                >
                  <td className="py-2 px-1 text-xs text-text-muted font-mono">{formatTime(trade.timestamp)}</td>
                  <td className="py-2 px-1 text-text-primary">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                      trade.trader.riskProfile === 'aggressive' ? 'bg-danger' : 
                      trade.trader.riskProfile === 'moderate' ? 'bg-warning' : 
                      'bg-success'
                    }`}></span>
                    {truncateAddress(trade.trader.walletAddress)}
                  </td>
                  <td className={`py-2 px-1 text-center ${
                    trade.action === 'buy' ? 'text-chart-up' : 'text-chart-down'
                  } font-semibold`}>
                    {trade.action.toUpperCase()}
                  </td>
                  <td className="py-2 px-1 text-right text-text-primary font-mono">{formatPrice(trade.price)}</td>
                  <td className="py-2 px-1 text-right text-text-primary font-mono">{formatQuantity(trade.quantity)}</td>
                  <td className="py-2 px-1 text-right text-text-primary font-mono">{formatValue(trade.value)}</td>
                  <td className="py-2 px-1 text-right text-xs text-text-muted font-mono">{formatImpact(trade.impact)}</td>
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