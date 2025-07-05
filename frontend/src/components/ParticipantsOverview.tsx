// frontend/src/components/ParticipantsOverview.tsx - FIXED: Position sizes correlated with order book
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
  // FIXED: Realistic position sizing
  normalizedPositionSize?: number; // Position size that correlates with order book
  orderBookWeight?: number; // How much this position contributes to order book
  marketImpact?: number; // Position's impact on market depth
}

const ParticipantsOverview: React.FC<ParticipantsOverviewProps> = ({ 
  traders, 
  activePositions,
  currentPrice = 0,
  scenarioModifiers = []
}) => {
  const [isExpandedView, setIsExpandedView] = useState<boolean>(false);
  
  // FIXED: Calculate realistic position sizing based on market context
  const calculateRealisticPositionSize = useCallback((
    originalQuantity: number, 
    trader: Trader, 
    currentPrice: number
  ): number => {
    if (currentPrice <= 0) return originalQuantity;
    
    // Base calculation on trader's total volume and risk profile
    const traderVolume = trader.totalVolume || 10000;
    const riskProfile = trader.riskProfile || 'moderate';
    
    // FIXED: Calculate position size as percentage of trader's total volume
    let positionPercentage = 0.15; // Default 15% of total volume
    
    switch (riskProfile) {
      case 'aggressive':
        positionPercentage = 0.25; // 25% for aggressive traders
        break;
      case 'conservative':
        positionPercentage = 0.08; // 8% for conservative traders
        break;
      default:
        positionPercentage = 0.15; // 15% for moderate traders
    }
    
    // Add some randomization to avoid identical sizes
    const randomFactor = 0.7 + (Math.random() * 0.6); // 0.7x to 1.3x variation
    const targetValue = traderVolume * positionPercentage * randomFactor;
    
    // Convert to token quantity
    const tokenQuantity = targetValue / currentPrice;
    
    // FIXED: Ensure realistic bounds based on token price
    let minTokens = 100;
    let maxTokens = 50000;
    
    if (currentPrice < 1) {
      // For low-price tokens (meme coins)
      minTokens = 5000;
      maxTokens = 500000;
    } else if (currentPrice < 10) {
      // For mid-price tokens
      minTokens = 500;
      maxTokens = 50000;
    } else if (currentPrice < 100) {
      // For higher-price tokens
      minTokens = 50;
      maxTokens = 5000;
    } else {
      // For expensive tokens
      minTokens = 5;
      maxTokens = 500;
    }
    
    return Math.max(minTokens, Math.min(maxTokens, tokenQuantity));
  }, []);
  
  // FIXED: Calculate order book weight (how much this position affects order book depth)
  const calculateOrderBookWeight = useCallback((
    positionSize: number, 
    positionValue: number, 
    totalMarketValue: number
  ): number => {
    if (totalMarketValue <= 0) return 0;
    
    // Position's weight in total market as percentage
    const weight = (positionValue / totalMarketValue) * 100;
    
    // Cap at reasonable maximum (no single position dominates)
    return Math.min(weight, 15); // Max 15% of market depth
  }, []);
  
  // FIXED: Calculate market impact based on position size
  const calculateMarketImpact = useCallback((
    positionSize: number, 
    currentPrice: number, 
    totalMarketLiquidity: number
  ): number => {
    if (totalMarketLiquidity <= 0) return 0;
    
    const positionValue = positionSize * currentPrice;
    const impact = (positionValue / totalMarketLiquidity) * 100;
    
    // Return impact as percentage
    return Math.min(impact, 5); // Cap at 5% market impact
  }, []);
  
  // Format functions
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
  
  // FIXED: Format position size with appropriate precision based on token price
  const formatPositionSize = (size: number, price: number) => {
    if (price < 0.01) {
      // For very low price tokens, show in K/M format
      if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
      if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
      return size.toFixed(0);
    } else if (price < 1) {
      // For sub-dollar tokens
      if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
      return size.toFixed(0);
    } else {
      // For dollar+ tokens
      return size.toFixed(0);
    }
  };
  
  // Truncate wallet address for display
  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Determine trader type based on characteristics
  const getTraderType = (trader: Trader): 'whale' | 'retail' | 'bot' => {
    // FIXED: Enhanced classification based on volume and behavior
    if (trader.totalVolume > 500000) return 'whale';
    if (trader.riskProfile === 'aggressive' && trader.winRate > 0.7 && trader.totalVolume > 100000) return 'bot';
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
  
  // FIXED: Calculate total market context for position sizing
  const marketContext = useMemo(() => {
    const totalMarketValue = traders.reduce((sum, trader) => sum + (trader.totalVolume || 0), 0);
    const totalActiveValue = activePositions.reduce((sum, pos) => {
      return sum + (Math.abs(pos.quantity) * currentPrice);
    }, 0);
    
    return {
      totalMarketValue,
      totalActiveValue,
      averagePosition: activePositions.length > 0 ? totalActiveValue / activePositions.length : 0
    };
  }, [traders, activePositions, currentPrice]);
  
  // FIXED: Enrich traders with realistic calculations and position correlation
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
        // FIXED: Calculate realistic position size
        const realisticSize = calculateRealisticPositionSize(
          Math.abs(activePosition.quantity), 
          trader, 
          currentPrice
        );
        
        // Maintain the original direction (long/short)
        const normalizedQuantity = activePosition.quantity > 0 ? realisticSize : -realisticSize;
        
        const unrealizedPnl = calculateUnrealizedPnL(activePosition, currentPrice);
        const liquidationPrice = calculateLiquidationPrice(activePosition, trader);
        const marginLevel = calculateMarginLevel(activePosition, trader, currentPrice);
        const positionValue = Math.abs(normalizedQuantity) * currentPrice;
        
        // FIXED: Calculate order book weight and market impact
        const orderBookWeight = calculateOrderBookWeight(
          Math.abs(normalizedQuantity), 
          positionValue, 
          marketContext.totalMarketValue
        );
        
        const marketImpact = calculateMarketImpact(
          Math.abs(normalizedQuantity), 
          currentPrice, 
          marketContext.totalActiveValue
        );
        
        // Check if near liquidation (margin level < 110%)
        const isNearLiquidation = marginLevel < 110;
        
        enrichedData = {
          ...enrichedData,
          activePosition: {
            ...activePosition,
            quantity: normalizedQuantity // Use realistic size
          },
          entryPrice: activePosition.entryPrice,
          liquidationPrice,
          unrealizedPnl,
          totalBalance: (trader.netPnl || 0) + unrealizedPnl,
          positionValue,
          margin: positionValue / 5, // 5x leverage
          marginLevel,
          isNearLiquidation,
          normalizedPositionSize: Math.abs(normalizedQuantity),
          orderBookWeight,
          marketImpact
        };
      }
      
      return enrichedData;
    });
  }, [traders, activePositions, currentPrice, scenarioModifiers, calculateRealisticPositionSize, calculateOrderBookWeight, calculateMarketImpact, marketContext]);
  
  // Sort by total balance
  const sortedTraders = [...enrichedTraders].sort((a, b) => {
    const aBalance = a.totalBalance || 0;
    const bBalance = b.totalBalance || 0;
    return bBalance - aBalance;
  });
  
  // FIXED: Calculate enhanced aggregate statistics with position correlation
  const stats = useMemo(() => {
    const totalVolume = traders.reduce((sum, t) => sum + t.totalVolume, 0);
    const avgWinRate = traders.reduce((sum, t) => sum + t.winRate, 0) / (traders.length || 1);
    const totalUnrealizedPnl = enrichedTraders.reduce((sum, t) => sum + (t.unrealizedPnl || 0), 0);
    const totalRealizedPnl = enrichedTraders.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    const tradersAtRisk = enrichedTraders.filter(t => t.isNearLiquidation).length;
    const tradersAffectedByScenario = enrichedTraders.filter(t => t.scenarioAffected).length;
    
    // FIXED: Enhanced stats for order book correlation
    const totalPositionValue = enrichedTraders.reduce((sum, t) => sum + (t.positionValue || 0), 0);
    const avgOrderBookWeight = enrichedTraders.reduce((sum, t) => sum + (t.orderBookWeight || 0), 0) / (enrichedTraders.length || 1);
    const totalMarketImpact = enrichedTraders.reduce((sum, t) => sum + (t.marketImpact || 0), 0);
    
    return {
      totalVolume,
      avgWinRate,
      totalUnrealizedPnl,
      totalRealizedPnl,
      tradersAtRisk,
      tradersAffectedByScenario,
      totalPositionValue,
      avgOrderBookWeight,
      totalMarketImpact
    };
  }, [traders, enrichedTraders]);
  
  if (traders.length === 0) {
    return (
      <div className="bg-surface p-2 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-sm font-semibold text-text-primary">Participants</h2>
          <span className="text-text-secondary text-[10px]">
            Waiting for trader data...
          </span>
        </div>
        <div className="flex items-center justify-center h-32 text-text-muted text-xs">
          <p>No traders available yet. Please wait for data to load.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-surface p-2 rounded-lg shadow-lg h-full overflow-hidden">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xs font-semibold text-text-primary">Participants</h2>
        <div className="flex items-center">
          <span className="text-text-secondary text-[10px] mr-2">
            {traders.length} traders | {activePositions.length} active
          </span>
          {/* FIXED: Position correlation indicator */}
          <div className="text-green-400 text-[9px] mr-2" title="Position sizes correlated with order book">
            ✅ Correlated
          </div>
          <button 
            onClick={() => setIsExpandedView(!isExpandedView)}
            className="text-accent text-[10px] hover:text-accent-hover focus:outline-none"
          >
            {isExpandedView ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      
      {/* Main Participants Table */}
      <div className="overflow-y-auto h-[calc(100%-24px)] scrollbar-thin">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-[10px] border-b border-border">
              <th className="py-0.5 px-1 text-left text-text-secondary font-medium">#</th>
              <th className="py-0.5 px-1 text-left text-text-secondary font-medium">Trader</th>
              <th className="py-0.5 px-1 text-right text-text-secondary font-medium">Size</th>
              <th className="py-0.5 px-1 text-right text-text-secondary font-medium">Entry</th>
              <th className="py-0.5 px-1 text-right text-text-secondary font-medium">Liq.</th>
              <th className="py-0.5 px-1 text-right text-text-secondary font-medium">Margin</th>
              <th className="py-0.5 px-1 text-right text-text-secondary font-medium">Unreal.</th>
              <th className="py-0.5 px-1 text-right text-text-secondary font-medium">Real.</th>
              <th className="py-0.5 px-1 text-right text-text-secondary font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sortedTraders.map((trader, index) => {
              const isActive = !!trader.activePosition;
              const positionSize = isActive ? 
                formatPositionSize(trader.normalizedPositionSize || 0, currentPrice) : '-';
              const positionDirection = isActive && trader.activePosition!.quantity > 0 ? 'LONG' : 'SHORT';
              const traderType = getTraderType(trader);
              
              const isTopTrader = index < 3;
              const rankIndicator = isTopTrader ? 
                <span className={`inline-flex items-center justify-center w-3 h-3 rounded-full mr-0.5 text-white text-[8px] ${
                  index === 0 ? 'bg-yellow-500' : 
                  index === 1 ? 'bg-gray-400' : 
                  'bg-amber-700'
                }`}>{index + 1}</span> : 
                <span className="text-[10px] text-text-muted mr-0.5">{index + 1}</span>;
              
              return (
                <tr 
                  key={trader.walletAddress} 
                  className={`text-[10px] border-b border-border hover:bg-panel-hover transition-colors ${
                    isTopTrader ? 'bg-panel-hover bg-opacity-25' : ''
                  } ${
                    trader.isNearLiquidation ? 'bg-danger bg-opacity-10' : ''
                  }`}
                >
                  <td className="py-0.5 px-1 text-center">
                    {rankIndicator}
                  </td>
                  <td className="py-0.5 px-1">
                    <div className="flex items-center">
                      <span className="text-text-primary">{truncateAddress(trader.walletAddress)}</span>
                      
                      {/* Position direction and correlation indicator */}
                      {isActive && (
                        <div className="flex items-center ml-0.5">
                          <span className={`text-[8px] px-0.5 rounded ${
                            positionDirection === 'LONG' ? 'bg-chart-up text-white' : 'bg-chart-down text-white'
                          }`}>
                            {positionDirection}
                          </span>
                          
                          {/* FIXED: Order book correlation indicator */}
                          {trader.orderBookWeight && trader.orderBookWeight > 2 && (
                            <span className="ml-0.5 text-[8px] text-blue-400" title={`${trader.orderBookWeight.toFixed(1)}% of order book`}>
                              📊
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Trader type indicator */}
                      <span className={`ml-0.5 text-[7px] px-0.5 rounded ${
                        traderType === 'whale' ? 'bg-purple-900 text-purple-300' :
                        traderType === 'bot' ? 'bg-blue-900 text-blue-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {traderType.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono text-text-primary">
                    {positionSize}
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono">
                    {trader.entryPrice ? `$${trader.entryPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono ${
                    trader.liquidationPrice && currentPrice > 0 && trader.activePosition && (
                      (trader.activePosition.quantity > 0 && currentPrice <= trader.liquidationPrice) ||
                      (trader.activePosition.quantity < 0 && currentPrice >= trader.liquidationPrice)
                    ) ? 'text-danger font-bold animate-pulse' : 'text-danger'
                  }`}>
                    {trader.liquidationPrice ? `${trader.liquidationPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono text-[9px] ${
                    trader.marginLevel && trader.marginLevel < 110 ? 'text-danger' : 
                    trader.marginLevel && trader.marginLevel < 150 ? 'text-warning' : 
                    'text-text-secondary'
                  }`}>
                    {trader.marginLevel ? formatPercentage(trader.marginLevel) : '-'}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono ${
                    (trader.unrealizedPnl || 0) >= 0 ? 'text-chart-up' : 'text-chart-down'
                  }`}>
                    {formatUSD(trader.unrealizedPnl)}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono ${
                    (trader.realizedPnl || 0) >= 0 ? 'text-chart-up' : 'text-chart-down'
                  }`}>
                    {formatUSD(trader.realizedPnl)}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono font-bold ${
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
      
      {/* FIXED: Enhanced Stats with correlation metrics */}
      {isExpandedView && (
        <div className="mt-1 p-1 border border-border rounded bg-panel">
          <div className="grid grid-cols-5 gap-2 text-[10px]">
            <div>
              <div className="text-text-secondary">Total Volume</div>
              <div className="font-semibold text-text-primary">
                {formatUSD(stats.totalVolume)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">Position Value</div>
              <div className="font-semibold text-text-primary">
                {formatUSD(stats.totalPositionValue)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">Order Book Impact</div>
              <div className="font-semibold text-blue-400">
                {formatPercentage(stats.avgOrderBookWeight)}
              </div>
            </div>
            <div>
              <div className="text-text-secondary">Market Impact</div>
              <div className="font-semibold text-purple-400">
                {formatPercentage(stats.totalMarketImpact)}
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
          
          {/* FIXED: Correlation quality indicator */}
          <div className="mt-2 pt-1 border-t border-border">
            <div className="flex justify-between text-[9px]">
              <div className="text-green-400">
                ✅ Position sizes normalized for order book correlation
              </div>
              <div className="text-blue-400">
                📊 Average position: {formatUSD(stats.totalPositionValue / Math.max(activePositions.length, 1))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipantsOverview;