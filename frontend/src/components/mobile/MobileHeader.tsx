// frontend/src/components/mobile/MobileHeader.tsx
import React, { useState } from 'react';

interface MobileHeaderProps {
  tokenSymbol: string;
  currentPrice: number;
  elapsedTime: string;
  marketCondition: 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash';
  isConnected: boolean;
  connectionError?: string;
  simulationRegistrationStatus: 'creating' | 'pending' | 'ready' | 'error';
  priceHistoryLength: number;
  tradesCount: number;
  wsMessageCount: number;
  simulation: any;
  canStartSimulation: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  simulationSpeed: number;
  onSpeedChange: (speed: keyof typeof speedMap) => void;
  speedMap: Record<string, number>;
  currentScenario: any;
  formatTradeCount: (count: number) => string;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({
  tokenSymbol,
  currentPrice,
  elapsedTime,
  marketCondition,
  isConnected,
  connectionError,
  simulationRegistrationStatus,
  priceHistoryLength,
  tradesCount,
  wsMessageCount,
  simulation,
  canStartSimulation,
  onStart,
  onPause,
  onReset,
  simulationSpeed,
  onSpeedChange,
  speedMap,
  currentScenario,
  formatTradeCount
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getMarketConditionColor = () => {
    switch (marketCondition) {
      case 'bullish': return 'text-green-400';
      case 'bearish': return 'text-red-400';
      case 'volatile': return 'text-orange-400';
      case 'crash': return 'text-red-600';
      case 'building': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const getConnectionStatusColor = () => {
    if (isConnected && simulationRegistrationStatus === 'ready') return 'bg-green-500';
    if (connectionError) return 'bg-red-500';
    return 'bg-yellow-500';
  };

  const formatPrice = (price: number) => {
    return price < 1 ? price.toFixed(6) : price.toFixed(2);
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700">
      {/* Main Header Row */}
      <div className="flex items-center justify-between p-3">
        {/* Left: Price & Symbol */}
        <div className="flex items-center space-x-3">
          <div className="flex flex-col">
            <div className="text-white font-bold text-lg">
              {tokenSymbol}
            </div>
            <div className="text-white font-mono text-xl">
              ${formatPrice(currentPrice)}
            </div>
          </div>
          
          {/* Connection Status */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${getConnectionStatusColor()}`}></div>
            <div className="text-xs text-gray-400">
              {isConnected ? 'Live' : 'Offline'}
            </div>
          </div>
        </div>

        {/* Right: Main Controls */}
        <div className="flex items-center space-x-2">
          {/* Advanced Toggle */}
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="p-2 text-gray-400 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 12v6m11-7h-6M6 12H0"/>
            </svg>
          </button>

          {/* Primary Action Button */}
          {canStartSimulation ? (
            <button 
              onClick={onStart}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
            >
              {simulation.isPaused ? 'Resume' : 'Start'}
            </button>
          ) : simulation.isRunning && !simulation.isPaused ? (
            <button 
              onClick={onPause} 
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition font-medium"
            >
              Pause
            </button>
          ) : (
            <button 
              disabled
              className="px-4 py-2 bg-gray-600 text-gray-400 rounded-lg cursor-not-allowed font-medium"
            >
              {simulation.isPaused ? 'Resume' : 'Start'}
            </button>
          )}

          {/* Reset Button */}
          <button 
            onClick={onReset}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-3 py-2 bg-gray-900 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs">
          {/* Left: Market Status */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <span className="text-gray-400">Market:</span>
              <span className={`font-medium ${getMarketConditionColor()}`}>
                {marketCondition.toUpperCase()}
              </span>
            </div>
            
            <div className="flex items-center space-x-1">
              <span className="text-gray-400">Time:</span>
              <span className="text-white font-mono">{elapsedTime}</span>
            </div>

            {currentScenario && (
              <div className="text-purple-400">
                📈 {currentScenario.scenarioName || 'Scenario'}
              </div>
            )}
          </div>

          {/* Right: Data Stats */}
          <div className="flex items-center space-x-4">
            <div className="text-gray-400">
              Candles: <span className="text-white">{priceHistoryLength}</span>
            </div>
            <div className="text-gray-400">
              Trades: <span className="text-accent font-bold">{formatTradeCount(tradesCount)}</span>
            </div>
            <div className="text-gray-400">
              Msgs: <span className="text-blue-400">{wsMessageCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Controls Panel */}
      {showAdvanced && (
        <div className="px-3 py-3 bg-gray-850 border-t border-gray-700">
          {/* Speed Controls */}
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-2">Trading Speed:</div>
            <div className="grid grid-cols-6 gap-1">
              {(Object.keys(speedMap) as Array<keyof typeof speedMap>).map((speed) => (
                <button
                  key={speed}
                  onClick={() => onSpeedChange(speed)}
                  className={`px-2 py-1 text-xs rounded transition ${
                    simulationSpeed === speedMap[speed]
                      ? 'bg-blue-600 text-white font-semibold' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {speed === 'ludicrous' ? 'Lud' : 
                   speed === 'quantum' ? 'Qnt' :
                   speed.charAt(0).toUpperCase() + speed.slice(1, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-400">Registration</div>
              <div className={`font-medium ${
                simulationRegistrationStatus === 'ready' ? 'text-green-400' :
                simulationRegistrationStatus === 'pending' ? 'text-yellow-400' :
                simulationRegistrationStatus === 'error' ? 'text-red-400' :
                'text-blue-400'
              }`}>
                {simulationRegistrationStatus.toUpperCase()}
              </div>
            </div>
            
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-400">Speed</div>
              <div className="text-white font-medium">
                {simulationSpeed}x
              </div>
            </div>
            
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-400">Status</div>
              <div className={`font-medium ${
                simulation?.isRunning ? (simulation?.isPaused ? 'text-yellow-400' : 'text-green-400') : 'text-gray-400'
              }`}>
                {simulation?.isRunning ? (simulation?.isPaused ? 'PAUSED' : 'RUNNING') : 'STOPPED'}
              </div>
            </div>
          </div>

          {/* Performance Indicators */}
          {tradesCount > 1000 && (
            <div className="mt-3 p-2 bg-green-900 bg-opacity-30 rounded border border-green-500">
              <div className="text-green-400 text-xs font-medium">
                🚀 High Frequency Mode: {formatTradeCount(tradesCount)} trades processed
              </div>
            </div>
          )}

          {/* Connection Issues */}
          {connectionError && (
            <div className="mt-3 p-2 bg-red-900 bg-opacity-30 rounded border border-red-500">
              <div className="text-red-400 text-xs font-medium">
                ⚠️ Connection Issue: {connectionError}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileHeader;