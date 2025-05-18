// frontend/src/components/Dashboard.tsx
import React, { useState, useEffect } from 'react';
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
          
          return {
            ...prev,
            recentTrades: [data, ...prev.recentTrades.slice(0, 99)]
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
  
  const handleStartSimulation = async () => {
    if (!simulation) return;
    
    try {
      await SimulationApi.startSimulation(simulation.id);
      setSimulation(prev => prev ? { ...prev, isRunning: true, isPaused: false } : prev);
    } catch (error) {
      console.error('Failed to start simulation:', error);
    }
  };
  
  const handlePauseSimulation = async () => {
    if (!simulation) return;
    
    try {
      await SimulationApi.pauseSimulation(simulation.id);
      setSimulation(prev => prev ? { ...prev, isPaused: true } : prev);
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    }
  };
  
  const handleResetSimulation = async () => {
    if (!simulation) return;
    
    try {
      await SimulationApi.resetSimulation(simulation.id);
      const response = await SimulationApi.getSimulation(simulation.id);
      if (response.data) {
        setSimulation(response.data);
      }
    } catch (error) {
      console.error('Failed to reset simulation:', error);
    }
  };
  
  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading simulation...</div>;
  }
  
  if (error) {
    return <div className="flex justify-center items-center h-screen text-red-500">{error}</div>;
  }
  
  if (!simulation) {
    return <div className="flex justify-center items-center h-screen">No simulation data available</div>;
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Pump.fun Trader Simulation Dashboard</h1>
        <div className="flex items-center mt-2">
          <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-3">
          <PriceChart 
            priceHistory={simulation.priceHistory} 
            currentPrice={simulation.currentPrice} 
            trades={simulation.recentTrades}
          />
        </div>
        
        <div className="lg:col-span-1">
          <OrderBookComponent orderBook={simulation.orderBook} />
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
  );
};

export default Dashboard;