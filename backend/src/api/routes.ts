// backend/src/api/routes.ts
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

// Create a new simulation
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

// Get all simulations
router.get('/simulations', (req: Request, res: Response) => {
  const simulations = simulationManager.getAllSimulations();
  res.json(simulations);
});

// Get a specific simulation
router.get('/simulations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const simulation = simulationManager.getSimulation(id);
  
  if (!simulation) {
    return res.status(404).json({ error: 'Simulation not found' });
  }
  
  res.json(simulation);
});

// Start a simulation
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

// Pause a simulation
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

// Reset a simulation
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

export default router;