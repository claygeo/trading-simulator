// frontend/src/components/SimulationControls.tsx
import React, { useState } from 'react';

interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType: string;
}

interface SimulationControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  parameters: SimulationParameters;
}

const SimulationControls: React.FC<SimulationControlsProps> = ({
  isRunning,
  isPaused,
  onStart,
  onPause,
  onReset,
  parameters
}) => {
  const [speed, setSpeed] = useState<number>(parameters.timeCompressionFactor);

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseInt(e.target.value, 10);
    setSpeed(newSpeed);
    // In a real implementation, you would call an API to change the simulation speed
  };

  return (
    <div className="bg-surface rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold mb-4">Simulation Controls</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col">
          <div className="mb-4">
            <div className="flex space-x-4">
              {!isRunning || isPaused ? (
                <button 
                  onClick={onStart}
                  className="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover transition"
                >
                  {isPaused ? 'Resume' : 'Start'} Simulation
                </button>
              ) : (
                <button 
                  onClick={onPause} 
                  className="px-4 py-2 bg-warning text-text-primary rounded hover:bg-warning-hover transition"
                >
                  Pause Simulation
                </button>
              )}
              
              <button 
                onClick={onReset}
                className="px-4 py-2 bg-danger text-white rounded hover:bg-danger-hover transition"
              >
                Reset Simulation
              </button>
            </div>
          </div>
          
          <div>
            <label htmlFor="speed" className="block mb-2">
              Simulation Speed: {speed}x
            </label>
            <input
              type="range"
              id="speed"
              min="1"
              max="60"
              step="1"
              value={speed}
              onChange={handleSpeedChange}
              className="w-full h-2 bg-surface-variant rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
        
        <div className="flex flex-col">
          <h3 className="font-medium mb-2">Simulation Parameters</h3>
          
          <div className="grid grid-cols-2 gap-2 text-text-secondary text-sm">
            <div>Initial Price:</div>
            <div className="text-text-primary">${parameters.initialPrice.toFixed(2)}</div>
            
            <div>Liquidity:</div>
            <div className="text-text-primary">${(parameters.initialLiquidity / 1000000).toFixed(2)}M</div>
            
            <div>Volatility:</div>
            <div className="text-text-primary">{(parameters.volatilityFactor * 100).toFixed(0)}%</div>
            
            <div>Duration:</div>
            <div className="text-text-primary">{parameters.duration / 60} hours</div>
            
            <div>Scenario:</div>
            <div className="text-text-primary capitalize">{parameters.scenarioType.replace('_', ' ')}</div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 border-t border-surface-variant pt-4 flex items-center">
        <div className="mr-4">
          <span className="text-text-secondary">Status: </span>
          <span className={`font-medium ${isRunning && !isPaused ? 'text-success' : isPaused ? 'text-warning' : 'text-text-secondary'}`}>
            {isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;