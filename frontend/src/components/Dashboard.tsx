// frontend/src/components/Dashboard.tsx - Simplified Version without TokenInfo
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SimulationApi } from '../services/api';
import { useWebSocket } from '../services/websocket';
import { Simulation } from '../types';
import PriceChart from './PriceChart';
import OrderBookComponent from './OrderBook';
import RecentTrades from './RecentTrades';
import ParticipantsOverview from './ParticipantsOverview';
import DynamicMusicPlayer from './DynamicMusicPlayer';
import SimulationControls from './SimulationControls';

const Dashboard: React.FC = () => {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [marketCondition, setMarketCondition] = useState<'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash'>('calm');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1); // Default to slow (1x)
  const [simulationStartTime, setSimulationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false);
  
  // Timer ref for simulation duration
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use a ref to track the last processed message to prevent infinite update loops
  const lastProcessedMessageRef = useRef<string | null>(null);
  
  const { isConnected, lastMessage } = useWebSocket(simulation?.id);

  // Add a debug log function
  const addDebugLog = useCallback((message: string) => {
    setDebugInfo(prev => [...prev.slice(-9), message]); // Keep last 10 messages
    console.log(message);
  }, []);
  
  // Create a new simulation when the component mounts
  useEffect(() => {
    const initSimulation = async () => {
      setLoading(true);
      try {
        addDebugLog("Creating simulation...");
        const response = await SimulationApi.createSimulation();
        if (response.error) {
          setError(response.error);
          addDebugLog(`Error creating simulation: ${response.error}`);
        } else {
          const simulationId = response.data.simulationId;
          addDebugLog(`Simulation created, ID: ${simulationId}`);
          
          const simulationResponse = await SimulationApi.getSimulation(simulationId);
          if (simulationResponse.error) {
            setError(simulationResponse.error);
            addDebugLog(`Error getting simulation: ${simulationResponse.error}`);
          } else {
            addDebugLog(`Simulation data received, initializing...`);
            setSimulation(simulationResponse.data);
            
            // Log some info about the simulation data received
            const data = simulationResponse.data;
            if (data) {
              addDebugLog(`Price history: ${data.priceHistory?.length || 0} points`);
              addDebugLog(`Current price: $${data.currentPrice?.toFixed(6) || 'N/A'}`);
              addDebugLog(`Order book: ${data.orderBook ? 'Available' : 'Not available'}`);
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
  
  // Function to determine market condition based on simulation data
  const determineMarketCondition = useCallback((simulation: Simulation): 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash' => {
    if (!simulation || !simulation.priceHistory || simulation.priceHistory.length < 2) {
      return 'calm'; // Default state
    }
    
    // Get the last 10 price points (or less if not available)
    const recentPrices = simulation.priceHistory.slice(-Math.min(10, simulation.priceHistory.length));
    
    // Calculate percent change from first to last
    const firstPrice = recentPrices[0].close;
    const lastPrice = simulation.currentPrice;
    const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    
    // Calculate volatility (standard deviation of price changes)
    const priceChanges = recentPrices.map((p, i, arr) => {
      if (i === 0) return 0;
      return ((arr[i].close - arr[i-1].close) / arr[i-1].close) * 100;
    }).slice(1);
    
    const mean = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
    const variance = priceChanges.reduce((sum, change) => sum + Math.pow(change - mean, 2), 0) / priceChanges.length;
    const volatility = Math.sqrt(variance);
    
    // Calculate rate of change (acceleration)
    const firstHalf = recentPrices.slice(0, Math.floor(recentPrices.length / 2));
    const secondHalf = recentPrices.slice(Math.floor(recentPrices.length / 2));
    
    const firstHalfChange = firstHalf.length > 0 ? 
      ((firstHalf[firstHalf.length - 1].close - firstHalf[0].close) / firstHalf[0].close) * 100 : 0;
    const secondHalfChange = secondHalf.length > 0 ? 
      ((secondHalf[secondHalf.length - 1].close - secondHalf[0].close) / secondHalf[0].close) * 100 : 0;
    const acceleration = secondHalfChange - firstHalfChange;
    
    // Determine market condition based on these factors
    if (volatility > 3) {
      if (percentChange < -5) {
        return 'crash';
      }
      return 'volatile';
    }
    
    if (percentChange > 3) {
      return 'bullish';
    }
    
    if (percentChange < -2) {
      return 'bearish';
    }
    
    if (acceleration > 1 && percentChange > 0) {
      return 'building';
    }
    
    return 'calm';
  }, []);
  
  // Update simulation timer
  useEffect(() => {
    if (simulation?.isRunning && !simulation?.isPaused) {
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      timerRef.current = setInterval(() => {
        if (simulationStartTime) {
          const now = Date.now();
          const elapsed = now - simulationStartTime;
          
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
  
  // Update the simulation state based on WebSocket messages
  useEffect(() => {
    if (!lastMessage || !simulation) return;
    
    const { simulationId, event } = lastMessage;
    
    // Only process messages for the current simulation
    if (simulationId !== simulation.id) return;
    
    // Create a unique identifier for this message
    const messageId = `${simulationId}-${event.type}-${event.timestamp}`;
    
    // Skip if we've already processed this message (prevents infinite loops)
    if (messageId === lastProcessedMessageRef.current) return;
    
    // Save this as the last processed message
    lastProcessedMessageRef.current = messageId;
    
    const { type, data } = event;
    
    switch (type) {
      case 'price_update':
        addDebugLog(`Price update: $${data.price.toFixed(6)}`);
        setSimulation(prev => {
          if (!prev) return prev;
          
          const updatedSim = {
            ...prev,
            currentPrice: data.price,
            orderBook: data.orderBook
          };
          
          // Determine market condition
          const newCondition = determineMarketCondition(updatedSim);
          if (newCondition !== marketCondition) {
            setMarketCondition(newCondition);
          }
          
          return updatedSim;
        });
        break;
        
      case 'trade':
        setSimulation(prev => {
          if (!prev) return prev;
          
          // Create a new array with the new trade at the beginning
          const updatedTrades = [data, ...prev.recentTrades.slice(0, 99)];
          
          return {
            ...prev,
            recentTrades: updatedTrades
          };
        });
        break;
        
      case 'position_open':
        setSimulation(prev => {
          if (!prev) return prev;
          
          return {
            ...prev,
            activePositions: [...prev.activePositions, data]
          };
        });
        break;
        
      case 'position_close':
        setSimulation(prev => {
          if (!prev) return prev;
          
          const updatedActivePositions = prev.activePositions.filter(
            pos => pos.trader.walletAddress !== data.trader.walletAddress
          );
          
          return {
            ...prev,
            activePositions: updatedActivePositions,
            closedPositions: [...prev.closedPositions, data]
          };
        });
        break;
        
      default:
        break;
    }
  }, [lastMessage, simulation, marketCondition, determineMarketCondition, addDebugLog]);
  
  // Use useCallback to prevent unnecessary recreations of handler functions
  const handleStartSimulation = useCallback(async () => {
    if (!simulation) return;
    
    try {
      addDebugLog("Starting simulation...");
      await SimulationApi.startSimulation(simulation.id);
      setSimulation(prev => {
        if (!prev) return prev;
        return { ...prev, isRunning: true, isPaused: false };
      });
      
      // Set start time if not already set
      if (!simulationStartTime) {
        setSimulationStartTime(Date.now());
      }
      
      // Enable audio when simulation starts
      setAudioEnabled(true);
      addDebugLog("Simulation started successfully");
    } catch (error) {
      addDebugLog(`Failed to start simulation: ${JSON.stringify(error)}`);
      console.error('Failed to start simulation:', error);
    }
  }, [simulation, simulationStartTime, addDebugLog]);
  
  const handlePauseSimulation = useCallback(async () => {
    if (!simulation) return;
    
    try {
      addDebugLog("Pausing simulation...");
      await SimulationApi.pauseSimulation(simulation.id);
      setSimulation(prev => {
        if (!prev) return prev;
        return { ...prev, isPaused: true };
      });
      addDebugLog("Simulation paused");
    } catch (error) {
      addDebugLog(`Failed to pause simulation: ${JSON.stringify(error)}`);
      console.error('Failed to pause simulation:', error);
    }
  }, [simulation, addDebugLog]);
  
  const handleResetSimulation = useCallback(async () => {
    if (!simulation) return;
    
    try {
      addDebugLog("Resetting simulation...");
      await SimulationApi.resetSimulation(simulation.id);
      const response = await SimulationApi.getSimulation(simulation.id);
      if (response.data) {
        // Reset the last processed message ref when we reset the simulation
        lastProcessedMessageRef.current = null;
        setSimulation(response.data);
        setMarketCondition('calm');
        
        // Reset simulation timer
        setSimulationStartTime(null);
        setElapsedTime("00:00:00");
        
        // Disable audio when simulation resets
        setAudioEnabled(false);
        
        addDebugLog("Simulation reset successfully");
        if (response.data.priceHistory) {
          addDebugLog(`New price history: ${response.data.priceHistory.length} points`);
        }
      }
    } catch (error) {
      addDebugLog(`Failed to reset simulation: ${JSON.stringify(error)}`);
      console.error('Failed to reset simulation:', error);
    }
  }, [simulation, addDebugLog]);
  
  const handleSpeedChange = useCallback(async (newSpeed: number) => {
    // Convert UI speed setting to actual speed multiplier
    // Slow = 1x, Medium = 3x, Fast = 5x
    const speedValue = newSpeed;
    
    setSimulationSpeed(speedValue);
    addDebugLog(`Speed changed to ${speedValue}x`);
    
    // Update speed on the server
    if (simulation) {
      try {
        await SimulationApi.setSimulationSpeed(simulation.id, speedValue);
        addDebugLog(`Server speed updated to ${speedValue}x`);
      } catch (error) {
        console.error(`Failed to update simulation speed:`, error);
        addDebugLog(`Failed to update simulation speed: ${JSON.stringify(error)}`);
      }
    }
  }, [simulation, addDebugLog]);
  
  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => !prev);
  }, []);
  
  // Toggle debug info visibility
  const toggleDebugInfo = useCallback(() => {
    setShowDebugInfo(prev => !prev);
  }, []);
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <div className="text-text-primary">
          <svg className="animate-spin h-12 w-12 mr-3 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="mt-4 block text-xl">Loading simulation...</span>
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

  // Ensure we have valid data for all components to prevent crashes
  const safeData = {
    ...simulation,
    orderBook: simulation.orderBook || {
      bids: [],
      asks: [],
      lastUpdateTime: Date.now()
    },
    recentTrades: simulation.recentTrades || [],
    traderRankings: simulation.traderRankings || [],
    activePositions: simulation.activePositions || [],
    priceHistory: simulation.priceHistory || [],
  };
  
  return (
    <div className="h-screen w-full bg-background text-text-primary p-2 flex flex-col overflow-hidden">
      {/* Audio player (hidden) */}
      <DynamicMusicPlayer 
        enabled={audioEnabled} 
        marketCondition={marketCondition}
        onToggle={toggleAudio}
      />
      
      {/* Header Bar with price info */}
      <div className="flex justify-between items-center mb-2 h-10 bg-surface p-2 rounded-md shadow-sm">
        <div className="flex items-center">
          <h1 className="text-base font-bold mr-2">Pump.fun Simulation</h1>
          <div className="ml-2 text-xs bg-panel px-2 py-1 rounded">
            <span className="text-text-secondary mr-1">Price:</span>
            <span className="text-text-primary font-medium">${safeData.currentPrice.toFixed(6)}</span>
          </div>
          <div className={`ml-2 w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-success' : 'bg-danger'}`}></div>
          <span className="text-xs text-text-secondary">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        
        <div className="flex items-center space-x-2">
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
          
          {/* Debug toggle button - only visible in development */}
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
      
      {/* Main dashboard - using CSS grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '3fr 9fr', 
        gridTemplateRows: '1fr 1fr 1fr', 
        gap: '8px',
        height: 'calc(100vh - 60px)',
        overflow: 'hidden'
      }}>
        {/* Simulation Controls - Left Top */}
        <div style={{ gridColumn: '1 / 2', gridRow: '1 / 2', overflow: 'hidden' }}>
          <SimulationControls 
            isRunning={safeData.isRunning}
            isPaused={safeData.isPaused}
            onStart={handleStartSimulation}
            onPause={handlePauseSimulation}
            onReset={handleResetSimulation}
            parameters={safeData.parameters}
            onSpeedChange={handleSpeedChange}
          />
        </div>
        
        {/* Order Book - Left Middle */}
        <div style={{ gridColumn: '1 / 2', gridRow: '2 / 3', overflow: 'hidden' }}>
          <OrderBookComponent orderBook={safeData.orderBook} />
        </div>
        
        {/* Recent Trades - Left Bottom */}
        <div style={{ gridColumn: '1 / 2', gridRow: '3 / 4', overflow: 'hidden' }}>
          <RecentTrades trades={safeData.recentTrades} />
        </div>
        
        {/* Price Chart - Right Top and Middle */}
        <div style={{ gridColumn: '2 / 3', gridRow: '1 / 3', position: 'relative', overflow: 'hidden' }} className="bg-[#131722] rounded-lg shadow-lg">
          {/* Simulation timer in top right */}
          <div className="absolute top-2 right-2 z-10 bg-[#1E2230] text-[#D9D9D9] rounded px-2 py-1 text-xs font-mono">
            {elapsedTime}
          </div>
          
          {/* Price Chart - 15min timeframe */}
          <div className="h-full">
            <PriceChart 
              priceHistory={safeData.priceHistory} 
              currentPrice={safeData.currentPrice} 
              trades={safeData.recentTrades}
            />
          </div>
        </div>
        
        {/* Participants/Leaderboard - Right Bottom */}
        <div style={{ gridColumn: '2 / 3', gridRow: '3 / 4', overflow: 'hidden' }}>
          <ParticipantsOverview 
            traders={safeData.traderRankings} 
            activePositions={safeData.activePositions} 
          />
        </div>
      </div>
      
      {/* Debug log - Only shown when enabled and not in production */}
      {showDebugInfo && process.env.NODE_ENV !== 'production' && (
        <div className="absolute bottom-2 right-2 z-20 bg-black bg-opacity-70 text-white p-2 rounded text-xs max-w-md max-h-32 overflow-auto">
          <div className="font-mono whitespace-pre">
            {debugInfo.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;