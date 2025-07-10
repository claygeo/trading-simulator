// frontend/src/components/StressTestController.tsx - FIXED: Enhanced Metrics & Real-time Updates
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../services/websocket';

interface TPSMetrics {
  currentTPS: number;
  actualTPS: number;
  targetTPS: number;
  activeMode: TPSMode;
  tradersActive: number;
  queueDepth: number;
  marketPressure: 'low' | 'medium' | 'high' | 'extreme';
  dominantTraderType: string;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  processedOrders: number;
  avgTPS: number;
}

enum TPSMode {
  NORMAL = 'NORMAL',
  BURST = 'BURST', 
  STRESS = 'STRESS',
  HFT = 'HFT'
}

interface StressTestControllerProps {
  isVisible: boolean;
  onToggle: () => void;
  simulationRunning: boolean;
  simulationId?: string;
}

const StressTestController: React.FC<StressTestControllerProps> = ({
  isVisible,
  onToggle,
  simulationRunning,
  simulationId
}) => {
  const [activeMode, setActiveMode] = useState<TPSMode>(TPSMode.NORMAL);
  const [metrics, setMetrics] = useState<TPSMetrics>({
    currentTPS: 0,
    actualTPS: 0,
    targetTPS: 25,
    activeMode: TPSMode.NORMAL,
    tradersActive: 0,
    queueDepth: 0,
    marketPressure: 'low',
    dominantTraderType: 'Market Makers',
    marketSentiment: 'neutral',
    processedOrders: 0,
    avgTPS: 0
  });
  
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [lastModeChange, setLastModeChange] = useState<number>(0);
  const [totalTradesGenerated, setTotalTradesGenerated] = useState<number>(0);
  const [peakTPS, setPeakTPS] = useState<number>(0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  
  const tpsHistoryRef = useRef<number[]>([]);
  const metricsUpdateRef = useRef<number>(0);
  const modeChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // WebSocket integration
  const { isConnected, lastMessage, sendTPSModeChange, sendStressTestMessage } = useWebSocket(
    simulationId && isVisible ? simulationId : undefined
  );

  // FIXED: Update connection status
  useEffect(() => {
    if (isConnected && simulationId) {
      setConnectionStatus('connected');
    } else if (simulationId) {
      setConnectionStatus('connecting');
    } else {
      setConnectionStatus('no_simulation');
    }
  }, [isConnected, simulationId]);

  // TPS Mode configurations
  const modeConfigs = {
    [TPSMode.NORMAL]: {
      targetTPS: 25,
      label: 'Normal',
      description: '25 TPS - Market makers & retail traders',
      color: 'bg-green-600',
      hoverColor: 'hover:bg-green-700',
      activeColor: 'bg-green-500',
      icon: '📈',
      traderTypes: ['Market Makers', 'Retail Traders']
    },
    [TPSMode.BURST]: {
      targetTPS: 150,
      label: 'Burst',
      description: '150 TPS - Increased retail & arbitrage activity',
      color: 'bg-yellow-600',
      hoverColor: 'hover:bg-yellow-700', 
      activeColor: 'bg-yellow-500',
      icon: '⚡',
      traderTypes: ['Retail Traders', 'Arbitrage Bots']
    },
    [TPSMode.STRESS]: {
      targetTPS: 1500,
      label: 'Stress',
      description: '1.5K TPS - Panic sellers & MEV bots',
      color: 'bg-orange-600',
      hoverColor: 'hover:bg-orange-700',
      activeColor: 'bg-orange-500',
      icon: '🔥',
      traderTypes: ['Panic Sellers', 'MEV Bots', 'Arbitrage Bots']
    },
    [TPSMode.HFT]: {
      targetTPS: 15000,
      label: 'HFT',
      description: '15K TPS - MEV bots, whales & arbitrage',
      color: 'bg-red-600',
      hoverColor: 'hover:bg-red-700',
      activeColor: 'bg-red-500 animate-pulse',
      icon: '🚀',
      traderTypes: ['MEV Bots', 'Whales', 'Arbitrage Bots']
    }
  };

  // FIXED: Enhanced WebSocket message handling
  useEffect(() => {
    if (!lastMessage) return;
    
    const { event } = lastMessage;
    const now = Date.now();
    
    console.log(`📊 [STRESS CONTROLLER] Received message: ${event.type}`, event.data);
    
    if (event.type === 'external_market_pressure' && event.data) {
      const { tpsMode, processedOrders, queueDepth, metrics: pressureMetrics } = event.data;
      
      console.log(`📈 [TPS METRICS] Processing market pressure update:`, pressureMetrics);
      
      setMetrics(prev => ({
        ...prev,
        actualTPS: pressureMetrics?.actualTPS || pressureMetrics?.avgTPS || 0,
        currentTPS: pressureMetrics?.currentTPS || prev.currentTPS,
        queueDepth: queueDepth || 0,
        dominantTraderType: formatTraderType(pressureMetrics?.dominantTraderType) || prev.dominantTraderType,
        marketSentiment: pressureMetrics?.marketSentiment || prev.marketSentiment,
        processedOrders: pressureMetrics?.processedOrders || 0,
        avgTPS: pressureMetrics?.avgTPS || 0
      }));
      
      // Update TPS history
      if (pressureMetrics?.actualTPS || pressureMetrics?.avgTPS) {
        const currentTPS = pressureMetrics.actualTPS || pressureMetrics.avgTPS;
        tpsHistoryRef.current.push(currentTPS);
        if (tpsHistoryRef.current.length > 30) {
          tpsHistoryRef.current.shift();
        }
        
        // Track peak TPS
        setPeakTPS(prev => Math.max(prev, currentTPS));
        setTotalTradesGenerated(prev => prev + (pressureMetrics.processedOrders || 0));
      }
      
      setLastUpdateTime(now);
    }
    
    // Handle TPS mode confirmation
    if (event.type === 'tps_mode_changed' && event.data) {
      console.log(`🔄 [TPS MODE] Mode change confirmed:`, event.data);
      const { mode, targetTPS } = event.data;
      
      if (mode) {
        setActiveMode(mode as TPSMode);
        setMetrics(prev => ({
          ...prev,
          activeMode: mode as TPSMode,
          targetTPS: targetTPS || getTargetTPSForMode(mode)
        }));
      }
      
      setIsTransitioning(false);
    }
    
    // Handle batch updates that might contain trade data
    if (event.type === 'batch_update' && event.data?.updates) {
      const { updates } = event.data;
      if (updates.trades && Array.isArray(updates.trades)) {
        const newTrades = updates.trades.length;
        setTotalTradesGenerated(prev => prev + newTrades);
        
        // Estimate current TPS from trade frequency
        if (now - metricsUpdateRef.current > 1000) {
          const estimatedTPS = newTrades * (1000 / (now - metricsUpdateRef.current));
          setMetrics(prev => ({
            ...prev,
            actualTPS: Math.max(prev.actualTPS, Math.round(estimatedTPS))
          }));
          metricsUpdateRef.current = now;
        }
      }
    }

    // Handle simulation state updates
    if (event.type === 'simulation_state' && event.data) {
      const { currentTPSMode, externalMarketMetrics, recentTrades } = event.data;
      
      if (currentTPSMode) {
        setActiveMode(currentTPSMode as TPSMode);
      }
      
      if (externalMarketMetrics) {
        setMetrics(prev => ({
          ...prev,
          currentTPS: externalMarketMetrics.currentTPS || prev.currentTPS,
          actualTPS: externalMarketMetrics.actualTPS || prev.actualTPS,
          queueDepth: externalMarketMetrics.queueDepth || 0,
          processedOrders: externalMarketMetrics.processedOrders || 0,
          marketSentiment: externalMarketMetrics.marketSentiment || prev.marketSentiment,
          dominantTraderType: formatTraderType(externalMarketMetrics.dominantTraderType) || prev.dominantTraderType
        }));
      }
      
      if (recentTrades && Array.isArray(recentTrades)) {
        setTotalTradesGenerated(prev => Math.max(prev, recentTrades.length));
      }
      
      setLastUpdateTime(now);
    }

    // Handle price updates that contain TPS metrics
    if (event.type === 'price_update' && event.data?.externalMarketMetrics) {
      const { externalMarketMetrics } = event.data;
      
      setMetrics(prev => ({
        ...prev,
        actualTPS: externalMarketMetrics.actualTPS || prev.actualTPS,
        currentTPS: externalMarketMetrics.currentTPS || prev.currentTPS,
        queueDepth: externalMarketMetrics.queueDepth || prev.queueDepth,
        processedOrders: externalMarketMetrics.processedOrders || prev.processedOrders
      }));
      
      setLastUpdateTime(now);
    }
  }, [lastMessage]);

  // Helper function to format trader type names
  const formatTraderType = useCallback((traderType: string): string => {
    if (!traderType) return 'Unknown';
    
    const typeMap: Record<string, string> = {
      'RETAIL_TRADER': 'Retail Traders',
      'MARKET_MAKER': 'Market Makers',
      'ARBITRAGE_BOT': 'Arbitrage Bots',
      'MEV_BOT': 'MEV Bots',
      'WHALE': 'Whales',
      'PANIC_SELLER': 'Panic Sellers'
    };
    
    return typeMap[traderType] || traderType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }, []);

  // Helper function to get target TPS for mode
  const getTargetTPSForMode = useCallback((mode: string): number => {
    const modeConfig = modeConfigs[mode as TPSMode];
    return modeConfig?.targetTPS || 25;
  }, [modeConfigs]);

  // FIXED: Request TPS status on component mount and mode changes
  useEffect(() => {
    if (isConnected && simulationId && sendStressTestMessage) {
      // Request current TPS status
      setTimeout(() => {
        sendStressTestMessage('get_tps_status', { simulationId });
      }, 500);
    }
  }, [isConnected, simulationId, sendStressTestMessage, activeMode]);

  // FIXED: Periodic status updates
  useEffect(() => {
    if (!isConnected || !simulationId || !sendStressTestMessage) return;
    
    const interval = setInterval(() => {
      sendStressTestMessage('get_tps_status', { simulationId });
    }, 5000); // Request status every 5 seconds
    
    updateIntervalRef.current = interval;
    
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [isConnected, simulationId, sendStressTestMessage]);

  // Handle mode change with transition effects
  const handleModeChange = useCallback(async (newMode: TPSMode) => {
    if (!simulationRunning) {
      console.warn('Cannot change TPS mode - simulation not running');
      return;
    }
    
    if (isTransitioning) {
      console.log('Mode change already in progress');
      return;
    }
    
    const now = Date.now();
    if (now - lastModeChange < 2000) {
      console.log('Mode change rate limited');
      return;
    }
    
    setIsTransitioning(true);
    setLastModeChange(now);
    
    // Clear any existing timeout
    if (modeChangeTimeoutRef.current) {
      clearTimeout(modeChangeTimeoutRef.current);
    }
    
    try {
      console.log(`🚀 [TPS CHANGE] Changing to ${newMode} mode for simulation ${simulationId}`);
      
      // Update local state immediately for UI responsiveness
      setActiveMode(newMode);
      setMetrics(prev => ({
        ...prev,
        activeMode: newMode,
        targetTPS: modeConfigs[newMode].targetTPS
      }));
      
      // Send the mode change via WebSocket
      if (sendTPSModeChange) {
        sendTPSModeChange(newMode);
      } else {
        console.error('sendTPSModeChange function not available');
        setIsTransitioning(false);
        return;
      }
      
      // Set transition timeout
      modeChangeTimeoutRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, 3000); // Longer timeout for TPS changes
      
    } catch (error) {
      console.error('Error changing TPS mode:', error);
      setIsTransitioning(false);
    }
  }, [simulationRunning, isTransitioning, lastModeChange, sendTPSModeChange, simulationId, modeConfigs]);

  // FIXED: Handle liquidation cascade trigger
  const handleLiquidationCascade = useCallback(() => {
    if (!simulationRunning || !simulationId || (activeMode !== TPSMode.STRESS && activeMode !== TPSMode.HFT)) {
      console.warn('Cannot trigger liquidation cascade - invalid conditions');
      return;
    }
    
    if (sendStressTestMessage) {
      console.log('💥 [LIQUIDATION] Triggering liquidation cascade');
      sendStressTestMessage('trigger_liquidation_cascade', { simulationId });
    }
  }, [simulationRunning, simulationId, activeMode, sendStressTestMessage]);

  // Calculate market pressure level
  const calculateMarketPressure = useCallback((): 'low' | 'medium' | 'high' | 'extreme' => {
    const { actualTPS, queueDepth } = metrics;
    
    if (actualTPS > 5000 || queueDepth > 1000) return 'extreme';
    if (actualTPS > 500 || queueDepth > 100) return 'high';
    if (actualTPS > 50 || queueDepth > 10) return 'medium';
    return 'low';
  }, [metrics]);

  // Update market pressure periodically
  useEffect(() => {
    const pressure = calculateMarketPressure();
    setMetrics(prev => ({ ...prev, marketPressure: pressure }));
  }, [metrics.actualTPS, metrics.queueDepth, calculateMarketPressure]);

  // Format large numbers
  const formatNumber = useCallback((num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }, []);

  // Get pressure color
  const getPressureColor = useCallback((pressure: string) => {
    switch (pressure) {
      case 'extreme': return 'text-red-400';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      default: return 'text-green-400';
    }
  }, []);

  // Get sentiment color
  const getSentimentColor = useCallback((sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'text-green-400';
      case 'bearish': return 'text-red-400';
      default: return 'text-gray-400';
    }
  }, []);

  // Get connection status color and text
  const getConnectionInfo = useCallback(() => {
    switch (connectionStatus) {
      case 'connected':
        return { color: 'bg-green-500', text: 'Connected', pulse: true };
      case 'connecting':
        return { color: 'bg-yellow-500', text: 'Connecting', pulse: true };
      case 'no_simulation':
        return { color: 'bg-gray-500', text: 'No Simulation', pulse: false };
      default:
        return { color: 'bg-red-500', text: 'Disconnected', pulse: false };
    }
  }, [connectionStatus]);

  // FIXED: Check for stale data
  const isDataStale = useCallback(() => {
    if (!lastUpdateTime) return true;
    return Date.now() - lastUpdateTime > 10000; // 10 seconds
  }, [lastUpdateTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (modeChangeTimeoutRef.current) {
        clearTimeout(modeChangeTimeoutRef.current);
      }
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed top-20 right-4 z-40 bg-purple-800 text-white p-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors"
        title="Show Stress Test Controller"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </button>
    );
  }

  const connectionInfo = getConnectionInfo();

  return (
    <div className="fixed top-20 right-4 z-40 bg-gray-900 text-white p-4 rounded-lg shadow-xl border border-gray-700 min-w-[420px] max-h-[700px] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${connectionInfo.color} ${
            connectionInfo.pulse ? 'animate-pulse' : ''
          }`}></div>
          <span className="text-sm font-semibold">Stress Test Controller</span>
          <div className="text-xs bg-gray-800 px-2 py-1 rounded">
            {formatNumber(totalTradesGenerated)} total
          </div>
          {isDataStale() && (
            <div className="text-xs bg-red-800 px-2 py-1 rounded animate-pulse">
              STALE
            </div>
          )}
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isExpanded ? <path d="M18 6L6 18M6 6l12 12"/> : <path d="M8 18l4-4 4 4M8 6l4 4 4-4"/>}
            </svg>
          </button>
          <button onClick={onToggle} className="text-gray-400 hover:text-white p-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* TPS Mode Controls */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {Object.entries(modeConfigs).map(([mode, config]) => (
          <button
            key={mode}
            onClick={() => handleModeChange(mode as TPSMode)}
            disabled={!simulationRunning || isTransitioning}
            className={`p-3 rounded-lg border transition-all duration-200 ${
              activeMode === mode
                ? `${config.activeColor} border-white text-white shadow-lg`
                : `${config.color} ${config.hoverColor} border-gray-600 text-gray-100 hover:border-gray-500`
            } ${
              !simulationRunning || isTransitioning
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer hover:scale-105'
            }`}
            title={config.description}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">{config.icon}</span>
              <span className="text-xs font-bold">
                {formatNumber(config.targetTPS)} TPS
              </span>
            </div>
            <div className="text-sm font-semibold">{config.label}</div>
            {activeMode === mode && (
              <div className="text-xs mt-1 opacity-90">
                {isTransitioning ? 'Switching...' : 'Active'}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* FIXED: Enhanced Metrics Display */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-xs text-gray-400">Current TPS</div>
          <div className={`text-lg font-bold ${
            metrics.actualTPS > 5000 ? 'text-red-400' :
            metrics.actualTPS > 1000 ? 'text-orange-400' :
            metrics.actualTPS > 100 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {formatNumber(metrics.actualTPS)}
          </div>
          <div className="text-xs text-gray-500">
            Target: {formatNumber(metrics.targetTPS)}
          </div>
          {metrics.avgTPS > 0 && (
            <div className="text-xs text-blue-400">
              Avg: {formatNumber(metrics.avgTPS)}
            </div>
          )}
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-xs text-gray-400">Queue Depth</div>
          <div className={`text-lg font-bold ${
            metrics.queueDepth > 500 ? 'text-red-400' :
            metrics.queueDepth > 100 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {formatNumber(metrics.queueDepth)}
          </div>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-xs text-gray-400">Market Pressure</div>
          <div className={`text-lg font-bold ${getPressureColor(metrics.marketPressure)}`}>
            {metrics.marketPressure.toUpperCase()}
          </div>
        </div>
      </div>

      {/* FIXED: Enhanced Market Activity */}
      <div className="bg-gray-800 p-3 rounded mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">Market Activity</span>
          <span className={`text-xs font-semibold ${getSentimentColor(metrics.marketSentiment)}`}>
            {metrics.marketSentiment.toUpperCase()}
          </span>
        </div>
        <div className="text-sm text-gray-300 mb-1">
          Dominant: <span className="text-blue-400">{metrics.dominantTraderType}</span>
        </div>
        <div className="text-sm text-gray-300">
          Processed: <span className="text-green-400">{formatNumber(metrics.processedOrders)}</span>
        </div>
        {activeMode !== TPSMode.NORMAL && (
          <div className="text-xs text-purple-400 mt-1">
            {modeConfigs[activeMode].traderTypes.join(', ')} active
          </div>
        )}
      </div>

      {/* FIXED: Liquidation Cascade Button */}
      {(activeMode === TPSMode.STRESS || activeMode === TPSMode.HFT) && (
        <div className="mb-3">
          <button
            onClick={handleLiquidationCascade}
            disabled={!simulationRunning}
            className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-3 rounded-lg font-semibold transition-colors"
          >
            💥 Trigger Liquidation Cascade
          </button>
        </div>
      )}

      {/* Status Indicators */}
      <div className="flex items-center justify-between text-xs mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            simulationRunning ? 'bg-green-500' : 'bg-gray-500'
          }`}></div>
          <span className="text-gray-400">
            {simulationRunning ? 'Simulation Running' : 'Simulation Stopped'}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {isTransitioning && (
            <>
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span className="text-yellow-400">Transitioning...</span>
            </>
          )}
        </div>
      </div>

      {/* FIXED: Enhanced Connection Status */}
      <div className="text-xs text-gray-500 flex justify-between items-center mb-2">
        <span>
          Status: <span className={`${
            connectionInfo.color.replace('bg-', 'text-').replace('-500', '-400')
          }`}>
            {connectionInfo.text}
          </span>
        </span>
        <span>
          Peak: <span className="text-cyan-400">{formatNumber(peakTPS)} TPS</span>
        </span>
      </div>

      {/* Last Update Indicator */}
      {lastUpdateTime > 0 && (
        <div className="text-xs text-gray-600 mb-2">
          Last update: {Math.round((Date.now() - lastUpdateTime) / 1000)}s ago
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 p-3 bg-gray-800 rounded text-xs">
          <div className="text-gray-300 mb-2">📊 Performance Metrics:</div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <span className="text-gray-400">Total Generated:</span>
              <div className="text-green-400 font-semibold">{formatNumber(totalTradesGenerated)}</div>
            </div>
            <div>
              <span className="text-gray-400">Peak TPS:</span>
              <div className="text-cyan-400 font-semibold">{formatNumber(peakTPS)}</div>
            </div>
            <div>
              <span className="text-gray-400">Processed Orders:</span>
              <div className="text-blue-400 font-semibold">{formatNumber(metrics.processedOrders)}</div>
            </div>
            <div>
              <span className="text-gray-400">Avg TPS:</span>
              <div className="text-purple-400 font-semibold">{formatNumber(metrics.avgTPS)}</div>
            </div>
          </div>
          
          <div className="text-gray-400 mb-1">Active Trader Types:</div>
          <div className="text-blue-300 mb-2">
            {modeConfigs[activeMode].traderTypes.join(' • ')}
          </div>
          
          <div className="text-gray-400">
            Mode: <span className="text-purple-400">{modeConfigs[activeMode].label}</span>
          </div>
          <div className="text-gray-500 text-[10px] mt-1 mb-2">
            {modeConfigs[activeMode].description}
          </div>
          
          {/* Debug Info */}
          <div className="border-t border-gray-700 pt-2 mt-2">
            <div className="text-gray-400 text-[10px] mb-1">Debug Info:</div>
            <div className="text-gray-500 text-[10px]">
              Connection: {connectionStatus} | Updates: {lastUpdateTime > 0 ? 'Active' : 'None'}
            </div>
          </div>
          
          {!simulationRunning && (
            <div className="mt-2 text-orange-400">
              ⚠️ Start simulation to enable stress testing
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StressTestController;