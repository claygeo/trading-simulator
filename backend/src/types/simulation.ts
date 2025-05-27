// backend/src/routes/simulation.ts - Add or update these endpoints

import { Router } from 'express';
import { simulationManager } from '../services/simulationManager';

const router = Router();

// Pause simulation endpoint
router.post('/simulation/:id/pause', async (req, res) => {
  const { id } = req.params;
  
  try {
    simulationManager.pauseSimulation(id);
    
    res.json({ 
      success: true, 
      message: 'Simulation paused',
      simulationId: id 
    });
  } catch (error) {
    console.error(`Error pausing simulation ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to pause simulation' 
    });
  }
});

// Start/Resume simulation endpoint
router.post('/simulation/:id/start', async (req, res) => {
  const { id } = req.params;
  
  try {
    simulationManager.startSimulation(id);
    
    res.json({ 
      success: true, 
      message: 'Simulation started/resumed',
      simulationId: id 
    });
  } catch (error) {
    console.error(`Error starting simulation ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start simulation' 
    });
  }
});

// Set simulation speed endpoint
router.post('/simulation/:id/speed', async (req, res) => {
  const { id } = req.params;
  const { speed } = req.body;
  
  try {
    simulationManager.setSimulationSpeed(id, speed);
    
    res.json({ 
      success: true, 
      message: 'Simulation speed updated',
      simulationId: id,
      speed 
    });
  } catch (error) {
    console.error(`Error setting simulation speed for ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update simulation speed' 
    });
  }
});

export default router;