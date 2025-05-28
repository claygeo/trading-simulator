// backend/src/routes/scenario.ts
import express, { Request, Response } from 'express';
import { simulationManager } from '../services/simulationManager';

const router = express.Router();

// Start scenario endpoint
router.post('/simulation/:id/scenario/start', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { modifiers } = req.body;
  
  try {
    // Apply trader behavior modifiers
    simulationManager.applyTraderBehaviorModifiers(id, modifiers);
    
    res.json({ 
      success: true, 
      message: 'Scenario started successfully',
      simulationId: id 
    });
  } catch (error) {
    console.error(`Error starting scenario for simulation ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start scenario' 
    });
  }
});

// Update scenario phase endpoint
router.post('/simulation/:id/scenario/update', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phase, progress } = req.body;
  
  try {
    // Apply scenario phase effects
    simulationManager.applyScenarioPhase(id, phase, progress);
    
    res.json({ 
      success: true, 
      message: 'Scenario phase updated',
      simulationId: id,
      phase: phase.name,
      progress 
    });
  } catch (error) {
    console.error(`Error updating scenario phase for simulation ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update scenario phase' 
    });
  }
});

// End scenario endpoint
router.post('/simulation/:id/scenario/end', async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    // Clear scenario effects
    simulationManager.clearScenarioEffects(id);
    
    res.json({ 
      success: true, 
      message: 'Scenario ended successfully',
      simulationId: id 
    });
  } catch (error) {
    console.error(`Error ending scenario for simulation ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to end scenario' 
    });
  }
});

// Enable high-frequency trading mode endpoint
router.post('/simulation/:id/enable-hft', async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    simulationManager.enableHighFrequencyMode(id);
    
    res.json({ 
      success: true, 
      message: 'High-frequency trading mode enabled',
      simulationId: id 
    });
  } catch (error) {
    console.error(`Error enabling HFT mode for simulation ${id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to enable HFT mode' 
    });
  }
});

export default router;