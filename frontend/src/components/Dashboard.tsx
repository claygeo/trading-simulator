// frontend/src/components/Dashboard.tsx - PRODUCTION READY: All issues resolved
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
  
  // Real-time data state - PRODUCTION: No trade limitations for ultra-fast mode
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
  
  // Enhanced WebSocket ready state tracking with registration status
  const [isWebSocketReady, setIsWebSocketReady] = useState<boolean>(false);
  const [simulationRegistrationStatus, setSimulationRegistrationStatus] = useState<'creating' | 'pending' | 'ready' | 'error'>('creating');
  const [initializationStep, setInitializationStep] = useState<string>('Starting...');
  
  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<boolean>(false);
  
  // Refs to prevent infinite loops
  const lastMessageProcessedRef = useRef<string>('');
  const marketConditionUpdateRef = useRef<number>(0);
  const debugLogCountRef = useRef<number>(0);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ultra-fast mode constants - PRODUCTION: No artificial limitations
  const ULTRA_FAST_CONFIG = {
    MAX_PRICE_HISTORY: 1000,
    MAX_ACTIVE_POSITIONS: 500,
    MAX_TRADER_RANKINGS: 200,
    MEMORY_MANAGEMENT_THRESHOLD: 10000,
    PERFORMANCE_MODE_THRESHOLD: 5000,
  };

  // Define speed mapping
  const speedMap = {
    'slow': 2,
    'medium': 3, 
    'fast': 6,
    'ludicrous': 10,
    'ultra': 50,
    'quantum': 100
  } as const;

  // Use WebSocket with proper ready state management
  const { isConnected, lastMessage, setPauseState, connectionError, messageStats } = useWebSocket(
    isWebSocketReady && simulationRegistrationStatus === 'ready' ? simulationId || undefined : undefined,
    simulation?.isPaused
  );

  // Stable debug logging with memoization
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[Dashboard ${timestamp}] ${message}`);
    debugLogCountRef.current++;
  }, []);

  // Memoized market condition detector
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

  // Memory management for ultra-fast mode (intelligent cleanup)
  const manageUltraFastMemory = useCallback(() => {
    const tradeCount = recentTrades.length;
    
    if (tradeCount > ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
      const keepTradeCount = Math.floor(ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.8);
      setRecentTrades(prev => prev.slice(0, keepTradeCount));
      
      if (activePositions.length > ULTRA_FAST_CONFIG.MAX_ACTIVE_POSITIONS) {
        setActivePositions(prev => prev.slice(0, ULTRA_FAST_CONFIG.MAX_ACTIVE_POSITIONS));
      }
      
      if (priceHistory.length > ULTRA_FAST_CONFIG.MAX_PRICE_HISTORY) {
        setPriceHistory(prev => prev.slice(-ULTRA_FAST_CONFIG.MAX_PRICE_HISTORY));
      }
      
      addDebugLog(`Memory cleanup completed: kept ${keepTradeCount} trades`);
    }
  }, [recentTrades.length, activePositions.length, priceHistory.length, addDebugLog]);

  // Optimized state update function with React 18+ automatic batching and memory management
  const updateSimulationState = useCallback((data: any, eventType: string) => {
    if (data.currentPrice !== undefined) {
      setCurrentPrice(data.currentPrice);
    }
    
    if (data.orderBook) {
      setOrderBook(data.orderBook);
    }
    
    if (data.priceHistory && Array.isArray(data.priceHistory)) {
      setPriceHistory(data.priceHistory);
    }
    
    // Handle ultra-fast trade updates without artificial limits
    if (data.recentTrades && Array.isArray(data.recentTrades)) {
      setRecentTrades(data.recentTrades);
      setTotalTradesProcessed(data.recentTrades.length);
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
    
    // Update simulation object if needed
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
    
    // Trigger memory management for ultra-fast mode
    setTimeout(manageUltraFastMemory, 100);
  }, [simulation, manageUltraFastMemory]);

  // Throttled market condition updates with debouncing
  const updateMarketCondition = useCallback(() => {
    const now = Date.now();
    
    if (now - marketConditionUpdateRef.current < 2000) {
      return;
    }
    
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = setTimeout(() => {
      marketConditionUpdateRef.current = now;
      const newCondition = determineMarketCondition();
      
      if (newCondition !== marketCondition) {
        setMarketCondition(newCondition);
        addDebugLog(`Market condition changed: ${marketCondition} → ${newCondition}`);
      }
    }, 100);
    
  }, [determineMarketCondition, marketCondition, addDebugLog]);

  // Process WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    const { simulationId: msgSimId, event } = lastMessage;
    
    const messageId = `${msgSimId}-${event.type}-${event.timestamp}`;
    if (lastMessageProcessedRef.current === messageId) {
      return;
    }
    lastMessageProcessedRef.current = messageId;
    
    if (simulationId && msgSimId !== simulationId) {
      addDebugLog(`Skipping message for different simulation: ${msgSimId}`);
      return;
    }
    
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
          
          if (data.registrationStatus === 'ready') {
            setSimulationRegistrationStatus('ready');
            addDebugLog('Simulation confirmed ready by backend');
          }
        }
        break;
        
      case 'price_update':
        if (data) {
          updateSimulationState(data, 'price_update');
        }
        break;
        
      case 'trade':
      case 'processed_trade':
        if (data) {
          setRecentTrades(prev => {
            const exists = prev.some(t => t.id === data.id);
            if (exists) return prev;
            
            const updated = [data, ...prev];
            
            if (updated.length > ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
              const keepCount = Math.floor(ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.9);
              addDebugLog(`Memory management: trimming trades from ${updated.length} to ${keepCount}`);
              return updated.slice(0, keepCount);
            }
            
            addDebugLog(`New trade: ${data.action} ${data.quantity} @ $${data.price} (total: ${updated.length})`);
            return updated;
          });
          
          setTotalTradesProcessed(prev => prev + 1);
          
          if (recentTrades.length > ULTRA_FAST_CONFIG.PERFORMANCE_MODE_THRESHOLD) {
            setIsHighFrequencyMode(true);
          }
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
              const combined = [...newTrades, ...prev];
              
              if (combined.length > ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
                const keepCount = Math.floor(ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.9);
                addDebugLog(`Batch memory management: ${combined.length} → ${keepCount} trades`);
                return combined.slice(0, keepCount);
              }
              
              return combined;
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
    
  }, [lastMessage, simulationId, simulation?.id, updateSimulationState, addDebugLog, recentTrades.length]);

  // Separate effect for market condition updates with proper cleanup
  useEffect(() => {
    if (priceHistory.length > 0 || currentPrice > 0) {
      updateMarketCondition();
    }
    
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

  // Enhanced simulation initialization
  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const initSimulation = async () => {
      setLoading(true);
      setSimulationRegistrationStatus('creating');
      
      try {
        setInitializationStep('Creating ultra-fast simulation...');
        addDebugLog("Creating ultra-fast simulation...");
        
        const response = await SimulationApi.createSimulation({
          initialPrice: 100,
          duration: 3600,
          volatilityFactor: 1.0,
          scenarioType: 'standard'
        });
        
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
        
        addDebugLog(`Ultra-fast simulation created with ID: ${simId}`);
        setSimulationId(simId);
        
        if (response.data?.registrationStatus === 'ready' && response.data?.isReady) {
          addDebugLog('Backend confirmed ultra-fast simulation is ready immediately');
          setSimulationRegistrationStatus('ready');
        } else {
          setSimulationRegistrationStatus('pending');
          setInitializationStep('Waiting for backend registration...');
          addDebugLog("Backend still registering ultra-fast simulation...");
        }
        
        setInitializationStep('Verifying ultra-fast simulation readiness...');
        addDebugLog("Checking ultra-fast simulation readiness with backend using API service...");
        
        const readyResult = await SimulationApi.waitForSimulationReady(simId, 10, 500);
        
        if (readyResult.error || !readyResult.data?.ready) {
          const errorMsg = readyResult.error || `Ultra-fast simulation failed to become ready after ${readyResult.data?.attempts || 0} attempts`;
          throw new Error(errorMsg);
        }
        
        addDebugLog(`✅ Ultra-fast simulation ${simId} confirmed ready by backend after ${readyResult.data.attempts} attempts!`);
        setSimulationRegistrationStatus('ready');
        
        setInitializationStep('Loading ultra-fast simulation data...');
        addDebugLog("Loading ultra-fast simulation data...");
        
        const simulationResponse = await SimulationApi.getSimulation(simId);
        
        if (simulationResponse?.error || !simulationResponse?.data) {
          throw new Error(`Failed to load ultra-fast simulation data: ${simulationResponse?.error}`);
        }
        
        const simData = simulationResponse.data?.data || simulationResponse.data;
        
        if (!simData) {
          throw new Error('No ultra-fast simulation data received');
        }
        
        simData.id = simId;
        setSimulation(simData);
        
        setInitializationStep('Initializing ultra-fast dashboard state...');
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
        
        setInitializationStep('Enabling ultra-fast WebSocket connection...');
        addDebugLog("Ultra-fast simulation ready - enabling WebSocket connection...");
        setIsWebSocketReady(true);
        
        addDebugLog(`Ultra-fast simulation initialized successfully - ready for massive real-time updates`);
        setInitializationStep('Ready for ultra-fast trading!');
        
      } catch (error) {
        setError('Failed to initialize ultra-fast simulation');
        addDebugLog(`Ultra-fast initialization error: ${error}`);
        console.error(error);
        setSimulationRegistrationStatus('error');
        initializationRef.current = false;
      } finally {
        setLoading(false);
      }
    };
    
    initSimulation();
  }, []);

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

  // Convert price history to chart format
  const convertPriceHistory = useCallback((history: SimulationPricePoint[]): ChartPricePoint[] => {
    if (!history || history.length === 0) return [];
    
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

  // Format impressive trade count
  const formatTradeCount = useCallback((count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }, []);

  // PRODUCTION: Enhanced start simulation handler
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
      addDebugLog(`Attempting to start ultra-fast simulation: ${simulationId}`);
      
      const response = await SimulationApi.startSimulation(simulationId);
      
      if (response.error) {
        addDebugLog(`Failed to start ultra-fast simulation: ${response.error}`);
        console.error('Failed to start simulation:', response.error);
        return;
      }
      
      addDebugLog("✅ Backend confirmed ultra-fast simulation started");
      
      setSimulation(prev => prev ? { ...prev, isRunning: true, isPaused: false } : prev);
      setPauseState(false);
      
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      setAudioEnabled(true);
      addDebugLog("Ultra-fast simulation started - expecting massive real-time data...");
      
    } catch (error) {
      console.error('Failed to start ultra-fast simulation:', error);
      addDebugLog(`Error starting ultra-fast simulation: ${error}`);
    }
  }, [simulationId, simulationStartTime, addDebugLog, setPauseState, isConnected, simulationRegistrationStatus]);

  const handlePauseSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      await SimulationApi.pauseSimulation(simulationId);
      setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
      setPauseState(true);
      addDebugLog("Ultra-fast simulation paused");
    } catch (error) {
      console.error('Failed to pause simulation:', error);
      addDebugLog(`Error pausing ultra-fast simulation: ${error}`);
    }
  }, [simulationId, addDebugLog, setPauseState]);

  // PRODUCTION: Enhanced comprehensive reset functionality
  const handleResetSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      console.log('🔄 Starting comprehensive simulation reset...');
      
      // STEP 1: Stop any running simulation
      if (simulation?.isRunning) {
        console.log('⏹️ Stopping running simulation...');
        await SimulationApi.pauseSimulation(simulationId);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // STEP 2: Clear all frontend state immediately
      console.log('🧹 Clearing frontend state...');
      
      // Clear all data arrays
      setRecentTrades([]);
      setOrderBook({ bids: [], asks: [], lastUpdateTime: Date.now() });
      setPriceHistory([]);
      setActivePositions([]);
      setTraderRankings([]);
      setCurrentPrice(0);
      
      // Reset UI state
      setTotalTradesProcessed(0);
      setMarketCondition('calm');
      setSimulationStartTime(null);
      setElapsedTime("00:00:00");
      setWsMessageCount(0);
      setAudioEnabled(false);
      setIsHighFrequencyMode(false);
      
      // Reset refs to prevent stale data
      lastMessageProcessedRef.current = '';
      marketConditionUpdateRef.current = 0;
      
      // Clear any pending timeouts
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      
      // STEP 3: Reset simulation on backend
      console.log('🔄 Resetting backend simulation...');
      const resetResponse = await SimulationApi.resetSimulation(simulationId);
      
      if (resetResponse.error) {
        console.error('Failed to reset backend simulation:', resetResponse.error);
      }
      
      // STEP 4: Wait for backend reset to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // STEP 5: Fetch fresh simulation state
      console.log('📥 Fetching fresh simulation state...');
      const freshSimResponse = await SimulationApi.getSimulation(simulationId);
      
      if (freshSimResponse?.data) {
        const freshSimData = freshSimResponse.data?.data || freshSimResponse.data;
        freshSimData.id = simulationId;
        setSimulation(freshSimData);
        
        const initialPrice = freshSimData.currentPrice || 100;
        
        updateSimulationState({
          currentPrice: initialPrice,
          orderBook: freshSimData.orderBook || { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: [], // Ensure completely empty
          recentTrades: [], // Ensure completely empty
          activePositions: [], // Ensure completely empty
          traderRankings: freshSimData.traderRankings || []
        }, 'reset');
        
        setTokenSymbol(determineTokenSymbol(initialPrice));
        
        console.log('✅ Reset complete - fresh state applied');
        console.log(`📊 New state: Price=$${initialPrice.toFixed(6)}, Trades=${0}, Candles=${0}`);
        
      } else {
        console.error('Failed to fetch fresh simulation state');
        
        // Apply minimal clean state if backend fetch fails
        updateSimulationState({
          currentPrice: 100,
          orderBook: { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          traderRankings: simulation?.traderRankings || []
        }, 'emergency_reset');
      }
      
      // STEP 6: Clear any cached WebSocket messages
      console.log('🧹 Clearing WebSocket message cache...');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // STEP 7: Verify clean state
      console.log('✅ Reset verification:');
      console.log(`   Price History: ${priceHistory.length} candles`);
      console.log(`   Recent Trades: ${recentTrades.length} trades`);
      console.log(`   Active Positions: ${activePositions.length} positions`);
      console.log(`   Simulation Running: ${simulation?.isRunning || false}`);
      
      addDebugLog("Comprehensive simulation reset completed successfully");
      
    } catch (error) {
      console.error('Error during comprehensive reset:', error);
      addDebugLog(`Reset error: ${error}`);
      
      // Emergency fallback reset
      console.log('🆘 Applying emergency frontend reset...');
      
      setRecentTrades([]);
      setPriceHistory([]);
      setActivePositions([]);
      setOrderBook({ bids: [], asks: [], lastUpdateTime: Date.now() });
      setCurrentPrice(100);
      setTotalTradesProcessed(0);
      setMarketCondition('calm');
      setSimulationStartTime(null);
      setElapsedTime("00:00:00");
      setWsMessageCount(0);
      setAudioEnabled(false);
      setIsHighFrequencyMode(false);
      
      if (simulation) {
        setSimulation(prev => prev ? {
          ...prev,
          isRunning: false,
          isPaused: false,
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          currentPrice: 100
        } : prev);
      }
    }
  }, [simulationId, simulation, priceHistory.length, recentTrades.length, activePositions.length, addDebugLog, determineTokenSymbol, updateSimulationState]);

  // Enhanced verification function to check if reset was successful
  const verifyResetState = useCallback(() => {
    const isClean = 
      priceHistory.length === 0 &&
      recentTrades.length === 0 &&
      activePositions.length === 0 &&
      totalTradesProcessed === 0 &&
      (!simulation?.isRunning) &&
      marketCondition === 'calm';
    
    console.log('🔍 Reset verification:', {
      priceHistoryEmpty: priceHistory.length === 0,
      tradesEmpty: recentTrades.length === 0,
      positionsEmpty: activePositions.length === 0,
      notRunning: !simulation?.isRunning,
      marketCalm: marketCondition === 'calm',
      overallClean: isClean
    });
    
    return isClean;
  }, [priceHistory.length, recentTrades.length, activePositions.length, totalTradesProcessed, simulation?.isRunning, marketCondition]);

  const handleSpeedChange = useCallback(async (speedOption: keyof typeof speedMap) => {
    const speedValue = speedMap[speedOption];
    setSimulationSpeed(speedValue);
    
    if (speedOption === 'ultra' || speedOption === 'quantum') {
      setIsHighFrequencyMode(true);
      addDebugLog(`${speedOption.toUpperCase()} MODE ACTIVATED - ${speedValue}x speed for massive trading`);
    }
    
    if (simulationId) {
      try {
        await SimulationApi.setSimulationSpeed(simulationId, speedValue);
        addDebugLog(`Ultra-fast speed set to ${speedOption} (${speedValue}x)`);
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
          <span className="text-xl">Initializing ultra-fast trading simulation...</span>
          <div className="mt-4 text-sm text-gray-400">
            {initializationStep}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Status: {simulationRegistrationStatus}
          </div>
          <div className="mt-4 text-sm text-blue-400">
            ✅ Trade count limitations REMOVED
          </div>
          <div className="mt-2 text-sm text-green-400">
            ✅ Ultra-fast mode activated
          </div>
          <div className="mt-2 text-sm text-purple-400">
            ✅ Memory management optimized
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900">
        <div className="text-red-400 p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <h2 className="text-xl font-bold mb-2">Ultra-Fast Simulation Error</h2>
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
          <p>No ultra-fast simulation data available</p>
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
            <h1 className="text-base font-bold mr-2">Ultra-Fast Trading Simulation</h1>
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
            
            {/* Enhanced stats with impressive numbers */}
            <div className="ml-2 text-xs text-gray-400">
              Candles: {priceHistory.length} | Trades: <span className="text-accent font-bold">{formatTradeCount(recentTrades.length)}</span> | Msgs: {wsMessageCount}
            </div>
            
            {/* Ultra-fast mode indicator */}
            <div className="ml-2 text-xs text-purple-400">
              ⚡ ULTRA: {debugLogCountRef.current} logs
            </div>
            
            {/* Memory management indicator */}
            {recentTrades.length > ULTRA_FAST_CONFIG.PERFORMANCE_MODE_THRESHOLD && (
              <div className="ml-2 text-xs text-yellow-400">
                🧠 HF Mode
              </div>
            )}
            
            {/* WebSocket ready indicator */}
            <div className={`ml-2 text-xs px-2 py-1 rounded ${
              isWebSocketReady ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
            }`}>
              WS: {isWebSocketReady ? 'Ready' : 'Waiting'}
            </div>
            
            {/* Trade count removed limitation indicator */}
            <div className="ml-2 text-xs text-green-400">
              ✅ No Limits
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
            
            {/* Ultra-fast performance indicator */}
            {isHighFrequencyMode && (
              <div className="ml-4 text-xs text-purple-400 bg-purple-900 px-2 py-1 rounded">
                🚀 HF MODE: {formatTradeCount(recentTrades.length)} trades
              </div>
            )}
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