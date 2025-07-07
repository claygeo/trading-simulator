// frontend/src/components/mobile/MobileDashboard.tsx - COMPLETE IMPLEMENTATION
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SimulationApi } from '../../services/api';
import { useWebSocket } from '../../services/websocket';
import { Simulation, PricePoint as SimulationPricePoint } from '../../types';

// Mobile components with error boundaries
import MobileHeader from './MobileHeader';
import MobileChart from './MobileChart';
import MobileTabs from './MobileTabs';
import MobileParticipants from './mobile-sections/MobileParticipants';
import MobileOrderBook from './mobile-sections/MobileOrderBook';
import MobileRecentTrades from './mobile-sections/MobileRecentTrades';

interface ChartPricePoint {
  time: number;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// Error Boundary Component
class MobileErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 Mobile Dashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="h-screen w-full bg-[#0B1426] text-white flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-xl font-bold mb-2 text-red-400">Mobile Error</h2>
            <p className="text-sm text-gray-300 mb-4">
              A component failed to load properly.
            </p>
            <div className="text-xs text-gray-500 mb-4 p-2 bg-gray-800 rounded">
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Back to Top Button Component
const BackToTopButton: React.FC<{ isVisible: boolean; onClick: () => void }> = ({ isVisible, onClick }) => {
  if (!isVisible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-300 flex items-center justify-center"
      style={{
        transform: isVisible ? 'translateY(0)' : 'translateY(100px)',
        opacity: isVisible ? 1 : 0
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 14l5-5 5 5"/>
      </svg>
    </button>
  );
};

const MobileDashboard: React.FC = () => {
  // Core state
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Market state
  const [marketCondition, setMarketCondition] = useState<'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash'>('calm');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [simulationStartTime, setSimulationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  
  // WebSocket state
  const [wsMessageCount, setWsMessageCount] = useState<number>(0);
  const [currentScenario, setCurrentScenario] = useState<any | null>(null);
  const [scenarioPhaseData, setScenarioPhaseData] = useState<any>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN/USDT');
  
  // Trading data
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [orderBook, setOrderBook] = useState<any>({ bids: [], asks: [], lastUpdateTime: Date.now() });
  const [priceHistory, setPriceHistory] = useState<SimulationPricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<any[]>([]);
  const [traderRankings, setTraderRankings] = useState<any[]>([]);
  const [totalTradesProcessed, setTotalTradesProcessed] = useState<number>(0);
  
  // Connection state
  const [isWebSocketReady, setIsWebSocketReady] = useState<boolean>(false);
  const [simulationRegistrationStatus, setSimulationRegistrationStatus] = useState<'creating' | 'pending' | 'ready' | 'error'>('creating');
  const [initializationStep, setInitializationStep] = useState<string>('Starting...');
  
  // Mobile-specific state for full page extension
  const [activeTab, setActiveTab] = useState<'participants' | 'orderbook' | 'trades'>('participants');
  const [isTabContentExpanded, setIsTabContentExpanded] = useState<boolean>(false);
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);
  const [scrollPosition, setScrollPosition] = useState<number>(0);
  
  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<boolean>(false);
  const lastMessageProcessedRef = useRef<string>('');
  const marketConditionUpdateRef = useRef<number>(0);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Scroll position tracking ref
  const dashboardRef = useRef<HTMLDivElement>(null);
  
  // Mobile-optimized configuration
  const MOBILE_CONFIG = {
    MAX_PRICE_HISTORY: 500,
    MAX_ACTIVE_POSITIONS: 250,
    MAX_TRADER_RANKINGS: 118,
    MAX_RECENT_TRADES: 100,
    MEMORY_MANAGEMENT_THRESHOLD: 1000,
    PERFORMANCE_MODE_THRESHOLD: 500,
    UPDATE_THROTTLE: 100,
    BACK_TO_TOP_THRESHOLD: 300,
  };

  const speedMap = {
    'slow': 2,
    'medium': 3, 
    'fast': 6,
    'ludicrous': 10,
    'ultra': 50,
    'quantum': 100
  } as const;

  // WebSocket connection with mobile-specific timeouts
  const { isConnected, lastMessage, setPauseState, connectionError, messageStats } = useWebSocket(
    isWebSocketReady && simulationRegistrationStatus === 'ready' ? simulationId || undefined : undefined,
    simulation?.isPaused
  );

  // Scroll tracking for back to top button
  useEffect(() => {
    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      scrollTimeoutRef.current = setTimeout(() => {
        const currentScrollY = window.scrollY;
        setScrollPosition(currentScrollY);
        setShowBackToTop(currentScrollY > MOBILE_CONFIG.BACK_TO_TOP_THRESHOLD);
      }, 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Back to top functionality
  const scrollToTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }, []);

  // Market condition determination
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

  // Mobile memory management
  const manageMobileMemory = useCallback(() => {
    const tradeCount = recentTrades.length;
    
    if (tradeCount > MOBILE_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
      console.log('🧠 Mobile memory management triggered:', tradeCount);
      
      const keepTradeCount = Math.floor(MOBILE_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.5);
      setRecentTrades(prev => prev.slice(0, keepTradeCount));
      
      if (activePositions.length > MOBILE_CONFIG.MAX_ACTIVE_POSITIONS) {
        setActivePositions(prev => prev.slice(0, MOBILE_CONFIG.MAX_ACTIVE_POSITIONS));
      }
      
      if (priceHistory.length > MOBILE_CONFIG.MAX_PRICE_HISTORY) {
        setPriceHistory(prev => prev.slice(-MOBILE_CONFIG.MAX_PRICE_HISTORY));
      }
    }
  }, [recentTrades.length, activePositions.length, priceHistory.length]);

  // Update simulation state with mobile optimizations
  const updateSimulationState = useCallback((data: any, eventType: string) => {
    try {
      if (data.currentPrice !== undefined) {
        setCurrentPrice(data.currentPrice);
      }
      
      if (data.orderBook) {
        setOrderBook(data.orderBook);
      }
      
      if (data.priceHistory && Array.isArray(data.priceHistory)) {
        setPriceHistory(data.priceHistory.slice(-MOBILE_CONFIG.MAX_PRICE_HISTORY));
      }
      
      if (data.recentTrades && Array.isArray(data.recentTrades)) {
        setRecentTrades(data.recentTrades.slice(0, MOBILE_CONFIG.MAX_RECENT_TRADES));
        setTotalTradesProcessed(data.recentTrades.length);
      }
      
      if (data.activePositions) {
        setActivePositions(data.activePositions.slice(0, MOBILE_CONFIG.MAX_ACTIVE_POSITIONS));
      }
      
      if (data.traderRankings) {
        setTraderRankings(data.traderRankings);
      }
      
      if (data.totalTradesProcessed !== undefined) {
        setTotalTradesProcessed(data.totalTradesProcessed);
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
      
      setTimeout(manageMobileMemory, 200);
      
    } catch (error) {
      console.error('❌ Error updating mobile simulation state:', error);
    }
  }, [simulation, manageMobileMemory]);

  // Market condition updates with mobile throttling
  const updateMarketCondition = useCallback(() => {
    const now = Date.now();
    
    if (now - marketConditionUpdateRef.current < 3000) {
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
    }, MOBILE_CONFIG.UPDATE_THROTTLE);
    
  }, [determineMarketCondition, marketCondition]);

  // WebSocket message handling with mobile optimizations
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      const { simulationId: msgSimId, event } = lastMessage;
      
      const messageId = `${msgSimId}-${event.type}-${event.timestamp}`;
      if (lastMessageProcessedRef.current === messageId) {
        return;
      }
      lastMessageProcessedRef.current = messageId;
      
      if (simulationId && msgSimId !== simulationId) {
        return;
      }
      
      if (!simulation && event.type !== 'simulation_state') {
        return;
      }
      
      const { type, data } = event;
      
      setWsMessageCount(prev => prev + 1);
      
      switch (type) {
        case 'simulation_state':
          if (data) {
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
              
              if (updated.length > MOBILE_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
                const keepCount = Math.floor(MOBILE_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.8);
                return updated.slice(0, keepCount);
              }
              
              return updated;
            });
            
            setTotalTradesProcessed(prev => prev + 1);
          }
          break;
          
        case 'candle_update':
          if (data && data.priceHistory) {
            setPriceHistory(data.priceHistory.slice(-MOBILE_CONFIG.MAX_PRICE_HISTORY));
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
                
                if (combined.length > MOBILE_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
                  const keepCount = Math.floor(MOBILE_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.8);
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
      }
      
    } catch (error) {
      console.error('❌ Error processing mobile WebSocket message:', error);
    }
    
  }, [lastMessage, simulationId, simulation?.id, updateSimulationState]);

  // Market condition updates
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Token symbol determination
  const determineTokenSymbol = useCallback((price: number): string => {
    if (price < 0.01) return 'MEME/USDT';
    if (price < 1) return 'SHIB/USDT';
    if (price < 10) return 'DOGE/USDT';
    if (price < 100) return 'MATIC/USDT';
    if (price < 1000) return 'ETH/USDT';
    return 'BTC/USDT';
  }, []);

  // Mobile initialization with enhanced error handling
  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const initMobileSimulation = async () => {
      setLoading(true);
      setSimulationRegistrationStatus('creating');
      
      try {
        console.log('📱 Starting mobile simulation initialization...');
        setInitializationStep('Creating mobile simulation...');
        
        const response = await SimulationApi.createSimulation({
          initialPrice: 100,
          duration: 3600,
          volatilityFactor: 1.0,
          scenarioType: 'standard'
        });
        
        if (response.error) {
          setError(response.error);
          initializationRef.current = false;
          return;
        }
        
        const responseData = response.data?.data || response.data;
        const simId = response.data?.simulationId || responseData?.id;
        
        if (!simId) {
          throw new Error('No simulation ID received from server');
        }
        
        console.log('📱 Mobile simulation ID:', simId);
        setSimulationId(simId);
        
        if (response.data?.registrationStatus === 'ready' && response.data?.isReady) {
          setSimulationRegistrationStatus('ready');
        } else {
          setSimulationRegistrationStatus('pending');
          setInitializationStep('Waiting for mobile registration...');
        }
        
        setInitializationStep('Verifying mobile simulation readiness...');
        
        const readyResult = await SimulationApi.waitForSimulationReady(simId, 10, 500);
        
        if (readyResult.error || !readyResult.data?.ready) {
          const errorMsg = readyResult.error || `Mobile simulation failed to become ready after ${readyResult.data?.attempts || 0} attempts`;
          throw new Error(errorMsg);
        }
        
        setSimulationRegistrationStatus('ready');
        
        setInitializationStep('Loading mobile simulation data...');
        
        const simulationResponse = await SimulationApi.getSimulation(simId);
        
        if (simulationResponse?.error || !simulationResponse?.data) {
          throw new Error(`Failed to load mobile simulation data: ${simulationResponse?.error}`);
        }
        
        const simData = simulationResponse.data?.data || simulationResponse.data;
        
        if (!simData) {
          throw new Error('No mobile simulation data received');
        }
        
        simData.id = simId;
        setSimulation(simData);
        
        setInitializationStep('Initializing mobile dashboard state...');
        updateSimulationState({
          currentPrice: simData.currentPrice || 100,
          orderBook: simData.orderBook || { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: (simData.priceHistory || []).slice(-MOBILE_CONFIG.MAX_PRICE_HISTORY),
          recentTrades: (simData.recentTrades || []).slice(0, MOBILE_CONFIG.MAX_RECENT_TRADES),
          activePositions: (simData.activePositions || []).slice(0, MOBILE_CONFIG.MAX_ACTIVE_POSITIONS),
          traderRankings: simData.traderRankings || []
        }, 'mobile_initialization');
        
        const initialPrice = simData.currentPrice || 100;
        setTokenSymbol(determineTokenSymbol(initialPrice));
        
        setInitializationStep('Enabling mobile WebSocket connection...');
        setIsWebSocketReady(true);
        
        setInitializationStep('Mobile trading dashboard ready!');
        console.log('✅ Mobile simulation initialization complete');
        
      } catch (error) {
        console.error('❌ Mobile initialization error:', error);
        setError(`Mobile initialization failed: ${error}`);
        setSimulationRegistrationStatus('error');
        initializationRef.current = false;
      } finally {
        setLoading(false);
      }
    };
    
    initMobileSimulation();
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

  // Convert price history for mobile chart
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

  // Control handlers
  const handleStartSimulation = useCallback(async () => {
    if (!simulationId) return;
    if (!isConnected) return;
    if (simulationRegistrationStatus !== 'ready') return;
    
    try {
      console.log('📱 Starting mobile simulation...');
      const response = await SimulationApi.startSimulation(simulationId);
      
      if (response.error) {
        console.error('❌ Failed to start mobile simulation:', response.error);
        return;
      }
      
      setSimulation(prev => prev ? { ...prev, isRunning: true, isPaused: false } : prev);
      setPauseState(false);
      
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
    } catch (error) {
      console.error('❌ Failed to start mobile simulation:', error);
    }
  }, [simulationId, simulationStartTime, setPauseState, isConnected, simulationRegistrationStatus]);

  const handlePauseSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      console.log('📱 Pausing mobile simulation...');
      await SimulationApi.pauseSimulation(simulationId);
      setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
      setPauseState(true);
    } catch (error) {
      console.error('❌ Failed to pause mobile simulation:', error);
    }
  }, [simulationId, setPauseState]);

  const handleResetSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      console.log('📱 Resetting mobile simulation...');
      
      if (simulation?.isRunning) {
        await SimulationApi.pauseSimulation(simulationId);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Clear mobile state
      setRecentTrades([]);
      setOrderBook({ bids: [], asks: [], lastUpdateTime: Date.now() });
      setPriceHistory([]);
      setActivePositions([]);
      setTraderRankings([]);
      setCurrentPrice(100);
      
      setTotalTradesProcessed(0);
      setMarketCondition('calm');
      setSimulationStartTime(null);
      setElapsedTime("00:00:00");
      setWsMessageCount(0);
      setCurrentScenario(null);
      setScenarioPhaseData(null);
      
      // Reset mobile-specific state
      setIsTabContentExpanded(false);
      setScrollPosition(0);
      setShowBackToTop(false);
      scrollToTop();
      
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
      
      const resetResponse = await SimulationApi.resetSimulation(simulationId);
      
      if (resetResponse.error) {
        console.error('❌ Failed to reset mobile backend simulation:', resetResponse.error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const freshSimResponse = await SimulationApi.getSimulation(simulationId);
      
      if (freshSimResponse?.data) {
        const freshSimData = freshSimResponse.data?.data || freshSimResponse.data;
        freshSimData.id = simulationId;
        
        setSimulation({
          ...freshSimData,
          isRunning: false,
          isPaused: false,
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          currentPrice: 100
        });
        
        const resetPrice = 100;
        
        updateSimulationState({
          currentPrice: resetPrice,
          orderBook: { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          traderRankings: freshSimData.traderRankings || []
        }, 'mobile_reset');
        
        setTokenSymbol(determineTokenSymbol(resetPrice));
        
      } else {
        console.error('❌ Failed to fetch fresh mobile simulation state');
        
        updateSimulationState({
          currentPrice: 100,
          orderBook: { bids: [], asks: [], lastUpdateTime: Date.now() },
          priceHistory: [],
          recentTrades: [],
          activePositions: [],
          traderRankings: []
        }, 'mobile_emergency_reset');
        
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
      
      console.log('✅ Mobile simulation reset complete');
      
    } catch (error) {
      console.error('❌ Error during mobile reset:', error);
      
      // Emergency mobile reset
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
      setCurrentScenario(null);
      setScenarioPhaseData(null);
      
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
  }, [simulationId, simulation, determineTokenSymbol, updateSimulationState, scrollToTop]);

  const handleSpeedChange = useCallback(async (speedOption: keyof typeof speedMap) => {
    const speedValue = speedMap[speedOption];
    setSimulationSpeed(speedValue);
    
    if (simulationId) {
      try {
        console.log(`📱 Changing mobile speed to ${speedOption} (${speedValue}x)`);
        await SimulationApi.setSimulationSpeed(simulationId, speedValue);
      } catch (error) {
        console.error(`❌ Failed to update mobile simulation speed:`, error);
      }
    }
  }, [simulationId]);

  // Tab change handler with expansion control
  const handleTabChange = useCallback((tab: 'participants' | 'orderbook' | 'trades') => {
    setActiveTab(tab);
    // Auto-expand when switching tabs to show content
    if (!isTabContentExpanded) {
      setIsTabContentExpanded(true);
    }
  }, [isTabContentExpanded]);

  // FIXED: Simplified loading state without extra text
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0B1426]">
        <div className="text-white text-center">
          <div className="animate-spin h-12 w-12 mx-auto mb-4 border-4 border-green-500 border-t-transparent rounded-full"></div>
          <span className="text-xl">Loading Mobile Trading...</span>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0B1426]">
        <div className="text-red-400 p-6 bg-gray-800 rounded-lg shadow-lg text-center max-w-sm mx-4">
          <h2 className="text-xl font-bold mb-2">Mobile Error</h2>
          <p className="text-sm">{error}</p>
          <div className="mt-4 text-xs text-gray-400">
            Registration: {simulationRegistrationStatus}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Connection: {isConnected ? '✅ Connected' : '❌ Disconnected'}
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition w-full"
          >
            Reload Mobile App
          </button>
          <div className="mt-2 text-xs text-gray-500">
            If issues persist, try desktop mode
          </div>
        </div>
      </div>
    );
  }
  
  if (!simulation) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0B1426]">
        <div className="text-white p-6 bg-gray-800 rounded-lg shadow-lg text-center max-w-sm mx-4">
          <p>No mobile simulation data available</p>
          <p className="mt-2 text-sm text-gray-400">
            Registration Status: {simulationRegistrationStatus}
          </p>
          <div className="mt-4">
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canStartSimulation = isConnected && 
                            simulationRegistrationStatus === 'ready' && 
                            (!simulation.isRunning || simulation.isPaused);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'participants':
        return (
          <MobileErrorBoundary>
            <MobileParticipants 
              traders={traderRankings} 
              activePositions={activePositions}
              currentPrice={currentPrice}
              scenarioModifiers={currentScenario?.traderModifiers}
            />
          </MobileErrorBoundary>
        );
      case 'orderbook':
        return (
          <MobileErrorBoundary>
            <MobileOrderBook orderBook={orderBook} />
          </MobileErrorBoundary>
        );
      case 'trades':
        return (
          <MobileErrorBoundary>
            <MobileRecentTrades trades={recentTrades} />
          </MobileErrorBoundary>
        );
      default:
        return null;
    }
  };

  return (
    <MobileErrorBoundary>
      {/* Full page container with natural scroll */}
      <div 
        ref={dashboardRef}
        className="min-h-screen w-full bg-[#0B1426] text-white"
      >
        {/* Header - Price + Controls (Fixed at top, scrolls naturally) */}
        <MobileErrorBoundary>
          <MobileHeader 
            tokenSymbol={tokenSymbol}
            currentPrice={currentPrice}
            elapsedTime={elapsedTime}
            marketCondition={marketCondition}
            isConnected={isConnected}
            connectionError={connectionError}
            simulationRegistrationStatus={simulationRegistrationStatus}
            priceHistoryLength={priceHistory.length}
            tradesCount={recentTrades.length}
            wsMessageCount={wsMessageCount}
            simulation={simulation}
            canStartSimulation={canStartSimulation}
            onStart={handleStartSimulation}
            onPause={handlePauseSimulation}
            onReset={handleResetSimulation}
            simulationSpeed={simulationSpeed}
            onSpeedChange={handleSpeedChange}
            speedMap={speedMap}
            currentScenario={currentScenario}
            formatTradeCount={formatTradeCount}
          />
        </MobileErrorBoundary>
        
        {/* Chart Area (Fixed size, scrolls naturally) */}
        <div className="px-2 pb-2">
          <MobileErrorBoundary 
            fallback={
              <div className="h-64 bg-gray-800 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-2">📈</div>
                  <p>Chart temporarily unavailable</p>
                  <p className="text-xs mt-1">Price: ${currentPrice.toFixed(2)}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="mt-2 px-3 py-1 bg-blue-600 rounded text-sm"
                  >
                    Reload
                  </button>
                </div>
              </div>
            }
          >
            <MobileChart 
              priceHistory={chartPriceHistory} 
              currentPrice={currentPrice} 
              trades={recentTrades}
              scenarioData={scenarioPhaseData}
              symbol={tokenSymbol}
              dynamicView={true}
              isTabContentExpanded={isTabContentExpanded}
            />
          </MobileErrorBoundary>
        </div>
        
        {/* Tab Navigation (Always visible, scrolls naturally) */}
        <MobileErrorBoundary>
          <MobileTabs 
            activeTab={activeTab}
            onTabChange={handleTabChange}
            isExpanded={isTabContentExpanded}
            onToggleExpanded={() => setIsTabContentExpanded(!isTabContentExpanded)}
            tradersCount={traderRankings.length}
            tradesCount={recentTrades.length}
            orderBookSize={orderBook.bids.length + orderBook.asks.length}
          />
        </MobileErrorBoundary>
        
        {/* Tab Content (Full page extension when expanded) */}
        {isTabContentExpanded && (
          <div 
            className="bg-gray-800 border-t border-gray-700"
            style={{
              // Auto height allows natural page extension
              minHeight: '100vh',
              paddingBottom: '2rem'
            }}
          >
            {renderTabContent()}
          </div>
        )}

        {/* Back to Top Button */}
        <BackToTopButton 
          isVisible={showBackToTop}
          onClick={scrollToTop}
        />

        {/* Debug info in dev */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-20 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-40">
            <div>📱 Mobile • Scroll: {scrollPosition}px</div>
            <div>{recentTrades.length} trades • {priceHistory.length} candles</div>
            <div>Tab: {activeTab} • Expanded: {isTabContentExpanded ? 'Yes' : 'No'}</div>
            <div>Back to top: {showBackToTop ? 'Visible' : 'Hidden'}</div>
          </div>
        )}
      </div>
    </MobileErrorBoundary>
  );
};

export default MobileDashboard;