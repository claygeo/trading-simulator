// frontend/src/components/SimulationControls.tsx
import React, { useState } from 'react';
import { SimulationParameters } from '../types';

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
  const [showParameters, setShowParameters] = useState(false);
  
  const handleToggleParameters = () => {
    setShowParameters(!showParameters);
  };
  
  const formatScenario = (scenario: string) => {
    return scenario
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Simulation Controls</h2>
      
      <div className="flex space-x-4 mb-4">
        {!isRunning || isPaused ? (
          <button 
            onClick={onStart}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-6 rounded transition-colors"
          >
            {isPaused ? 'Resume' : 'Start'} Simulation
          </button>
        ) : (
          <button 
            onClick={onPause}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-6 rounded transition-colors"
          >
            Pause Simulation
          </button>
        )}
        
        <button 
          onClick={onReset}
          className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-6 rounded transition-colors"
        >
          Reset Simulation
        </button>
        
        <button 
          onClick={handleToggleParameters}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded transition-colors"
        >
          {showParameters ? 'Hide' : 'Show'} Parameters
        </button>
      </div>
      
      {showParameters && (
        <div className="bg-gray-100 p-4 rounded">
          <h3 className="font-semibold mb-3">Simulation Parameters</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-gray-600 text-sm">Scenario</div>
              <div className="font-semibold">
                {formatScenario(parameters.scenarioType)}
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 text-sm">Initial Price</div>
              <div className="font-semibold">
                ${parameters.initialPrice.toFixed(2)}
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 text-sm">Initial Liquidity</div>
              <div className="font-semibold">
                ${parameters.initialLiquidity.toLocaleString()}
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 text-sm">Volatility Factor</div>
              <div className="font-semibold">
                {parameters.volatilityFactor.toFixed(2)}x
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 text-sm">Time Compression</div>
              <div className="font-semibold">
                1 day = {parameters.timeCompressionFactor} seconds
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 text-sm">Duration</div>
              <div className="font-semibold">
                {parameters.duration} minutes
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-4">
        <div className="flex items-center">
          <div className="text-gray-600 mr-2">Simulation Status:</div>
          <div className={`w-3 h-3 rounded-full mr-2 ${isRunning && !isPaused ? 'bg-green-500' : isPaused ? 'bg-yellow-500' : 'bg-gray-500'}`}></div>
          <div className="font-semibold">
            {isRunning && !isPaused ? 'Running' : isPaused ? 'Paused' : 'Ready'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;