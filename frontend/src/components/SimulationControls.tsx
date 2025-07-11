// frontend/src/components/SimulationControls.tsx - ENHANCED: Price Range Selection & Dynamic Starting Prices
import React, { useState } from 'react';

interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType: string;
  priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega' | 'random';
  customPrice?: number;
}

interface SimulationControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  parameters: SimulationParameters;
  onSpeedChange: (speed: number) => void;
  onParametersChange?: (params: Partial<SimulationParameters>) => void;
}

interface PriceRangeOption {
  id: string;
  name: string;
  description: string;
  range: string;
  example: string;
  color: string;
}

const SimulationControls: React.FC<SimulationControlsProps> = ({
  isRunning,
  isPaused,
  onStart,
  onPause,
  onReset,
  parameters,
  onSpeedChange,
  onParametersChange
}) => {
  // Simplified speed options: 1 = Slow, 2 = Medium, 3 = Fast
  const [speedSetting, setSpeedSetting] = useState<number>(1); // Default to Slow
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showPriceSettings, setShowPriceSettings] = useState<boolean>(false);
  const [selectedPriceRange, setSelectedPriceRange] = useState<string>('random');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [useCustomPrice, setUseCustomPrice] = useState<boolean>(false);

  // Enhanced price range options with colors and examples
  const priceRanges: PriceRangeOption[] = [
    {
      id: 'random',
      name: 'Random',
      description: 'Weighted random selection',
      range: 'All ranges',
      example: 'Varied each time',
      color: 'bg-gradient-to-r from-purple-500 to-pink-500'
    },
    {
      id: 'micro',
      name: 'Micro-cap',
      description: 'Very low price tokens',
      range: '< $0.01',
      example: '$0.0001 - $0.01',
      color: 'bg-gradient-to-r from-red-400 to-red-600'
    },
    {
      id: 'small',
      name: 'Small-cap',
      description: 'Low price tokens',
      range: '$0.01 - $1',
      example: '$0.05, $0.25, $0.75',
      color: 'bg-gradient-to-r from-orange-400 to-orange-600'
    },
    {
      id: 'mid',
      name: 'Mid-cap',
      description: 'Medium price tokens',
      range: '$1 - $10',
      example: '$2.50, $5.75, $8.25',
      color: 'bg-gradient-to-r from-yellow-400 to-yellow-600'
    },
    {
      id: 'large',
      name: 'Large-cap',
      description: 'High price tokens',
      range: '$10 - $100',
      example: '$25, $50, $85',
      color: 'bg-gradient-to-r from-green-400 to-green-600'
    },
    {
      id: 'mega',
      name: 'Mega-cap',
      description: 'Very high price tokens',
      range: '$100+',
      example: '$250, $500, $750',
      color: 'bg-gradient-to-r from-blue-400 to-blue-600'
    }
  ];

  // Handle speed setting change with buttons instead of slider
  const handleSpeedChange = (newSpeed: number) => {
    setSpeedSetting(newSpeed);
    
    // Convert simplified speed settings to actual speed values
    // Slow = 1x, Medium = 3x, Fast = 5x
    const actualSpeed = newSpeed === 1 ? 1 : (newSpeed === 2 ? 3 : 5);
    onSpeedChange(actualSpeed);
  };

  // Handle price range selection
  const handlePriceRangeChange = (rangeId: string) => {
    setSelectedPriceRange(rangeId);
    setUseCustomPrice(false);
    setCustomPrice('');
    
    if (onParametersChange) {
      onParametersChange({
        priceRange: rangeId as any,
        customPrice: undefined
      });
    }
  };

  // Handle custom price input
  const handleCustomPriceChange = (value: string) => {
    setCustomPrice(value);
    const numericValue = parseFloat(value);
    
    if (!isNaN(numericValue) && numericValue > 0) {
      if (onParametersChange) {
        onParametersChange({
          customPrice: numericValue,
          priceRange: undefined
        });
      }
    }
  };

  // Toggle custom price mode
  const handleCustomPriceToggle = (enabled: boolean) => {
    setUseCustomPrice(enabled);
    if (!enabled) {
      setCustomPrice('');
      handlePriceRangeChange(selectedPriceRange);
    } else {
      if (onParametersChange) {
        onParametersChange({
          priceRange: undefined,
          customPrice: undefined
        });
      }
    }
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  const togglePriceSettings = () => {
    setShowPriceSettings(!showPriceSettings);
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

  // Get current price display
  const getCurrentPriceDisplay = () => {
    if (useCustomPrice && customPrice) {
      return `Custom: $${customPrice}`;
    }
    
    const selectedRange = priceRanges.find(r => r.id === selectedPriceRange);
    if (selectedRange) {
      return `${selectedRange.name}: ${selectedRange.range}`;
    }
    
    return `Current: $${parameters.initialPrice.toFixed(6)}`;
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
        
        <div className="flex space-x-2">
          <button 
            onClick={togglePriceSettings}
            className="text-xs text-accent hover:text-accent-hover"
          >
            {showPriceSettings ? 'Hide Price' : 'Set Price'}
          </button>
          <button 
            onClick={toggleDetails}
            className="text-xs text-accent hover:text-accent-hover"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>
      
      {/* ENHANCED: Starting Price Configuration */}
      {showPriceSettings && (
        <div className="mt-3 p-3 bg-panel rounded-lg border-l-4 border-accent">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Starting Price Range</h3>
            <div className="text-xs text-text-secondary">
              {getCurrentPriceDisplay()}
            </div>
          </div>
          
          {/* Custom Price Toggle */}
          <div className="flex items-center space-x-2 mb-3">
            <input
              type="checkbox"
              id="useCustomPrice"
              checked={useCustomPrice}
              onChange={(e) => handleCustomPriceToggle(e.target.checked)}
              className="rounded"
              disabled={isRunning}
            />
            <label htmlFor="useCustomPrice" className="text-sm">Use custom price</label>
          </div>
          
          {useCustomPrice ? (
            /* Custom Price Input */
            <div className="space-y-2">
              <label className="block text-xs font-medium">Custom Starting Price</label>
              <div className="flex items-center space-x-2">
                <span className="text-sm">$</span>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => handleCustomPriceChange(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  disabled={isRunning}
                  className="flex-1 px-2 py-1 text-sm bg-surface border border-border rounded focus:border-accent focus:outline-none"
                />
              </div>
              <div className="text-xs text-text-secondary">
                Enter any price from $0.0001 to $1000+
              </div>
            </div>
          ) : (
            /* Price Range Selection Grid */
            <div className="grid grid-cols-2 gap-2">
              {priceRanges.map((range) => (
                <button
                  key={range.id}
                  onClick={() => handlePriceRangeChange(range.id)}
                  disabled={isRunning}
                  className={`relative overflow-hidden rounded-lg p-2 text-left transition-all duration-200 ${
                    selectedPriceRange === range.id
                      ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface'
                      : 'hover:scale-105'
                  } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className={`absolute inset-0 ${range.color} opacity-20`}></div>
                  <div className="relative z-10">
                    <div className="text-xs font-medium text-text-primary">{range.name}</div>
                    <div className="text-xs text-text-secondary mb-1">{range.range}</div>
                    <div className="text-xs text-text-muted italic">{range.example}</div>
                  </div>
                  {selectedPriceRange === range.id && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full"></div>
                  )}
                </button>
              ))}
            </div>
          )}
          
          {/* Dynamic Price Info */}
          <div className="mt-2 p-2 bg-surface-variant rounded text-xs">
            <div className="text-accent font-medium mb-1">💡 Dynamic Pricing</div>
            <div className="text-text-secondary">
              Each simulation will start with a different price within your selected range, 
              making every run unique and realistic.
            </div>
          </div>
        </div>
      )}
      
      {/* Simulation speed control - simplified to 3 buttons */}
      <div className="mt-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs">Speed: {getSpeedText()}</span>
        </div>
        
        <div className="flex space-x-2 mt-1">
          <button
            onClick={() => handleSpeedChange(1)}
            disabled={isRunning}
            className={`px-3 py-1 text-xs rounded flex-1 transition ${
              speedSetting === 1 
                ? 'bg-accent text-white' 
                : 'bg-surface-variant text-text-muted hover:bg-panel'
            } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Slow
          </button>
          <button
            onClick={() => handleSpeedChange(2)}
            disabled={isRunning}
            className={`px-3 py-1 text-xs rounded flex-1 transition ${
              speedSetting === 2 
                ? 'bg-accent text-white' 
                : 'bg-surface-variant text-text-muted hover:bg-panel'
            } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Medium
          </button>
          <button
            onClick={() => handleSpeedChange(3)}
            disabled={isRunning}
            className={`px-3 py-1 text-xs rounded flex-1 transition ${
              speedSetting === 3 
                ? 'bg-accent text-white' 
                : 'bg-surface-variant text-text-muted hover:bg-panel'
            } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              <div className="text-text-secondary">Current Price:</div>
              <div className="text-text-primary font-medium">${parameters.initialPrice.toFixed(6)}</div>
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
          
          {/* Enhanced price category info */}
          <div className="mt-2 pt-2 border-t border-border">
            <div className="text-text-secondary">Price Category:</div>
            <div className="text-text-primary font-medium">
              {parameters.initialPrice < 0.01 ? 'Micro-cap (< $0.01)' :
               parameters.initialPrice < 1 ? 'Small-cap ($0.01 - $1)' :
               parameters.initialPrice < 10 ? 'Mid-cap ($1 - $10)' :
               parameters.initialPrice < 100 ? 'Large-cap ($10 - $100)' :
               'Mega-cap ($100+)'}
            </div>
          </div>
        </div>
      )}
      
      {/* Price range indicator when not showing settings */}
      {!showPriceSettings && !isRunning && (
        <div className="mt-2 text-xs text-text-secondary flex items-center justify-between">
          <span>Next start: {getCurrentPriceDisplay()}</span>
          <button 
            onClick={togglePriceSettings}
            className="text-accent hover:text-accent-hover underline"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
};

export default SimulationControls;