// backend/src/api/routes.ts - Updated to match frontend endpoints
import express, { Request, Response } from 'express';
import duneApi from './duneApi';
import traderService from '../services/traderService';
import { simulationManager } from '../services/simulationManager';
import { RawTrader } from '../types/traders';

const router = express.Router();

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

// Create a new simulation - support both /simulations and /simulation endpoints
router.post('/simulations', async (req: Request, res: Response) => {
  try {
    const parameters = req.body;
    const simulation = await simulationManager.createSimulation(parameters);
    res.json({ simulationId: simulation.id });
  } catch (error) {
    console.error('Error creating simulation:', error);
    res.status(500).json({ error: 'Failed to create simulation' });
  }
});

// Create a new simulation - support legacy endpoint
router.post('/simulation', async (req: Request, res: Response) => {
  try {
    const parameters = req.body;
    const simulation = await simulationManager.createSimulation(parameters);
    res.json({ simulationId: simulation.id });
  } catch (error) {
    console.error('Error creating simulation:', error);
    res.status(500).json({ error: 'Failed to create simulation' });
  }
});

// Get all simulations
router.get('/simulations', (req: Request, res: Response) => {
  const simulations = simulationManager.getAllSimulations();
  res.json(simulations);
});

// Get a specific simulation - support both /simulations/:id and /simulation/:id endpoints
router.get('/simulations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const simulation = simulationManager.getSimulation(id);
  
  if (!simulation) {
    return res.status(404).json({ error: 'Simulation not found' });
  }
  
  res.json(simulation);
});

// Get a specific simulation - support legacy endpoint
router.get('/simulation/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const simulation = simulationManager.getSimulation(id);
  
  if (!simulation) {
    return res.status(404).json({ error: 'Simulation not found' });
  }
  
  res.json(simulation);
});

// Start a simulation - support both patterns
router.post('/simulations/:id/start', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.startSimulation(id);
    res.json({ status: 'started' });
  } catch (error) {
    console.error('Error starting simulation:', error);
    res.status(500).json({ error: 'Failed to start simulation' });
  }
});

router.post('/simulation/:id/start', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.startSimulation(id);
    res.json({ status: 'started' });
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
    res.json({ status: 'reset' });
  } catch (error) {
    console.error('Error resetting simulation:', error);
    res.status(500).json({ error: 'Failed to reset simulation' });
  }
});

router.post('/simulation/:id/reset', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.resetSimulation(id);
    res.json({ status: 'reset' });
  } catch (error) {
    console.error('Error resetting simulation:', error);
    res.status(500).json({ error: 'Failed to reset simulation' });
  }
});

// Set simulation speed - support both patterns
router.post('/simulations/:id/speed', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { speed } = req.body;
    
    if (typeof speed !== 'number' || speed < 1 || speed > 10) {
      return res.status(400).json({ error: 'Invalid speed value. Must be a number between 1 and 10.' });
    }
    
    simulationManager.setSimulationSpeed(id, speed);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error setting simulation speed:', error);
    res.status(500).json({ error: 'Failed to set simulation speed' });
  }
});

router.post('/simulation/:id/speed', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { speed } = req.body;
    
    if (typeof speed !== 'number' || speed < 1 || speed > 10) {
      return res.status(400).json({ error: 'Invalid speed value. Must be a number between 1 and 10.' });
    }
    
    simulationManager.setSimulationSpeed(id, speed);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error setting simulation speed:', error);
    res.status(500).json({ error: 'Failed to set simulation speed' });
  }
});

export default router;