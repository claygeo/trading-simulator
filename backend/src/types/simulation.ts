// backend/src/routes/simulation.ts - COMPLETE FIX: API Endpoints with State Management Coordination
import { Router, Request, Response } from 'express';
import { SimulationManager } from '../services/simulation/SimulationManager';
import { validateSimulationParameters } from '../middleware/validation';
import { asyncHandler } from '../middleware/asyncHandler';
import { TPSMode } from '../types/simulation';

const router = Router();

// Pass SimulationManager instance from app setup
export const createSimulationRoutes = (simulationManager: SimulationManager) => {
  
  // Test endpoint for connectivity verification
  router.get('/test', asyncHandler(async (req: Request, res: Response) => {
    console.log('🧪 Test endpoint hit - backend is running');
    res.json({ 
      status: 'ok', 
      message: 'Backend is running',
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
      version: '3.0.0',
      tpsSupport: true,
      stressTestSupport: true,
      completeStateCoordination: true,
      pauseStopResetFixed: true
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

      // Get enhanced state information
      const simulationState = simulationManager.getSimulationState(simulation.id);

      // Return enhanced response with complete state info
      res.status(201).json({
        success: true,
        data: simulation,
        simulationId: simulation.id,
        isReady: simulationManager.isSimulationReady(simulation.id),
        registrationStatus: simulationManager.isSimulationReady(simulation.id) ? 'ready' : 'pending',
        state: {
          runState: simulationState.runState,
          isRunning: simulation.isRunning,
          isPaused: simulation.isPaused,
          canStart: simulationState.canStart,
          canPause: simulationState.canPause,
          canResume: simulationState.canResume,
          canStop: simulationState.canStop,
          isTransitioning: simulationState.isTransitioning
        },
        tpsSupport: true,
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        traderCount: simulation.traders ? simulation.traders.length : 0,
        completeStateCoordination: true,
        pauseStopResetFixed: true,
        message: 'Simulation created successfully with complete state coordination'
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
      const simulationSummaries = simulations.map(sim => {
        const state = simulationManager.getSimulationState(sim.id);
        return {
          id: sim.id,
          runState: state.runState,
          isRunning: sim.isRunning,
          isPaused: sim.isPaused,
          canStart: state.canStart,
          canPause: state.canPause,
          canResume: state.canResume,
          canStop: state.canStop,
          isTransitioning: state.isTransitioning,
          currentPrice: sim.currentPrice,
          startTime: sim.startTime,
          currentTime: sim.currentTime,
          endTime: sim.endTime,
          parameters: sim.parameters,
          candleCount: sim.priceHistory?.length || 0,
          tradeCount: sim.recentTrades?.length || 0,
          traderCount: sim.traders ? sim.traders.length : 0,
          currentTPSMode: sim.currentTPSMode || 'NORMAL',
          tpsSupport: true,
          completeStateCoordination: true,
          pauseStopResetFixed: true
        };
      });

      res.json({
        success: true,
        data: simulationSummaries,
        count: simulationSummaries.length,
        completeStateCoordination: true,
        pauseStopResetFixed: true
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
      
      // Get enhanced state information
      const simulationState = simulationManager.getSimulationState(id);
      
      // Return clean simulation data with enhanced state info
      const cleanSimulation = {
        ...simulation,
        // Ensure arrays are properly initialized
        priceHistory: simulation.priceHistory || [],
        recentTrades: simulation.recentTrades || [],
        activePositions: simulation.activePositions || [],
        traderRankings: simulation.traderRankings || simulation.traders?.map(t => t.trader) || [],
        // Enhanced state information
        state: {
          runState: simulationState.runState,
          isRunning: simulation.isRunning,
          isPaused: simulation.isPaused,
          canStart: simulationState.canStart,
          canPause: simulationState.canPause,
          canResume: simulationState.canResume,
          canStop: simulationState.canStop,
          isTransitioning: simulationState.isTransitioning,
          validationIssues: simulationState.validationIssues
        },
        // TPS information
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        tpsSupport: true,
        externalMarketMetrics: simulation.externalMarketMetrics || {
          currentTPS: 25,
          actualTPS: 0,
          queueDepth: 0,
          processedOrders: 0,
          rejectedOrders: 0,
          avgProcessingTime: 0,
          dominantTraderType: 'RETAIL_TRADER',
          marketSentiment: 'neutral',
          liquidationRisk: 0
        },
        traderCount: simulation.traders ? simulation.traders.length : 0,
        completeStateCoordination: true,
        pauseStopResetFixed: true
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

  // 🚨 CRITICAL FIX: Enhanced simulation state endpoint
  router.get('/simulation/:id/state', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`🔍 Getting state for simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for state check`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found',
          state: {
            exists: false,
            runState: 'stopped',
            isRunning: false,
            isPaused: false,
            canStart: false,
            canPause: false,
            canResume: false,
            canStop: false
          }
        });
      }

      const simulationState = simulationManager.getSimulationState(id);
      
      console.log(`🔍 Simulation ${id} state: ${simulationState.runState}, running=${simulationState.isRunning}, paused=${simulationState.isPaused}`);

      res.json({
        success: true,
        simulationId: id,
        state: simulationState,
        currentPrice: simulation.currentPrice,
        traderCount: simulation.traders ? simulation.traders.length : 0,
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        completeStateCoordination: true,
        pauseStopResetFixed: true,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error(`❌ Error getting simulation state for ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get simulation state'
      });
    }
  }));

  // Check simulation readiness endpoint
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
      const simulationState = simulationManager.getSimulationState(id);
      const status = isReady ? 'ready' : 'initializing';
      
      console.log(`🔍 Simulation ${id} readiness: ${isReady ? 'READY' : 'NOT READY'}`);

      res.json({
        success: true,
        ready: isReady,
        status: status,
        id: id,
        state: simulationState,
        tpsSupport: true,
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        traderCount: simulation.traders ? simulation.traders.length : 0,
        details: {
          runState: simulationState.runState,
          isRunning: simulation.isRunning,
          isPaused: simulation.isPaused,
          hasTraders: (simulation.traders?.length || 0) > 0,
          hasOrderBook: !!simulation.orderBook,
          currentTime: simulation.currentTime,
          validationIssues: simulationState.validationIssues
        },
        completeStateCoordination: true,
        pauseStopResetFixed: true
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

  // 🚨 CRITICAL FIX: Enhanced Start Endpoint with State Coordination
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

      // Check current state before attempting to start
      const preState = simulationManager.getSimulationState(id);
      console.log(`🔍 [START API] Pre-start state: ${preState.runState}, canStart: ${preState.canStart}`);
      
      if (!preState.canStart) {
        console.log(`❌ [START API] Cannot start simulation ${id} - current state: ${preState.runState}`);
        return res.status(400).json({
          success: false,
          error: `Cannot start simulation - current state: ${preState.runState}`,
          currentState: preState
        });
      }

      // Check if simulation is ready
      if (!simulationManager.isSimulationReady(id)) {
        console.log(`❌ Simulation ${id} not ready for start`);
        return res.status(400).json({
          success: false,
          error: 'Simulation not ready - still initializing',
          currentState: preState
        });
      }

      await simulationManager.startSimulation(id);
      
      // Get updated state after start
      const postState = simulationManager.getSimulationState(id);
      console.log(`✅ [START API] Simulation ${id} started - post-start state: ${postState.runState}`);

      res.json({
        success: true,
        message: 'Simulation started successfully',
        data: {
          id: id,
          action: 'started',
          previousState: preState,
          currentState: postState,
          startTime: simulation.startTime,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL',
          tpsSupport: true,
          completeStateCoordination: true,
          pauseStopResetFixed: true
        }
      });
    } catch (error) {
      console.error(`❌ Error starting simulation ${id}:`, error);
      
      // Get current state for error response
      const currentState = simulationManager.getSimulationState(id);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start simulation',
        currentState: currentState
      });
    }
  }));

  // 🚨 CRITICAL FIX: Enhanced Pause Endpoint with State Coordination
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

      // Check current state before attempting to pause
      const preState = simulationManager.getSimulationState(id);
      console.log(`🔍 [PAUSE API] Pre-pause state: ${preState.runState}, canPause: ${preState.canPause}`);
      
      if (!preState.canPause) {
        console.log(`❌ [PAUSE API] Cannot pause simulation ${id} - current state: ${preState.runState}`);
        return res.status(400).json({
          success: false,
          error: `Cannot pause simulation - current state: ${preState.runState}`,
          currentState: preState
        });
      }

      await simulationManager.pauseSimulation(id);
      
      // Get updated state after pause
      const postState = simulationManager.getSimulationState(id);
      console.log(`✅ [PAUSE API] Simulation ${id} paused - post-pause state: ${postState.runState}`);

      res.json({
        success: true,
        message: 'Simulation paused successfully',
        data: {
          id: id,
          action: 'paused',
          previousState: preState,
          currentState: postState,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL',
          completeStateCoordination: true,
          pauseStopResetFixed: true
        }
      });
    } catch (error) {
      console.error(`❌ Error pausing simulation ${id}:`, error);
      
      // Get current state for error response
      const currentState = simulationManager.getSimulationState(id);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause simulation',
        currentState: currentState
      });
    }
  }));

  // 🚨 CRITICAL FIX: New Resume Endpoint with State Coordination
  router.post('/simulation/:id/resume', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`▶️ Resuming simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for resume`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Check current state before attempting to resume
      const preState = simulationManager.getSimulationState(id);
      console.log(`🔍 [RESUME API] Pre-resume state: ${preState.runState}, canResume: ${preState.canResume}`);
      
      if (!preState.canResume) {
        console.log(`❌ [RESUME API] Cannot resume simulation ${id} - current state: ${preState.runState}`);
        return res.status(400).json({
          success: false,
          error: `Cannot resume simulation - current state: ${preState.runState}`,
          currentState: preState
        });
      }

      await simulationManager.resumeSimulation(id);
      
      // Get updated state after resume
      const postState = simulationManager.getSimulationState(id);
      console.log(`✅ [RESUME API] Simulation ${id} resumed - post-resume state: ${postState.runState}`);

      res.json({
        success: true,
        message: 'Simulation resumed successfully',
        data: {
          id: id,
          action: 'resumed',
          previousState: preState,
          currentState: postState,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL',
          completeStateCoordination: true,
          pauseStopResetFixed: true
        }
      });
    } catch (error) {
      console.error(`❌ Error resuming simulation ${id}:`, error);
      
      // Get current state for error response
      const currentState = simulationManager.getSimulationState(id);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resume simulation',
        currentState: currentState
      });
    }
  }));

  // 🚨 CRITICAL FIX: New Stop Endpoint with State Coordination
  router.post('/simulation/:id/stop', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`⏹️ Stopping simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for stop`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Check current state before attempting to stop
      const preState = simulationManager.getSimulationState(id);
      console.log(`🔍 [STOP API] Pre-stop state: ${preState.runState}, canStop: ${preState.canStop}`);
      
      if (!preState.canStop) {
        console.log(`❌ [STOP API] Cannot stop simulation ${id} - current state: ${preState.runState}`);
        return res.status(400).json({
          success: false,
          error: `Cannot stop simulation - current state: ${preState.runState}`,
          currentState: preState
        });
      }

      await simulationManager.stopSimulation(id);
      
      // Get updated state after stop
      const postState = simulationManager.getSimulationState(id);
      console.log(`✅ [STOP API] Simulation ${id} stopped - post-stop state: ${postState.runState}`);

      res.json({
        success: true,
        message: 'Simulation stopped successfully',
        data: {
          id: id,
          action: 'stopped',
          previousState: preState,
          currentState: postState,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL',
          completeStateCoordination: true,
          pauseStopResetFixed: true
        }
      });
    } catch (error) {
      console.error(`❌ Error stopping simulation ${id}:`, error);
      
      // Get current state for error response
      const currentState = simulationManager.getSimulationState(id);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop simulation',
        currentState: currentState
      });
    }
  }));

  // 🚨 CRITICAL FIX: Enhanced Reset Endpoint with Complete State Clearing
  router.post('/simulation/:id/reset', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { clearAllData = true, resetPrice, resetState = 'complete' } = req.body;
    
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

      // Get state before reset
      const preState = simulationManager.getSimulationState(id);
      console.log(`🔍 [RESET API] Pre-reset state: ${preState.runState}`);

      // Reset the simulation (this will put it in stopped state)
      await simulationManager.resetSimulation(id);
      
      // Get updated simulation and state after reset
      const updatedSimulation = simulationManager.getSimulation(id);
      const postState = simulationManager.getSimulationState(id);
      console.log(`✅ [RESET API] Simulation ${id} reset - post-reset state: ${postState.runState}`);

      if (!updatedSimulation) {
        throw new Error('Simulation not found after reset');
      }

      console.log(`✅ Comprehensive reset completed for simulation ${id}`);
      console.log(`📊 Reset verification: price=${updatedSimulation.currentPrice}, trades=${updatedSimulation.recentTrades.length}, candles=${updatedSimulation.priceHistory.length}, TPS=${updatedSimulation.currentTPSMode}`);

      res.json({
        success: true,
        message: 'Simulation reset successfully',
        data: {
          id: id,
          action: 'reset',
          previousState: preState,
          currentState: postState,
          simulation: {
            currentPrice: updatedSimulation.currentPrice,
            priceHistory: updatedSimulation.priceHistory,
            recentTrades: updatedSimulation.recentTrades,
            activePositions: updatedSimulation.activePositions,
            currentTPSMode: updatedSimulation.currentTPSMode,
            traderCount: updatedSimulation.traders ? updatedSimulation.traders.length : 0
          },
          tpsSupport: true,
          resetComplete: true,
          resetTimestamp: Date.now(),
          completeStateCoordination: true,
          pauseStopResetFixed: true
        }
      });
    } catch (error) {
      console.error(`❌ Error resetting simulation ${id}:`, error);
      
      // Get current state for error response
      const currentState = simulationManager.getSimulationState(id);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset simulation',
        currentState: currentState
      });
    }
  }));

  // Enhanced speed control endpoint
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
      simulationManager.setSimulationSpeed(id, speed);
      
      // Get updated simulation
      const updatedSimulation = simulationManager.getSimulation(id);
      const currentState = simulationManager.getSimulationState(id);
      
      console.log(`✅ Speed changed for simulation ${id}: ${oldSpeed}x → ${speed}x`);

      res.json({
        success: true,
        message: `Speed changed to ${speed}x`,
        data: {
          id: id,
          oldSpeed: oldSpeed,
          newSpeed: speed,
          currentState: currentState,
          requestId: requestId,
          timestamp: timestamp || Date.now(),
          applied: true,
          currentTPSMode: updatedSimulation?.currentTPSMode || 'NORMAL',
          completeStateCoordination: true,
          pauseStopResetFixed: true
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

  // TPS Mode Management Endpoints
  
  // Get current TPS mode
  router.get('/simulation/:id/tps-mode', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`🚀 [TPS] Getting TPS mode for simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ [TPS] Simulation ${id} not found`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      const currentMode = simulation.currentTPSMode || 'NORMAL';
      const metrics = simulation.externalMarketMetrics;

      res.json({
        success: true,
        data: {
          simulationId: id,
          currentTPSMode: currentMode,
          targetTPS: getTargetTPSForMode(currentMode),
          metrics: metrics,
          supportedModes: ['NORMAL', 'BURST', 'STRESS', 'HFT'],
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error(`❌ [TPS] Error getting TPS mode for ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get TPS mode'
      });
    }
  }));

  // Set TPS mode
  router.post('/simulation/:id/tps-mode', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { mode } = req.body;
    
    console.log(`🚀 [TPS] Setting TPS mode for simulation ${id} to ${mode}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ [TPS] Simulation ${id} not found`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Validate mode
      const validModes = ['NORMAL', 'BURST', 'STRESS', 'HFT'];
      if (!validModes.includes(mode)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid TPS mode. Valid modes: ' + validModes.join(', ')
        });
      }

      // Apply TPS mode change
      const result = await simulationManager.setTPSModeAsync(id, mode);
      
      if (result.success) {
        console.log(`✅ [TPS] Successfully changed TPS mode to ${mode} for simulation ${id}`);
        
        res.json({
          success: true,
          data: {
            simulationId: id,
            previousMode: result.previousMode,
            newMode: mode,
            targetTPS: getTargetTPSForMode(mode as TPSMode),
            metrics: result.metrics,
            timestamp: Date.now()
          },
          message: `TPS mode changed to ${mode}`
        });
      } else {
        console.error(`❌ [TPS] Failed to change TPS mode: ${result.error}`);
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to change TPS mode'
        });
      }
    } catch (error) {
      console.error(`❌ [TPS] Error setting TPS mode for ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set TPS mode'
      });
    }
  }));

  // Stress Test Endpoints
  
  // Trigger liquidation cascade
  router.post('/simulation/:id/stress-test/liquidation-cascade', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`💥 [LIQUIDATION] Triggering liquidation cascade for simulation ${id}`);
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // Check if simulation is in appropriate mode
      const currentMode = simulation.currentTPSMode || 'NORMAL';
      if (currentMode !== 'STRESS' && currentMode !== 'HFT') {
        return res.status(400).json({
          success: false,
          error: 'Liquidation cascade requires STRESS or HFT mode'
        });
      }

      const result = await simulationManager.triggerLiquidationCascade(id);
      
      if (result.success) {
        console.log(`✅ [LIQUIDATION] Liquidation cascade triggered for simulation ${id}`);
        
        res.json({
          success: true,
          data: {
            simulationId: id,
            ordersGenerated: result.ordersGenerated,
            estimatedImpact: result.estimatedImpact,
            cascadeSize: result.cascadeSize,
            timestamp: Date.now()
          },
          message: 'Liquidation cascade triggered successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to trigger liquidation cascade'
        });
      }
    } catch (error) {
      console.error(`❌ [LIQUIDATION] Error triggering liquidation cascade for ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger liquidation cascade'
      });
    }
  }));

  // Get stress test capabilities
  router.get('/simulation/:id/stress-test/capabilities', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      const currentMode = simulation.currentTPSMode || 'NORMAL';
      
      res.json({
        success: true,
        data: {
          simulationId: id,
          currentTPSMode: currentMode,
          capabilities: {
            liquidationCascade: currentMode === 'STRESS' || currentMode === 'HFT',
            mevBotSimulation: currentMode === 'HFT',
            panicSelling: currentMode === 'STRESS',
            highFrequencyTrading: currentMode === 'HFT',
            marketMaking: true,
            arbitrageSimulation: currentMode !== 'NORMAL'
          },
          supportedModes: ['NORMAL', 'BURST', 'STRESS', 'HFT'],
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error(`❌ Error getting stress test capabilities for ${id}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stress test capabilities'
      });
    }
  }));

  // Get simulation statistics with TPS metrics
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

      const simulationState = simulationManager.getSimulationState(id);

      // Calculate comprehensive statistics
      const stats = {
        id: id,
        state: simulationState,
        currentPrice: simulation.currentPrice,
        
        // Trading statistics
        totalTrades: simulation.recentTrades?.length || 0,
        totalCandles: simulation.priceHistory?.length || 0,
        activePositions: simulation.activePositions?.length || 0,
        totalTraders: simulation.traders?.length || 0,
        
        // Performance statistics
        speed: simulation.parameters.timeCompressionFactor,
        uptime: simulation.startTime ? Date.now() - simulation.startTime : 0,
        tickCounter: (simulation as any)._tickCounter || 0,
        
        // Market statistics
        marketConditions: simulation.marketConditions,
        orderBookDepth: {
          bids: simulation.orderBook?.bids?.length || 0,
          asks: simulation.orderBook?.asks?.length || 0
        },
        
        // TPS and stress test statistics
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        externalMarketMetrics: simulation.externalMarketMetrics || {
          currentTPS: 25,
          actualTPS: 0,
          queueDepth: 0,
          processedOrders: 0,
          rejectedOrders: 0,
          avgProcessingTime: 0,
          dominantTraderType: 'RETAIL_TRADER',
          marketSentiment: 'neutral',
          liquidationRisk: 0
        },
        
        // Last update info
        lastUpdate: (simulation as any).lastUpdateTimestamp || simulation.currentTime,
        timeSinceLastUpdate: Date.now() - ((simulation as any).lastUpdateTimestamp || simulation.currentTime),
        
        // State coordination info
        completeStateCoordination: true,
        pauseStopResetFixed: true,
        timestamp: Date.now()
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
          hasMore: endIndex < trades.length,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL',
          completeStateCoordination: true,
          pauseStopResetFixed: true
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

      // Get state before deletion
      const preState = simulationManager.getSimulationState(id);

      await simulationManager.deleteSimulation(id);
      console.log(`✅ Simulation ${id} deleted successfully`);

      res.json({
        success: true,
        message: 'Simulation deleted successfully',
        data: { 
          id: id,
          previousState: preState,
          deletedAt: Date.now(),
          completeStateCoordination: true,
          pauseStopResetFixed: true
        }
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

// Helper function to get target TPS for mode
function getTargetTPSForMode(mode: TPSMode | string): number {
  switch (mode) {
    case 'NORMAL': return 25;
    case 'BURST': return 150;
    case 'STRESS': return 1500;
    case 'HFT': return 15000;
    default: return 25;
  }
}

// Default export for compatibility
export default createSimulationRoutes;