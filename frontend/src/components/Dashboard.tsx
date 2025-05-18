// frontend/src/components/Dashboard.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SimulationApi } from '../services/api';
import { useWebSocket } from '../services/websocket';
import { Simulation } from '../types';
import PriceChart from './PriceChart';
import OrderBookComponent from './OrderBook';
import RecentTrades from './RecentTrades';
import ParticipantsOverview from './ParticipantsOverview';
import SimulationControls from './SimulationControls';

const Dashboard: React.FC = () => {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use a ref to track the last processed message to prevent infinite update loops
  const lastProcessedMessageRef = useRef<string | null>(null);
  
  const { isConnected, lastMessage } = useWebSocket(simulation?.id);
  
  // Create a new simulation when the component mounts
  useEffect(() => {
    const initSimulation = async () => {
      setLoading(true);
      try {
        const response = await SimulationApi.createSimulation();
        if (response.error) {
          setError(response.error);
        } else {
          const simulationId = response.data.simulationId;
          const simulationResponse = await SimulationApi.getSimulation(simulationId);
          if (simulationResponse.error) {
            setError(simulationResponse.error);
          } else {
            setSimulation(simulationResponse.data);
          }
        }
      } catch (error) {
        setError('Failed to initialize simulation');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    
    initSimulation();
  }, []);
  
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
        setSimulation(prev => {
          if (!prev) return prev;
          
          return {
            ...prev,
            currentPrice: data.price,
            orderBook: data.orderBook
          };
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
  }, [lastMessage, simulation]);
  
  // Use useCallback to prevent unnecessary recreations of handler functions
  const handleStartSimulation = useCallback(async () => {
    if (!simulation) return;
    
    try {
      await SimulationApi.startSimulation(simulation.id);
      setSimulation(prev => {
        if (!prev) return prev;
        return { ...prev, isRunning: true, isPaused: false };
      });
    } catch (error) {
      console.error('Failed to start simulation:', error);
    }
  }, [simulation?.id]);
  
  const handlePauseSimulation = useCallback(async () => {
    if (!simulation) return;
    
    try {
      await SimulationApi.pauseSimulation(simulation.id);
      setSimulation(prev => {
        if (!prev) return prev;
        return { ...prev, isPaused: true };
      });
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    }
  }, [simulation?.id]);
  
  const handleResetSimulation = useCallback(async () => {
    if (!simulation) return;
    
    try {
      await SimulationApi.resetSimulation(simulation.id);
      const response = await SimulationApi.getSimulation(simulation.id);
      if (response.data) {
        // Reset the last processed message ref when we reset the simulation
        lastProcessedMessageRef.current = null;
        setSimulation(response.data);
      }
    } catch (error) {
      console.error('Failed to reset simulation:', error);
    }
  }, [simulation?.id]);
  
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
  
  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Pump.fun Trader Simulation</h1>
            
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-success' : 'bg-danger'}`}></div>
              <span className="text-text-secondary">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <p className="text-text-secondary mt-2">
            Watch top Pump.fun traders compete in a simulated market environment
          </p>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-3">
            {simulation.priceHistory && (
              <PriceChart 
                priceHistory={simulation.priceHistory} 
                currentPrice={simulation.currentPrice} 
                trades={simulation.recentTrades}
              />
            )}
          </div>
          
          <div className="lg:col-span-1">
            {simulation.orderBook && (
              <OrderBookComponent orderBook={simulation.orderBook} />
            )}
          </div>
          
          <div className="lg:col-span-2">
            <RecentTrades trades={simulation.recentTrades} />
          </div>
        </div>
        
        <div className="mb-8">
          <ParticipantsOverview 
            traders={simulation.traderRankings} 
            activePositions={simulation.activePositions}
          />
        </div>
        
        <div>
          <SimulationControls 
            isRunning={simulation.isRunning}
            isPaused={simulation.isPaused}
            onStart={handleStartSimulation}
            onPause={handlePauseSimulation}
            onReset={handleResetSimulation}
            parameters={simulation.parameters}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;