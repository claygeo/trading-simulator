// frontend/src/components/StressTestController.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../services/websocket';

interface TPSMetrics {
  currentTPS: number;
  targetTPS: number;
  activeMode: TPSMode;
  tradersActive: number;
  queueDepth: number;
  marketPressure: 'low' | 'medium' | 'high' | 'extreme';
  dominantTraderType: string;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
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
    targetTPS: 10,
    activeMode: TPSMode.NORMAL,
    tradersActive: 0,
    queueDepth: 0,
    marketPressure: 'low',
    dominantTraderType: 'Market Makers',
    marketSentiment: 'neutral'
  });
  
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [lastModeChange, setLastModeChange] = useState<number>(0);
  const [totalTradesGenerated, setTotalTradesGenerated] = useState<number>(0);
  const [peakTPS, setPeakTPS] = useState<number>(0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  
  const tpsHistoryRef = useRef<number[]>([]);
  const metricsUpdateRef = useRef<number>(0);
  const modeChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // WebSocket integration
  const { isConnected, lastMessage } = useWebSocket(
    simulationId && isVisible ? simulationId : undefined
  );

  // TPS Mode configurations
  const modeConfigs = {
    [TPSMode.NORMAL]: {
      targetTPS: 10,
      label: 'Normal',
      description: '10 TPS - Market makers & retail traders',
      color: 'bg-green-600',
      hoverColor: 'hover:bg-green-700',
      activeColor: 'bg-green-500',
      icon: '📈',
      traderTypes: ['Market Makers', 'Retail Traders']
    },
    [TPSMode.BURST]: {
      targetTPS: 100,
      label: 'Burst',
      description: '100 TPS - Increased retail & arbitrage activity',
      color: 'bg-yellow-600',
      hoverColor: 'hover:bg-yellow-700', 
      activeColor: 'bg-yellow-500',
      icon: '⚡',
      traderTypes: ['Retail Traders', 'Arbitrage Bots']
    },
    [TPSMode.STRESS]: {
      targetTPS: 1000,
      label: 'Stress',
      description: '1K TPS - Panic sellers & MEV bots',
      color: 'bg-orange-600',
      hoverColor: 'hover:bg-orange-700',
      activeColor: 'bg-orange-500',
      icon: '🔥',
      traderTypes: ['Panic Sellers', 'MEV Bots', 'Arbitrage Bots']
    },
    [TPSMode.HFT]: {
      targetTPS: 10000,
      label: 'HFT',
      description: '10K TPS - MEV bots, whales & arbitrage',
      color: 'bg-red-600',
      hoverColor: 'hover:bg-red-700',
      activeColor: 'bg-red-500 animate-pulse',
      icon: '🚀',
      traderTypes: ['MEV Bots', 'Whales', 'Arbitrage Bots']
    }
  };

  // Handle WebSocket messages for TPS metrics
  useEffect(() => {
    if (!lastMessage) return;
    
    const { event } = lastMessage;
    
    if (event.type === 'external_market_pressure' && event.data) {
      const { tpsMode, processedOrders, queueDepth, metrics: pressureMetrics } = event.data;
      
      setMetrics(prev => ({
        ...prev,
        currentTPS: pressureMetrics?.currentTPS || 0,
        queueDepth: queueDepth || 0,
        dominantTraderType: pressureMetrics?.dominantTraderType || prev.dominantTraderType,
        marketSentiment: pressureMetrics?.marketSentiment || prev.marketSentiment
      }));
      
      // Update TPS history
      if (pressureMetrics?.currentTPS) {
        tpsHistoryRef.current.push(pressureMetrics.currentTPS);
        if (tpsHistoryRef.current.length > 30) {
          tpsHistoryRef.current.shift();
        }
        
        // Track peak TPS
        setPeakTPS(prev => Math.max(prev, pressureMetrics.currentTPS));
        setTotalTradesGenerated(prev => prev + processedOrders);
      }
    }
    
    // Handle batch updates that might contain trade data
    if (event.type === 'batch_update' && event.data?.updates) {
      const { updates } = event.data;
      if (updates.trades && Array.isArray(updates.trades)) {
        const newTrades = updates.trades.length;
        setTotalTradesGenerated(prev => prev + newTrades);
        
        // Estimate current TPS from trade frequency
        const now = Date.now();
        if (now - metricsUpdateRef.current > 1000) {
          const estimatedTPS = newTrades * (1000 / (now - metricsUpdateRef.current));
          setMetrics(prev => ({
            ...prev,
            currentTPS: Math.round(estimatedTPS)
          }));
          metricsUpdateRef.current = now;
        }
      }
    }
  }, [lastMessage]);

  // Send TPS mode change via WebSocket
  const sendTPSModeChange = useCallback((mode: TPSMode) => {
    if (!simulationId || !isConnected) {
      console.warn('Cannot send TPS mode change - no simulation ID or WebSocket not connected');
      return;
    }

    try {
      // Use the WebSocket connection to send the message
      const ws = (window as any).wsConnection; // Access the WebSocket from the hook
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        const message = {
          type: 'set_tps_mode',
          simulationId: simulationId,
          mode: mode,
          timestamp: Date.now()
        };
        
        ws.send(JSON.stringify(message));
        console.log(`TPS mode change sent: ${mode} for simulation ${simulationId}`);
      } else {
        console.warn('WebSocket not ready for TPS mode change');
      }
    } catch (error) {
      console.error('Error sending TPS mode change:', error);
    }
  }, [simulationId, isConnected]);

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
      // Update local state immediately for UI responsiveness
      setActiveMode(newMode);
      setMetrics(prev => ({
        ...prev,
        activeMode: newMode,
        targetTPS: modeConfigs[newMode].targetTPS
      }));
      
      // Send the mode change via WebSocket
      sendTPSModeChange(newMode);
      
      // Set transition timeout
      modeChangeTimeoutRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, 1500);
      
    } catch (error) {
      console.error('Error changing TPS mode:', error);
      setIsTransitioning(false);
    }
  }, [simulationRunning, isTransitioning, lastModeChange, sendTPSModeChange]);

  // Calculate market pressure level
  const calculateMarketPressure = useCallback((): 'low' | 'medium' | 'high' | 'extreme' => {
    const { currentTPS, queueDepth } = metrics;
    
    if (currentTPS > 5000 || queueDepth > 1000) return 'extreme';
    if (currentTPS > 500 || queueDepth > 100) return 'high';
    if (currentTPS > 50 || queueDepth > 10) return 'medium';
    return 'low';
  }, [metrics]);

  // Update market pressure periodically
  useEffect(() => {
    const pressure = calculateMarketPressure();
    setMetrics(prev => ({ ...prev, marketPressure: pressure }));
  }, [metrics.currentTPS, metrics.queueDepth, calculateMarketPressure]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (modeChangeTimeoutRef.current) {
        clearTimeout(modeChangeTimeoutRef.current);
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

  return (
    <div className="fixed top-20 right-4 z-40 bg-gray-900 text-white p-4 rounded-lg shadow-xl border border-gray-700 min-w-[400px] max-h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          } animate-pulse`}></div>
          <span className="text-sm font-semibold">Stress Test Controller</span>
          <div className="text-xs bg-gray-800 px-2 py-1 rounded">
            {formatNumber(totalTradesGenerated)} generated
          </div>
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
                Active
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Current Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-xs text-gray-400">Current TPS</div>
          <div className={`text-lg font-bold ${
            metrics.currentTPS > 5000 ? 'text-red-400' :
            metrics.currentTPS > 1000 ? 'text-orange-400' :
            metrics.currentTPS > 100 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {formatNumber(metrics.currentTPS)}
          </div>
          <div className="text-xs text-gray-500">
            Target: {formatNumber(metrics.targetTPS)}
          </div>
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

      {/* Market Sentiment */}
      <div className="bg-gray-800 p-3 rounded mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">Market Activity</span>
          <span className={`text-xs font-semibold ${getSentimentColor(metrics.marketSentiment)}`}>
            {metrics.marketSentiment.toUpperCase()}
          </span>
        </div>
        <div className="text-sm text-gray-300">
          Dominant: <span className="text-blue-400">{metrics.dominantTraderType}</span>
        </div>
        {activeMode !== TPSMode.NORMAL && (
          <div className="text-xs text-purple-400 mt-1">
            {modeConfigs[activeMode].traderTypes.join(', ')} active
          </div>
        )}
      </div>

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

      {/* Connection Status */}
      <div className="text-xs text-gray-500 flex justify-between items-center">
        <span>
          WebSocket: {isConnected ? (
            <span className="text-green-400">Connected</span>
          ) : (
            <span className="text-red-400">Disconnected</span>
          )}
        </span>
        <span>
          Peak: <span className="text-cyan-400">{formatNumber(peakTPS)} TPS</span>
        </span>
      </div>

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
          </div>
          
          <div className="text-gray-400 mb-1">Active Trader Types:</div>
          <div className="text-blue-300">
            {modeConfigs[activeMode].traderTypes.join(' • ')}
          </div>
          
          <div className="mt-2 text-gray-400">
            Mode: <span className="text-purple-400">{modeConfigs[activeMode].label}</span>
          </div>
          <div className="text-gray-500 text-[10px] mt-1">
            {modeConfigs[activeMode].description}
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