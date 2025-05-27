import React, { useState, useEffect, useMemo } from 'react';
import { Trader, TraderPosition } from '../types';

interface ParticipantsOverviewProps {
  traders: Trader[];
  activePositions: TraderPosition[];
  currentPrice?: number;
  scenarioModifiers?: any[]; // Behavior modifiers from active scenario
}

interface TraderData extends Trader {
  activePosition?: TraderPosition;
  entryPrice?: number;
  liquidationPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  totalBalance?: number;
  positionValue?: number;
  margin?: number;
  marginLevel?: number; // percentage
  isNearLiquidation?: boolean;
  scenarioAffected?: boolean; // Whether trader is affected by current scenario
  behaviorModification?: string; // Description of behavior change
}

const ParticipantsOverview: React.FC<ParticipantsOverviewProps> = ({ 
  traders, 
  activePositions,
  currentPrice = 0,
  scenarioModifiers = []
}) => {
  const [isExpandedView, setIsExpandedView] = useState<boolean>(false);
  
  // Format numbers for display
  const formatUSD = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return '-';
    const isNegative = value < 0;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.abs(value));
    return isNegative ? `-${formatted}` : formatted;
  };
  
  const formatPercentage = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return '-';
    return `${value.toFixed(2)}%`;
  };
  
  // Truncate wallet address for display
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Determine trader type based on characteristics
  const getTraderType = (trader: Trader): 'whale' | 'retail' | 'bot' => {
    // Simple heuristic - could be enhanced with more sophisticated classification
    if (trader.totalVolume > 100000) return 'whale';
    if (trader.riskProfile === 'aggressive' && trader.winRate > 0.7) return 'bot';
    return 'retail';
  };

  // Apply scenario behavior modifiers
  const applyScenarioModifiers = (trader: Trader): { affected: boolean; description: string } => {
    if (!scenarioModifiers || scenarioModifiers.length === 0) {
      return { affected: false, description: '' };
    }

    const traderType = getTraderType(trader);
    const applicableModifier = scenarioModifiers.find(
      mod => mod.traderType === traderType || mod.traderType === 'all'
    );

    if (!applicableModifier) {
      return { affected: false, description: '' };
    }

    const { behaviorChange } = applicableModifier;
    const descriptions: string[] = [];

    if (behaviorChange.aggression) {
      if (behaviorChange.aggression > 0) {
        descriptions.push('↑ More Aggressive');
      } else {
        descriptions.push('↓ Less Aggressive');
      }
    }

    if (behaviorChange.riskTolerance) {
      if (behaviorChange.riskTolerance > 0) {
        descriptions.push('↑ Higher Risk');
      } else {
        descriptions.push('↓ Lower Risk');
      }
    }

    if (behaviorChange.followTrend) {
      if (behaviorChange.followTrend > 0) {
        descriptions.push('↑ More Trend Following');
      } else {
        descriptions.push('↓ Less Trend Following');
      }
    }

    if (behaviorChange.liquidityProviding) {
      if (behaviorChange.liquidityProviding > 0) {
        descriptions.push('↑ More Liquidity Providing');
      } else {
        descriptions.push('↓ Less Liquidity Providing');
      }
    }

    return {
      affected: descriptions.length > 0,
      description: descriptions.join(', ')
    };
  };
  
  // Calculate liquidation price with proper leverage model
  const calculateLiquidationPrice = (position: TraderPosition, trader: Trader) => {
    const leverage = 5; // 5x leverage
    const maintenanceMarginRate = 0.05; // 5% maintenance margin
    const direction = position.quantity > 0 ? 1 : -1; // 1 for long, -1 for short
    
    // For longs: Liquidation = Entry * (1 - 1/leverage + maintenanceMargin)
    // For shorts: Liquidation = Entry * (1 + 1/leverage - maintenanceMargin)
    if (direction > 0) {
      // Long position
      return position.entryPrice * (1 - (1/leverage) + maintenanceMarginRate);
    } else {
      // Short position
      return position.entryPrice * (1 + (1/leverage) - maintenanceMarginRate);
    }
  };
  
  // Calculate real-time unrealized PnL
  const calculateUnrealizedPnL = (position: TraderPosition, currentPrice: number) => {
    if (!currentPrice || currentPrice <= 0) return 0;
    
    const direction = position.quantity > 0 ? 1 : -1;
    const priceChange = currentPrice - position.entryPrice;
    const pnl = direction * priceChange * Math.abs(position.quantity);
    
    return pnl;
  };
  
  // Calculate margin level
  const calculateMarginLevel = (position: TraderPosition, trader: Trader, currentPrice: number) => {
    const unrealizedPnl = calculateUnrealizedPnL(position, currentPrice);
    const positionValue = Math.abs(position.quantity) * currentPrice;
    const equity = (trader.netPnl || 0) + unrealizedPnl;
    const margin = positionValue / 5; // 5x leverage means 20% margin
    
    // Margin level = (Equity / Used Margin) * 100
    return margin > 0 ? (equity / margin) * 100 : 0;
  };
  
  // Enrich traders with real-time calculations and scenario effects
  const enrichedTraders = useMemo(() => {
    return traders.map(trader => {
      const activePosition = activePositions.find(
        pos => pos.trader.walletAddress === trader.walletAddress
      );

      // Apply scenario modifiers
      const scenarioEffect = applyScenarioModifiers(trader);
      
      let enrichedData: TraderData = {
        ...trader,
        realizedPnl: trader.netPnl || 0,
        totalBalance: trader.netPnl || 0,
        scenarioAffected: scenarioEffect.affected,
        behaviorModification: scenarioEffect.description
      };
      
      if (activePosition && currentPrice > 0) {
        const unrealizedPnl = calculateUnrealizedPnL(activePosition, currentPrice);
        const liquidationPrice = calculateLiquidationPrice(activePosition, trader);
        const marginLevel = calculateMarginLevel(activePosition, trader, currentPrice);
        const positionValue = Math.abs(activePosition.quantity) * currentPrice;
        
        // Check if near liquidation (margin level < 110%)
        const isNearLiquidation = marginLevel < 110;
        
        enrichedData = {
          ...enrichedData,
          activePosition,
          entryPrice: activePosition.entryPrice,
          liquidationPrice,
          unrealizedPnl,
          totalBalance: (trader.netPnl || 0) + unrealizedPnl,
          positionValue,
          margin: positionValue / 5, // 5x leverage
          marginLevel,
          isNearLiquidation
        };
      }
      
      return enrichedData;
    });
  }, [traders, activePositions, currentPrice, scenarioModifiers]);
  
  // Sort by total balance
  const sortedTraders = [...enrichedTraders].sort((a, b) => {
    const aBalance = a.totalBalance || 0;
    const bBalance = b.totalBalance || 0;
    return bBalance - aBalance;
  });
  
  // Calculate aggregate statistics with scenario awareness
  const stats = useMemo(() => {
    const totalVolume = traders.reduce((sum, t) => sum + t.totalVolume, 0);
    const avgWinRate = traders.reduce((sum, t) => sum + t.winRate, 0) / (traders.length || 1);
    const totalUnrealizedPnl = enrichedTraders.reduce((sum, t) => sum + (t.unrealizedPnl || 0), 0);
    const totalRealizedPnl = enrichedTraders.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    const tradersAtRisk = enrichedTraders.filter(t => t.isNearLiquidation).length;
    const tradersAffectedByScenario = enrichedTraders.filter(t => t.scenarioAffected).length;
    
    return {
      totalVolume,
      avgWinRate,
      totalUnrealizedPnl,
      totalRealizedPnl,
      tradersAtRisk,
      tradersAffectedByScenario
    };
  }, [traders, enrichedTraders]);
  
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
            {traders.length} traders | {activePositions.length} active
          </span>
          <button 
            onClick={() => setIsExpandedView(!isExpandedView)}
            className="text-accent text-xs hover:text-accent-hover focus:outline-none"
          >
            {isExpandedView ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      
      {/* Main Participants Table */}
      <div className="overflow-y-auto h-[calc(100%-32px)] scrollbar-thin">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-xs border-b border-border">
              <th className="py-1 px-2 text-left text-text-secondary font-medium">#</th>
              <th className="py-1 px-2 text-left text-text-secondary font-medium">Trader</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Size</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Entry</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Liq.</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Margin</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Unreal.</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Real.</th>
              <th className="py-1 px-2 text-right text-text-secondary font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sortedTraders.map((trader, index) => {
              const isActive = !!trader.activePosition;
              const positionSize = isActive ? 
                Math.abs(trader.activePosition!.quantity).toFixed(2) : '-';
              const positionDirection = isActive && trader.activePosition!.quantity > 0 ? 'LONG' : 'SHORT';
              const traderType = getTraderType(trader);
              
              const isTopTrader = index < 3;
              const rankIndicator = isTopTrader ? 
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full mr-1 text-white text-[10px] ${
                  index === 0 ? 'bg-yellow-500' : 
                  index === 1 ? 'bg-gray-400' : 
                  'bg-amber-700'
                }`}>{index + 1}</span> : 
                <span className="text-xs text-text-muted mr-1">{index + 1}</span>;
              
              return (
                <tr 
                  key={trader.walletAddress} 
                  className={`text-xs border-b border-border hover:bg-panel-hover transition-colors ${
                    isTopTrader ? 'bg-panel-hover bg-opacity-25' : ''
                  } ${
                    trader.isNearLiquidation ? 'bg-danger bg-opacity-10' : ''
                  }`}
                >
                  <td className="py-1 px-2 text-center">
                    {rankIndicator}
                  </td>
                  <td className="py-1 px-2">
                    <div className="flex items-center">
                      <span className="text-text-primary">{truncateAddress(trader.walletAddress)}</span>
                      
                      {/* Position direction - only show if active */}
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
                  <td className={`py-1 px-2 text-right font-mono ${
                    trader.liquidationPrice && currentPrice > 0 && trader.activePosition && (
                      (trader.activePosition.quantity > 0 && currentPrice <= trader.liquidationPrice) ||
                      (trader.activePosition.quantity < 0 && currentPrice >= trader.liquidationPrice)
                    ) ? 'text-danger font-bold animate-pulse' : 'text-danger'
                  }`}>
                    {trader.liquidationPrice ? `${trader.liquidationPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className={`py-1 px-2 text-right font-mono text-xs ${
                    trader.marginLevel && trader.marginLevel < 110 ? 'text-danger' : 
                    trader.marginLevel && trader.marginLevel < 150 ? 'text-warning' : 
                    'text-text-secondary'
                  }`}>
                    {trader.marginLevel ? formatPercentage(trader.marginLevel) : '-'}
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
                  <td className={`py-1 px-2 text-right font-mono font-bold ${
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
      
      {/* Enhanced Stats */}
      {isExpandedView && (
        <div className="mt-2 p-2 border border-border rounded bg-panel">
          <div className="grid grid-cols-5 gap-3 text-xs">
            <div>
              <div className="text-text-secondary">Total Volume</div>
              <div className="font-semibold text-text-primary">
                {formatUSD(stats.totalVolume)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">Avg Win Rate</div>
              <div className="font-semibold text-text-primary">
                {formatPercentage(stats.avgWinRate * 100)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">Total Unreal. PnL</div>
              <div className={`font-semibold ${
                stats.totalUnrealizedPnl >= 0 ? 'text-chart-up' : 'text-chart-down'
              }`}>
                {formatUSD(stats.totalUnrealizedPnl)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">Total Real. PnL</div>
              <div className={`font-semibold ${
                stats.totalRealizedPnl >= 0 ? 'text-chart-up' : 'text-chart-down'
              }`}>
                {formatUSD(stats.totalRealizedPnl)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">At Risk</div>
              <div className={`font-semibold ${
                stats.tradersAtRisk > 0 ? 'text-danger' : 'text-text-primary'
              }`}>
                {stats.tradersAtRisk} traders
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipantsOverview;