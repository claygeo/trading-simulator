// backend/src/routes/simulation.ts - FIXED: Complete API support for frontend
import { Router, Request, Response } from 'express';
import { SimulationManager } from '../services/simulation/SimulationManager';
import { validateSimulationParameters } from '../middleware/validation';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

// FIXED: Pass SimulationManager instance from app setup
export const createSimulationRoutes = (simulationManager: SimulationManager) => {
  
  // Test endpoint for connectivity verification
  router.get('/test', asyncHandler(async (req: Request, res: Response) => {
    console.log('🧪 Test endpoint hit - backend is running');
    res.json({ 
      status: 'ok', 
      message: 'Backend is running',
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
      version: '2.1.0'
    });
  }));

  // Create new simulation
  router.post('/simulation', validateSimulationParameters, asyncHandler(async (req: Request, res: Response) => {
    console.log('🚀 Creating new simulation with parameters:', req.body);
    
    try {
      const parameters = {
        initialPrice: 100,
        duration: 3600,
        volatilityFactor: 1.0,
        scenarioType: 'standard',
        ...req.body
      };

      console.log('📊 Final parameters:', parameters);
      
      const simulation = await simulationManager.createSimulation(parameters);
      console.log('✅ Simulation created successfully:', simulation.id);

      // Return enhanced response with readiness info
      res.status(201).json({
        success: true,
        data: simulation,
        simulationId: simulation.id,
        isReady: simulationManager.isSimulationReady(simulation.id),
        registrationStatus: simulationManager.isSimulationReady(simulation.id) ? 'ready' : 'pending',
        message: 'Simulation created successfully'
      });
    } catch (error) {
      console.error('❌ Error creating simulation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create simulation'
      });
    }
  }));

  // Get all simulations
  router.get('/simulations', asyncHandler(async (req: Request, res: Response) => {
    console.log('📋 Fetching all simulations');
    
    try {
      const simulations = simulationManager.getAllSimulations();
      const simulationSummaries = simulations.map(sim => ({
        id: sim.id,
        isRunning: sim.isRunning,
        isPaused: sim.isPaused,
        currentPrice: sim.currentPrice,
        startTime: sim.startTime,
        currentTime: sim.currentTime,
        endTime: sim.endTime,
        parameters: sim.parameters,
        candleCount: sim.priceHistory?.length || 0,
        tradeCount: sim.recentTrades?.length || 0
      }));

      res.json({
        success: true,
        data: simulationSummaries,
        count: simulationSummaries.length
      });
    } catch (error) {
      console.error('❌ Error fetching simulations:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch simulations'
      });
    }
  }));

  // Get specific simulation
  router.get('/simulation/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`📊 Fetching simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      console.log(`✅ Simulation ${id} found - returning data`);
      
      // Return clean simulation data
      const cleanSimulation = {
        ...simulation,
        // Ensure arrays are properly initialized
        priceHistory: simulation.priceHistory || [],
        recentTrades: simulation.recentTrades || [],
        activePositions: simulation.activePositions || [],
        traderRankings: simulation.traderRankings || simulation.traders?.map(t => t.trader) || []
      };

      res.json({
        success: true,
        data: cleanSimulation
      });
    } catch (error) {
      console.error(`❌ Error fetching simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch simulation'
      });
    }
  }));

  // FIXED: Check simulation readiness endpoint
  router.get('/simulation/:id/ready', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`🔍 Checking readiness for simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for readiness check`);
        return res.status(404).json({
          success: false,
          ready: false,
          status: 'not_found',
          id: id,
          error: 'Simulation not found'
        });
      }

      const isReady = simulationManager.isSimulationReady(id);
      const status = isReady ? 'ready' : 'initializing';
      
      console.log(`🔍 Simulation ${id} readiness: ${isReady ? 'READY' : 'NOT READY'}`);

      res.json({
        success: true,
        ready: isReady,
        status: status,
        id: id,
        details: {
          isRunning: simulation.isRunning,
          isPaused: simulation.isPaused,
          hasTraders: (simulation.traders?.length || 0) > 0,
          hasOrderBook: !!simulation.orderBook,
          currentTime: simulation.currentTime
        }
      });
    } catch (error) {
      console.error(`❌ Error checking simulation readiness for ${id}:`, error);
      res.status(500).json({
        success: false,
        ready: false,
        status: 'error',
        id: id,
        error: error instanceof Error ? error.message : 'Failed to check simulation readiness'
      });
    }
  }));

  // Start simulation
  router.post('/simulation/:id/start', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`🚀 Starting simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for start`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Check if simulation is ready
      if (!simulationManager.isSimulationReady(id)) {
        console.log(`❌ Simulation ${id} not ready for start`);
        return res.status(400).json({
          success: false,
          error: 'Simulation not ready - still initializing'
        });
      }

      await simulationManager.startSimulation(id);
      console.log(`✅ Simulation ${id} started successfully`);

      res.json({
        success: true,
        message: 'Simulation started successfully',
        data: {
          id: id,
          isRunning: true,
          isPaused: false,
          startTime: simulation.startTime
        }
      });
    } catch (error) {
      console.error(`❌ Error starting simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start simulation'
      });
    }
  }));

  // Pause simulation
  router.post('/simulation/:id/pause', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`⏸️ Pausing simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for pause`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      await simulationManager.pauseSimulation(id);
      console.log(`✅ Simulation ${id} paused successfully`);

      res.json({
        success: true,
        message: 'Simulation paused successfully',
        data: {
          id: id,
          isRunning: simulation.isRunning,
          isPaused: true
        }
      });
    } catch (error) {
      console.error(`❌ Error pausing simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause simulation'
      });
    }
  }));

  // FIXED: Comprehensive reset simulation endpoint
  router.post('/simulation/:id/reset', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { clearAllData = true, resetPrice = 100, resetState = 'complete' } = req.body;
    
    console.log(`🔄 Resetting simulation ${id} with options:`, { clearAllData, resetPrice, resetState });
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for reset`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Comprehensive reset implementation
      console.log(`🧹 Performing comprehensive reset for simulation ${id}`);
      
      // Step 1: Stop simulation if running
      if (simulation.isRunning) {
        console.log(`⏹️ Stopping running simulation ${id} before reset`);
        await simulationManager.pauseSimulation(id);
      }

      // Step 2: Reset all simulation state
      simulation.isRunning = false;
      simulation.isPaused = false;
      simulation.currentPrice = resetPrice;
      simulation.currentTime = Date.now();
      
      // Step 3: Clear all data arrays if requested
      if (clearAllData) {
        console.log(`🧹 Clearing all data for simulation ${id}`);
        simulation.priceHistory = [];
        simulation.recentTrades = [];
        simulation.activePositions = [];
        simulation.closedPositions = [];
        
        // Reset order book
        simulation.orderBook = {
          bids: [],
          asks: [],
          lastUpdateTime: Date.now()
        };
        
        // Reset market conditions
        simulation.marketConditions = {
          volatility: 0.01,
          trend: 'sideways' as const,
          volume: 0
        };
      }

      // Step 4: Reset internal counters and timers
      if (simulation._tickCounter !== undefined) {
        simulation._tickCounter = 0;
      }
      
      simulation.lastUpdateTimestamp = Date.now();
      simulation.timestampOffset = 0;

      console.log(`✅ Comprehensive reset completed for simulation ${id}`);
      console.log(`📊 Reset verification: price=${simulation.currentPrice}, trades=${simulation.recentTrades.length}, candles=${simulation.priceHistory.length}`);

      res.json({
        success: true,
        message: 'Simulation reset successfully',
        data: {
          id: id,
          isRunning: false,
          isPaused: false,
          currentPrice: simulation.currentPrice,
          priceHistory: simulation.priceHistory,
          recentTrades: simulation.recentTrades,
          activePositions: simulation.activePositions,
          resetComplete: true,
          resetTimestamp: Date.now()
        }
      });
    } catch (error) {
      console.error(`❌ Error resetting simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset simulation'
      });
    }
  }));

  // FIXED: Enhanced speed control endpoint
  router.post('/simulation/:id/speed', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { speed, timestamp, requestId } = req.body;
    
    console.log(`⚡ Setting speed for simulation ${id} to ${speed}x (request: ${requestId})`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for speed change`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Validate speed value
      if (typeof speed !== 'number' || speed < 1 || speed > 1000) {
        console.log(`❌ Invalid speed value for simulation ${id}: ${speed}`);
        return res.status(400).json({
          success: false,
          error: 'Speed must be a number between 1 and 1000'
        });
      }

      // Apply speed change
      const oldSpeed = simulation.parameters.timeCompressionFactor;
      simulation.parameters.timeCompressionFactor = speed;
      
      // Notify simulation manager of speed change for optimization
      try {
        await simulationManager.setSimulationSpeed(id, speed);
        console.log(`✅ Speed changed for simulation ${id}: ${oldSpeed}x → ${speed}x`);
      } catch (speedError) {
        console.warn(`⚠️ Speed change notification failed for ${id}:`, speedError);
        // Continue anyway as the basic speed was set
      }

      res.json({
        success: true,
        message: `Speed changed to ${speed}x`,
        data: {
          id: id,
          oldSpeed: oldSpeed,
          newSpeed: speed,
          requestId: requestId,
          timestamp: timestamp || Date.now(),
          applied: true
        }
      });
    } catch (error) {
      console.error(`❌ Error setting speed for simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set simulation speed'
      });
    }
  }));

  // NEW: Get simulation statistics
  router.get('/simulation/:id/stats', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`📊 Fetching stats for simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for stats`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Calculate comprehensive statistics
      const stats = {
        id: id,
        isRunning: simulation.isRunning,
        isPaused: simulation.isPaused,
        currentPrice: simulation.currentPrice,
        
        // Trading statistics
        totalTrades: simulation.recentTrades?.length || 0,
        totalCandles: simulation.priceHistory?.length || 0,
        activePositions: simulation.activePositions?.length || 0,
        totalTraders: simulation.traders?.length || 0,
        
        // Performance statistics
        speed: simulation.parameters.timeCompressionFactor,
        uptime: simulation.startTime ? Date.now() - simulation.startTime : 0,
        tickCounter: simulation._tickCounter || 0,
        
        // Market statistics
        marketConditions: simulation.marketConditions,
        orderBookDepth: {
          bids: simulation.orderBook?.bids?.length || 0,
          asks: simulation.orderBook?.asks?.length || 0
        },
        
        // Last update info
        lastUpdate: simulation.lastUpdateTimestamp || simulation.currentTime,
        timeSinceLastUpdate: Date.now() - (simulation.lastUpdateTimestamp || simulation.currentTime)
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error(`❌ Error fetching stats for simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch simulation stats'
      });
    }
  }));

  // Get simulation trades
  router.get('/simulation/:id/trades', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    console.log(`💰 Fetching trades for simulation ${id} (limit: ${limit}, offset: ${offset})`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for trades`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      const trades = simulation.recentTrades || [];
      const startIndex = Number(offset);
      const endIndex = startIndex + Number(limit);
      const paginatedTrades = trades.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          trades: paginatedTrades,
          total: trades.length,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: endIndex < trades.length
        }
      });
    } catch (error) {
      console.error(`❌ Error fetching trades for simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch trades'
      });
    }
  }));

  // Delete simulation
  router.delete('/simulation/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`🗑️ Deleting simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for deletion`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      await simulationManager.deleteSimulation(id);
      console.log(`✅ Simulation ${id} deleted successfully`);

      res.json({
        success: true,
        message: 'Simulation deleted successfully',
        data: { id: id }
      });
    } catch (error) {
      console.error(`❌ Error deleting simulation ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete simulation'
      });
    }
  }));

  return router;
};

// Default export for compatibility
export default createSimulationRoutes;