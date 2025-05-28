// Ultra-optimized Dashboard.tsx with Market Scenario Engine Integration
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SimulationApi } from '../services/api';
import { useWebSocket } from '../services/websocket';
import { Simulation, PricePoint as SimulationPricePoint } from '../types';
import PriceChart from './PriceChart';
import OrderBookComponent from './OrderBook';
import RecentTrades from './RecentTrades';
import ParticipantsOverview from './ParticipantsOverview';
import DynamicMusicPlayer from './DynamicMusicPlayer';
import PerformanceMonitor from './PerformanceMonitor';
import TransactionProcessor from './TransactionProcessor';
import MarketScenarioEngine, { MarketScenario } from './MarketScenarioEngine';

// Type adapter to convert between different PricePoint formats
interface ChartPricePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const Dashboard: React.FC = () => {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [marketCondition, setMarketCondition] = useState<'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash'>('calm');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [simulationStartTime, setSimulationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false);
  
  // Performance monitoring state
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState<boolean>(false);
  const [showTransactionProcessor, setShowTransactionProcessor] = useState<boolean>(false);
  const [wsMessageCount, setWsMessageCount] = useState<number>(0);
  
  // Ultra-low latency optimizations
  const [tradeExecutionTimes, setTradeExecutionTimes] = useState<number[]>([]);
  const [averageExecutionTime, setAverageExecutionTime] = useState<number>(0);
  const [isHighFrequencyMode, setIsHighFrequencyMode] = useState<boolean>(false);
  
  // Market Scenario Engine state
  const [scenarioEngineActive, setScenarioEngineActive] = useState<boolean>(true);
  const [currentScenario, setCurrentScenario] = useState<MarketScenario | null>(null);
  const [scenarioPhaseData, setScenarioPhaseData] = useState<any>(null);
  
  // Performance timing refs
  const tradeStartTimeRef = useRef<number>(0);
  const updateBatchRef = useRef<any[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Optimized refs for minimal re-renders
  const lastProcessedMessageRef = useRef<string | null>(null);
  const performanceStatsRef = useRef({
    totalTrades: 0,
    fastTrades: 0, // < 5ms
    mediumTrades: 0, // 5-15ms
    slowTrades: 0, // > 15ms
    averageLatency: 0
  });

  const { isConnected, lastMessage, setPauseState } = useWebSocket(
    simulation?.isRunning ? simulation?.id : undefined, 
    simulation?.isPaused
  );

  // Ultra-fast debug logging with circular buffer
  const addDebugLog = useCallback((message: string) => {
    setDebugInfo(prev => {
      const newLogs = [...prev.slice(-9), `${Date.now()}: ${message}`];
      return newLogs;
    });
    // Console logging is optional in high-frequency mode
    if (!isHighFrequencyMode) {
      console.log(message);
    }
  }, [isHighFrequencyMode]);

  // Batch update mechanism for high-frequency updates
  const batchUpdate = useCallback((updateFn: () => void) => {
    updateBatchRef.current.push(updateFn);
    
    if (!batchTimeoutRef.current) {
      batchTimeoutRef.current = setTimeout(() => {
        const startTime = performance.now();
        
        // Execute all batched updates in a single frame
        updateBatchRef.current.forEach(fn => fn());
        updateBatchRef.current = [];
        batchTimeoutRef.current = null;
        
        const executionTime = performance.now() - startTime;
        
        // Track batch execution performance
        if (executionTime > 5) {
          addDebugLog(`Batch update took ${executionTime.toFixed(2)}ms (above 5ms threshold)`);
        }
      }, 0); // Next tick for immediate processing
    }
  }, [addDebugLog]);

  // Ultra-fast trade execution tracking
  const trackTradeExecution = useCallback((executionTime: number) => {
    setTradeExecutionTimes(prev => {
      const newTimes = [...prev.slice(-99), executionTime]; // Keep last 100 trades
      const average = newTimes.reduce((sum, time) => sum + time, 0) / newTimes.length;
      setAverageExecutionTime(average);
      
      // Update performance stats
      const stats = performanceStatsRef.current;
      stats.totalTrades++;
      
      if (executionTime < 5) {
        stats.fastTrades++;
      } else if (executionTime < 15) {
        stats.mediumTrades++;
      } else {
        stats.slowTrades++;
      }
      
      stats.averageLatency = average;
      
      return newTimes;
    });
  }, []);

  // Market Scenario Engine callbacks
  const handleScenarioStart = useCallback((scenario: MarketScenario) => {
    setCurrentScenario(scenario);
    addDebugLog(`Market scenario started: ${scenario.name}`);
  }, [addDebugLog]);

  const handleScenarioEnd = useCallback(() => {
    setCurrentScenario(null);
    setScenarioPhaseData(null);
    addDebugLog('Market scenario ended');
  }, [addDebugLog]);

  const handleScenarioUpdate = useCallback((phase: any, progress: number) => {
    setScenarioPhaseData({ phase, progress });
    
    // Update market condition based on scenario
    if (phase.marketCondition !== marketCondition) {
      setMarketCondition(phase.marketCondition);
    }
  }, [marketCondition]);

  // Create simulation with performance optimizations
  useEffect(() => {
    const initSimulation = async () => {
      const initStartTime = performance.now();
      setLoading(true);
      
      try {
        addDebugLog("Creating high-performance simulation...");
        const response = await SimulationApi.createSimulation();
        
        if (response.error) {
          setError(response.error);
          addDebugLog(`Error creating simulation: ${response.error}`);
        } else {
          const simulationId = response.data.simulationId;
          addDebugLog(`Simulation created in ${(performance.now() - initStartTime).toFixed(2)}ms`);
          
          const simulationResponse = await SimulationApi.getSimulation(simulationId);
          
          if (simulationResponse.error) {
            setError(simulationResponse.error);
            addDebugLog(`Error getting simulation: ${simulationResponse.error}`);
          } else {
            setSimulation(simulationResponse.data);
            const totalInitTime = performance.now() - initStartTime;
            addDebugLog(`Full initialization completed in ${totalInitTime.toFixed(2)}ms`);
            
            // Enable high-frequency mode if initialization was fast
            if (totalInitTime < 100) {
              setIsHighFrequencyMode(true);
              addDebugLog("High-frequency mode enabled (sub-100ms init)");
            }
          }
        }
      } catch (error) {
        setError('Failed to initialize simulation');
        addDebugLog(`Initialization error: ${JSON.stringify(error)}`);
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    
    initSimulation();
  }, [addDebugLog]);

  // Enhanced market condition detection with scenario integration
  const determineMarketCondition = useCallback((simulation: Simulation): 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash' => {
    // If scenario is active, prioritize scenario-driven market condition
    if (currentScenario && scenarioPhaseData) {
      return scenarioPhaseData.phase.marketCondition;
    }

    if (!simulation?.priceHistory?.length) return 'calm';
    
    // Enhanced analysis for more realistic detection
    const recent = simulation.priceHistory.slice(-10); // Use more data points when not in scenario
    const firstPrice = recent[0].close;
    const lastPrice = simulation.currentPrice;
    const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    
    // Calculate volatility with better algorithm
    let volatility = 0;
    let volumeWeightedPrice = 0;
    let totalVolume = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const change = Math.abs((recent[i].close - recent[i-1].close) / recent[i-1].close);
      volatility += change;
      
      // Add volume consideration if available
      const volume = 1; // Default volume, could be enhanced with real volume data
      volumeWeightedPrice += recent[i].close * volume;
      totalVolume += volume;
    }
    
    volatility = (volatility / (recent.length - 1)) * 100;
    const vwap = totalVolume > 0 ? volumeWeightedPrice / totalVolume : lastPrice;
    
    // Enhanced condition detection
    if (volatility > 4) {
      if (percentChange < -8) return 'crash';
      if (percentChange > 8) return 'volatile';
      return 'volatile';
    }
    
    if (percentChange > 5) return 'bullish';
    if (percentChange < -3) return 'bearish';
    
    // Check for building momentum
    const recentChange = ((recent[recent.length-1].close - recent[recent.length-3].close) / recent[recent.length-3].close) * 100;
    if (recentChange > 2 && percentChange > 0) return 'building';
    
    return 'calm';
  }, [currentScenario, scenarioPhaseData]);

  // High-performance timer
  useEffect(() => {
    if (simulation?.isRunning && !simulation?.isPaused) {
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      // Use more efficient timer for high-frequency mode
      const updateInterval = isHighFrequencyMode ? 100 : 1000;
      
      timerRef.current = setInterval(() => {
        if (simulationStartTime) {
          const elapsed = Date.now() - simulationStartTime;
          const hours = Math.floor(elapsed / 3600000);
          const minutes = Math.floor((elapsed % 3600000) / 60000);
          const seconds = Math.floor((elapsed % 60000) / 1000);
          setElapsedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      }, updateInterval);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [simulation?.isRunning, simulation?.isPaused, simulationStartTime, isHighFrequencyMode]);

  // Convert price history to chart format
  const convertPriceHistory = useCallback((priceHistory: SimulationPricePoint[]): ChartPricePoint[] => {
    if (!priceHistory || priceHistory.length === 0) return [];
    
    // First convert the data
    const converted = priceHistory.map(point => ({
      time: point.timestamp,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume
    }));
    
    // Then sort by time to ensure chronological order
    return converted.sort((a, b) => a.time - b.time);
  }, []);

  // Memoized safe data with minimal recalculation
  const safeData = useMemo(() => {
    if (!simulation) return {
      orderBook: { bids: [], asks: [], lastUpdateTime: Date.now() },
      recentTrades: [],
      traderRankings: [],
      activePositions: [],
      priceHistory: [] as ChartPricePoint[],
      currentPrice: 0,
    };
    
    // Sort price history to ensure chronological order
    const sortedPriceHistory = simulation.priceHistory ? 
      [...simulation.priceHistory].sort((a, b) => a.timestamp - b.timestamp) : [];
    
    // Sort recent trades by timestamp
    const sortedRecentTrades = simulation.recentTrades ? 
      [...simulation.recentTrades].sort((a, b) => a.timestamp - b.timestamp) : [];
    
    return {
      ...simulation,
      orderBook: simulation.orderBook || { bids: [], asks: [], lastUpdateTime: Date.now() },
      recentTrades: sortedRecentTrades,
      traderRankings: simulation.traderRankings || [],
      activePositions: simulation.activePositions || [],
      priceHistory: convertPriceHistory(sortedPriceHistory),
      currentPrice: simulation.currentPrice || 0,
    };
  }, [simulation, convertPriceHistory]);

  // Ultra-optimized WebSocket message processing
  useEffect(() => {
    if (!lastMessage || !simulation) return;
    
    const messageStartTime = performance.now();
    const { simulationId, event } = lastMessage;
    
    if (simulationId !== simulation.id) return;
    
    // Increment message count for performance tracking
    setWsMessageCount(prev => prev + 1);
    
    const messageId = `${simulationId}-${event.type}-${event.timestamp}`;
    if (messageId === lastProcessedMessageRef.current) return;
    lastProcessedMessageRef.current = messageId;
    
    const { type, data } = event;
    
    // Start trade execution timing
    if (type === 'trade') {
      tradeStartTimeRef.current = performance.now();
    }
    
    // Batch the simulation update for better performance
    batchUpdate(() => {
      setSimulation(prev => {
        if (!prev) return prev;
        
        let updatedSim = { ...prev };
        
        switch (type) {
          case 'price_update':
            updatedSim = {
              ...updatedSim,
              currentPrice: data.price,
              orderBook: data.orderBook
            };
            break;
            
          case 'trade':
            // Ultra-fast trade processing
            const tradeProcessingTime = performance.now() - tradeStartTimeRef.current;
            trackTradeExecution(tradeProcessingTime);
            
            // Optimized trade array update
            const updatedTrades = [data, ...updatedSim.recentTrades.slice(0, 49)]; // Reduced from 99
            updatedSim = {
              ...updatedSim,
              recentTrades: updatedTrades
            };
            
            addDebugLog(`Trade executed in ${tradeProcessingTime.toFixed(2)}ms`);
            break;
            
          case 'position_open':
            updatedSim = {
              ...updatedSim,
              activePositions: [...updatedSim.activePositions, data]
            };
            break;
            
          case 'position_close':
            updatedSim = {
              ...updatedSim,
              activePositions: updatedSim.activePositions.filter(
                pos => pos.trader.walletAddress !== data.trader.walletAddress
              ),
              closedPositions: [...updatedSim.closedPositions, data]
            };
            break;
            
          default:
            break;
        }
        
        return updatedSim;
      });
    });
    
    // Track total message processing time
    const totalMessageTime = performance.now() - messageStartTime;
    if (totalMessageTime > 10) {
      addDebugLog(`Message processing took ${totalMessageTime.toFixed(2)}ms (above 10ms threshold)`);
    }
    
    // Update market condition less frequently for performance
    if (Math.random() < 0.1) { // Only 10% of the time
      const newCondition = determineMarketCondition(simulation);
      if (newCondition !== marketCondition) {
        setMarketCondition(newCondition);
        addDebugLog(`Market condition: ${newCondition}`);
      }
    }
    
  }, [lastMessage, simulation, marketCondition, determineMarketCondition, addDebugLog, batchUpdate, trackTradeExecution]);

  // Optimized speed change with immediate effect
  const handleSpeedChange = useCallback(async (speedOption: 'slow' | 'medium' | 'fast' | 'ludicrous') => {
    const speedMap = {
      'slow': 2,
      'medium': 3, 
      'fast': 6,
      'ludicrous': 10  // New ultra-fast mode
    };
    
    const speedValue = speedMap[speedOption];
    setSimulationSpeed(speedValue);
    
    // Enable high-frequency mode for ludicrous speed
    if (speedOption === 'ludicrous') {
      setIsHighFrequencyMode(true);
      addDebugLog("Ludicrous mode activated - High-frequency trading enabled");
    }
    
    if (simulation) {
      try {
        await SimulationApi.setSimulationSpeed(simulation.id, speedValue);
        addDebugLog(`Speed: ${speedOption} (${speedValue}x) - Latency optimized`);
      } catch (error) {
        console.error(`Failed to update simulation speed:`, error);
      }
    }
  }, [simulation, addDebugLog]);

  // Performance-optimized handlers
  const handleStartSimulation = useCallback(async () => {
    if (!simulation) return;
    
    const startTime = performance.now();
    try {
      await SimulationApi.startSimulation(simulation.id);
      setSimulation(prev => prev ? { ...prev, isRunning: true, isPaused: false } : prev);
      setPauseState(false); // Notify WebSocket
      
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      setAudioEnabled(true);
      const totalStartTime = performance.now() - startTime;
      addDebugLog(`Simulation started in ${totalStartTime.toFixed(2)}ms`);
    } catch (error) {
      console.error('Failed to start simulation:', error);
    }
  }, [simulation, simulationStartTime, addDebugLog, setPauseState]);

  const handlePauseSimulation = useCallback(async () => {
    if (!simulation) return;
    
    try {
      await SimulationApi.pauseSimulation(simulation.id);
      setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
      setPauseState(true); // Notify WebSocket
      addDebugLog("Simulation paused");
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    }
  }, [simulation, addDebugLog, setPauseState]);

  const handleResetSimulation = useCallback(async () => {
    if (!simulation) return;
    
    const resetStartTime = performance.now();
    try {
      await SimulationApi.resetSimulation(simulation.id);
      const response = await SimulationApi.getSimulation(simulation.id);
      
      if (response.data) {
        lastProcessedMessageRef.current = null;
        setSimulation(response.data);
        setMarketCondition('calm');
        setSimulationStartTime(null);
        setElapsedTime("00:00:00");
        setWsMessageCount(0);
        setAudioEnabled(false);
        
        // Reset performance stats
        setTradeExecutionTimes([]);
        setAverageExecutionTime(0);
        performanceStatsRef.current = {
          totalTrades: 0,
          fastTrades: 0,
          mediumTrades: 0,
          slowTrades: 0,
          averageLatency: 0
        };
        
        // Reset scenario state
        setCurrentScenario(null);
        setScenarioPhaseData(null);
        
        const resetTime = performance.now() - resetStartTime;
        addDebugLog(`Full reset completed in ${resetTime.toFixed(2)}ms`);
      }
    } catch (error) {
      console.error('Failed to reset simulation:', error);
    }
  }, [simulation, addDebugLog]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => !prev);
  }, []);

  const toggleDebugInfo = useCallback(() => {
    setShowDebugInfo(prev => !prev);
  }, []);

  const handleComponentError = useCallback((componentName: string, error: Error) => {
    addDebugLog(`Error in ${componentName}: ${error.message}`);
    console.error(`Error in ${componentName}:`, error);
  }, [addDebugLog]);

  // Loading states optimized for speed
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <div className="text-text-primary">
          <svg className="animate-spin h-12 w-12 mr-3 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="mt-4 block text-xl">Initializing realistic market simulation...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <div className="text-danger p-6 bg-surface rounded-lg shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-center text-xl">{error}</p>
        </div>
      </div>
    );
  }
  
  if (!simulation) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <div className="text-text-primary p-6 bg-surface rounded-lg shadow-lg">
          <p className="text-center text-xl">No simulation data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-background text-text-primary p-2 flex flex-col overflow-hidden">
      {/* Audio player */}
      <DynamicMusicPlayer 
        enabled={audioEnabled} 
        marketCondition={marketCondition}
        onToggle={toggleAudio}
      />
      
      {/* Header with ultra-low latency indicators */}
      <div className="flex flex-col mb-2 bg-surface rounded-md shadow-sm">
        <div className="flex justify-between items-center h-10 p-2">
          <div className="flex items-center">
            <h1 className="text-base font-bold mr-2">Realistic Market Simulation</h1>
            <div className="ml-2 text-xs bg-panel px-2 py-1 rounded">
              <span className="text-text-secondary mr-1">Price:</span>
              <span className="text-text-primary font-medium">${safeData.currentPrice.toFixed(2)}</span>
            </div>
            <div className={`ml-2 w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-success' : 'bg-danger'}`}></div>
            <span className="text-xs text-text-secondary">{isConnected ? 'Connected' : 'Disconnected'}</span>
            
            {/* Ultra-low latency indicator */}
            {isHighFrequencyMode && (
              <div className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded animate-pulse">
                HFT MODE
              </div>
            )}
            
            {/* Market scenario indicator */}
            {currentScenario && (
              <div className="ml-2 text-xs bg-purple-600 text-white px-2 py-1 rounded animate-pulse">
                📈 {currentScenario.name}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="text-xs bg-panel px-2 py-1 rounded">
              <span className="text-text-secondary">Time:</span>
              <span className="ml-1 font-mono text-text-primary">{elapsedTime}</span>
            </div>
            
            {/* Average execution time display */}
            <div className="text-xs bg-panel px-2 py-1 rounded">
              <span className="text-text-secondary">Avg Exec:</span>
              <span className={`ml-1 font-mono font-bold ${
                averageExecutionTime < 5 ? 'text-green-400' : 
                averageExecutionTime < 15 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {averageExecutionTime.toFixed(1)}ms
              </span>
            </div>
            
            <div className="cursor-pointer" onClick={toggleAudio}>
              {audioEnabled ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
              )}
            </div>
            
            <button 
              onClick={() => setShowPerformanceMonitor(!showPerformanceMonitor)}
              className={`text-xs px-2 py-0.5 rounded transition ${
                showPerformanceMonitor ? 'bg-blue-600 text-white' : 'bg-surface-variant text-text-muted hover:bg-panel'
              }`}
            >
              Perf
            </button>
            
            <button 
              onClick={() => setShowTransactionProcessor(!showTransactionProcessor)}
              className={`text-xs px-2 py-0.5 rounded transition ${
                showTransactionProcessor ? 'bg-green-600 text-white' : 'bg-surface-variant text-text-muted hover:bg-panel'
              }`}
            >
              TXN
            </button>
            
            {process.env.NODE_ENV !== 'production' && (
              <button 
                onClick={toggleDebugInfo}
                className="text-xs bg-surface-variant text-text-muted px-2 py-0.5 rounded"
              >
                {showDebugInfo ? 'Hide Debug' : 'Debug'}
              </button>
            )}
          </div>
        </div>
        
        {/* Controls with new Ludicrous speed */}
        <div className="flex justify-between items-center h-10 p-2 border-t border-border">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-text-secondary">Speed:</span>
            <div className="flex space-x-1">
              <button
                onClick={() => handleSpeedChange('slow')}
                className={`px-2 py-0.5 text-xs rounded transition ${
                  simulationSpeed === 2 ? 'bg-accent text-white' : 'bg-surface-variant text-text-muted hover:bg-panel'
                }`}
              >
                Slow
              </button>
              <button
                onClick={() => handleSpeedChange('medium')}
                className={`px-2 py-0.5 text-xs rounded transition ${
                  simulationSpeed === 3 ? 'bg-accent text-white' : 'bg-surface-variant text-text-muted hover:bg-panel'
                }`}
              >
                Medium
              </button>
              <button
                onClick={() => handleSpeedChange('fast')}
                className={`px-2 py-0.5 text-xs rounded transition ${
                  simulationSpeed === 6 ? 'bg-accent text-white' : 'bg-surface-variant text-text-muted hover:bg-panel'
                }`}
              >
                Fast
              </button>
              <button
                onClick={() => handleSpeedChange('ludicrous')}
                className={`px-2 py-0.5 text-xs rounded transition ${
                  simulationSpeed === 10 ? 'bg-red-600 text-white animate-pulse' : 'bg-red-500 text-white hover:bg-red-600'
                }`}
                title="Ultra-high frequency trading mode"
              >
                🚀 Ludicrous
              </button>
            </div>
            
            {/* Market condition indicator */}
            <div className="ml-4 flex items-center space-x-2">
              <span className="text-xs text-text-secondary">Market:</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                marketCondition === 'bullish' ? 'bg-green-600 text-white' :
                marketCondition === 'bearish' ? 'bg-red-600 text-white' :
                marketCondition === 'volatile' ? 'bg-orange-600 text-white' :
                marketCondition === 'crash' ? 'bg-red-800 text-white animate-pulse' :
                marketCondition === 'building' ? 'bg-blue-600 text-white' :
                'bg-gray-600 text-white'
              }`}>
                {marketCondition.toUpperCase()}
              </span>
            </div>
          </div>
          
          <div className="flex space-x-2">
            {!simulation.isRunning || simulation.isPaused ? (
              <button 
                onClick={handleStartSimulation}
                className="px-3 py-0.5 bg-accent text-white rounded hover:bg-accent-hover transition"
              >
                {simulation.isPaused ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button 
                onClick={handlePauseSimulation} 
                className="px-3 py-0.5 bg-warning text-text-primary rounded hover:bg-warning-hover transition"
              >
                Pause
              </button>
            )}
            
            <button 
              onClick={handleResetSimulation}
              className="px-3 py-0.5 bg-danger text-white rounded hover:bg-danger-hover transition"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
      
      {/* Main dashboard grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '3fr 9fr', 
        gridTemplateRows: '1fr 1fr', 
        gap: '8px',
        height: 'calc(100vh - 85px)',
        overflow: 'hidden'
      }}>
        <div style={{ gridColumn: '1 / 2', gridRow: '1 / 2', overflow: 'hidden' }}>
          <ErrorBoundary
            fallback={<ErrorFallback componentName="Order Book" />}
            onError={(error) => handleComponentError("Order Book", error)}
          >
            <OrderBookComponent orderBook={safeData.orderBook} />
          </ErrorBoundary>
        </div>
        
        <div style={{ gridColumn: '1 / 2', gridRow: '2 / 3', overflow: 'hidden' }}>
          <ErrorBoundary
            fallback={<ErrorFallback componentName="Recent Trades" />}
            onError={(error) => handleComponentError("Recent Trades", error)}
          >
            <RecentTrades trades={safeData.recentTrades} />
          </ErrorBoundary>
        </div>
        
        <div style={{ gridColumn: '2 / 3', gridRow: '1 / 2', position: 'relative', overflow: 'hidden' }} className="bg-[#131722] rounded-lg shadow-lg">
          <div className="h-full" style={{ position: 'relative' }}>
            <ErrorBoundary
              fallback={<ErrorFallback componentName="Price Chart" />}
              onError={(error) => handleComponentError("Price Chart", error)}
            >
              <PriceChart 
                priceHistory={safeData.priceHistory} 
                currentPrice={safeData.currentPrice} 
                trades={safeData.recentTrades}
                scenarioData={scenarioPhaseData}
              />
            </ErrorBoundary>
          </div>
        </div>
        
        <div style={{ gridColumn: '2 / 3', gridRow: '2 / 3', overflow: 'hidden' }}>
          <ErrorBoundary
            fallback={<ErrorFallback componentName="Participants Overview" />}
            onError={(error) => handleComponentError("Participants Overview", error)}
          >
            <ParticipantsOverview 
              traders={safeData.traderRankings} 
              activePositions={safeData.activePositions}
              currentPrice={safeData.currentPrice}
              scenarioModifiers={currentScenario?.traderBehaviorModifiers}
            />
          </ErrorBoundary>
        </div>
      </div>
      
      {/* Performance Monitor */}
      <PerformanceMonitor 
        isVisible={showPerformanceMonitor}
        onToggle={() => setShowPerformanceMonitor(!showPerformanceMonitor)}
        wsMessageCount={wsMessageCount}
        tradeCount={safeData.recentTrades.length}
      />

      {/* Transaction Processor */}
      <TransactionProcessor 
        isVisible={showTransactionProcessor}
        onToggle={() => setShowTransactionProcessor(!showTransactionProcessor)}
        simulationRunning={simulation?.isRunning && !simulation?.isPaused}
      />

      {/* Market Scenario Engine */}
      <MarketScenarioEngine
        isActive={scenarioEngineActive}
        onScenarioStart={handleScenarioStart}
        onScenarioEnd={handleScenarioEnd}
        onScenarioUpdate={handleScenarioUpdate}
        simulationRunning={simulation?.isRunning && !simulation?.isPaused}
      />
      
      {/* Debug log with performance timing */}
      {showDebugInfo && process.env.NODE_ENV !== 'production' && (
        <div className="absolute bottom-2 right-2 z-20 bg-black bg-opacity-90 text-white p-3 rounded text-xs max-w-md max-h-40 overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">Realistic Market Debug</span>
            <div className="flex space-x-2 text-[10px]">
              <span className="text-green-400">Fast: {performanceStatsRef.current.fastTrades}</span>
              <span className="text-yellow-400">Med: {performanceStatsRef.current.mediumTrades}</span>
              <span className="text-red-400">Slow: {performanceStatsRef.current.slowTrades}</span>
              {currentScenario && (
                <span className="text-purple-400">Scenario: {currentScenario.name}</span>
              )}
            </div>
          </div>
          <div className="font-mono whitespace-pre text-[10px]">
            {debugInfo.map((log, i) => (
              <div key={i} className={i === debugInfo.length - 1 ? 'text-green-300' : ''}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Error boundary components remain the same
const ErrorFallback: React.FC<{ componentName: string }> = ({ componentName }) => {
  return (
    <div className="flex items-center justify-center h-full w-full bg-surface rounded-lg p-4">
      <div className="text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-danger mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-danger font-medium">{componentName} Error</p>
        <p className="text-text-secondary text-xs mt-1">There was an error rendering this component</p>
      </div>
    </div>
  );
};

class ErrorBoundary extends React.Component<{
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError?: (error: Error) => void;
}, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Component error:", error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    
    return this.props.children;
  }
}

export default Dashboard;