// frontend/src/components/Dashboard.tsx - Complete version with Ultra High Performance
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
  timestamp?: number;
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
  const [scenarioEngineActive] = useState<boolean>(true);
  const [currentScenario, setCurrentScenario] = useState<MarketScenario | null>(null);
  const [scenarioPhaseData, setScenarioPhaseData] = useState<any>(null);
  
  // Dynamic chart view state
  const [dynamicChartView, setDynamicChartView] = useState<boolean>(true);
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN/USDT');
  
  // Performance timing refs
  const tradeStartTimeRef = useRef<number>(0);
  const updateBatchRef = useRef<any[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL FIX: Add message queue and batch processing
  const messageQueueRef = useRef<any[]>([]);
  const processingMessageBatch = useRef<boolean>(false);
  const batchProcessIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL FIX: Limit data retention to prevent memory leaks
  const MAX_PRICE_HISTORY = 1000; // Keep only last 1000 candles
  const MAX_RECENT_TRADES = 100; // Keep only last 100 trades
  const MAX_DEBUG_LOGS = 20; // Keep only last 20 debug logs
  
  // Optimized refs for minimal re-renders
  const lastProcessedMessageRef = useRef<string | null>(null);
  const performanceStatsRef = useRef({
    totalTrades: 0,
    fastTrades: 0, // < 5ms
    mediumTrades: 0, // 5-15ms
    slowTrades: 0, // > 15ms
    averageLatency: 0,
    droppedMessages: 0,
    batchesProcessed: 0
  });

  const { isConnected, lastMessage, setPauseState } = useWebSocket(
    simulation?.isRunning ? simulation?.id : undefined, 
    simulation?.isPaused
  );

  // Ultra-fast debug logging with circular buffer
  const addDebugLog = useCallback((message: string) => {
    setDebugInfo(prev => {
      const newLogs = [...prev.slice(-MAX_DEBUG_LOGS + 1), `${Date.now()}: ${message}`];
      return newLogs;
    });
    // Console logging is optional in high-frequency mode
    if (!isHighFrequencyMode) {
      console.log(message);
    }
  }, [isHighFrequencyMode]);

  // CRITICAL FIX: Enhanced batch update mechanism with Web Workers consideration
  const batchUpdate = useCallback((updateFn: () => void) => {
    updateBatchRef.current.push(updateFn);
    
    if (!batchTimeoutRef.current) {
      batchTimeoutRef.current = setTimeout(() => {
        const startTime = performance.now();
        
        // Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
          // Execute all batched updates in a single frame
          updateBatchRef.current.forEach(fn => fn());
          updateBatchRef.current = [];
          batchTimeoutRef.current = null;
          
          const executionTime = performance.now() - startTime;
          
          // Track batch execution performance
          if (executionTime > 16.67) { // More than one frame (60fps)
            addDebugLog(`Batch update took ${executionTime.toFixed(2)}ms (above frame budget)`);
          }
        });
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

  // CRITICAL FIX: Process message queue in batches
  const processMessageBatch = useCallback(() => {
    if (processingMessageBatch.current || messageQueueRef.current.length === 0) {
      return;
    }
    
    processingMessageBatch.current = true;
    const startTime = performance.now();
    
    // Process up to 50 messages per batch in HFT/Quantum mode
    const batchSize = isHighFrequencyMode ? 50 : 20;
    const messagesToProcess = messageQueueRef.current.splice(0, batchSize);
    
    // If queue is getting too large, drop old messages
    if (messageQueueRef.current.length > 1000) {
      const dropped = messageQueueRef.current.length - 500;
      messageQueueRef.current = messageQueueRef.current.slice(-500);
      performanceStatsRef.current.droppedMessages += dropped;
      addDebugLog(`Dropped ${dropped} messages to prevent overflow`);
    }
    
    batchUpdate(() => {
      setSimulation(prev => {
        if (!prev) return prev;
        
        let updatedSim = { ...prev };
        
        // Process all messages in batch
        messagesToProcess.forEach(message => {
          const { event } = message;
          const { type, data } = event;
          
          switch (type) {
            case 'price_update':
              // CRITICAL: Limit price history size
              const newPriceHistory = data.priceHistory || updatedSim.priceHistory;
              if (newPriceHistory.length > MAX_PRICE_HISTORY) {
                data.priceHistory = newPriceHistory.slice(-MAX_PRICE_HISTORY);
              }
              
              updatedSim = {
                ...updatedSim,
                currentPrice: data.price,
                orderBook: data.orderBook,
                priceHistory: data.priceHistory || updatedSim.priceHistory
              };
              break;
              
            case 'trade':
              // CRITICAL: Limit recent trades size
              const updatedTrades = [data, ...updatedSim.recentTrades.slice(0, MAX_RECENT_TRADES - 1)];
              updatedSim = {
                ...updatedSim,
                recentTrades: updatedTrades
              };
              
              // Track trade execution time
              if (tradeStartTimeRef.current > 0) {
                const executionTime = performance.now() - tradeStartTimeRef.current;
                trackTradeExecution(executionTime);
                tradeStartTimeRef.current = 0;
              }
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
                // Limit closed positions to prevent memory leak
                closedPositions: [...updatedSim.closedPositions.slice(-99), data]
              };
              break;
              
            case 'simulation_status':
              if (data.isRunning !== undefined) {
                updatedSim.isRunning = data.isRunning;
              }
              if (data.isPaused !== undefined) {
                updatedSim.isPaused = data.isPaused;
              }
              break;
              
            case 'batch_update':
              // Handle batched updates from server
              if (data.updates) {
                if (data.updates.price) {
                  updatedSim.currentPrice = data.updates.price.price;
                  updatedSim.orderBook = data.updates.price.orderBook;
                  if (data.updates.price.priceHistory) {
                    updatedSim.priceHistory = data.updates.price.priceHistory.slice(-MAX_PRICE_HISTORY);
                  }
                }
                if (data.updates.trades) {
                  const newTrades = [...data.updates.trades, ...updatedSim.recentTrades];
                  updatedSim.recentTrades = newTrades.slice(0, MAX_RECENT_TRADES);
                }
              }
              break;
              
            default:
              break;
          }
        });
        
        return updatedSim;
      });
    });
    
    const processingTime = performance.now() - startTime;
    performanceStatsRef.current.batchesProcessed++;
    
    if (processingTime > 10) {
      addDebugLog(`Batch processing (${messagesToProcess.length} msgs) took ${processingTime.toFixed(2)}ms`);
    }
    
    processingMessageBatch.current = false;
  }, [isHighFrequencyMode, batchUpdate, addDebugLog, trackTradeExecution]);

  // Market Scenario Engine callbacks
  const handleScenarioStart = useCallback(async (scenario: MarketScenario) => {
    if (!simulation) return;
    
    setCurrentScenario(scenario);
    addDebugLog(`Market scenario started: ${scenario.name}`);
    
    try {
      const response = await fetch(`/api/simulation/${simulation.id}/scenario/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifiers: scenario.traderBehaviorModifiers
        })
      });
      
      if (!response.ok) {
        addDebugLog(`Failed to apply scenario modifiers: ${response.statusText}`);
      }
    } catch (error) {
      addDebugLog(`Error applying scenario: ${error}`);
    }
  }, [simulation, addDebugLog]);

  const handleScenarioEnd = useCallback(async () => {
    if (!simulation) return;
    
    setCurrentScenario(null);
    setScenarioPhaseData(null);
    addDebugLog('Market scenario ended');
    
    try {
      await fetch(`/api/simulation/${simulation.id}/scenario/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      addDebugLog(`Error ending scenario: ${error}`);
    }
  }, [simulation, addDebugLog]);

  const handleScenarioUpdate = useCallback(async (phase: any, progress: number) => {
    if (!simulation) return;
    
    setScenarioPhaseData({ phase, progress });
    
    if (phase.marketCondition !== marketCondition) {
      setMarketCondition(phase.marketCondition);
    }
    
    try {
      await fetch(`/api/simulation/${simulation.id}/scenario/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: phase,
          progress: progress
        })
      });
    } catch (error) {
      addDebugLog(`Error updating scenario phase: ${error}`);
    }
  }, [simulation, marketCondition, addDebugLog]);

  // Determine token symbol based on price
  const determineTokenSymbol = useCallback((price: number): string => {
    if (price < 0.01) return 'MEME/USDT';
    if (price < 1) return 'SHIB/USDT';
    if (price < 10) return 'DOGE/USDT';
    if (price < 100) return 'MATIC/USDT';
    if (price < 1000) return 'ETH/USDT';
    return 'BTC/USDT';
  }, []);

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
            
            const initialPrice = simulationResponse.data.currentPrice || 100;
            setTokenSymbol(determineTokenSymbol(initialPrice));
            
            const totalInitTime = performance.now() - initStartTime;
            addDebugLog(`Full initialization completed in ${totalInitTime.toFixed(2)}ms`);
            
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
  }, []);

  // CRITICAL FIX: Start batch processing interval
  useEffect(() => {
    if (simulation?.isRunning && !simulation?.isPaused) {
      // Process messages more frequently in HFT/Quantum modes
      const interval = simulationSpeed >= 50 ? 16 : simulationSpeed >= 10 ? 50 : 100;
      
      batchProcessIntervalRef.current = setInterval(() => {
        processMessageBatch();
      }, interval);
    } else {
      if (batchProcessIntervalRef.current) {
        clearInterval(batchProcessIntervalRef.current);
        batchProcessIntervalRef.current = null;
      }
    }
    
    return () => {
      if (batchProcessIntervalRef.current) {
        clearInterval(batchProcessIntervalRef.current);
      }
    };
  }, [simulation?.isRunning, simulation?.isPaused, simulationSpeed, processMessageBatch]);

  // Enhanced market condition detection with scenario integration
  const determineMarketCondition = useCallback((simulation: Simulation): 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash' => {
    if (currentScenario && scenarioPhaseData) {
      return scenarioPhaseData.phase.marketCondition;
    }

    if (!simulation?.priceHistory?.length) return 'calm';
    
    const recent = simulation.priceHistory.slice(-10);
    const firstPrice = recent[0].close;
    const lastPrice = simulation.currentPrice;
    const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    
    let volatility = 0;
    for (let i = 1; i < recent.length; i++) {
      const change = Math.abs((recent[i].close - recent[i-1].close) / recent[i-1].close);
      volatility += change;
    }
    
    volatility = (volatility / (recent.length - 1)) * 100;
    
    if (volatility > 4) {
      if (percentChange < -8) return 'crash';
      if (percentChange > 8) return 'volatile';
      return 'volatile';
    }
    
    if (percentChange > 5) return 'bullish';
    if (percentChange < -3) return 'bearish';
    
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
    
    return priceHistory.map(point => ({
      time: point.timestamp,
      timestamp: point.timestamp,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume
    }));
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
    
    const sortedPriceHistory = simulation.priceHistory ? 
      [...simulation.priceHistory].sort((a, b) => a.timestamp - b.timestamp) : [];
    
    const sortedRecentTrades = simulation.recentTrades || [];
    
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

  // CRITICAL FIX: Queue messages instead of processing immediately
  useEffect(() => {
    if (!lastMessage || !simulation) return;
    
    const { simulationId, event } = lastMessage;
    
    if (simulationId !== simulation.id) return;
    
    // Queue the message for batch processing
    messageQueueRef.current.push(lastMessage);
    
    // Increment message count for performance tracking
    setWsMessageCount(prev => prev + 1);
    
    // Track trade execution if it's a trade
    if (event.type === 'trade') {
      tradeStartTimeRef.current = performance.now();
    }
    
    // Update market condition less frequently
    if (Math.random() < 0.05) { // Only 5% of the time
      const newCondition = determineMarketCondition(simulation);
      if (newCondition !== marketCondition) {
        setMarketCondition(newCondition);
        addDebugLog(`Market condition: ${newCondition}`);
      }
    }
    
  }, [lastMessage, simulation, marketCondition, determineMarketCondition, addDebugLog]);

  // Updated handleSpeedChange method with Ultra and Quantum modes
  const handleSpeedChange = useCallback(async (speedOption: 'slow' | 'medium' | 'fast' | 'ludicrous' | 'ultra' | 'quantum') => {
    const speedMap = {
      'slow': 2,
      'medium': 3, 
      'fast': 6,
      'ludicrous': 10,
      'ultra': 50,
      'quantum': 100
    };
    
    const speedValue = speedMap[speedOption];
    setSimulationSpeed(speedValue);
    
    if (speedOption === 'ultra' || speedOption === 'quantum') {
      setIsHighFrequencyMode(true);
      addDebugLog(`${speedOption.toUpperCase()} MODE ACTIVATED - ${speedValue}x speed`);
      
      if (simulation) {
        try {
          await fetch(`/api/simulation/${simulation.id}/enable-hft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Failed to enable HFT mode:', error);
        }
      }
    } else if (speedOption === 'ludicrous') {
      setIsHighFrequencyMode(true);
      addDebugLog("Ludicrous mode activated - High-frequency trading enabled");
    }
    
    if (simulation) {
      try {
        await SimulationApi.setSimulationSpeed(simulation.id, speedValue);
        addDebugLog(`Speed: ${speedOption} (${speedValue}x) - ${speedValue > 10 ? 'HFT' : 'Normal'} mode`);
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
      setPauseState(false);
      
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
      setPauseState(true);
      addDebugLog("Simulation paused");
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    }
  }, [simulation, addDebugLog, setPauseState]);

  const handleResetSimulation = useCallback(async () => {
    if (!simulation) return;
    
    const resetStartTime = performance.now();
    try {
      // Clear message queue
      messageQueueRef.current = [];
      
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
        
        const resetPrice = response.data.currentPrice || 100;
        setTokenSymbol(determineTokenSymbol(resetPrice));
        
        setTradeExecutionTimes([]);
        setAverageExecutionTime(0);
        performanceStatsRef.current = {
          totalTrades: 0,
          fastTrades: 0,
          mediumTrades: 0,
          slowTrades: 0,
          averageLatency: 0,
          droppedMessages: 0,
          batchesProcessed: 0
        };
        
        setCurrentScenario(null);
        setScenarioPhaseData(null);
        
        const resetTime = performance.now() - resetStartTime;
        addDebugLog(`Full reset completed in ${resetTime.toFixed(2)}ms`);
      }
    } catch (error) {
      console.error('Failed to reset simulation:', error);
    }
  }, [simulation, addDebugLog, determineTokenSymbol]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => !prev);
  }, []);

  const toggleDebugInfo = useCallback(() => {
    setShowDebugInfo(prev => !prev);
  }, []);

  const toggleDynamicView = useCallback(() => {
    setDynamicChartView(prev => !prev);
    addDebugLog(`Dynamic chart view: ${!dynamicChartView ? 'enabled' : 'disabled'}`);
  }, [dynamicChartView, addDebugLog]);

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
          <span className="mt-4 block text-xl">Initializing ultra-high-performance simulation...</span>
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
            <h1 className="text-base font-bold mr-2">Market Simulation</h1>
            <div className="ml-2 text-xs bg-panel px-2 py-1 rounded">
              <span className="text-text-secondary mr-1">{tokenSymbol}:</span>
              <span className="text-text-primary font-medium">${safeData.currentPrice < 1 ? safeData.currentPrice.toFixed(6) : safeData.currentPrice.toFixed(2)}</span>
            </div>
            <div className={`ml-2 w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-success' : 'bg-danger'}`}></div>
            <span className="text-xs text-text-secondary">{isConnected ? 'Connected' : 'Disconnected'}</span>
            
            {/* Ultra-low latency indicator */}
            {isHighFrequencyMode && (
              <div className="ml-2 text-xs text-green-400 px-2 py-1">
                HFT MODE
              </div>
            )}
            
            {/* Market scenario indicator */}
            {currentScenario && (
              <div className="ml-2 text-xs text-purple-400 px-2 py-1">
                📈 {currentScenario.name}
              </div>
            )}
            
            {/* Queue size indicator */}
            {messageQueueRef.current.length > 0 && (
              <div className="ml-2 text-xs text-yellow-400 px-2 py-1">
                Queue: {messageQueueRef.current.length}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="text-xs bg-panel px-2 py-1 rounded">
              <span className="text-text-secondary">Time:</span>
              <span className="ml-1 font-mono text-text-primary">{elapsedTime}</span>
            </div>
            
            {/* Average execution time display */}
            {tradeExecutionTimes.length > 0 && (
              <div className="text-xs bg-panel px-2 py-1 rounded">
                <span className="text-text-secondary">Avg Exec:</span>
                <span className={`ml-1 font-mono font-bold ${
                  averageExecutionTime < 5 ? 'text-green-400' : 
                  averageExecutionTime < 15 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {averageExecutionTime.toFixed(1)}ms
                </span>
              </div>
            )}
            
            {/* Performance stats */}
            <div className="text-xs bg-panel px-2 py-1 rounded">
              <span className="text-text-secondary">Batches:</span>
              <span className="ml-1 font-mono text-text-primary">{performanceStatsRef.current.batchesProcessed}</span>
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
              onClick={toggleDynamicView}
              className={`text-xs px-2 py-0.5 transition ${
                dynamicChartView ? 'text-purple-400' : 'text-text-muted hover:text-text-secondary'
              }`}
              title="Toggle dynamic chart view"
            >
              Dynamic
            </button>
            
            <button 
              onClick={() => setShowPerformanceMonitor(!showPerformanceMonitor)}
              className={`text-xs px-2 py-0.5 transition ${
                showPerformanceMonitor ? 'text-blue-400' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Perf
            </button>
            
            <button 
              onClick={() => setShowTransactionProcessor(!showTransactionProcessor)}
              className={`text-xs px-2 py-0.5 transition ${
                showTransactionProcessor ? 'text-green-400' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              TXN
            </button>
            
            {process.env.NODE_ENV !== 'production' && (
              <button 
                onClick={toggleDebugInfo}
                className="text-xs text-text-muted hover:text-text-secondary px-2 py-0.5 transition"
              >
                {showDebugInfo ? 'Hide Debug' : 'Debug'}
              </button>
            )}
          </div>
        </div>
        
        {/* Controls with Ultra and Quantum speeds */}
        <div className="flex justify-between items-center h-10 p-2 border-t border-border">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-text-secondary">Speed:</span>
            <div className="flex space-x-1">
              <button
                onClick={() => handleSpeedChange('slow')}
                className={`px-2 py-0.5 text-xs transition ${
                  simulationSpeed === 2 ? 'text-accent font-semibold' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Slow
              </button>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => handleSpeedChange('medium')}
                className={`px-2 py-0.5 text-xs transition ${
                  simulationSpeed === 3 ? 'text-accent font-semibold' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Medium
              </button>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => handleSpeedChange('fast')}
                className={`px-2 py-0.5 text-xs transition ${
                  simulationSpeed === 6 ? 'text-accent font-semibold' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Fast
              </button>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => handleSpeedChange('ludicrous')}
                className={`px-2 py-0.5 text-xs transition ${
                  simulationSpeed === 10 ? 'text-accent font-semibold' : 'text-text-muted hover:text-text-secondary'
                }`}
                title="Ultra-high frequency trading mode"
              >
                Ludicrous
              </button>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => handleSpeedChange('ultra')}
                className={`px-2 py-0.5 text-xs transition ${
                  simulationSpeed === 50 ? 'text-accent font-semibold' : 'text-text-muted hover:text-text-secondary'
                }`}
                title="50x speed - Ultra mode"
              >
                Ultra
              </button>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => handleSpeedChange('quantum')}
                className={`px-2 py-0.5 text-xs transition ${
                  simulationSpeed === 100 ? 'text-accent font-semibold' : 'text-text-muted hover:text-text-secondary'
                }`}
                title="100x speed - Quantum mode"
              >
                Quantum
              </button>
            </div>
            
            {/* Market condition indicator */}
            <div className="ml-4 flex items-center space-x-2">
              <span className="text-xs text-text-secondary">Market:</span>
              <span className={`text-xs font-medium ${
                marketCondition === 'bullish' ? 'text-green-400' :
                marketCondition === 'bearish' ? 'text-red-400' :
                marketCondition === 'volatile' ? 'text-orange-400' :
                marketCondition === 'crash' ? 'text-red-600' :
                marketCondition === 'building' ? 'text-blue-400' :
                'text-gray-400'
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
      
      {/* Main dashboard grid - Updated with larger price chart */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '3fr 9fr', 
        gridTemplateRows: '3fr 2fr', // Changed from '2fr 3fr' to make chart taller
        gap: '8px',
        height: 'calc(100vh - 85px)',
        overflow: 'hidden'
      }}>
        {/* Left column container with its own grid */}
        <div style={{ 
          gridColumn: '1 / 2', 
          gridRow: '1 / 3', 
          display: 'grid',
          gridTemplateRows: '3fr 1fr',
          gap: '8px',
          overflow: 'hidden'
        }}>
          <div style={{ overflow: 'hidden' }}>
            <ErrorBoundary
              fallback={<ErrorFallback componentName="Order Book" />}
              onError={(error) => handleComponentError("Order Book", error)}
            >
              <OrderBookComponent orderBook={safeData.orderBook} />
            </ErrorBoundary>
          </div>
          
          <div style={{ overflow: 'hidden' }}>
            <ErrorBoundary
              fallback={<ErrorFallback componentName="Recent Trades" />}
              onError={(error) => handleComponentError("Recent Trades", error)}
            >
              <RecentTrades trades={safeData.recentTrades} />
            </ErrorBoundary>
          </div>
        </div>
        
        <div style={{ 
          gridColumn: '2 / 3', 
          gridRow: '1 / 2', 
          position: 'relative', 
          overflow: 'hidden'
        }} className="bg-[#0B1426] rounded-lg shadow-lg">
          <div className="h-full w-full" style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0 
          }}>
            <ErrorBoundary
              fallback={<ErrorFallback componentName="Price Chart" />}
              onError={(error) => handleComponentError("Price Chart", error)}
            >
              <PriceChart 
                priceHistory={safeData.priceHistory} 
                currentPrice={safeData.currentPrice} 
                trades={safeData.recentTrades}
                scenarioData={scenarioPhaseData}
                symbol={tokenSymbol}
                dynamicView={dynamicChartView}
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
        queueSize={messageQueueRef.current.length}
        droppedMessages={performanceStatsRef.current.droppedMessages}
        batchesProcessed={performanceStatsRef.current.batchesProcessed}
        isHighFrequencyMode={isHighFrequencyMode}
        simulationSpeed={simulationSpeed}
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
            <span className="font-bold">Ultra Performance Debug</span>
            <div className="flex space-x-2 text-[10px]">
              <span className="text-green-400">Fast: {performanceStatsRef.current.fastTrades}</span>
              <span className="text-yellow-400">Med: {performanceStatsRef.current.mediumTrades}</span>
              <span className="text-red-400">Slow: {performanceStatsRef.current.slowTrades}</span>
              <span className="text-orange-400">Dropped: {performanceStatsRef.current.droppedMessages}</span>
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