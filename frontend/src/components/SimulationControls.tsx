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
  onSpeedChange: (speed: number) => void;
}

const SimulationControls: React.FC<SimulationControlsProps> = ({
  isRunning,
  isPaused,
  onStart,
  onPause,
  onReset,
  parameters,
  onSpeedChange
}) => {
  const [speed, setSpeed] = useState<number>(parameters.timeCompressionFactor);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseInt(e.target.value, 10);
    setSpeed(newSpeed);
    onSpeedChange(newSpeed);
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  return (
    <div className="bg-surface rounded-lg shadow-lg p-3 h-full">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <h2 className="text-base font-semibold">Simulation</h2>
          <div className="ml-2 text-xs bg-panel px-2 py-1 rounded">
            <span className={`font-medium ${isRunning ? (isPaused ? 'text-warning' : 'text-success') : 'text-text-secondary'}`}>
              {isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped'}
            </span>
          </div>
        </div>
        
        <button 
          onClick={toggleDetails}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      {/* Simulation speed control */}
      <div className="mt-2">
        <div className="flex justify-between items-center mb-1 text-xs">
          <span>Speed: {speed}x</span>
          <span className="text-text-secondary text-xs">Max: 10x</span>
        </div>
        <input
          type="range"
          id="speed"
          min="1"
          max="10"
          step="1"
          value={speed}
          onChange={handleSpeedChange}
          className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer"
        />
      </div>
      
      {/* Control buttons */}
      <div className="flex items-center space-x-2 mt-2">
        {!isRunning || isPaused ? (
          <button 
            onClick={onStart}
            className="px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-hover transition flex-1"
          >
            {isPaused ? 'Resume' : 'Start'} Simulation
          </button>
        ) : (
          <button 
            onClick={onPause} 
            className="px-3 py-1.5 bg-warning text-text-primary rounded hover:bg-warning-hover transition flex-1"
          >
            Pause
          </button>
        )}
        
        <button 
          onClick={onReset}
          className="px-3 py-1.5 bg-danger text-white rounded hover:bg-danger-hover transition w-20"
        >
          Reset
        </button>
      </div>
      
      {/* Details popup (only shown when showDetails is true) */}
      {showDetails && (
        <div className="mt-3 text-xs p-2 bg-panel rounded">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-text-secondary">Initial Price:</div>
              <div className="text-text-primary font-medium">${parameters.initialPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-secondary">Liquidity:</div>
              <div className="text-text-primary font-medium">${(parameters.initialLiquidity / 1000000).toFixed(2)}M</div>
            </div>
            <div>
              <div className="text-text-secondary">Volatility:</div>
              <div className="text-text-primary font-medium">{(parameters.volatilityFactor * 100).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-text-secondary">Scenario:</div>
              <div className="text-text-primary font-medium capitalize">{parameters.scenarioType}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationControls;