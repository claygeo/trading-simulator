// backend/src/routes/simulation.ts - FIXED: Complete API support with dynamic pricing
import { Router, Request, Response } from 'express';
import { SimulationManager } from '../services/simulation/SimulationManager';
import { validateSimulationParameters } from '../middleware/validation';
import { asyncHandler } from '../middleware/asyncHandler';
import { TPSMode } from '../types/simulation';

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
      version: '2.2.0',
      tpsSupport: true,
      stressTestSupport: true,
      dynamicPricingFixed: true
    });
  }));

  // FIXED: Create new simulation with proper dynamic pricing support
  router.post('/simulation', validateSimulationParameters, asyncHandler(async (req: Request, res: Response) => {
    console.log('🚀 Creating new simulation with parameters:', req.body);
    
    try {
      // CRITICAL FIX: Extract dynamic pricing parameters FIRST
      const { 
        priceRange, 
        customPrice, 
        useCustomPrice,
        initialPrice,  // Explicit price override
        ...otherParams 
      } = req.body;
      
      let finalPrice: number | undefined = undefined;
      
      // FIXED: Priority order for price determination:
      // 1. Custom price (highest priority)
      // 2. Explicit initialPrice 
      // 3. Price range selection
      // 4. Let SimulationManager generate random (lowest priority)
      
      if (useCustomPrice && customPrice && customPrice > 0) {
        finalPrice = customPrice;
        console.log(`💰 FIXED: Using custom price: $${finalPrice}`);
      } else if (initialPrice && initialPrice > 0) {
        finalPrice = initialPrice;
        console.log(`💰 FIXED: Using explicit initial price: $${finalPrice}`);
      } else if (priceRange && priceRange !== 'random') {
        // Let SimulationManager handle range-based generation
        console.log(`🎲 FIXED: Using price range: ${priceRange}`);
      } else {
        console.log(`🎲 FIXED: Using random dynamic price generation`);
      }
      
      // CRITICAL FIX: Build parameters WITHOUT hardcoded $100
      const parameters = {
        duration: 3600,
        volatilityFactor: 1.0,
        scenarioType: 'standard',
        ...otherParams,
        // FIXED: Dynamic pricing parameters
        priceRange: priceRange || 'random',
        customPrice: useCustomPrice ? customPrice : undefined,
        // FIXED: Only set initialPrice if we have a definitive value
        ...(finalPrice ? { initialPrice: finalPrice } : {})
      };

      console.log('📊 FIXED: Final parameters for dynamic pricing:', parameters);
      console.log('🚫 FIXED: No hardcoded $100 price!');
      
      const simulation = await simulationManager.createSimulation(parameters);
      console.log('✅ FIXED: Simulation created successfully with dynamic price:', simulation.currentPrice);

      // FIXED: Enhanced response with dynamic pricing info
      res.status(201).json({
        success: true,
        data: simulation,
        simulationId: simulation.id,
        isReady: simulationManager.isSimulationReady(simulation.id),
        registrationStatus: simulationManager.isSimulationReady(simulation.id) ? 'ready' : 'pending',
        tpsSupport: true,
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        // FIXED: Dynamic pricing response data
        dynamicPricing: {
          finalPrice: simulation.currentPrice,
          wasCustom: !!finalPrice,
          priceRange: priceRange || 'random',
          priceCategory: simulation.currentPrice < 0.01 ? 'micro' :
                        simulation.currentPrice < 1 ? 'small' :
                        simulation.currentPrice < 10 ? 'mid' :
                        simulation.currentPrice < 100 ? 'large' : 'mega'
        },
        message: 'Simulation created successfully with dynamic pricing - NO MORE $100!'
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
        tradeCount: sim.recentTrades?.length || 0,
        currentTPSMode: sim.currentTPSMode || 'NORMAL',
        tpsSupport: true,
        // FIXED: Include dynamic pricing info
        priceCategory: sim.currentPrice < 0.01 ? 'micro' :
                      sim.currentPrice < 1 ? 'small' :
                      sim.currentPrice < 10 ? 'mid' :
                      sim.currentPrice < 100 ? 'large' : 'mega'
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

      console.log(`✅ Simulation ${id} found - returning data with price $${simulation.currentPrice}`);
      
      // Return clean simulation data with TPS info and dynamic pricing
      const cleanSimulation = {
        ...simulation,
        // Ensure arrays are properly initialized
        priceHistory: simulation.priceHistory || [],
        recentTrades: simulation.recentTrades || [],
        activePositions: simulation.activePositions || [],
        traderRankings: simulation.traderRankings || simulation.traders?.map(t => t.trader) || [],
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
        // FIXED: Dynamic pricing info
        dynamicPricing: {
          currentPrice: simulation.currentPrice,
          priceCategory: simulation.currentPrice < 0.01 ? 'micro' :
                        simulation.currentPrice < 1 ? 'small' :
                        simulation.currentPrice < 10 ? 'mid' :
                        simulation.currentPrice < 100 ? 'large' : 'mega',
          isDynamic: simulation.currentPrice !== 100 // Flag if not the old hardcoded value
        }
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

  // NEW: TPS Mode Management Endpoints
  
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
            targetTPS: getTargetTPSForMode(mode),
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

  // NEW: Stress Test Endpoints
  
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
        tpsSupport: true,
        currentTPSMode: simulation.currentTPSMode || 'NORMAL',
        dynamicPricingFixed: true,
        currentPrice: simulation.currentPrice,
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
      console.log(`✅ Simulation ${id} started successfully with price $${simulation.currentPrice}`);

      res.json({
        success: true,
        message: 'Simulation started successfully',
        data: {
          id: id,
          isRunning: true,
          isPaused: false,
          startTime: simulation.startTime,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL',
          tpsSupport: true,
          dynamicPrice: simulation.currentPrice
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
          isPaused: true,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL'
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

  // FIXED: Reset simulation with dynamic pricing regeneration
  router.post('/simulation/:id/reset', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { 
      clearAllData = true, 
      resetPrice, 
      resetState = 'complete',
      generateNewPrice = true  // FIXED: New option to generate new dynamic price
    } = req.body;
    
    console.log(`🔄 FIXED: Resetting simulation ${id} with dynamic pricing options:`, { 
      clearAllData, 
      resetPrice, 
      resetState, 
      generateNewPrice 
    });
    
    try {
      const simulation = simulationManager.getSimulation(id);
      
      if (!simulation) {
        console.log(`❌ Simulation ${id} not found for reset`);
        return res.status(404).json({
          success: false,
          error: 'Simulation not found'
        });
      }

      // FIXED: Use SimulationManager's reset method which generates new dynamic price
      await simulationManager.resetSimulation(id);
      
      // Get the fresh simulation data with new dynamic price
      const resetSimulation = simulationManager.getSimulation(id);
      
      if (!resetSimulation) {
        throw new Error('Failed to retrieve reset simulation');
      }

      console.log(`✅ FIXED: Reset completed with NEW dynamic price: $${resetSimulation.currentPrice}`);

      res.json({
        success: true,
        message: 'Simulation reset successfully with NEW dynamic price',
        data: {
          id: id,
          isRunning: false,
          isPaused: false,
          currentPrice: resetSimulation.currentPrice,
          priceHistory: resetSimulation.priceHistory,
          recentTrades: resetSimulation.recentTrades,
          activePositions: resetSimulation.activePositions,
          currentTPSMode: resetSimulation.currentTPSMode,
          tpsSupport: true,
          resetComplete: true,
          resetTimestamp: Date.now(),
          // FIXED: Dynamic pricing info
          dynamicPricing: {
            newPrice: resetSimulation.currentPrice,
            priceCategory: resetSimulation.currentPrice < 0.01 ? 'micro' :
                          resetSimulation.currentPrice < 1 ? 'small' :
                          resetSimulation.currentPrice < 10 ? 'mid' :
                          resetSimulation.currentPrice < 100 ? 'large' : 'mega',
            wasGenerated: resetSimulation.currentPrice !== 100
          }
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
          applied: true,
          currentTPSMode: simulation.currentTPSMode || 'NORMAL'
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

  // NEW: Get simulation statistics with TPS metrics
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
        
        // FIXED: Dynamic pricing statistics
        dynamicPricing: {
          currentPrice: simulation.currentPrice,
          priceCategory: simulation.currentPrice < 0.01 ? 'micro' :
                        simulation.currentPrice < 1 ? 'small' :
                        simulation.currentPrice < 10 ? 'mid' :
                        simulation.currentPrice < 100 ? 'large' : 'mega',
          isDynamic: simulation.currentPrice !== 100,
          initialPrice: simulation.parameters.initialPrice
        },
        
        // Last update info
        lastUpdate: (simulation as any).lastUpdateTimestamp || simulation.currentTime,
        timeSinceLastUpdate: Date.now() - ((simulation as any).lastUpdateTimestamp || simulation.currentTime)
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
          currentPrice: simulation.currentPrice
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

// Helper function to get target TPS for mode
function getTargetTPSForMode(mode: string): number {
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