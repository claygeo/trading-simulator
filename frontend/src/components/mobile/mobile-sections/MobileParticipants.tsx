// frontend/src/components/mobile/mobile-sections/MobileParticipants.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { Trader, TraderPosition } from '../../../types';

interface MobileParticipantsProps {
  traders: Trader[];
  activePositions: TraderPosition[];
  currentPrice?: number;
  scenarioModifiers?: any[];
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
  marginLevel?: number;
  isNearLiquidation?: boolean;
  scenarioAffected?: boolean;
  behaviorModification?: string;
  normalizedPositionSize?: number;
  orderBookWeight?: number;
  marketImpact?: number;
}

const MobileParticipants: React.FC<MobileParticipantsProps> = ({ 
  traders, 
  activePositions,
  currentPrice = 0,
  scenarioModifiers = []
}) => {
  const [sortBy, setSortBy] = useState<'balance' | 'pnl' | 'position' | 'volume'>('balance');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [selectedTrader, setSelectedTrader] = useState<string | null>(null);
  
  // Generate realistic position sizes for mobile display
  const generateRealisticPositionSize = useCallback((trader: Trader, currentPrice: number): number => {
    if (currentPrice <= 0) return 0;
    
    const traderVolume = trader.totalVolume || 10000;
    const riskProfile = trader.riskProfile || 'moderate';
    const netPnl = trader.netPnl || 0;
    
    let positionPercentage = 0.15;
    
    switch (riskProfile) {
      case 'aggressive':
        positionPercentage = 0.25 + (Math.random() * 0.15);
        break;
      case 'conservative':
        positionPercentage = 0.05 + (Math.random() * 0.08);
        break;
      default:
        positionPercentage = 0.12 + (Math.random() * 0.10);
    }
    
    if (netPnl > 50000) {
      positionPercentage *= 1.3;
    } else if (netPnl < -20000) {
      positionPercentage *= 0.7;
    }
    
    const addressHash = trader.walletAddress.split('').reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0);
    const variation = 0.8 + ((Math.abs(addressHash) % 100) / 100) * 0.4;
    
    const targetValue = traderVolume * positionPercentage * variation;
    const tokenQuantity = targetValue / currentPrice;
    
    let minTokens = 500;
    let maxTokens = 15000;
    
    if (currentPrice < 1) {
      minTokens = 2000;
      maxTokens = 50000;
    } else if (currentPrice < 10) {
      minTokens = 800;
      maxTokens = 25000;
    } else if (currentPrice < 100) {
      minTokens = 100;
      maxTokens = 5000;
    }
    
    return Math.max(minTokens, Math.min(maxTokens, tokenQuantity));
  }, []);

  const calculateOrderBookWeight = useCallback((
    positionSize: number, 
    positionValue: number, 
    totalMarketValue: number
  ): number => {
    if (totalMarketValue <= 0) return 0;
    const weight = (positionValue / totalMarketValue) * 100;
    return Math.min(weight, 12);
  }, []);

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

    return {
      affected: descriptions.length > 0,
      description: descriptions.join(', ')
    };
  };

  const calculateLiquidationPrice = (position: TraderPosition, trader: Trader) => {
    const leverage = 5;
    const maintenanceMarginRate = 0.05;
    const direction = position.quantity > 0 ? 1 : -1;
    
    if (direction > 0) {
      return position.entryPrice * (1 - (1/leverage) + maintenanceMarginRate);
    } else {
      return position.entryPrice * (1 + (1/leverage) - maintenanceMarginRate);
    }
  };

  const calculateUnrealizedPnL = (position: TraderPosition, currentPrice: number) => {
    if (!currentPrice || currentPrice <= 0) return 0;
    
    const direction = position.quantity > 0 ? 1 : -1;
    const priceChange = currentPrice - position.entryPrice;
    const pnl = direction * priceChange * Math.abs(position.quantity);
    
    return pnl;
  };

  const calculateMarginLevel = (position: TraderPosition, trader: Trader, currentPrice: number) => {
    const unrealizedPnl = calculateUnrealizedPnL(position, currentPrice);
    const positionValue = Math.abs(position.quantity) * currentPrice;
    const equity = (trader.netPnl || 0) + unrealizedPnl;
    const margin = positionValue / 5;
    
    return margin > 0 ? (equity / margin) * 100 : 0;
  };

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

  const getTraderType = (trader: Trader): 'institution' | 'retail' | 'bot' => {
    if (trader.totalVolume > 500000) return 'institution';
    if (trader.riskProfile === 'aggressive' && trader.winRate > 0.7 && trader.totalVolume > 100000) return 'bot';
    return 'retail';
  };

  // Enrich traders with realistic position data
  const enrichedTraders = useMemo(() => {
    return traders.map(trader => {
      const activePosition = activePositions.find(
        pos => pos.trader.walletAddress === trader.walletAddress
      );

      const scenarioEffect = applyScenarioModifiers(trader);
      
      let enrichedData: TraderData = {
        ...trader,
        realizedPnl: trader.netPnl || 0,
        totalBalance: trader.netPnl || 0,
        scenarioAffected: scenarioEffect.affected,
        behaviorModification: scenarioEffect.description
      };
      
      if (activePosition && currentPrice > 0) {
        const realisticSize = generateRealisticPositionSize(trader, currentPrice);
        const normalizedQuantity = activePosition.quantity > 0 ? realisticSize : -realisticSize;
        
        const unrealizedPnl = calculateUnrealizedPnL(activePosition, currentPrice);
        const liquidationPrice = calculateLiquidationPrice(activePosition, trader);
        const marginLevel = calculateMarginLevel(activePosition, trader, currentPrice);
        const positionValue = Math.abs(normalizedQuantity) * currentPrice;
        
        const orderBookWeight = calculateOrderBookWeight(
          Math.abs(normalizedQuantity), 
          positionValue, 
          marketContext.totalMarketValue
        );
        
        const isNearLiquidation = marginLevel < 110;
        
        enrichedData = {
          ...enrichedData,
          activePosition: {
            ...activePosition,
            quantity: normalizedQuantity
          },
          entryPrice: activePosition.entryPrice,
          liquidationPrice,
          unrealizedPnl,
          totalBalance: (trader.netPnl || 0) + unrealizedPnl,
          positionValue,
          margin: positionValue / 5,
          marginLevel,
          isNearLiquidation,
          normalizedPositionSize: Math.abs(normalizedQuantity),
          orderBookWeight
        };
      }
      
      return enrichedData;
    });
  }, [traders, activePositions, currentPrice, scenarioModifiers, generateRealisticPositionSize, calculateOrderBookWeight, marketContext]);

  const sortedTraders = useMemo(() => {
    const sorted = [...enrichedTraders].sort((a, b) => {
      switch (sortBy) {
        case 'balance':
          return (b.totalBalance || 0) - (a.totalBalance || 0);
        case 'pnl':
          return (b.unrealizedPnl || 0) - (a.unrealizedPnl || 0);
        case 'position':
          return (b.positionValue || 0) - (a.positionValue || 0);
        case 'volume':
          return b.totalVolume - a.totalVolume;
        default:
          return (b.totalBalance || 0) - (a.totalBalance || 0);
      }
    });
    return sorted;
  }, [enrichedTraders, sortBy]);

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

  const formatPositionSize = (size: number, price: number) => {
    if (price < 0.01) {
      if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
      if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
      return size.toFixed(0);
    } else if (price < 1) {
      if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
      return size.toFixed(0);
    } else {
      if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
      return size.toFixed(0);
    }
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (traders.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">👥</div>
          <p className="text-sm">No traders available yet</p>
          <p className="text-xs text-gray-500 mt-1">Please wait for data to load</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Mobile Header */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-medium">
            {traders.length} Participants
          </h3>
          
          <div className="flex items-center space-x-2">
            <div className="text-green-400 text-xs">
              ✅ Realistic Sizes
            </div>
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className="text-blue-400 text-xs px-2 py-1 bg-blue-900 rounded"
            >
              {showDetails ? 'Less' : 'More'}
            </button>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex space-x-1">
          {[
            { key: 'balance', label: 'Balance' },
            { key: 'pnl', label: 'P&L' },
            { key: 'position', label: 'Position' },
            { key: 'volume', label: 'Volume' }
          ].map((sort) => (
            <button
              key={sort.key}
              onClick={() => setSortBy(sort.key as any)}
              className={`px-3 py-1 text-xs rounded transition ${
                sortBy === sort.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {sort.label}
            </button>
          ))}
        </div>
      </div>

      {/* Traders List */}
      <div className="flex-1 overflow-y-auto">
        {sortedTraders.map((trader, index) => {
          const isActive = !!trader.activePosition;
          const positionSize = isActive ? 
            formatPositionSize(trader.normalizedPositionSize || 0, currentPrice) : '-';
          const positionDirection = isActive && trader.activePosition!.quantity > 0 ? 'LONG' : 'SHORT';
          const traderType = getTraderType(trader);
          
          const isTopTrader = index < 3;
          const isSelected = selectedTrader === trader.walletAddress;

          return (
            <div key={trader.walletAddress}>
              {/* Main Trader Row */}
              <div 
                className={`p-3 border-b border-gray-800 transition-colors ${
                  isTopTrader ? 'bg-gray-800' : 'bg-gray-900'
                } ${
                  trader.isNearLiquidation ? 'border-l-4 border-red-500' : ''
                } ${
                  isSelected ? 'bg-gray-700' : 'hover:bg-gray-800'
                }`}
                onClick={() => setSelectedTrader(isSelected ? null : trader.walletAddress)}
              >
                <div className="flex items-center justify-between">
                  {/* Left: Rank + Trader Info */}
                  <div className="flex items-center space-x-3 flex-1">
                    {/* Rank Badge */}
                    <div className="flex-shrink-0">
                      {isTopTrader ? (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                          index === 0 ? 'bg-yellow-500' : 
                          index === 1 ? 'bg-gray-400' : 
                          'bg-amber-700'
                        }`}>
                          {index + 1}
                        </div>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center text-gray-500 text-xs">
                          {index + 1}
                        </div>
                      )}
                    </div>

                    {/* Trader Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-medium">
                          {truncateAddress(trader.walletAddress)}
                        </span>
                        
                        {/* Position Direction */}
                        {isActive && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            positionDirection === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                          }`}>
                            {positionDirection}
                          </span>
                        )}
                        
                        {/* Trader Type */}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          traderType === 'institution' ? 'bg-purple-900 text-purple-300' :
                          traderType === 'bot' ? 'bg-blue-900 text-blue-300' :
                          'bg-gray-700 text-gray-300'
                        }`}>
                          {traderType === 'institution' ? 'INST' : traderType.toUpperCase()}
                        </span>
                      </div>

                      {/* Position Size & Entry */}
                      <div className="flex items-center space-x-3 mt-1 text-xs text-gray-400">
                        <span>Size: <span className="text-white">{positionSize}</span></span>
                        {trader.entryPrice && (
                          <span>Entry: <span className="text-white">${trader.entryPrice.toFixed(2)}</span></span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: P&L & Balance */}
                  <div className="flex flex-col items-end space-y-1">
                    <div className={`font-medium ${
                      (trader.totalBalance || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatUSD(trader.totalBalance)}
                    </div>
                    
                    {trader.unrealizedPnl !== undefined && (
                      <div className={`text-xs ${
                        trader.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatUSD(trader.unrealizedPnl)} P&L
                      </div>
                    )}
                  </div>
                </div>

                {/* Liquidation Warning */}
                {trader.isNearLiquidation && (
                  <div className="mt-2 p-2 bg-red-900 bg-opacity-30 rounded border border-red-500">
                    <div className="text-red-400 text-xs font-medium">
                      ⚠️ Near Liquidation: ${trader.liquidationPrice?.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded Details */}
              {isSelected && showDetails && (
                <div className="bg-gray-800 border-b border-gray-700 p-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-gray-400">Total Volume</div>
                      <div className="text-white font-medium">{formatUSD(trader.totalVolume)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Win Rate</div>
                      <div className="text-white font-medium">{(trader.winRate * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Trade Count</div>
                      <div className="text-white font-medium">{trader.tradeCount}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Risk Profile</div>
                      <div className={`font-medium capitalize ${
                        trader.riskProfile === 'aggressive' ? 'text-red-400' :
                        trader.riskProfile === 'conservative' ? 'text-green-400' :
                        'text-blue-400'
                      }`}>
                        {trader.riskProfile}
                      </div>
                    </div>
                  </div>

                  {trader.marginLevel && (
                    <div className="mt-3 pt-2 border-t border-gray-700">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Margin Level:</span>
                        <span className={`font-medium ${
                          trader.marginLevel < 110 ? 'text-red-400' : 
                          trader.marginLevel < 150 ? 'text-yellow-400' : 
                          'text-green-400'
                        }`}>
                          {trader.marginLevel.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {trader.orderBookWeight && trader.orderBookWeight > 1 && (
                    <div className="mt-2 text-xs text-blue-400">
                      📊 Order Book Weight: {trader.orderBookWeight.toFixed(1)}%
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="p-3 border-t border-gray-700 bg-gray-800">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-gray-400">Active Positions</div>
            <div className="text-white font-medium">{activePositions.length}</div>
          </div>
          <div>
            <div className="text-gray-400">At Risk</div>
            <div className={`font-medium ${
              enrichedTraders.filter(t => t.isNearLiquidation).length > 0 ? 'text-red-400' : 'text-green-400'
            }`}>
              {enrichedTraders.filter(t => t.isNearLiquidation).length} traders
            </div>
          </div>
        </div>
        
        <div className="mt-2 text-center text-xs text-gray-500">
          All {traders.length} traders • Realistic position sizes 500-15K range
        </div>
      </div>
    </div>
  );
};

export default MobileParticipants;