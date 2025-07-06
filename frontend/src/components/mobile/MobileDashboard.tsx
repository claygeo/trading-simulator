// frontend/src/components/mobile/MobileDashboard.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SimulationApi } from '../../services/api';
import { useWebSocket } from '../../services/websocket';
import { Simulation, PricePoint as SimulationPricePoint } from '../../types';
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

const MobileDashboard: React.FC = () => {
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [marketCondition, setMarketCondition] = useState<'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash'>('calm');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [simulationStartTime, setSimulationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  
  const [wsMessageCount, setWsMessageCount] = useState<number>(0);
  const [currentScenario, setCurrentScenario] = useState<any | null>(null);
  const [scenarioPhaseData, setScenarioPhaseData] = useState<any>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN/USDT');
  
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [orderBook, setOrderBook] = useState<any>({ bids: [], asks: [], lastUpdateTime: Date.now() });
  const [priceHistory, setPriceHistory] = useState<SimulationPricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [activePositions, setActivePositions] = useState<any[]>([]);
  const [traderRankings, setTraderRankings] = useState<any[]>([]);
  const [totalTradesProcessed, setTotalTradesProcessed] = useState<number>(0);
  
  const [isWebSocketReady, setIsWebSocketReady] = useState<boolean>(false);
  const [simulationRegistrationStatus, setSimulationRegistrationStatus] = useState<'creating' | 'pending' | 'ready' | 'error'>('creating');
  const [initializationStep, setInitializationStep] = useState<string>('Starting...');
  
  // Mobile-specific state
  const [activeTab, setActiveTab] = useState<'participants' | 'orderbook' | 'trades'>('participants');
  const [isTabContentExpanded, setIsTabContentExpanded] = useState<boolean>(true);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<boolean>(false);
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

  const { isConnected, lastMessage, setPauseState, connectionError, messageStats } = useWebSocket(
    isWebSocketReady && simulationRegistrationStatus === 'ready' ? simulationId || undefined : undefined,
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

  // WebSocket message handling - same as desktop
  useEffect(() => {
    if (!lastMessage) return;
    
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
            
            if (updated.length > ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD) {
              const keepCount = Math.floor(ULTRA_FAST_CONFIG.MEMORY_MANAGEMENT_THRESHOLD * 0.9);
              return updated.slice(0, keepCount);
            }
            
            return updated;
          });
          
          setTotalTradesProcessed(prev => prev + 1);
        }
        break;
        
      case 'candle_update':
        if (data && data.priceHistory) {
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

  // Initialization - same as desktop
  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const initSimulation = async () => {
      setLoading(true);
      setSimulationRegistrationStatus('creating');
      
      try {
        setInitializationStep('Creating simulation...');
        
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
        
        setSimulationId(simId);
        
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
        
        setInitializationStep('Enabling WebSocket connection...');
        setIsWebSocketReady(true);
        
        setInitializationStep('Ready for trading!');
        
      } catch (error) {
        setError('Failed to initialize simulation');
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
      return;
    }
    
    if (!isConnected) {
      return;
    }
    
    if (simulationRegistrationStatus !== 'ready') {
      return;
    }
    
    try {
      const response = await SimulationApi.startSimulation(simulationId);
      
      if (response.error) {
        console.error('Failed to start simulation:', response.error);
        return;
      }
      
      setSimulation(prev => prev ? { ...prev, isRunning: true, isPaused: false } : prev);
      setPauseState(false);
      
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
    } catch (error) {
      console.error('Failed to start simulation:', error);
    }
  }, [simulationId, simulationStartTime, setPauseState, isConnected, simulationRegistrationStatus]);

  const handlePauseSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      await SimulationApi.pauseSimulation(simulationId);
      setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
      setPauseState(true);
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    }
  }, [simulationId, setPauseState]);

  const handleResetSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      if (simulation?.isRunning) {
        await SimulationApi.pauseSimulation(simulationId);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
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
        console.error('Failed to reset backend simulation:', resetResponse.error);
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
        }, 'reset');
        
        setTokenSymbol(determineTokenSymbol(resetPrice));
        
      } else {
        console.error('Failed to fetch fresh simulation state');
        
        updateSimulationState({
          currentPrice: 100,
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
          currentPrice: 100
        } : prev);
      }
      
    } catch (error) {
      console.error('Error during comprehensive reset:', error);
      
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
  }, [simulationId, simulation, determineTokenSymbol, updateSimulationState]);

  const handleSpeedChange = useCallback(async (speedOption: keyof typeof speedMap) => {
    const speedValue = speedMap[speedOption];
    setSimulationSpeed(speedValue);
    
    if (simulationId) {
      try {
        await SimulationApi.setSimulationSpeed(simulationId, speedValue);
      } catch (error) {
        console.error(`Failed to update simulation speed:`, error);
      }
    }
  }, [simulationId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0B1426]">
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
            ✅ Ultra-fast mode activated
          </div>
          <div className="mt-2 text-sm text-green-400">
            ✅ Mobile optimized
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#0B1426]">
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
      <div className="flex justify-center items-center h-screen bg-[#0B1426]">
        <div className="text-white p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <p>No simulation data available</p>
          <p className="mt-2 text-sm text-gray-400">
            Registration Status: {simulationRegistrationStatus}
          </p>
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
          <MobileParticipants 
            traders={traderRankings} 
            activePositions={activePositions}
            currentPrice={currentPrice}
            scenarioModifiers={currentScenario?.traderModifiers}
          />
        );
      case 'orderbook':
        return <MobileOrderBook orderBook={orderBook} />;
      case 'trades':
        return <MobileRecentTrades trades={recentTrades} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full bg-[#0B1426] text-white flex flex-col overflow-hidden">
      {/* Header - Price + Controls (Fixed at top) */}
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
      
      {/* Chart Area (Responsive height) */}
      <div className="flex-1 min-h-0 px-2 pb-2">
        <MobileChart 
          priceHistory={chartPriceHistory} 
          currentPrice={currentPrice} 
          trades={recentTrades}
          scenarioData={scenarioPhaseData}
          symbol={tokenSymbol}
          dynamicView={true}
        />
      </div>
      
      {/* Tab Navigation (Always visible) */}
      <MobileTabs 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isExpanded={isTabContentExpanded}
        onToggleExpanded={() => setIsTabContentExpanded(!isTabContentExpanded)}
        tradersCount={traderRankings.length}
        tradesCount={recentTrades.length}
        orderBookSize={orderBook.bids.length + orderBook.asks.length}
      />
      
      {/* Tab Content (Expandable) */}
      {isTabContentExpanded && (
        <div className="bg-gray-800 border-t border-gray-700 max-h-[40vh] overflow-hidden">
          {renderTabContent()}
        </div>
      )}
    </div>
  );
};

export default MobileDashboard;