// frontend/src/components/Dashboard.tsx - COMPLETE FIXED VERSION WITH PROPER API USAGE
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SimulationApi } from '../services/api';
import { useWebSocket } from '../services/websocket';
import { Simulation, PricePoint as SimulationPricePoint } from '../types';
import PriceChart from './PriceChart';
import OrderBook from './OrderBook';
import RecentTrades from './RecentTrades';
import ParticipantsOverview from './ParticipantsOverview';
import DynamicMusicPlayer from './DynamicMusicPlayer';
import PerformanceMonitor from './PerformanceMonitor';
import TransactionProcessor from './TransactionProcessor';

// Type adapter for chart data
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
  // Core simulation state
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [marketCondition, setMarketCondition] = useState<'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash'>('calm');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [simulationStartTime, setSimulationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false);
  
  // Performance monitoring state
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState<boolean>(false);
  const [showTransactionProcessor, setShowTransactionProcessor] = useState<boolean>(false);
  const [wsMessageCount, setWsMessageCount] = useState<number>(0);
  
  // Market scenario state
  const [currentScenario, setCurrentScenario] = useState<any | null>(null);
  const [scenarioPhaseData, setScenarioPhaseData] = useState<any>(null);
  
  // Dynamic chart view state
  const [dynamicChartView, setDynamicChartView] = useState<boolean>(true);
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN/USDT');
  
  // Real-time data state - BATCHED UPDATES (React 18+ automatic batching)
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [orderBook, setOrderBook] = useState<any>({ bids: [], asks: [], lastUpdateTime: Date.now() });
  const [priceHistory, setPriceHistory] = useState<SimulationPricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<any[]>([]);
  const [traderRankings, setTraderRankings] = useState<any[]>([]);
  const [totalTradesProcessed, setTotalTradesProcessed] = useState<number>(0);
  
  // Performance tracking
  const [tradeExecutionTimes, setTradeExecutionTimes] = useState<number[]>([]);
  const [averageExecutionTime, setAverageExecutionTime] = useState<number>(0);
  const [isHighFrequencyMode, setIsHighFrequencyMode] = useState<boolean>(false);
  
  // CRITICAL FIX: Enhanced WebSocket ready state tracking with registration status
  const [isWebSocketReady, setIsWebSocketReady] = useState<boolean>(false);
  const [simulationRegistrationStatus, setSimulationRegistrationStatus] = useState<'creating' | 'pending' | 'ready' | 'error'>('creating');
  const [initializationStep, setInitializationStep] = useState<string>('Starting...');
  
  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<boolean>(false);
  
  // CRITICAL FIX: Refs to prevent infinite loops
  const lastMessageProcessedRef = useRef<string>('');
  const marketConditionUpdateRef = useRef<number>(0);
  const debugLogCountRef = useRef<number>(0);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Constants
  const MAX_PRICE_HISTORY = 1000;
  const MAX_RECENT_TRADES = 1000;

  // Define speed mapping
  const speedMap = {
    'slow': 2,
    'medium': 3, 
    'fast': 6,
    'ludicrous': 10,
    'ultra': 50,
    'quantum': 100
  } as const;

  // CRITICAL FIX: Use WebSocket with proper ready state management
  const { isConnected, lastMessage, setPauseState, connectionError, messageStats } = useWebSocket(
    isWebSocketReady && simulationRegistrationStatus === 'ready' ? simulationId || undefined : undefined,
    simulation?.isPaused
  );

  // CRITICAL FIX: Stable debug logging with memoization
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[Dashboard ${timestamp}] ${message}`);
    debugLogCountRef.current++;
  }, []);

  // CRITICAL FIX: Memoized market condition detector
  const determineMarketCondition = useCallback((): 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash' => {
    if (!priceHistory.length) return 'calm';
    
    const recent = priceHistory.slice(-10);
    if (recent.length < 2) return 'calm';
    
    const firstPrice = recent[0].close;
    const lastPrice = currentPrice || recent[recent.length - 1].close;
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
    
    return 'calm';
  }, [priceHistory, currentPrice]);

  // CRITICAL FIX: Optimized state update function with React 18+ automatic batching
  const updateSimulationState = useCallback((data: any, eventType: string) => {
    console.log(`📊 State update for ${eventType}:`, {
      hasPrice: data.currentPrice !== undefined,
      hasOrderBook: !!data.orderBook,
      hasPriceHistory: !!data.priceHistory,
      hasRecentTrades: !!data.recentTrades,
      priceHistoryLength: data.priceHistory?.length || 0
    });

    // React 18+ automatically batches these state updates
    if (data.currentPrice !== undefined) {
      setCurrentPrice(data.currentPrice);
    }
    
    if (data.orderBook) {
      setOrderBook(data.orderBook);
    }
    
    if (data.priceHistory && Array.isArray(data.priceHistory)) {
      setPriceHistory(data.priceHistory);
    }
    
    if (data.recentTrades && Array.isArray(data.recentTrades)) {
      setRecentTrades(data.recentTrades.slice(0, MAX_RECENT_TRADES));
    }
    
    if (data.activePositions) {
      setActivePositions(data.activePositions);
    }
    
    if (data.traderRankings) {
      setTraderRankings(data.traderRankings);
    }
    
    if (data.totalTradesProcessed !== undefined) {
      setTotalTradesProcessed(data.totalTradesProcessed);
    }
    
    // Update simulation object if needed - React 18+ will batch this too
    if (simulation) {
      setSimulation(prev => prev ? {
        ...prev,
        isRunning: data.isRunning !== undefined ? data.isRunning : prev.isRunning,
        isPaused: data.isPaused !== undefined ? data.isPaused : prev.isPaused,
        currentPrice: data.currentPrice !== undefined ? data.currentPrice : prev.currentPrice,
        priceHistory: data.priceHistory || prev.priceHistory,
        orderBook: data.orderBook || prev.orderBook,
        recentTrades: data.recentTrades || prev.recentTrades,
        activePositions: data.activePositions || prev.activePositions,
        traderRankings: data.traderRankings || prev.traderRankings
      } : prev);
    }
  }, [simulation]);

  // CRITICAL FIX: Throttled market condition updates with debouncing
  const updateMarketCondition = useCallback(() => {
    const now = Date.now();
    
    // Throttle to max once per 2 seconds
    if (now - marketConditionUpdateRef.current < 2000) {
      return;
    }
    
    // Clear any pending timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Debounce the update
    updateTimeoutRef.current = setTimeout(() => {
      marketConditionUpdateRef.current = now;
      const newCondition = determineMarketCondition();
      
      if (newCondition !== marketCondition) {
        setMarketCondition(newCondition);
        addDebugLog(`Market condition changed: ${marketCondition} → ${newCondition}`);
      }
    }, 100); // 100ms debounce
    
  }, [determineMarketCondition, marketCondition, addDebugLog]);

  // CRITICAL FIX: Process WebSocket messages - FIXED INFINITE LOOP
  useEffect(() => {
    if (!lastMessage) return;
    
    const { simulationId: msgSimId, event } = lastMessage;
    
    // Create unique message ID to prevent duplicate processing
    const messageId = `${msgSimId}-${event.type}-${event.timestamp}`;
    if (lastMessageProcessedRef.current === messageId) {
      console.log(`⏭️ Skipping duplicate message: ${messageId}`);
      return;
    }
    lastMessageProcessedRef.current = messageId;
    
    // Skip if not for our simulation
    if (simulationId && msgSimId !== simulationId) {
      addDebugLog(`Skipping message for different simulation: ${msgSimId}`);
      return;
    }
    
    // If we don't have a simulation yet, still process simulation_state messages
    if (!simulation && event.type !== 'simulation_state') {
      addDebugLog(`No simulation yet, skipping ${event.type} message`);
      return;
    }
    
    const { type, data } = event;
    
    addDebugLog(`Processing ${type} event (ID: ${messageId})`);
    setWsMessageCount(prev => prev + 1);
    
    switch (type) {
      case 'simulation_state':
        if (data) {
          addDebugLog(`Loading initial state: ${data.recentTrades?.length || 0} trades, price: $${data.currentPrice}, candles: ${data.candleCount || 0}`);
          updateSimulationState(data, 'simulation_state');
          
          // Update registration status based on received data
          if (data.registrationStatus === 'ready') {
            setSimulationRegistrationStatus('ready');
            addDebugLog('Simulation confirmed ready by backend');
          }
        }
        break;
        
      case 'price_update':
        if (data) {
          console.log('Price update received:', {
            price: data.price,
            hasOrderBook: !!data.orderBook,
            hasPriceHistory: !!data.priceHistory,
            recentTradesCount: data.recentTrades?.length,
            totalProcessed: data.totalTradesProcessed
          });
          updateSimulationState(data, 'price_update');
        }
        break;
        
      case 'trade':
      case 'processed_trade':
        if (data) {
          setRecentTrades(prev => {
            const exists = prev.some(t => t.id === data.id);
            if (exists) return prev;
            
            const updated = [data, ...prev].slice(0, MAX_RECENT_TRADES);
            addDebugLog(`New trade: ${data.action} ${data.quantity} @ $${data.price}`);
            return updated;
          });
          
          setTotalTradesProcessed(prev => prev + 1);
        }
        break;
        
      case 'candle_update':
        if (data && data.priceHistory) {
          addDebugLog(`Candle update: ${data.candleCount} candles, live: ${data.isLive}`);
          setPriceHistory(data.priceHistory);
        }
        break;
        
      case 'batch_update':
        if (data?.updates) {
          const { updates } = data;
          addDebugLog(`Batch update with ${Object.keys(updates).length} update types`);
          
          const batchData: any = {};
          
          if (updates.trades && Array.isArray(updates.trades)) {
            setRecentTrades(prev => {
              const existingIds = new Set(prev.map(t => t.id));
              const newTrades = updates.trades.filter((t: any) => !existingIds.has(t.id));
              return [...newTrades, ...prev].slice(0, MAX_RECENT_TRADES);
            });
          }
          
          if (updates.price) {
            Object.assign(batchData, updates.price);
          }
          
          if (Object.keys(batchData).length > 0) {
            updateSimulationState(batchData, 'batch_update');
          }
        }
        break;
        
      case 'simulation_status':
        if (data) {
          addDebugLog(`Status update: running=${data.isRunning}, paused=${data.isPaused}`);
          setSimulation(prev => prev ? {
            ...prev,
            isRunning: data.isRunning ?? prev.isRunning,
            isPaused: data.isPaused ?? prev.isPaused
          } : prev);
        }
        break;
        
      case 'scenario_started':
      case 'scenario_phase_update':
      case 'scenario_phase_transition':
        if (data) {
          addDebugLog(`Scenario event: ${type}`);
          if (type === 'scenario_started') {
            setCurrentScenario(data);
          } else if (type === 'scenario_phase_update') {
            setScenarioPhaseData(data);
          }
        }
        break;
        
      case 'scenario_ended':
        addDebugLog('Scenario ended');
        setCurrentScenario(null);
        setScenarioPhaseData(null);
        break;
        
      default:
        addDebugLog(`Unhandled event type: ${type}`);
    }
    
  }, [lastMessage, simulationId, simulation?.id, updateSimulationState, addDebugLog]);

  // CRITICAL FIX: Separate effect for market condition updates with proper cleanup
  useEffect(() => {
    // Only update market condition when price data actually changes
    if (priceHistory.length > 0 || currentPrice > 0) {
      updateMarketCondition();
    }
    
    // Cleanup function
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, [priceHistory.length, currentPrice]);

  // Cleanup effect for timeouts
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Determine token symbol based on price
  const determineTokenSymbol = useCallback((price: number): string => {
    if (price < 0.01) return 'MEME/USDT';
    if (price < 1) return 'SHIB/USDT';
    if (price < 10) return 'DOGE/USDT';
    if (price < 100) return 'MATIC/USDT';
    if (price < 1000) return 'ETH/USDT';
    return 'BTC/USDT';
  }, []);

  // CRITICAL FIX: Enhanced simulation initialization with race condition prevention and proper API usage
  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const initSimulation = async () => {
      setLoading(true);
      setSimulationRegistrationStatus('creating');
      
      try {
        // STEP 1: Create simulation
        setInitializationStep('Creating simulation...');
        addDebugLog("Creating simulation...");
        
        const response = await SimulationApi.createSimulation({
          initialPrice: 100,
          duration: 3600,
          volatilityFactor: 1.0,
          scenarioType: 'standard'
        });
        
        console.log('🔍 Full response from backend:', response);
        
        if (response.error) {
          setError(response.error);
          addDebugLog(`Error creating simulation: ${response.error}`);
          initializationRef.current = false;
          return;
        }
        
        const responseData = response.data?.data || response.data;
        const simId = response.data?.simulationId || responseData?.id;
        
        if (!simId) {
          throw new Error('No simulation ID received from server');
        }
        
        addDebugLog(`Simulation created with ID: ${simId}`);
        setSimulationId(simId);
        
        // STEP 2: Check registration status from response
        if (response.data?.registrationStatus === 'ready' && response.data?.isReady) {
          addDebugLog('Backend confirmed simulation is ready immediately');
          setSimulationRegistrationStatus('ready');
        } else {
          setSimulationRegistrationStatus('pending');
          setInitializationStep('Waiting for backend registration...');
          addDebugLog("Backend still registering simulation...");
        }
        
        // STEP 3: ✅ FIXED - Use API service instead of direct fetch
        setInitializationStep('Verifying simulation readiness...');
        addDebugLog("Checking simulation readiness with backend using API service...");
        
        const readyResult = await SimulationApi.waitForSimulationReady(simId, 10, 500);
        
        if (readyResult.error || !readyResult.data?.ready) {
          const errorMsg = readyResult.error || `Simulation failed to become ready after ${readyResult.data?.attempts || 0} attempts`;
          throw new Error(errorMsg);
        }
        
        addDebugLog(`✅ Simulation ${simId} confirmed ready by backend after ${readyResult.data.attempts} attempts!`);
        setSimulationRegistrationStatus('ready');
        
        // STEP 4: Get simulation data
        setInitializationStep('Loading simulation data...');
        addDebugLog("Loading simulation data...");
        
        const simulationResponse = await SimulationApi.getSimulation(simId);
        
        if (simulationResponse?.error || !simulationResponse?.data) {
          throw new Error(`Failed to load simulation data: ${simulationResponse?.error}`);
        }
        
        const simData = simulationResponse.data?.data || simulationResponse.data;
        
        if (!simData) {
          throw new Error('No simulation data received');
        }
        
        simData.id = simId;
        setSimulation(simData);
        
        // STEP 5: Initialize state
        setInitializationStep('Initializing dashboard state...');
        updateSimulationState({
          currentPrice: simData.currentPrice || 100,
          orderBook: simData.orderBook || { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: simData.priceHistory || [],
          recentTrades: simData.recentTrades || [],
          activePositions: simData.activePositions || [],
          traderRankings: simData.traderRankings || []
        }, 'initialization');
        
        const initialPrice = simData.currentPrice || 100;
        setTokenSymbol(determineTokenSymbol(initialPrice));
        
        // STEP 6: Enable WebSocket connection
        setInitializationStep('Enabling WebSocket connection...');
        addDebugLog("Simulation ready - enabling WebSocket connection...");
        setIsWebSocketReady(true);
        
        addDebugLog(`Simulation initialized successfully - ready for real-time updates`);
        setInitializationStep('Ready!');
        
      } catch (error) {
        setError('Failed to initialize simulation');
        addDebugLog(`Initialization error: ${error}`);
        console.error(error);
        setSimulationRegistrationStatus('error');
        initializationRef.current = false;
      } finally {
        setLoading(false);
      }
    };
    
    initSimulation();
  }, []); // Empty deps - only run once

  // Timer for elapsed time
  useEffect(() => {
    if (simulation?.isRunning && !simulation?.isPaused) {
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      timerRef.current = setInterval(() => {
        if (simulationStartTime) {
          const elapsed = Date.now() - simulationStartTime;
          const hours = Math.floor(elapsed / 3600000);
          const minutes = Math.floor((elapsed % 3600000) / 60000);
          const seconds = Math.floor((elapsed % 60000) / 1000);
          setElapsedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      }, 1000);
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
  }, [simulation?.isRunning, simulation?.isPaused, simulationStartTime]);

  // Convert price history to chart format - SIMPLIFIED
  const convertPriceHistory = useCallback((history: SimulationPricePoint[]): ChartPricePoint[] => {
    if (!history || history.length === 0) return [];
    
    // TRUST BACKEND: No validation, direct conversion
    return history.map(point => ({
      time: point.timestamp,
      timestamp: point.timestamp,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume
    }));
  }, []);

  // Prepare chart data
  const chartPriceHistory = useMemo(() => convertPriceHistory(priceHistory), [priceHistory, convertPriceHistory]);

  // CRITICAL FIX: Enhanced start simulation handler with comprehensive logging
  const handleStartSimulation = useCallback(async () => {
    if (!simulationId) {
      addDebugLog("Cannot start - no simulation ID");
      return;
    }
    
    if (!isConnected) {
      addDebugLog("Cannot start - WebSocket not connected");
      return;
    }
    
    if (simulationRegistrationStatus !== 'ready') {
      addDebugLog(`Cannot start - simulation not ready (status: ${simulationRegistrationStatus})`);
      return;
    }
    
    try {
      addDebugLog(`Attempting to start simulation: ${simulationId}`);
      
      const response = await SimulationApi.startSimulation(simulationId);
      
      if (response.error) {
        addDebugLog(`Failed to start simulation: ${response.error}`);
        console.error('Failed to start simulation:', response.error);
        return;
      }
      
      addDebugLog("✅ Backend confirmed simulation started");
      
      setSimulation(prev => prev ? { ...prev, isRunning: true, isPaused: false } : prev);
      setPauseState(false);
      
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      setAudioEnabled(true);
      addDebugLog("Simulation started - expecting real-time data...");
      
    } catch (error) {
      console.error('Failed to start simulation:', error);
      addDebugLog(`Error starting simulation: ${error}`);
    }
  }, [simulationId, simulationStartTime, addDebugLog, setPauseState, isConnected, simulationRegistrationStatus]);

  const handlePauseSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      await SimulationApi.pauseSimulation(simulationId);
      setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
      setPauseState(true);
      addDebugLog("Simulation paused");
    } catch (error) {
      console.error('Failed to pause simulation:', error);
      addDebugLog(`Error pausing simulation: ${error}`);
    }
  }, [simulationId, addDebugLog, setPauseState]);

  const handleResetSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      await SimulationApi.resetSimulation(simulationId);
      const response = await SimulationApi.getSimulation(simulationId);
      
      if (response.data) {
        const resetData = response.data?.data || response.data;
        resetData.id = simulationId;
        setSimulation(resetData);
        
        // Reset state - React 18+ will batch these automatically
        updateSimulationState({
          currentPrice: resetData.currentPrice || 100,
          orderBook: resetData.orderBook || { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: resetData.priceHistory || [],
          recentTrades: resetData.recentTrades || [],
          activePositions: resetData.activePositions || [],
          traderRankings: resetData.traderRankings || []
        }, 'reset');
        
        setTotalTradesProcessed(0);
        setMarketCondition('calm');
        setSimulationStartTime(null);
        setElapsedTime("00:00:00");
        setWsMessageCount(0);
        setAudioEnabled(false);
        
        setTokenSymbol(determineTokenSymbol(resetData.currentPrice || 100));
        setCurrentScenario(null);
        setScenarioPhaseData(null);
        
        // Reset refs
        lastMessageProcessedRef.current = '';
        marketConditionUpdateRef.current = 0;
        
        // Clear any pending timeouts
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
        
        addDebugLog("Simulation reset");
      }
    } catch (error) {
      console.error('Failed to reset simulation:', error);
      addDebugLog(`Error resetting simulation: ${error}`);
    }
  }, [simulationId, addDebugLog, determineTokenSymbol, updateSimulationState]);

  const handleSpeedChange = useCallback(async (speedOption: keyof typeof speedMap) => {
    const speedValue = speedMap[speedOption];
    setSimulationSpeed(speedValue);
    
    if (speedOption === 'ultra' || speedOption === 'quantum') {
      setIsHighFrequencyMode(true);
      addDebugLog(`${speedOption.toUpperCase()} MODE ACTIVATED - ${speedValue}x speed`);
    }
    
    if (simulationId) {
      try {
        await SimulationApi.setSimulationSpeed(simulationId, speedValue);
        addDebugLog(`Speed set to ${speedOption} (${speedValue}x)`);
      } catch (error) {
        console.error(`Failed to update simulation speed:`, error);
      }
    }
  }, [simulationId, addDebugLog]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => !prev);
  }, []);

  const toggleDynamicView = useCallback(() => {
    setDynamicChartView(prev => !prev);
    addDebugLog(`Dynamic chart view: ${!dynamicChartView ? 'enabled' : 'disabled'}`);
  }, [dynamicChartView, addDebugLog]);

  // Loading state with enhanced information
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900">
        <div className="text-white text-center">
          <div className="animate-spin h-12 w-12 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-xl">Initializing trading simulation...</span>
          <div className="mt-4 text-sm text-gray-400">
            {initializationStep}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Status: {simulationRegistrationStatus}
          </div>
          <div className="mt-4 text-sm text-blue-400">
            ✅ Race condition prevention active
          </div>
          <div className="mt-2 text-sm text-green-400">
            ✅ Using proper API service
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900">
        <div className="text-red-400 p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <h2 className="text-xl font-bold mb-2">Simulation Error</h2>
          <p>{error}</p>
          <p className="mt-2 text-sm text-gray-400">
            Registration Status: {simulationRegistrationStatus}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
  
  if (!simulation) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900">
        <div className="text-white p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <p>No simulation data available</p>
          <p className="mt-2 text-sm text-gray-400">
            Registration Status: {simulationRegistrationStatus}
          </p>
        </div>
      </div>
    );
  }

  // Determine if simulation can be started
  const canStartSimulation = isConnected && 
                            simulationRegistrationStatus === 'ready' && 
                            (!simulation.isRunning || simulation.isPaused);

  return (
    <div className="h-screen w-full bg-gray-900 text-white p-2 flex flex-col overflow-hidden">
      {/* Audio player */}
      <DynamicMusicPlayer 
        enabled={audioEnabled} 
        marketCondition={marketCondition}
        onToggle={toggleAudio}
      />
      
      {/* Header */}
      <div className="flex flex-col mb-2 bg-gray-800 rounded-md shadow-sm">
        <div className="flex justify-between items-center h-10 p-2">
          <div className="flex items-center">
            <h1 className="text-base font-bold mr-2">Trading Simulation</h1>
            <div className="ml-2 text-xs bg-gray-700 px-2 py-1 rounded">
              <span className="text-gray-400 mr-1">{tokenSymbol}:</span>
              <span className="text-white font-medium">${currentPrice < 1 ? currentPrice.toFixed(6) : currentPrice.toFixed(2)}</span>
            </div>
            
            {/* Enhanced connection status */}
            <div className={`ml-2 w-2 h-2 rounded-full mr-1 ${
              isConnected ? 'bg-green-500' : connectionError ? 'bg-red-500' : 'bg-yellow-500'
            }`}></div>
            <span className="text-xs text-gray-400">
              {isConnected ? 'Connected' : connectionError || 'Connecting...'}
            </span>
            
            {/* Registration status indicator */}
            <div className={`ml-2 text-xs px-2 py-1 rounded ${
              simulationRegistrationStatus === 'ready' ? 'bg-green-900 text-green-300' :
              simulationRegistrationStatus === 'pending' ? 'bg-yellow-900 text-yellow-300' :
              simulationRegistrationStatus === 'error' ? 'bg-red-900 text-red-300' :
              'bg-blue-900 text-blue-300'
            }`}>
              Reg: {simulationRegistrationStatus}
            </div>
            
            {/* Stats */}
            <div className="ml-2 text-xs text-gray-400">
              Candles: {priceHistory.length} | Trades: {recentTrades.length} | Msgs: {wsMessageCount}
            </div>
            
            {/* Debug info */}
            <div className="ml-2 text-xs text-purple-400">
              Logs: {debugLogCountRef.current}
            </div>
            
            {/* WebSocket ready indicator */}
            <div className={`ml-2 text-xs px-2 py-1 rounded ${
              isWebSocketReady ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
            }`}>
              WS: {isWebSocketReady ? 'Ready' : 'Waiting'}
            </div>
            
            {/* Fixed API indicator */}
            <div className="ml-2 text-xs text-green-400">
              ✅ API Fixed
            </div>
            
            {/* Race condition prevention indicator */}
            <div className="ml-2 text-xs text-green-400">
              ✅ Race Prevention
            </div>
            
            {/* Scenario indicator */}
            {currentScenario && (
              <div className="ml-2 text-xs text-purple-400 px-2 py-1 bg-purple-900 rounded">
                📈 {currentScenario.scenarioName || 'Scenario Active'}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="text-xs bg-gray-700 px-2 py-1 rounded">
              <span className="text-gray-400">Time:</span>
              <span className="ml-1 font-mono text-white">{elapsedTime}</span>
            </div>
            
            <button 
              onClick={toggleAudio}
              className={`p-1 rounded ${audioEnabled ? 'text-green-400' : 'text-gray-400'}`}
            >
              {audioEnabled ? '🔊' : '🔇'}
            </button>
            
            <button 
              onClick={toggleDynamicView}
              className={`text-xs px-2 py-1 rounded transition ${
                dynamicChartView ? 'text-purple-400 bg-purple-900' : 'text-gray-400 hover:text-gray-300'
              }`}
              title="Toggle dynamic chart view"
            >
              Dynamic
            </button>
            
            <button 
              onClick={() => setShowPerformanceMonitor(!showPerformanceMonitor)}
              className={`text-xs px-2 py-1 rounded transition ${
                showPerformanceMonitor ? 'text-blue-400 bg-blue-900' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Perf
            </button>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex justify-between items-center h-10 p-2 border-t border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">Speed:</span>
            <div className="flex space-x-1">
              {(Object.keys(speedMap) as Array<keyof typeof speedMap>).map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-2 py-0.5 text-xs transition ${
                    simulationSpeed === speedMap[speed]
                      ? 'text-blue-400 font-semibold' 
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  {speed.charAt(0).toUpperCase() + speed.slice(1)}
                </button>
              ))}
            </div>
            
            <div className="ml-4 flex items-center space-x-2">
              <span className="text-xs text-gray-400">Market:</span>
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
            {canStartSimulation ? (
              <button 
                onClick={handleStartSimulation}
                className="px-3 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                title={!canStartSimulation ? 'Waiting for simulation to be ready' : ''}
              >
                {simulation.isPaused ? 'Resume' : 'Start'}
              </button>
            ) : simulation.isRunning && !simulation.isPaused ? (
              <button 
                onClick={handlePauseSimulation} 
                className="px-3 py-0.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition"
              >
                Pause
              </button>
            ) : (
              <button 
                disabled
                className="px-3 py-0.5 bg-gray-600 text-gray-400 rounded cursor-not-allowed"
                title={`Cannot start - ${
                  !isConnected ? 'WebSocket not connected' :
                  simulationRegistrationStatus !== 'ready' ? 'Simulation not ready' :
                  'Unknown issue'
                }`}
              >
                {simulation.isPaused ? 'Resume' : 'Start'}
              </button>
            )}
            
            <button 
              onClick={handleResetSimulation}
              className="px-3 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition"
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
        gridTemplateRows: '3fr 2fr',
        gap: '8px',
        height: 'calc(100vh - 85px)',
        overflow: 'hidden'
      }}>
        {/* Left column */}
        <div style={{ 
          gridColumn: '1 / 2', 
          gridRow: '1 / 3', 
          display: 'grid',
          gridTemplateRows: '3fr 1fr',
          gap: '8px',
          overflow: 'hidden'
        }}>
          <div style={{ overflow: 'hidden' }}>
            <OrderBook orderBook={orderBook} />
          </div>
          
          <div style={{ overflow: 'hidden' }}>
            <RecentTrades trades={recentTrades} />
          </div>
        </div>
        
        {/* Chart */}
        <div style={{ 
          gridColumn: '2 / 3', 
          gridRow: '1 / 2', 
          position: 'relative', 
          overflow: 'hidden'
        }} className="bg-gray-900 rounded-lg shadow-lg">
          <div className="h-full w-full">
            <PriceChart 
              priceHistory={chartPriceHistory} 
              currentPrice={currentPrice} 
              trades={recentTrades}
              scenarioData={scenarioPhaseData}
              symbol={tokenSymbol}
              dynamicView={dynamicChartView}
            />
          </div>
        </div>
        
        {/* Participants */}
        <div style={{ gridColumn: '2 / 3', gridRow: '2 / 3', overflow: 'hidden' }}>
          <ParticipantsOverview 
            traders={traderRankings} 
            activePositions={activePositions}
            currentPrice={currentPrice}
            scenarioModifiers={currentScenario?.traderModifiers}
          />
        </div>
      </div>
      
      {/* Performance Monitor */}
      <PerformanceMonitor 
        isVisible={showPerformanceMonitor}
        onToggle={() => setShowPerformanceMonitor(!showPerformanceMonitor)}
        wsMessageCount={wsMessageCount}
        tradeCount={recentTrades.length}
        queueSize={messageStats?.received || 0}
        droppedMessages={messageStats?.dropped || 0}
        batchesProcessed={0}
        isHighFrequencyMode={isHighFrequencyMode}
        simulationSpeed={simulationSpeed}
      />
    </div>
  );
};

export default Dashboard;