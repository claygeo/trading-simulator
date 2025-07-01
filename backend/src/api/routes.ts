import express, { Request, Response } from 'express';
import duneApi from './duneApi';
import traderService from '../services/traderService';
import { simulationManager } from '../services/simulation';
import { RawTrader } from '../types/traders';
import scenarioRoutes from '../routes/scenario';

const router = express.Router();

// Include scenario routes
router.use('/', scenarioRoutes);

// Get all traders
router.get('/traders', async (req: Request, res: Response) => {
  try {
    const rawData = await duneApi.getTraderData();
    if (!rawData || !rawData.result || !Array.isArray(rawData.result.rows)) {
      throw new Error('Invalid data format from Dune API');
    }
    
    const traders = traderService.transformRawTraders(rawData.result.rows as RawTrader[]);
    res.json(traders);
  } catch (error) {
    console.error('Error fetching traders:', error);
    res.status(500).json({ error: 'Failed to fetch trader data' });
  }
});

// Get trader profiles (includes derived behavior metrics)
router.get('/trader-profiles', async (req: Request, res: Response) => {
  try {
    const rawData = await duneApi.getTraderData();
    if (!rawData || !rawData.result || !Array.isArray(rawData.result.rows)) {
      throw new Error('Invalid data format from Dune API');
    }
    
    const traders = traderService.transformRawTraders(rawData.result.rows as RawTrader[]);
    const profiles = traderService.generateTraderProfiles(traders);
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching trader profiles:', error);
    res.status(500).json({ error: 'Failed to fetch trader profiles' });
  }
});

// SIMPLIFIED: Create a new simulation - removed template support
router.post('/simulations', async (req: Request, res: Response) => {
  try {
    console.log('🚀 Creating clean simulation (no templates)');
    const parameters = req.body;
    
    // Remove any templateId if accidentally included
    delete parameters.templateId;
    
    const simulation = await simulationManager.createSimulation(parameters);
    res.json({ 
      simulationId: simulation.id,
      message: 'Clean simulation created - chart will fill in real-time'
    });
  } catch (error) {
    console.error('Error creating simulation:', error);
    res.status(500).json({ error: 'Failed to create simulation' });
  }
});

// Create a new simulation - support legacy endpoint
router.post('/simulation', async (req: Request, res: Response) => {
  try {
    console.log('🚀 Creating clean simulation (no templates)');
    const parameters = req.body;
    
    // Remove any templateId if accidentally included
    delete parameters.templateId;
    
    const simulation = await simulationManager.createSimulation(parameters);
    res.json({ 
      simulationId: simulation.id,
      message: 'Clean simulation created - chart will fill in real-time'
    });
  } catch (error) {
    console.error('Error creating simulation:', error);
    res.status(500).json({ error: 'Failed to create simulation' });
  }
});

// Get all simulations
router.get('/simulations', (req: Request, res: Response) => {
  const simulations = simulationManager.getAllSimulations();
  
  // FIXED: Remove any template info from response to clean up the API
  const cleanedSimulations = simulations.map(sim => {
    // FIXED: Use object destructuring with rest to safely remove templateInfo
    const { templateInfo, ...cleanSim } = sim;
    return {
      ...cleanSim,
      type: 'real-time', // Indicate this is a real-time simulation
      chartStatus: sim.priceHistory.length === 0 ? 'empty-ready' : 'building'
    };
  });
  
  res.json(cleanedSimulations);
});

// Get a specific simulation - support both /simulations/:id and /simulation/:id endpoints
router.get('/simulations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const simulation = simulationManager.getSimulation(id);
  
  if (!simulation) {
    return res.status(404).json({ error: 'Simulation not found' });
  }
  
  // FIXED: Remove template info and add real-time status
  const { templateInfo, ...cleanSim } = simulation;
  res.json({
    ...cleanSim,
    type: 'real-time',
    chartStatus: simulation.priceHistory.length === 0 ? 'empty-ready' : 'building',
    candleCount: simulation.priceHistory.length
  });
});

// Get a specific simulation - support legacy endpoint
router.get('/simulation/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const simulation = simulationManager.getSimulation(id);
  
  if (!simulation) {
    return res.status(404).json({ error: 'Simulation not found' });
  }
  
  // FIXED: Remove template info and add real-time status
  const { templateInfo, ...cleanSim } = simulation;
  res.json({
    ...cleanSim,
    type: 'real-time',
    chartStatus: simulation.priceHistory.length === 0 ? 'empty-ready' : 'building',
    candleCount: simulation.priceHistory.length
  });
});

// Start a simulation - support both patterns
router.post('/simulations/:id/start', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.startSimulation(id);
    res.json({ 
      status: 'started',
      message: 'Real-time chart generation started - candles will appear smoothly'
    });
  } catch (error) {
    console.error('Error starting simulation:', error);
    res.status(500).json({ error: 'Failed to start simulation' });
  }
});

router.post('/simulation/:id/start', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.startSimulation(id);
    res.json({ 
      status: 'started',
      message: 'Real-time chart generation started - candles will appear smoothly'
    });
  } catch (error) {
    console.error('Error starting simulation:', error);
    res.status(500).json({ error: 'Failed to start simulation' });
  }
});

// Pause a simulation - support both patterns
router.post('/simulations/:id/pause', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.pauseSimulation(id);
    res.json({ status: 'paused' });
  } catch (error) {
    console.error('Error pausing simulation:', error);
    res.status(500).json({ error: 'Failed to pause simulation' });
  }
});

router.post('/simulation/:id/pause', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.pauseSimulation(id);
    res.json({ status: 'paused' });
  } catch (error) {
    console.error('Error pausing simulation:', error);
    res.status(500).json({ error: 'Failed to pause simulation' });
  }
});

// Reset a simulation - support both patterns
router.post('/simulations/:id/reset', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.resetSimulation(id);
    res.json({ 
      status: 'reset',
      message: 'Simulation reset to clean state - chart will start empty'
    });
  } catch (error) {
    console.error('Error resetting simulation:', error);
    res.status(500).json({ error: 'Failed to reset simulation' });
  }
});

router.post('/simulation/:id/reset', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.resetSimulation(id);
    res.json({ 
      status: 'reset',
      message: 'Simulation reset to clean state - chart will start empty'
    });
  } catch (error) {
    console.error('Error resetting simulation:', error);
    res.status(500).json({ error: 'Failed to reset simulation' });
  }
});

// Set simulation speed - support both patterns with enhanced feedback
router.post('/simulations/:id/speed', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { speed } = req.body;
    
    if (typeof speed !== 'number' || speed < 0.1 || speed > 100) {
      return res.status(400).json({ 
        error: 'Invalid speed value. Must be a number between 0.1 and 100.' 
      });
    }
    
    simulationManager.setSimulationSpeed(id, speed);
    
    const simulation = simulationManager.getSimulation(id);
    res.status(200).json({ 
      success: true,
      speed: speed,
      simulationId: id,
      candleCount: simulation?.priceHistory.length || 0,
      message: `Speed set to ${speed}x - real-time candle generation adjusted`
    });
  } catch (error) {
    console.error('Error setting simulation speed:', error);
    res.status(500).json({ error: 'Failed to set simulation speed' });
  }
});

router.post('/simulation/:id/speed', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { speed } = req.body;
    
    if (typeof speed !== 'number' || speed < 0.1 || speed > 100) {
      return res.status(400).json({ 
        error: 'Invalid speed value. Must be a number between 0.1 and 100.' 
      });
    }
    
    simulationManager.setSimulationSpeed(id, speed);
    
    const simulation = simulationManager.getSimulation(id);
    res.status(200).json({ 
      success: true,
      speed: speed,
      simulationId: id,
      candleCount: simulation?.priceHistory.length || 0,
      message: `Speed set to ${speed}x - real-time candle generation adjusted`
    });
  } catch (error) {
    console.error('Error setting simulation speed:', error);
    res.status(500).json({ error: 'Failed to set simulation speed' });
  }
});

// Get simulation status endpoint
router.get('/simulation/:id/status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const simulation = simulationManager.getSimulation(id);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    res.json({
      id: simulation.id,
      isRunning: simulation.isRunning,
      isPaused: simulation.isPaused,
      speed: simulation.parameters.timeCompressionFactor,
      currentPrice: simulation.currentPrice,
      candleCount: simulation.priceHistory.length,
      chartStatus: simulation.priceHistory.length === 0 ? 'empty-ready' : 'building',
      tradeCount: simulation.recentTrades.length,
      activePositions: simulation.activePositions.length,
      type: 'real-time',
      message: simulation.priceHistory.length === 0 
        ? 'Ready to start - chart will fill smoothly in real-time'
        : `Building chart: ${simulation.priceHistory.length} candles generated`
    });
  } catch (error) {
    console.error('Error getting simulation status:', error);
    res.status(500).json({ error: 'Failed to get simulation status' });
  }
});

export default router;