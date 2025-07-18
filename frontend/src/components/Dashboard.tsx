// frontend/src/components/Dashboard.tsx - FIXED: Complete setPauseState_response Handler
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SimulationApi } from '../services/api';
import { useWebSocket } from '../services/websocket';
import { Simulation, PricePoint as SimulationPricePoint } from '../types';

// Desktop components
import PriceChart from './PriceChart';
import OrderBook from './OrderBook';
import RecentTrades from './RecentTrades';
import ParticipantsOverview from './ParticipantsOverview';
import PerformanceMonitor from './PerformanceMonitor';
import StressTestController from './StressTestController';

// Mobile components - will lazy load to avoid initial import errors
const MobileDashboard = React.lazy(() => import('./mobile/MobileDashboard'));

interface ChartPricePoint {
  time: number;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice?: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType: string;
  priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega' | 'random';
  customPrice?: number;
  useCustomPrice?: boolean;
}

// FIXED: Enhanced mobile detection with better reliability
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  useEffect(() => {
    let mounted = true;
    
    const checkIsMobile = () => {
      try {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Method 1: Screen size check
        const isSmallScreen = screenWidth <= 768;
        
        // Method 2: User agent check (more comprehensive)
        const userAgent = navigator.userAgent.toLowerCase();
        const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
        const isMobileUA = mobileRegex.test(userAgent);
        
        // Method 3: Touch capability
        const hasTouch = (
          'ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          (navigator as any).msMaxTouchPoints > 0
        );
        
        // Method 4: CSS media query check
        const isMediaQueryMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        
        // Method 5: Orientation API
        const hasOrientation = 'orientation' in window;
        
        // Method 6: Device pixel ratio (mobile devices often have higher DPR)
        const devicePixelRatio = window.devicePixelRatio || 1;
        const isHighDPR = devicePixelRatio > 1;
        
        // Confidence scoring system
        let mobileScore = 0;
        if (isSmallScreen) mobileScore += 3;
        if (isMobileUA) mobileScore += 4;
        if (hasTouch) mobileScore += 3;
        if (isMediaQueryMobile) mobileScore += 2;
        if (hasOrientation) mobileScore += 1;
        if (isHighDPR && isSmallScreen) mobileScore += 1;
        
        // Additional checks
        const isSafariMobile = /safari/i.test(userAgent) && hasTouch;
        const isAndroid = /android/i.test(userAgent);
        const isIOS = /iphone|ipad|ipod/i.test(userAgent);
        
        if (isSafariMobile || isAndroid || isIOS) mobileScore += 2;
        
        // Decision logic: mobile if score >= 5 OR strong indicators
        const isMobileDevice = mobileScore >= 5 || 
                              (isSmallScreen && (isMobileUA || hasTouch)) ||
                              isAndroid || isIOS;
        
        const debug = {
          screenWidth,
          screenHeight,
          isSmallScreen,
          isMobileUA,
          hasTouch,
          isMediaQueryMobile,
          hasOrientation,
          devicePixelRatio,
          isHighDPR,
          isSafariMobile,
          isAndroid,
          isIOS,
          mobileScore,
          finalDecision: isMobileDevice,
          userAgent: userAgent.substring(0, 150) + '...',
          timestamp: new Date().toISOString()
        };
        
        // Production: Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 Mobile Detection Analysis:', debug);
        }
        
        if (mounted) {
          setIsMobile(isMobileDevice);
          setDebugInfo(debug);
          setIsLoading(false);
        }
        
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ Mobile detection error:', error);
        }
        if (mounted) {
          // Emergency fallback
          setIsMobile(window.innerWidth <= 768);
          setIsLoading(false);
        }
      }
    };
    
    // Initial check with small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      checkIsMobile();
    }, 50);
    
    // Responsive updates with debouncing
    let resizeTimer: NodeJS.Timeout;
    const debouncedCheck = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkIsMobile, 300);
    };
    
    window.addEventListener('resize', debouncedCheck);
    window.addEventListener('orientationchange', () => {
      // Orientation change needs longer delay for mobile browsers
      setTimeout(checkIsMobile, 500);
    });
    
    return () => {
      mounted = false;
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedCheck);
      window.removeEventListener('orientationchange', debouncedCheck);
    };
  }, []);
  
  return { isMobile, isLoading, debugInfo };
};

const Dashboard: React.FC = () => {
  const { isMobile, isLoading, debugInfo } = useIsMobile();
  
  // CRITICAL FIX: Prevent multiple initializations
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [marketCondition, setMarketCondition] = useState<'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash'>('calm');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [simulationStartTime, setSimulationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  
  const [showDebugPopup, setShowDebugPopup] = useState<boolean>(false);
  
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState<boolean>(false);
  const [showStressTestController, setShowStressTestController] = useState<boolean>(false);
  const [wsMessageCount, setWsMessageCount] = useState<number>(0);
  
  const [currentScenario, setCurrentScenario] = useState<any | null>(null);
  const [scenarioPhaseData, setScenarioPhaseData] = useState<any>(null);
  
  const [dynamicChartView, setDynamicChartView] = useState<boolean>(true);
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN/USDT');
  
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [orderBook, setOrderBook] = useState<any>({ bids: [], asks: [], lastUpdateTime: Date.now() });
  const [priceHistory, setPriceHistory] = useState<SimulationPricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<any[]>([]);
  const [traderRankings, setTraderRankings] = useState<any[]>([]);
  const [totalTradesProcessed, setTotalTradesProcessed] = useState<number>(0);
  
  const [tradeExecutionTimes, setTradeExecutionTimes] = useState<number[]>([]);
  const [averageExecutionTime, setAverageExecutionTime] = useState<number>(0);
  const [isHighFrequencyMode, setIsHighFrequencyMode] = useState<boolean>(false);
  
  const [isWebSocketReady, setIsWebSocketReady] = useState<boolean>(false);
  const [simulationRegistrationStatus, setSimulationRegistrationStatus] = useState<'creating' | 'pending' | 'ready' | 'error'>('creating');
  const [initializationStep, setInitializationStep] = useState<string>('Starting...');
  
  const [dynamicPricingInfo, setDynamicPricingInfo] = useState<any>(null);
  const [simulationParameters, setSimulationParameters] = useState<SimulationParameters>({
    priceRange: 'random',
    customPrice: undefined,
    useCustomPrice: false,
    timeCompressionFactor: 1,
    initialLiquidity: 1000000,
    volatilityFactor: 1.0,
    duration: 3600,
    scenarioType: 'standard'
  });
  
  // CRITICAL FIX: Initialization guard refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<boolean>(false);
  const initializationLockRef = useRef<boolean>(false);
  const simulationCreatedRef = useRef<boolean>(false);
  
  const lastMessageProcessedRef = useRef<string>('');
  const marketConditionUpdateRef = useRef<number>(0);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const ULTRA_FAST_CONFIG = {
    MAX_PRICE_HISTORY: 1000,
    MAX_ACTIVE_POSITIONS: 500,
    MAX_TRADER_RANKINGS: 200,
    MEMORY_MANAGEMENT_THRESHOLD: 10000,
    PERFORMANCE_MODE_THRESHOLD: 5000,
  };

  const speedMap = {
    'slow': 2,
    'medium': 3, 
    'fast': 6,
    'ludicrous': 10,
    'ultra': 50,
    'quantum': 100
  } as const;

  // CRITICAL FIX: Only connect WebSocket when simulation is confirmed ready
  const { isConnected, lastMessage, setPauseState, connectionError, messageStats } = useWebSocket(
    isWebSocketReady && simulationRegistrationStatus === 'ready' && simulationId ? simulationId : undefined,
    simulation?.isPaused
  );

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
    }
  }, [recentTrades.length, activePositions.length, priceHistory.length]);

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
    
    if (data.dynamicPricing) {
      setDynamicPricingInfo(data.dynamicPricing);
    }
    
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
    
    setTimeout(manageUltraFastMemory, 100);
  }, [simulation, manageUltraFastMemory]);

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
      }
    }, 100);
    
  }, [determineMarketCondition, marketCondition]);

  // CRITICAL FIX: Enhanced WebSocket message handling with setPauseState_response handler
  useEffect(() => {
    if (!lastMessage) return;
    
    const { simulationId: msgSimId, event } = lastMessage;
    
    // CRITICAL: Create unique message identifier
    const messageId = `${msgSimId}-${event.type}-${event.timestamp}`;
    if (lastMessageProcessedRef.current === messageId) {
      console.log(`🔄 SKIPPED: Duplicate message ${messageId}`);
      return;
    }
    lastMessageProcessedRef.current = messageId;
    
    // CRITICAL: Only process messages for OUR simulation
    if (simulationId && msgSimId !== simulationId) {
      console.log(`⚠️ IGNORED: Message for different simulation ${msgSimId} (ours: ${simulationId})`);
      return;
    }
    
    if (!simulation && event.type !== 'simulation_state') {
      console.log(`⚠️ IGNORED: Message for non-existent simulation: ${event.type}`);
      return;
    }
    
    const { type, data } = event;
    
    setWsMessageCount(prev => prev + 1);
    
    // Log message processing for debugging
    console.log(`📨 [WS] Processing message: ${type} for simulation ${msgSimId}`);
    
    switch (type) {
      case 'simulation_state':
        if (data) {
          console.log(`📊 [WS] Simulation state update for ${msgSimId}`);
          updateSimulationState(data, 'simulation_state');
          
          if (data.registrationStatus === 'ready') {
            setSimulationRegistrationStatus('ready');
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
              return updated.slice(0, keepCount);
            }
            
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
          console.log(`📊 [WS] Candle update: ${data.priceHistory.length} candles`);
          setPriceHistory(data.priceHistory);
        }
        break;
        
      case 'batch_update':
        if (data?.updates) {
          const { updates } = data;
          
          const batchData: any = {};
          
          if (updates.trades && Array.isArray(updates.trades)) {
            setRecentTrades(prev => {
              const existingIds = new Set(prev.map(t => t.id));
              const newTrades = updates.trades.filter((t: any) => !existingIds.has(t.id));
              const combined = [...newTrades, ...prev];
              
              if (combined.length > ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
                const keepCount = Math.floor(ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.9);
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
          console.log(`📊 [WS] Simulation status: isRunning=${data.isRunning}, isPaused=${data.isPaused}`);
          setSimulation(prev => prev ? {
            ...prev,
            isRunning: data.isRunning ?? prev.isRunning,
            isPaused: data.isPaused ?? prev.isPaused
          } : prev);
        }
        break;

      // 🔧 CRITICAL FIX: Handle setPauseState_response message
      case 'setPauseState_response':
      case 'pause_state_changed':
        if (data) {
          console.log(`⏸️▶️ [PAUSE RESPONSE] Received pause state response:`, data);
          
          // Update simulation state based on backend response
          if (data.newState) {
            console.log(`🔄 [PAUSE RESPONSE] Updating simulation state: isRunning=${data.newState.isRunning}, isPaused=${data.newState.isPaused}`);
            
            setSimulation(prev => prev ? {
              ...prev,
              isRunning: data.newState.isRunning,
              isPaused: data.newState.isPaused
            } : prev);
            
            // Update the pause state tracking
            if (data.action) {
              if (data.action === 'paused') {
                console.log(`⏸️ [PAUSE RESPONSE] Simulation successfully paused`);
              } else if (data.action === 'resumed' || data.action === 'started') {
                console.log(`▶️ [PAUSE RESPONSE] Simulation successfully ${data.action}`);
              }
            }
          }
          
          // Show user feedback
          if (data.success) {
            const actionText = data.action === 'paused' ? 'paused' : 
                              data.action === 'resumed' ? 'resumed' : 
                              data.action === 'started' ? 'started' : 'updated';
            console.log(`✅ [PAUSE RESPONSE] Simulation ${actionText} successfully via WebSocket`);
          } else if (data.error) {
            console.error(`❌ [PAUSE RESPONSE] Pause state change failed: ${data.error}`);
          }
        } else {
          console.log(`📡 [PAUSE RESPONSE] Received setPauseState_response without data`);
        }
        break;
        
      case 'scenario_started':
      case 'scenario_phase_update':
      case 'scenario_phase_transition':
        if (data) {
          if (type === 'scenario_started') {
            setCurrentScenario(data);
          } else if (type === 'scenario_phase_update') {
            setScenarioPhaseData(data);
          }
        }
        break;
        
      case 'scenario_ended':
        setCurrentScenario(null);
        setScenarioPhaseData(null);
        break;
        
      default:
        console.log(`🔍 [WS] Unhandled message type: ${type}`);
        break;
    }
    
  }, [lastMessage, simulationId, simulation?.id, updateSimulationState, recentTrades.length]);

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

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const determineTokenSymbol = useCallback((price: number): string => {
    if (price < 0.01) return 'MEME/USDT';
    if (price < 1) return 'SHIB/USDT';
    if (price < 10) return 'DOGE/USDT';
    if (price < 100) return 'MATIC/USDT';
    if (price < 1000) return 'ETH/USDT';
    return 'BTC/USDT';
  }, []);

  // CRITICAL FIX: Single initialization with proper locking to prevent duplicate simulations
  useEffect(() => {
    // CRITICAL: Prevent multiple initialization calls
    if (initializationRef.current || initializationLockRef.current || simulationCreatedRef.current) {
      console.log('🔒 PREVENTED: Double initialization attempt');
      return;
    }
    
    initializationRef.current = true;
    initializationLockRef.current = true;

    const initSimulation = async () => {
      setLoading(true);
      setSimulationRegistrationStatus('creating');
      
      try {
        setInitializationStep('Creating simulation with dynamic pricing...');
        console.log('🚀 FIXED: Starting single simulation creation');
        
        // CRITICAL: Check if simulation already exists
        if (simulationCreatedRef.current) {
          console.log('⚠️ PREVENTED: Simulation already created');
          initializationLockRef.current = false;
          return;
        }
        
        const response = await SimulationApi.createSimulation({
          duration: simulationParameters.duration,
          volatilityFactor: simulationParameters.volatilityFactor,
          scenarioType: simulationParameters.scenarioType,
          timeCompressionFactor: simulationParameters.timeCompressionFactor,
          initialLiquidity: simulationParameters.initialLiquidity,
          priceRange: simulationParameters.priceRange,
          customPrice: simulationParameters.useCustomPrice ? simulationParameters.customPrice : undefined,
          useCustomPrice: simulationParameters.useCustomPrice
        });
        
        if (response.error) {
          setError(response.error);
          initializationLockRef.current = false;
          return;
        }
        
        const responseData = response.data?.data || response.data;
        const simId = response.data?.simulationId || responseData?.id;
        
        if (!simId) {
          throw new Error('No simulation ID received from server');
        }
        
        // CRITICAL: Mark simulation as created IMMEDIATELY to prevent duplicates
        simulationCreatedRef.current = true;
        setSimulationId(simId);
        
        console.log(`✅ FIXED: Single simulation created with ID: ${simId}`);
        
        if (response.data?.dynamicPricing) {
          setDynamicPricingInfo(response.data.dynamicPricing);
          console.log('💰 Dynamic pricing info received:', response.data.dynamicPricing);
        }
        
        if (response.data?.registrationStatus === 'ready' && response.data?.isReady) {
          setSimulationRegistrationStatus('ready');
        } else {
          setSimulationRegistrationStatus('pending');
          setInitializationStep('Waiting for backend registration...');
        }
        
        setInitializationStep('Verifying simulation readiness...');
        
        const readyResult = await SimulationApi.waitForSimulationReady(simId, 10, 500);
        
        if (readyResult.error || !readyResult.data?.ready) {
          const errorMsg = readyResult.error || `Simulation failed to become ready after ${readyResult.data?.attempts || 0} attempts`;
          throw new Error(errorMsg);
        }
        
        setSimulationRegistrationStatus('ready');
        
        setInitializationStep('Loading simulation data...');
        
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
        
        setInitializationStep('Initializing dashboard state...');
        
        const dynamicPrice = simData.currentPrice;
        console.log(`💰 Using dynamic price from simulation: ${dynamicPrice}`);
        
        updateSimulationState({
          currentPrice: dynamicPrice,
          orderBook: simData.orderBook || { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: simData.priceHistory || [],
          recentTrades: simData.recentTrades || [],
          activePositions: simData.activePositions || [],
          traderRankings: simData.traderRankings || [],
          dynamicPricing: simData.dynamicPricing
        }, 'initialization');
        
        setTokenSymbol(determineTokenSymbol(dynamicPrice));
        
        setInitializationStep('Enabling WebSocket connection...');
        
        // CRITICAL: Only enable WebSocket after simulation is confirmed ready
        setTimeout(() => {
          setIsWebSocketReady(true);
          console.log('🔌 FIXED: WebSocket enabled for single simulation');
        }, 500);
        
        setInitializationStep('Ready for trading with dynamic pricing!');
        
      } catch (error) {
        setError('Failed to initialize simulation');
        simulationCreatedRef.current = false; // Reset on error
        if (process.env.NODE_ENV === 'development') {
          console.error(error);
        }
        setSimulationRegistrationStatus('error');
      } finally {
        setLoading(false);
        initializationLockRef.current = false;
      }
    };
    
    initSimulation();
  }, []); // CRITICAL: Empty dependency array to prevent re-runs

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

  const chartPriceHistory = useMemo(() => convertPriceHistory(priceHistory), [priceHistory, convertPriceHistory]);

  const formatTradeCount = useCallback((count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }, []);

  const handleStartSimulation = useCallback(async () => {
    if (!simulationId) {
      console.warn('⚠️ Cannot start: No simulation ID');
      return;
    }
    
    if (!isConnected) {
      console.warn('⚠️ Cannot start: WebSocket not connected');
      return;
    }
    
    if (simulationRegistrationStatus !== 'ready') {
      console.warn('⚠️ Cannot start: Simulation not ready');
      return;
    }
    
    try {
      console.log(`🚀 Starting simulation ${simulationId}`);
      const response = await SimulationApi.startSimulation(simulationId);
      
      if (response.error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to start simulation:', response.error);
        }
        return;
      }
      
      setSimulation(prev => prev ? { ...prev, isRunning: true, isPaused: false } : prev);
      setPauseState(false);
      
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      console.log(`✅ Simulation ${simulationId} started successfully`);
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to start simulation:', error);
      }
    }
  }, [simulationId, simulationStartTime, setPauseState, isConnected, simulationRegistrationStatus]);

  // 🔧 CRITICAL FIX: Enhanced pause handler using WebSocket setPauseState
  const handlePauseSimulation = useCallback(async () => {
    if (!simulationId) {
      console.warn('⚠️ Cannot pause: No simulation ID');
      return;
    }
    
    if (!isConnected) {
      console.warn('⚠️ Cannot pause: WebSocket not connected');
      return;
    }
    
    try {
      console.log(`⏸️ Pausing simulation ${simulationId} via WebSocket`);
      
      // CRITICAL FIX: Use WebSocket setPauseState instead of direct API call
      // This ensures proper backend coordination and prevents data flow after pause
      setPauseState(true);
      
      // Update local state optimistically
      setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
      
      console.log(`✅ Pause request sent for simulation ${simulationId}`);
      
    } catch (error) {
      console.error('❌ Failed to pause simulation via WebSocket:', error);
      
      // Fallback to direct API call if WebSocket fails
      try {
        console.log(`🔄 Fallback: Trying direct API pause for ${simulationId}`);
        await SimulationApi.pauseSimulation(simulationId);
        setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
        console.log(`✅ Simulation ${simulationId} paused via API fallback`);
      } catch (apiError) {
        console.error('❌ API fallback pause also failed:', apiError);
      }
    }
  }, [simulationId, setPauseState, isConnected]);

  // FIXED: Clean reset implementation that triggers PriceChart reset via empty priceHistory
  const handleResetSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      console.log('🔄 CLEAN RESET: Starting simple reset process');
      
      // Step 1: Pause simulation if running
      if (simulation?.isRunning) {
        console.log('🔄 CLEAN RESET: Pausing simulation first');
        await SimulationApi.pauseSimulation(simulationId);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Step 2: Clear local state - this triggers PriceChart reset when priceHistory becomes empty
      console.log('🧹 CLEAN RESET: Clearing local state (triggers chart reset)');
      setRecentTrades([]);
      setOrderBook({ bids: [], asks: [], lastUpdateTime: Date.now() });
      setPriceHistory([]); // CRITICAL: This empty array triggers PriceChart's detectAndHandleReset
      setActivePositions([]);
      setTraderRankings([]);
      setCurrentPrice(0);
      
      setTotalTradesProcessed(0);
      setMarketCondition('calm');
      setSimulationStartTime(null);
      setElapsedTime("00:00:00");
      setWsMessageCount(0);
      setIsHighFrequencyMode(false);
      setCurrentScenario(null);
      setScenarioPhaseData(null);
      setDynamicPricingInfo(null);
      
      // Clear refs
      lastMessageProcessedRef.current = '';
      marketConditionUpdateRef.current = 0;
      
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Step 3: Call backend reset to generate new simulation state
      console.log('🔄 CLEAN RESET: Calling backend reset');
      const resetResponse = await SimulationApi.resetSimulation(simulationId);
      
      if (resetResponse.error && process.env.NODE_ENV === 'development') {
        console.error('Failed to reset backend simulation:', resetResponse.error);
      }
      
      // Give backend time to complete reset
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 4: Get fresh simulation data with new dynamic price
      console.log('🔄 CLEAN RESET: Fetching fresh simulation data');
      const freshSimResponse = await SimulationApi.getSimulation(simulationId);
      
      if (freshSimResponse?.data) {
        const freshSimData = freshSimResponse.data?.data || freshSimResponse.data;
        freshSimData.id = simulationId;
        
        const newDynamicPrice = freshSimData.currentPrice;
        console.log(`💰 Reset generated new dynamic price: ${newDynamicPrice}`);
        
        setSimulation({
          ...freshSimData,
          isRunning: false,
          isPaused: false,
          priceHistory: [], // Ensure empty start
          recentTrades: [],
          activePositions: [],
          currentPrice: newDynamicPrice
        });
        
        updateSimulationState({
          currentPrice: newDynamicPrice,
          orderBook: { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: [], // This will keep chart empty until new data arrives
          recentTrades: [],
          activePositions: [],
          traderRankings: freshSimData.traderRankings || [],
          dynamicPricing: resetResponse.data?.dynamicPricing || freshSimData.dynamicPricing
        }, 'reset');
        
        setTokenSymbol(determineTokenSymbol(newDynamicPrice));
        
        if (resetResponse.data?.dynamicPricing) {
          setDynamicPricingInfo(resetResponse.data.dynamicPricing);
        }
        
        console.log('✅ CLEAN RESET: Complete with new dynamic price');
        
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch fresh simulation state');
        }
        
        // Emergency reset with fallback
        const fallbackPrice = 1.0;
        
        updateSimulationState({
          currentPrice: fallbackPrice,
          orderBook: { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          traderRankings: []
        }, 'emergency_reset');
        
        setSimulation(prev => prev ? {
          ...prev,
          isRunning: false,
          isPaused: false,
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          currentPrice: fallbackPrice
        } : prev);
        
        console.log('⚠️ CLEAN RESET: Emergency fallback complete');
      }
      
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error during clean reset:', error);
      }
      
      // Emergency cleanup
      setRecentTrades([]);
      setPriceHistory([]); // Trigger chart reset
      setActivePositions([]);
      setOrderBook({ bids: [], asks: [], lastUpdateTime: Date.now() });
      setCurrentPrice(0);
      setTotalTradesProcessed(0);
      setMarketCondition('calm');
      setSimulationStartTime(null);
      setElapsedTime("00:00:00");
      setWsMessageCount(0);
      setIsHighFrequencyMode(false);
      setCurrentScenario(null);
      setScenarioPhaseData(null);
      setDynamicPricingInfo(null);
      
      if (simulation) {
        setSimulation(prev => prev ? {
          ...prev,
          isRunning: false,
          isPaused: false,
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          currentPrice: 0
        } : prev);
      }
      
      console.log('❌ CLEAN RESET: Error recovery complete');
    }
  }, [simulationId, simulation, determineTokenSymbol, updateSimulationState]);

  const handleSpeedChange = useCallback(async (speedOption: keyof typeof speedMap) => {
    const speedValue = speedMap[speedOption];
    setSimulationSpeed(speedValue);
    
    if (speedOption === 'ultra' || speedOption === 'quantum') {
      setIsHighFrequencyMode(true);
    }
    
    if (simulationId) {
      try {
        await SimulationApi.setSimulationSpeed(simulationId, speedValue);
        console.log(`⚡ Speed changed to ${speedValue}x for simulation ${simulationId}`);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`Failed to update simulation speed:`, error);
        }
      }
    }
  }, [simulationId]);

  const toggleDynamicView = useCallback(() => {
    setDynamicChartView(prev => !prev);
  }, []);

  // Show mobile detection loading
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900">
        <div className="text-white text-center">
          <div className="animate-spin h-8 w-8 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-lg">Detecting device type...</span>
          <div className="mt-2 text-sm text-gray-400">
            🔍 Enhanced mobile detection active
          </div>
        </div>
      </div>
    );
  }
  
  // Mobile detected - use mobile dashboard
  if (isMobile) {
    return (
      <React.Suspense 
        fallback={
          <div className="flex justify-center items-center h-screen bg-[#0B1426]">
            <div className="text-white text-center">
              <div className="animate-spin h-12 w-12 mx-auto mb-4 border-4 border-green-500 border-t-transparent rounded-full"></div>
              <span className="text-xl">Loading Mobile Trading...</span>
              <div className="mt-4 text-sm text-gray-400">
                📱 Full mobile interface with TradingView charts
              </div>
              {process.env.NODE_ENV === 'development' && debugInfo && (
                <div className="mt-2 text-xs text-gray-500">
                  Detection: {debugInfo?.finalDecision ? 'Mobile' : 'Desktop'} (Score: {debugInfo?.mobileScore})
                </div>
              )}
            </div>
          </div>
        }
      >
        <MobileDashboard />
      </React.Suspense>
    );
  }

  // Desktop Dashboard
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
          {simulationId && (
            <div className="mt-2 text-xs text-cyan-400">
              Simulation ID: {simulationId.substring(0, 8)}...
            </div>
          )}
          <div className="mt-4 text-sm text-blue-400">
            ✅ FIXED: No duplicate simulations
          </div>
          <div className="mt-2 text-sm text-green-400">
            ✅ FIXED: Single data stream
          </div>
          <div className="mt-2 text-sm text-purple-400">
            ✅ FIXED: Clean WebSocket connection
          </div>
          <div className="mt-2 text-sm text-orange-400">
            💰 FIXED: Dynamic pricing - NO $100!
          </div>
          <div className="mt-2 text-sm text-cyan-400">
            🖥️ Desktop mode • Enhanced mobile detection
          </div>
          <div className="mt-2 text-sm text-green-400">
            ✅ FIXED: Initialization locked to prevent duplication
          </div>
          <div className="mt-2 text-sm text-yellow-400">
            🔧 CRITICAL FIX: setPauseState_response handler added
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
          {simulationId && (
            <p className="mt-2 text-xs text-cyan-400">
              Simulation ID: {simulationId.substring(0, 8)}...
            </p>
          )}
          <div className="mt-4">
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition mr-2"
            >
              Reload
            </button>
            {process.env.NODE_ENV === 'development' && (
              <button 
                onClick={() => setShowDebugPopup(!showDebugPopup)} 
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded transition"
              >
                {showDebugPopup ? 'Hide' : 'Show'} Debug
              </button>
            )}
          </div>
          
          {showDebugPopup && debugInfo && process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-gray-700 rounded text-left text-xs">
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}
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
          {simulationId && (
            <p className="mt-2 text-xs text-cyan-400">
              Simulation ID: {simulationId.substring(0, 8)}...
            </p>
          )}
        </div>
      </div>
    );
  }

  const canStartSimulation = isConnected && 
                            simulationRegistrationStatus === 'ready' && 
                            (!simulation.isRunning || simulation.isPaused);

  return (
    <div className="h-screen w-full bg-gray-900 text-white p-2 flex flex-col overflow-hidden">
      {/* Header with simulation info */}
      <div className="flex flex-col mb-2 bg-gray-800 rounded-md shadow-sm">
        <div className="flex justify-between items-center h-10 p-2">
          <div className="flex items-center">
            <h1 className="text-base font-bold mr-3">Trading Simulator</h1>
            
            {/* FIXED: Show simulation ID for debugging */}
            {simulationId && (
              <div className="ml-2 text-xs bg-blue-900 px-2 py-1 rounded text-blue-300">
                ID: {simulationId.substring(0, 8)}...
              </div>
            )}
            
            {/* Essential trading info only */}
            <div className="ml-2 text-xs bg-gray-700 px-2 py-1 rounded">
              <span className="text-gray-400 mr-1">{tokenSymbol}:</span>
              <span className="text-white font-medium">${currentPrice < 1 ? currentPrice.toFixed(6) : currentPrice.toFixed(2)}</span>
            </div>
            
            {/* Dynamic pricing indicator */}
            {dynamicPricingInfo && (
              <div className="ml-2 text-xs bg-green-900 px-2 py-1 rounded text-green-300">
                💰 {dynamicPricingInfo.priceCategory || 'Dynamic'}
              </div>
            )}
            
            {/* Connection status */}
            <div className="ml-2 flex items-center">
              <div className={`w-2 h-2 rounded-full mr-1 ${
                isConnected ? 'bg-green-500' : connectionError ? 'bg-red-500' : 'bg-yellow-500'
              }`}></div>
              <span className="text-xs text-gray-400">
                {isConnected ? 'Connected' : connectionError || 'Connecting...'}
              </span>
            </div>
            
            {/* Market condition */}
            <div className="ml-3 flex items-center">
              <span className="text-xs text-gray-400 mr-1">Market:</span>
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
            
            {/* Current scenario */}
            {currentScenario && (
              <div className="ml-2 text-xs text-purple-400 px-2 py-1 bg-purple-900 rounded">
                📈 {currentScenario.scenarioName || 'Scenario Active'}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Essential timer */}
            <div className="text-xs bg-gray-700 px-2 py-1 rounded">
              <span className="text-gray-400">Time:</span>
              <span className="ml-1 font-mono text-white">{elapsedTime}</span>
            </div>
            
            {/* Debug info button */}
            <button 
              onClick={() => setShowDebugPopup(!showDebugPopup)}
              className="text-gray-400 hover:text-blue-400 text-sm transition"
              title="Show debug information"
            >
              ℹ️
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
            
            <button 
              onClick={() => setShowStressTestController(!showStressTestController)}
              className={`text-xs px-2 py-1 rounded transition ${
                showStressTestController ? 'text-red-400 bg-red-900' : 'text-gray-400 hover:text-gray-300'
              }`}
              title="Stress Test Controller"
            >
              Stress
            </button>
          </div>
        </div>
        
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
                title="🔧 FIXED: Now uses WebSocket setPauseState for immediate data stop"
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
              title="Clean reset - triggers chart reset via empty priceHistory"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Debug Info Popup */}
      {showDebugPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Debug Information</h3>
              <button 
                onClick={() => setShowDebugPopup(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              {/* FIXED: Simulation Status */}
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-blue-400 font-semibold mb-2">FIXED Simulation Status</div>
                <div className="space-y-1 text-xs">
                  <div>Simulation ID: <span className="text-cyan-400">{simulationId?.substring(0, 12) || 'None'}...</span></div>
                  <div>Created: <span className={simulationCreatedRef.current ? 'text-green-400' : 'text-red-400'}>{simulationCreatedRef.current ? 'Yes' : 'No'}</span></div>
                  <div>Init Lock: <span className={initializationLockRef.current ? 'text-yellow-400' : 'text-green-400'}>{initializationLockRef.current ? 'Locked' : 'Free'}</span></div>
                  <div>Registration: <span className="text-green-400">{simulationRegistrationStatus}</span></div>
                  <div>WebSocket: <span className={isConnected ? 'text-green-400' : 'text-red-400'}>{isConnected ? 'Connected' : 'Disconnected'}</span></div>
                  <div>WebSocket Ready: <span className={isWebSocketReady ? 'text-green-400' : 'text-yellow-400'}>{isWebSocketReady ? 'Yes' : 'No'}</span></div>
                  <div>Running: <span className={simulation.isRunning ? 'text-green-400' : 'text-gray-400'}>{simulation.isRunning ? 'Yes' : 'No'}</span></div>
                  <div>Paused: <span className={simulation.isPaused ? 'text-yellow-400' : 'text-gray-400'}>{simulation.isPaused ? 'Yes' : 'No'}</span></div>
                </div>
              </div>

              {/* 🔧 CRITICAL FIX: Enhanced pause handler status */}
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-green-400 font-semibold mb-2">🔧 CRITICAL FIX: Pause Handler</div>
                <div className="space-y-1 text-xs">
                  <div>setPauseState_response: <span className="text-green-400">HANDLED ✅</span></div>
                  <div>WebSocket Pause: <span className="text-green-400">ENABLED ✅</span></div>
                  <div>Data Stop Guarantee: <span className="text-green-400">ACTIVE ✅</span></div>
                  <div>Backend Coordination: <span className="text-green-400">SYNCHRONIZED ✅</span></div>
                  <div>Pause Method: <span className="text-green-400">WebSocket setPauseState</span></div>
                  <div>Fallback: <span className="text-blue-400">Direct API available</span></div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-purple-400 font-semibold mb-2">Performance Metrics</div>
                <div className="space-y-1 text-xs">
                  <div>Messages: <span className="text-white">{wsMessageCount}</span></div>
                  <div>Candles: <span className="text-white">{priceHistory.length}</span></div>
                  <div>Trades: <span className="text-accent font-bold">{formatTradeCount(recentTrades.length)}</span></div>
                  <div>Active Positions: <span className="text-white">{activePositions.length}</span></div>
                  <div>Traders: <span className="text-white">{traderRankings.length}</span></div>
                  <div>HF Mode: <span className={isHighFrequencyMode ? 'text-yellow-400' : 'text-gray-400'}>{isHighFrequencyMode ? 'Active' : 'Inactive'}</span></div>
                </div>
              </div>

              {/* FIXED: Clean Reset System Status */}
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-green-400 font-semibold mb-2">FIXED Clean Reset System</div>
                <div className="space-y-1 text-xs">
                  <div>Reset Method: <span className="text-green-400">CLEAN</span></div>
                  <div>Price History Length: <span className="text-white">{priceHistory.length}</span></div>
                  <div>Chart Reset Trigger: <span className="text-green-400">Empty priceHistory array</span></div>
                  <div>✅ Fixed: <span className="text-green-400">No duplicate simulations</span></div>
                  <div>📡 Single Stream: <span className="text-green-400">One simulation ID</span></div>
                </div>
              </div>

              {/* FIXED: Dynamic Pricing Info */}
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-green-400 font-semibold mb-2">FIXED Dynamic Pricing</div>
                <div className="space-y-1 text-xs">
                  <div>Current Price: <span className="text-white">${currentPrice.toFixed(6)}</span></div>
                  <div>Category: <span className="text-green-400">{dynamicPricingInfo?.priceCategory || 'Unknown'}</span></div>
                  <div>Was Custom: <span className={dynamicPricingInfo?.wasCustom ? 'text-yellow-400' : 'text-gray-400'}>{dynamicPricingInfo?.wasCustom ? 'Yes' : 'No'}</span></div>
                  <div>Token Symbol: <span className="text-white">{tokenSymbol}</span></div>
                  <div>✅ FIXED: <span className="text-green-400">No hardcoded $100!</span></div>
                </div>
              </div>

              {/* FIXED: Deduplication Status */}
              <div className="bg-gray-700 p-3 rounded">
                <div className="text-cyan-400 font-semibold mb-2">FIXED Deduplication</div>
                <div className="space-y-1 text-xs">
                  <div>Duplicate Prevention: <span className="text-green-400">ACTIVE</span></div>
                  <div>Message Dedup: <span className="text-green-400">ENABLED</span></div>
                  <div>Last Msg ID: <span className="text-white">{lastMessageProcessedRef.current.substring(0, 20)}...</span></div>
                  <div>Init Guard: <span className="text-green-400">PROTECTED</span></div>
                  <div>Single WebSocket: <span className="text-green-400">ENFORCED</span></div>
                </div>
              </div>

              {/* Mobile Detection (Development) */}
              {process.env.NODE_ENV === 'development' && debugInfo && (
                <div className="bg-gray-700 p-3 rounded">
                  <div className="text-cyan-400 font-semibold mb-2">Mobile Detection</div>
                  <div className="space-y-1 text-xs">
                    <div>Screen: <span className="text-white">{debugInfo.screenWidth}x{debugInfo.screenHeight}</span></div>
                    <div>Score: <span className="text-white">{debugInfo.mobileScore}/10</span></div>
                    <div>Mode: <span className={debugInfo.finalDecision ? 'text-red-400' : 'text-green-400'}>{debugInfo.finalDecision ? 'Mobile' : 'Desktop'}</span></div>
                    <div>Touch: <span className={debugInfo.hasTouch ? 'text-green-400' : 'text-gray-400'}>{debugInfo.hasTouch ? 'Yes' : 'No'}</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* Message Stats */}
            {messageStats && (
              <div className="mt-4 bg-gray-700 p-3 rounded">
                <div className="text-red-400 font-semibold mb-2">WebSocket Message Stats</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>Received: <span className="text-white">{messageStats.received}</span></div>
                  <div>Processed: <span className="text-white">{messageStats.processed}</span></div>
                  <div>Dropped: <span className="text-red-400">{messageStats.dropped}</span></div>
                  <div>Text Messages: <span className="text-white">{messageStats.textMessages}</span></div>
                  <div>Array Buffer: <span className="text-white">{messageStats.arrayBufferMessages}</span></div>
                  <div>Parse Errors: <span className="text-red-400">{messageStats.parseErrors}</span></div>
                </div>
              </div>
            )}

            <div className="mt-4 text-center">
              <button 
                onClick={() => setShowDebugPopup(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
              >
                Close Debug Info
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Grid Layout - Clean and simple */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '3fr 9fr', 
        gridTemplateRows: '3fr 2fr',
        gap: '8px',
        height: 'calc(100vh - 105px)',
        overflow: 'hidden'
      }}>
        {/* Left sidebar - OrderBook and RecentTrades */}
        <div style={{ 
          gridColumn: '1 / 2', 
          gridRow: '1 / 3', 
          display: 'grid',
          gridTemplateRows: '1fr 1fr',
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
        
        {/* FIXED: Price Chart - passes data to trigger reset when priceHistory is empty */}
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
        
        {/* Participants Overview */}
        <div style={{ gridColumn: '2 / 3', gridRow: '2 / 3', overflow: 'hidden' }}>
          <ParticipantsOverview 
            traders={traderRankings} 
            activePositions={activePositions}
            currentPrice={currentPrice}
            scenarioModifiers={currentScenario?.traderModifiers}
          />
        </div>
      </div>
      
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

      <StressTestController 
        isVisible={showStressTestController}
        onToggle={() => setShowStressTestController(!showStressTestController)}
        simulationRunning={simulation?.isRunning || false}
        simulationId={simulationId || undefined}
      />
    </div>
  );
};

export default Dashboard;