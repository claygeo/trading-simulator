// frontend/src/components/SimulationControls.tsx - FIXED: Button State Responsiveness & Props Integration
import React, { useState, useEffect } from 'react';

interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice?: number; // FIXED: Made optional - should not be used with dynamic pricing
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType: string;
  // FIXED: Dynamic pricing parameters
  priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega' | 'random';
  customPrice?: number;
  useCustomPrice?: boolean;
}

interface SimulationControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  parameters: SimulationParameters;
  onSpeedChange: (speed: string) => void; // FIXED: Change to string for speed names
  onParametersChange?: (params: Partial<SimulationParameters>) => void;
  // 🔧 CRITICAL FIX: Add explicit showStart prop to reflect Dashboard state
  showStart?: boolean;
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
  onParametersChange,
  showStart = true // 🔧 CRITICAL FIX: Default to true, but respect explicit prop
}) => {
  // FIXED: Speed options mapped to names instead of numbers
  const [speedSetting, setSpeedSetting] = useState<string>('slow'); // Default to Slow
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

  // FIXED: Initialize from parameters
  useEffect(() => {
    if (parameters.priceRange) {
      setSelectedPriceRange(parameters.priceRange);
    }
    if (parameters.useCustomPrice) {
      setUseCustomPrice(true);
      if (parameters.customPrice) {
        setCustomPrice(parameters.customPrice.toString());
      }
    }
  }, [parameters.priceRange, parameters.useCustomPrice, parameters.customPrice]);

  // 🔧 CRITICAL FIX: Log prop changes for debugging button state issues
  useEffect(() => {
    console.log(`🔧 [CONTROLS] Props update: isRunning=${isRunning}, isPaused=${isPaused}, showStart=${showStart}`);
  }, [isRunning, isPaused, showStart]);

  // Handle speed setting change with buttons instead of slider
  const handleSpeedChange = (newSpeed: string) => {
    setSpeedSetting(newSpeed);
    onSpeedChange(newSpeed); // FIXED: Pass string instead of number
  };

  // FIXED: Handle price range selection with proper parameter updates
  const handlePriceRangeChange = (rangeId: string) => {
    setSelectedPriceRange(rangeId);
    setUseCustomPrice(false);
    setCustomPrice('');
    
    if (onParametersChange) {
      onParametersChange({
        priceRange: rangeId as any,
        customPrice: undefined,
        useCustomPrice: false,
        // CRITICAL: DO NOT include initialPrice when using dynamic pricing
        initialPrice: undefined
      });
    }
    
    console.log('💰 FIXED: Price range changed to:', rangeId);
  };

  // FIXED: Handle custom price input with proper validation
  const handleCustomPriceChange = (value: string) => {
    setCustomPrice(value);
    const numericValue = parseFloat(value);
    
    if (!isNaN(numericValue) && numericValue > 0) {
      if (onParametersChange) {
        onParametersChange({
          customPrice: numericValue,
          useCustomPrice: true,
          priceRange: undefined,
          // CRITICAL: DO NOT include initialPrice when using custom price
          initialPrice: undefined
        });
      }
      console.log('💰 FIXED: Custom price set to:', numericValue);
    }
  };

  // FIXED: Toggle custom price mode with proper parameter updates
  const handleCustomPriceToggle = (enabled: boolean) => {
    setUseCustomPrice(enabled);
    if (!enabled) {
      setCustomPrice('');
      // Revert to selected price range
      handlePriceRangeChange(selectedPriceRange);
    } else {
      if (onParametersChange) {
        onParametersChange({
          priceRange: undefined,
          customPrice: undefined,
          useCustomPrice: true,
          // CRITICAL: DO NOT include initialPrice
          initialPrice: undefined
        });
      }
    }
    
    console.log('💰 FIXED: Custom price mode toggled:', enabled);
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  const togglePriceSettings = () => {
    setShowPriceSettings(!showPriceSettings);
  };

  // FIXED: Get display text for current price setting
  const getCurrentPriceDisplay = () => {
    if (useCustomPrice && customPrice) {
      return `Custom: ${customPrice}`;
    }
    
    const selectedRange = priceRanges.find(r => r.id === selectedPriceRange);
    if (selectedRange) {
      return `${selectedRange.name}: ${selectedRange.range}`;
    }
    
    // FIXED: Show current parameter price if available, but indicate it's dynamic
    if (parameters.initialPrice) {
      return `Current: ${parameters.initialPrice.toFixed(6)} (Dynamic)`;
    }
    
    return `Dynamic: Random Generation`;
  };

  // 🔧 CRITICAL FIX: Enhanced button state logic that respects Dashboard props
  const shouldShowStartButton = () => {
    // Use explicit showStart prop if provided, otherwise fall back to local logic
    if (showStart !== undefined) {
      return showStart;
    }
    
    // Fallback logic (though Dashboard should provide showStart)
    return !isRunning || isPaused;
  };

  // 🔧 CRITICAL FIX: Determine button text based on state
  const getButtonText = () => {
    if (isPaused) {
      return 'Resume';
    }
    if (!isRunning) {
      return 'Start';
    }
    return 'Start'; // Fallback
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
          {/* FIXED: Dynamic pricing indicator */}
          <div className="ml-2 text-xs bg-green-800 text-green-300 px-2 py-1 rounded">
            💰 Dynamic
          </div>
          
          {/* 🔧 CRITICAL FIX: Debug indicator for button state */}
          {process.env.NODE_ENV === 'development' && (
            <div className="ml-2 text-xs bg-blue-800 text-blue-300 px-2 py-1 rounded">
              BTN: {shouldShowStartButton() ? 'START' : 'PAUSE'}
            </div>
          )}
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
      
      {/* ENHANCED: Starting Price Configuration with Dynamic Pricing */}
      {showPriceSettings && (
        <div className="mt-3 p-3 bg-panel rounded-lg border-l-4 border-accent">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Dynamic Starting Price</h3>
            <div className="text-xs text-text-secondary">
              {getCurrentPriceDisplay()}
            </div>
          </div>
          
          {/* FIXED: Custom Price Toggle */}
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
          
          {/* FIXED: Dynamic Price Info */}
          <div className="mt-2 p-2 bg-surface-variant rounded text-xs">
            <div className="text-accent font-medium mb-1">💰 FIXED: Dynamic Pricing</div>
            <div className="text-text-secondary">
              Each simulation will start with a different price within your selected range. 
              No more hardcoded $100! Every run is unique and realistic.
            </div>
            {!useCustomPrice && (
              <div className="text-green-400 mt-1">
                ✅ Random generation enabled - price will vary every reset!
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* FIXED: Simulation speed control - simplified to text buttons */}
      <div className="mt-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs">Speed: {speedSetting}</span>
        </div>
        
        <div className="flex space-x-2 mt-1">
          {['slow', 'medium', 'fast'].map((speed) => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              disabled={isRunning}
              className={`px-3 py-1 text-xs rounded flex-1 transition ${
                speedSetting === speed 
                  ? 'bg-accent text-white' 
                  : 'bg-surface-variant text-text-muted hover:bg-panel'
              } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {speed.charAt(0).toUpperCase() + speed.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* 🔧 CRITICAL FIX: Enhanced control buttons with proper state handling */}
      <div className="flex items-center space-x-2 mt-3">
        {shouldShowStartButton() ? (
          <button 
            onClick={onStart}
            className="px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-hover transition flex-1"
            title={`🔧 FIXED: ${getButtonText()} simulation - respects Dashboard state`}
          >
            {getButtonText()} Simulation
          </button>
        ) : (
          <button 
            onClick={onPause} 
            className="px-3 py-1.5 bg-warning text-text-primary rounded hover:bg-warning-hover transition flex-1"
            title="🔧 FIXED: Pause simulation - triggered by Dashboard props"
          >
            Pause
          </button>
        )}
        
        <button 
          onClick={onReset}
          className="px-3 py-1.5 bg-danger text-white rounded hover:bg-danger-hover transition w-20"
          title="Reset with NEW dynamic price"
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
              <div className="text-text-primary font-medium">
                {parameters.initialPrice ? `${parameters.initialPrice.toFixed(6)}` : 'Dynamic'}
              </div>
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
          
          {/* FIXED: Enhanced price category info */}
          <div className="mt-2 pt-2 border-t border-border">
            <div className="text-text-secondary">Price Category:</div>
            <div className="text-text-primary font-medium">
              {useCustomPrice && customPrice ? 
                `Custom: ${customPrice}` :
                selectedPriceRange ? 
                  priceRanges.find(r => r.id === selectedPriceRange)?.description || 'Unknown' :
                  'Dynamic Generation'}
            </div>
          </div>
          
          {/* FIXED: Dynamic pricing status */}
          <div className="mt-2 pt-2 border-t border-border">
            <div className="text-green-400 font-medium">💰 Dynamic Pricing Status:</div>
            <div className="text-text-secondary">
              {useCustomPrice ? 
                'Custom price will be used' :
                'Price will be randomly generated in selected range'}
            </div>
            <div className="text-orange-400 text-xs mt-1">
              ✅ NO MORE $100 hardcoded values!
            </div>
          </div>
          
          {/* 🔧 CRITICAL FIX: Button state debugging info */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-2 pt-2 border-t border-border">
              <div className="text-blue-400 font-medium">🔧 BUTTON STATE DEBUG:</div>
              <div className="text-text-secondary text-xs space-y-1">
                <div>isRunning: <span className={isRunning ? 'text-green-400' : 'text-red-400'}>{isRunning ? 'true' : 'false'}</span></div>
                <div>isPaused: <span className={isPaused ? 'text-yellow-400' : 'text-gray-400'}>{isPaused ? 'true' : 'false'}</span></div>
                <div>showStart prop: <span className={showStart ? 'text-green-400' : 'text-red-400'}>{showStart ? 'true' : 'false'}</span></div>
                <div>shouldShowStartButton(): <span className={shouldShowStartButton() ? 'text-green-400' : 'text-red-400'}>{shouldShowStartButton() ? 'true' : 'false'}</span></div>
                <div>Button text: <span className="text-white">{getButtonText()}</span></div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* FIXED: Price range indicator when not showing settings */}
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
      
      {/* FIXED: Dynamic pricing indicator */}
      <div className="mt-2 text-xs text-center">
        <div className="text-green-400 font-medium">
          💰 Dynamic Pricing Active
        </div>
        <div className="text-text-muted">
          Each simulation starts with a unique price
        </div>
        
        {/* 🔧 CRITICAL FIX: Status indicator */}
        <div className="mt-1 text-blue-400">
          🔧 FIXED: Button state properly synchronized
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;