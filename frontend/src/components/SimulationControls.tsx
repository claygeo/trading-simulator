// frontend/src/components/SimulationControls.tsx - Simplified Speed Settings
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
  // Simplified speed options: 1 = Slow, 2 = Medium, 3 = Fast
  const [speedSetting, setSpeedSetting] = useState<number>(1); // Default to Slow
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // Handle speed setting change with buttons instead of slider
  const handleSpeedChange = (newSpeed: number) => {
    setSpeedSetting(newSpeed);
    
    // Convert simplified speed settings to actual speed values
    // Slow = 1x, Medium = 3x, Fast = 5x
    const actualSpeed = newSpeed === 1 ? 1 : (newSpeed === 2 ? 3 : 5);
    onSpeedChange(actualSpeed);
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  // Get display text for current speed
  const getSpeedText = () => {
    switch(speedSetting) {
      case 1: return "Slow";
      case 2: return "Medium";
      case 3: return "Fast";
      default: return "Slow";
    }
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
      
      {/* Simulation speed control - simplified to 3 buttons */}
      <div className="mt-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs">Speed: {getSpeedText()}</span>
        </div>
        
        <div className="flex space-x-2 mt-1">
          <button
            onClick={() => handleSpeedChange(1)}
            className={`px-3 py-1 text-xs rounded flex-1 transition ${
              speedSetting === 1 
                ? 'bg-accent text-white' 
                : 'bg-surface-variant text-text-muted hover:bg-panel'
            }`}
          >
            Slow
          </button>
          <button
            onClick={() => handleSpeedChange(2)}
            className={`px-3 py-1 text-xs rounded flex-1 transition ${
              speedSetting === 2 
                ? 'bg-accent text-white' 
                : 'bg-surface-variant text-text-muted hover:bg-panel'
            }`}
          >
            Medium
          </button>
          <button
            onClick={() => handleSpeedChange(3)}
            className={`px-3 py-1 text-xs rounded flex-1 transition ${
              speedSetting === 3 
                ? 'bg-accent text-white' 
                : 'bg-surface-variant text-text-muted hover:bg-panel'
            }`}
          >
            Fast
          </button>
        </div>
      </div>
      
      {/* Control buttons */}
      <div className="flex items-center space-x-2 mt-3">
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