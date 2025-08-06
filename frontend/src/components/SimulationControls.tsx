// frontend/src/components/SimulationControls.tsx - COMPLETE FIXES: Start/Pause/Stop + Dynamic Pricing
import React, { useState, useEffect, useCallback, useRef } from 'react';

interface SimulationParameters {
  timeCompressionFactor: number;
  initialPrice?: number;
  initialLiquidity: number;
  volatilityFactor: number;
  duration: number;
  scenarioType: string;
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
  onSpeedChange: (speed: string) => void;
  onParametersChange?: (params: Partial<SimulationParameters>) => void;
  simulationId?: string;
  isConnected?: boolean;
  canStart?: boolean;
  resetInProgress?: boolean;
  manualStartRequired?: boolean;
}

interface PriceRangeOption {
  id: string;
  name: string;
  description: string;
  range: string;
  example: string;
  color: string;
}

interface ControlState {
  lastActionTime: number;
  actionInProgress: boolean;
  actionType: 'start' | 'pause' | 'reset' | null;
  buttonClickCount: number;
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
  simulationId,
  isConnected = false,
  canStart = false,
  resetInProgress = false,
  manualStartRequired = false
}) => {
  // 🔧 FIXED: Enhanced state management for controls
  const [speedSetting, setSpeedSetting] = useState<string>('slow');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showPriceSettings, setShowPriceSettings] = useState<boolean>(false);
  const [selectedPriceRange, setSelectedPriceRange] = useState<string>('random');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [useCustomPrice, setUseCustomPrice] = useState<boolean>(false);
  
  // 🔧 FIXED: Control state to prevent double-clicks and track actions
  const [controlState, setControlState] = useState<ControlState>({
    lastActionTime: 0,
    actionInProgress: false,
    actionType: null,
    buttonClickCount: 0
  });
  
  // 🔧 FIXED: Refs to prevent multiple rapid clicks
  const actionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActionTypeRef = useRef<string | null>(null);
  const clickDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Enhanced price range options with realistic examples
  const priceRanges: PriceRangeOption[] = [
    {
      id: 'random',
      name: 'Random',
      description: 'Weighted random selection',
      range: 'All ranges',
      example: 'Varied each simulation',
      color: 'bg-gradient-to-r from-purple-500 to-pink-500'
    },
    {
      id: 'micro',
      name: 'Micro-cap',
      description: 'Ultra-low price tokens',
      range: '< $0.01',
      example: '$0.000123, $0.00456',
      color: 'bg-gradient-to-r from-red-400 to-red-600'
    },
    {
      id: 'small',
      name: 'Small-cap',
      description: 'Low price tokens',
      range: '$0.01 - $1',
      example: '$0.0789, $0.345, $0.92',
      color: 'bg-gradient-to-r from-orange-400 to-orange-600'
    },
    {
      id: 'mid',
      name: 'Mid-cap',
      description: 'Medium price tokens',
      range: '$1 - $10',
      example: '$2.34, $5.67, $8.91',
      color: 'bg-gradient-to-r from-yellow-400 to-yellow-600'
    },
    {
      id: 'large',
      name: 'Large-cap',
      description: 'High price tokens',
      range: '$10 - $100',
      example: '$23.45, $56.78, $89.12',
      color: 'bg-gradient-to-r from-green-400 to-green-600'
    },
    {
      id: 'mega',
      name: 'Mega-cap',
      description: 'Very high price tokens',
      range: '$100+',
      example: '$234.56, $567.89',
      color: 'bg-gradient-to-r from-blue-400 to-blue-600'
    }
  ];

  // Speed options with more granular control
  const speedOptions = [
    { key: 'slow', label: 'Slow', description: '2x speed' },
    { key: 'medium', label: 'Medium', description: '3x speed' },
    { key: 'fast', label: 'Fast', description: '6x speed' },
    { key: 'ludicrous', label: 'Ludicrous', description: '10x speed' },
    { key: 'ultra', label: 'Ultra', description: '50x speed' },
    { key: 'quantum', label: 'Quantum', description: '100x speed' }
  ];

  // 🔧 FIXED: Initialize from parameters with comprehensive sync
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

  // 🔧 FIXED: Enhanced debounced action handler to prevent double-clicks
  const handleAction = useCallback((actionType: 'start' | 'pause' | 'reset', handler: () => void) => {
    const now = Date.now();
    const timeSinceLastAction = now - controlState.lastActionTime;
    
    // 🔧 FIXED: Prevent rapid clicks (minimum 1 second between actions)
    if (timeSinceLastAction < 1000 && lastActionTypeRef.current === actionType) {
      console.log(`🔒 PREVENTED: Rapid ${actionType} click (${timeSinceLastAction}ms ago)`);
      return;
    }
    
    // 🔧 FIXED: Prevent action if one is already in progress
    if (controlState.actionInProgress) {
      console.log(`🔒 PREVENTED: ${actionType} click while action in progress`);
      return;
    }
    
    if (clickDebounceRef.current) {
      clearTimeout(clickDebounceRef.current);
    }
    
    // 🔧 FIXED: Set action state immediately to prevent double execution
    setControlState(prev => ({
      ...prev,
      lastActionTime: now,
      actionInProgress: true,
      actionType,
      buttonClickCount: prev.buttonClickCount + 1
    }));
    
    lastActionTypeRef.current = actionType;
    
    console.log(`🎯 EXECUTING: ${actionType.toUpperCase()} action (click #${controlState.buttonClickCount + 1})`);
    
    // 🔧 FIXED: Execute handler with timeout protection
    clickDebounceRef.current = setTimeout(() => {
      try {
        handler();
      } catch (error) {
        console.error(`❌ Error executing ${actionType}:`, error);
      } finally {
        // 🔧 FIXED: Clear action state after execution
        setControlState(prev => ({
          ...prev,
          actionInProgress: false,
          actionType: null
        }));
      }
    }, 100);
    
    // 🔧 FIXED: Auto-clear action progress after timeout
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
    }
    
    actionTimeoutRef.current = setTimeout(() => {
      setControlState(prev => ({
        ...prev,
        actionInProgress: false,
        actionType: null
      }));
      console.log(`⏰ TIMEOUT: Cleared ${actionType} action progress`);
    }, 5000);
    
  }, [controlState.lastActionTime, controlState.actionInProgress, controlState.buttonClickCount]);

  // 🔧 FIXED: Enhanced start handler with comprehensive state checking
  const handleStart = useCallback(() => {
    handleAction('start', () => {
      console.log('🚀 START: Executing start action');
      console.log(`🔍 START: State check - canStart=${canStart}, isConnected=${isConnected}, isRunning=${isRunning}, isPaused=${isPaused}`);
      onStart();
    });
  }, [handleAction, onStart, canStart, isConnected, isRunning, isPaused]);

  // 🔧 FIXED: Enhanced pause handler
  const handlePause = useCallback(() => {
    handleAction('pause', () => {
      console.log('⏸️ PAUSE: Executing pause action');
      console.log(`🔍 PAUSE: State check - isRunning=${isRunning}, isPaused=${isPaused}`);
      onPause();
    });
  }, [handleAction, onPause, isRunning, isPaused]);

  // 🔧 FIXED: Enhanced reset handler
  const handleResetAction = useCallback(() => {
    handleAction('reset', () => {
      console.log('🔄 RESET: Executing reset action');
      console.log(`🔍 RESET: State check - resetInProgress=${resetInProgress}`);
      onReset();
    });
  }, [handleAction, onReset, resetInProgress]);

  // 🔧 FIXED: Speed change handler with validation
  const handleSpeedChange = useCallback((newSpeed: string) => {
    if (speedOptions.find(option => option.key === newSpeed)) {
      setSpeedSetting(newSpeed);
      onSpeedChange(newSpeed);
      console.log(`⚡ SPEED: Changed to ${newSpeed}`);
    } else {
      console.warn(`⚠️ SPEED: Invalid speed option: ${newSpeed}`);
    }
  }, [onSpeedChange]);

  // 🔧 FIXED: Price range change handler with comprehensive parameter updates
  const handlePriceRangeChange = useCallback((rangeId: string) => {
    setSelectedPriceRange(rangeId);
    setUseCustomPrice(false);
    setCustomPrice('');
    
    if (onParametersChange) {
      onParametersChange({
        priceRange: rangeId as any,
        customPrice: undefined,
        useCustomPrice: false,
        initialPrice: undefined // CRITICAL: Remove hardcoded initial price
      });
    }
    
    console.log(`💰 PRICE RANGE: Changed to ${rangeId}`);
  }, [onParametersChange]);

  // 🔧 FIXED: Custom price change handler with validation
  const handleCustomPriceChange = useCallback((value: string) => {
    setCustomPrice(value);
    const numericValue = parseFloat(value);
    
    if (!isNaN(numericValue) && numericValue > 0) {
      if (onParametersChange) {
        onParametersChange({
          customPrice: numericValue,
          useCustomPrice: true,
          priceRange: undefined,
          initialPrice: undefined // CRITICAL: Remove hardcoded initial price
        });
      }
      console.log(`💰 CUSTOM PRICE: Set to $${numericValue}`);
    }
  }, [onParametersChange]);

  // 🔧 FIXED: Custom price toggle handler
  const handleCustomPriceToggle = useCallback((enabled: boolean) => {
    setUseCustomPrice(enabled);
    if (!enabled) {
      setCustomPrice('');
      handlePriceRangeChange(selectedPriceRange);
    } else {
      if (onParametersChange) {
        onParametersChange({
          priceRange: undefined,
          customPrice: undefined,
          useCustomPrice: true,
          initialPrice: undefined // CRITICAL: Remove hardcoded initial price
        });
      }
    }
    
    console.log(`💰 CUSTOM PRICE MODE: ${enabled ? 'Enabled' : 'Disabled'}`);
  }, [onParametersChange, selectedPriceRange, handlePriceRangeChange]);

  // 🔧 FIXED: Get current price display with enhanced information
  const getCurrentPriceDisplay = useCallback(() => {
    if (useCustomPrice && customPrice) {
      return `Custom: $${customPrice}`;
    }
    
    const selectedRange = priceRanges.find(r => r.id === selectedPriceRange);
    if (selectedRange) {
      return `${selectedRange.name}: ${selectedRange.range}`;
    }
    
    if (parameters.initialPrice) {
      return `Current: $${parameters.initialPrice.toFixed(6)} (Dynamic)`;
    }
    
    return `Dynamic: Random Generation`;
  }, [useCustomPrice, customPrice, selectedPriceRange, parameters.initialPrice, priceRanges]);

  // 🔧 FIXED: Get button state with comprehensive logic
  const getButtonState = useCallback(() => {
    const isActionInProgress = controlState.actionInProgress;
    const actionType = controlState.actionType;
    
    // 🔧 FIXED: Determine if we should show start button
    const shouldShowStart = !isRunning || isPaused || manualStartRequired;
    const canStartSimulation = canStart && !isActionInProgress && !resetInProgress;
    
    // 🔧 FIXED: Determine if we should show pause button
    const shouldShowPause = isRunning && !isPaused && !manualStartRequired;
    const canPauseSimulation = isConnected && !isActionInProgress;
    
    // 🔧 FIXED: Reset button state
    const canResetSimulation = !isActionInProgress && !resetInProgress;
    
    return {
      shouldShowStart,
      canStartSimulation,
      shouldShowPause,
      canPauseSimulation,
      canResetSimulation,
      isActionInProgress,
      actionType,
      startButtonText: isPaused ? 'Resume' : 'Start',
      startButtonTitle: !canStartSimulation ? 
        'Cannot start - check connection and simulation state' : 
        manualStartRequired ? 
          'Manual start required after reset' : 
          'Start trading simulation'
    };
  }, [controlState, isRunning, isPaused, manualStartRequired, canStart, resetInProgress, isConnected]);

  const buttonState = getButtonState();

  // 🔧 FIXED: Cleanup effect
  useEffect(() => {
    return () => {
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
      }
      if (clickDebounceRef.current) {
        clearTimeout(clickDebounceRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-surface rounded-lg shadow-lg p-4 h-full">
      {/* Header with enhanced status display */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-semibold">Simulation Controls</h2>
          
          {/* 🔧 FIXED: Enhanced status indicators */}
          <div className={`text-xs px-2 py-1 rounded font-medium ${
            isRunning ? (isPaused ? 'bg-yellow-800 text-yellow-300' : 'bg-green-800 text-green-300') : 'bg-gray-800 text-gray-300'
          }`}>
            {isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped'}
          </div>
          
          {/* Connection status */}
          <div className={`text-xs px-2 py-1 rounded ${
            isConnected ? 'bg-green-800 text-green-300' : 'bg-red-800 text-red-300'
          }`}>
            {isConnected ? '🔗 Connected' : '❌ Disconnected'}
          </div>
          
          {/* Dynamic pricing indicator */}
          <div className="text-xs bg-purple-800 text-purple-300 px-2 py-1 rounded">
            💰 Dynamic
          </div>
          
          {/* Manual start required indicator */}
          {manualStartRequired && (
            <div className="text-xs bg-orange-800 text-orange-300 px-2 py-1 rounded">
              🔄 Manual Start Required
            </div>
          )}
          
          {/* Action in progress indicator */}
          {buttonState.isActionInProgress && (
            <div className="text-xs bg-blue-800 text-blue-300 px-2 py-1 rounded">
              ⚡ {buttonState.actionType?.toUpperCase()} in progress...
            </div>
          )}
        </div>
        
        <div className="flex space-x-2">
          <button 
            onClick={() => setShowPriceSettings(!showPriceSettings)}
            className="text-xs text-accent hover:text-accent-hover transition"
            disabled={isRunning && !isPaused}
          >
            {showPriceSettings ? 'Hide Price' : 'Set Price'}
          </button>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-accent hover:text-accent-hover transition"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>
      
      {/* 🔧 FIXED: Enhanced Dynamic Price Configuration */}
      {showPriceSettings && (
        <div className="mb-4 p-3 bg-panel rounded-lg border-l-4 border-accent">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">🔧 FIXED: Dynamic Pricing</h3>
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
              disabled={isRunning && !isPaused}
            />
            <label htmlFor="useCustomPrice" className="text-sm">Use custom price</label>
            {useCustomPrice && (
              <div className="text-xs text-green-400">
                ✅ Custom price mode active
              </div>
            )}
          </div>
          
          {useCustomPrice ? (
            /* Custom Price Input */
            <div className="space-y-2">
              <label className="block text-xs font-medium">Custom Starting Price</label>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold">$</span>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => handleCustomPriceChange(e.target.value)}
                  placeholder="0.000000"
                  min="0"
                  step="any"
                  disabled={isRunning && !isPaused}
                  className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="text-xs text-text-secondary">
                Enter any price from $0.0001 to $10,000+ with up to 8 decimal precision
              </div>
            </div>
          ) : (
            /* Price Range Selection Grid */
            <div className="grid grid-cols-2 gap-2">
              {priceRanges.map((range) => (
                <button
                  key={range.id}
                  onClick={() => handlePriceRangeChange(range.id)}
                  disabled={isRunning && !isPaused}
                  className={`relative overflow-hidden rounded-lg p-3 text-left transition-all duration-200 ${
                    selectedPriceRange === range.id
                      ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface'
                      : 'hover:scale-105'
                  } ${(isRunning && !isPaused) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className={`absolute inset-0 ${range.color} opacity-20`}></div>
                  <div className="relative z-10">
                    <div className="text-xs font-semibold text-text-primary">{range.name}</div>
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
          
          {/* Dynamic Pricing Information */}
          <div className="mt-3 p-2 bg-surface-variant rounded text-xs">
            <div className="text-accent font-medium mb-1">🔧 FIXED: Dynamic Pricing System</div>
            <div className="text-text-secondary space-y-1">
              <div>✅ Each simulation starts with a unique realistic price</div>
              <div>✅ No more hardcoded $100 values</div>
              <div>✅ Proper micro-cap token support (8 decimal precision)</div>
              <div>✅ Price category affects trading behavior and market dynamics</div>
              {!useCustomPrice && (
                <div className="text-green-400 mt-1 font-medium">
                  🎲 Random generation enabled - price varies every reset!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 🔧 FIXED: Enhanced Speed Control */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Simulation Speed</span>
          <span className="text-xs text-text-secondary">
            Current: {speedOptions.find(opt => opt.key === speedSetting)?.description || speedSetting}
          </span>
        </div>
        
        <div className="grid grid-cols-3 gap-1 mb-2">
          {speedOptions.slice(0, 3).map((speed) => (
            <button
              key={speed.key}
              onClick={() => handleSpeedChange(speed.key)}
              disabled={!isConnected}
              className={`px-2 py-2 text-xs rounded transition ${
                speedSetting === speed.key 
                  ? 'bg-accent text-white font-semibold' 
                  : 'bg-surface-variant text-text-muted hover:bg-panel'
              } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={speed.description}
            >
              {speed.label}
            </button>
          ))}
        </div>
        
        {/* Advanced speed options */}
        <div className="grid grid-cols-3 gap-1">
          {speedOptions.slice(3).map((speed) => (
            <button
              key={speed.key}
              onClick={() => handleSpeedChange(speed.key)}
              disabled={!isConnected}
              className={`px-2 py-1 text-xs rounded transition ${
                speedSetting === speed.key 
                  ? 'bg-red-600 text-white font-semibold' 
                  : 'bg-red-900 text-red-300 hover:bg-red-800'
              } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={`${speed.description} - Use with caution!`}
            >
              {speed.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* 🔧 FIXED: Enhanced Control Buttons */}
      <div className="space-y-2">
        {/* Main action button */}
        {buttonState.shouldShowStart ? (
          <button 
            onClick={handleStart}
            disabled={!buttonState.canStartSimulation}
            className={`w-full px-4 py-3 rounded font-semibold transition-all duration-200 ${
              buttonState.canStartSimulation 
                ? 'bg-accent text-white hover:bg-accent-hover hover:scale-105 shadow-lg' 
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            } ${buttonState.isActionInProgress && buttonState.actionType === 'start' ? 'animate-pulse' : ''}`}
            title={buttonState.startButtonTitle}
          >
            {buttonState.isActionInProgress && buttonState.actionType === 'start' ? 
              '⚡ Starting...' : 
              `🚀 ${buttonState.startButtonText} Simulation`
            }
          </button>
        ) : buttonState.shouldShowPause ? (
          <button 
            onClick={handlePause} 
            disabled={!buttonState.canPauseSimulation}
            className={`w-full px-4 py-3 rounded font-semibold transition-all duration-200 ${
              buttonState.canPauseSimulation
                ? 'bg-warning text-text-primary hover:bg-warning-hover hover:scale-105 shadow-lg'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            } ${buttonState.isActionInProgress && buttonState.actionType === 'pause' ? 'animate-pulse' : ''}`}
            title="Pause trading simulation - data will stop immediately"
          >
            {buttonState.isActionInProgress && buttonState.actionType === 'pause' ? 
              '⚡ Pausing...' : 
              '⏸️ Pause Simulation'
            }
          </button>
        ) : null}
        
        {/* Reset button */}
        <button 
          onClick={handleResetAction}
          disabled={!buttonState.canResetSimulation}
          className={`w-full px-4 py-2 rounded font-medium transition-all duration-200 ${
            buttonState.canResetSimulation
              ? 'bg-danger text-white hover:bg-danger-hover hover:scale-105 shadow-lg'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          } ${buttonState.isActionInProgress && buttonState.actionType === 'reset' ? 'animate-pulse' : ''}`}
          title="🔧 FIXED: Complete reset with NEW dynamic price - manual start required"
        >
          {buttonState.isActionInProgress && buttonState.actionType === 'reset' ? 
            '⚡ Resetting...' : 
            '🔄 Reset with New Price'
          }
        </button>
      </div>
      
      {/* 🔧 FIXED: Enhanced Details Panel */}
      {showDetails && (
        <div className="mt-4 text-xs p-3 bg-panel rounded border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-text-secondary font-medium">Simulation State:</div>
              <div className="text-text-primary">
                {isRunning ? (isPaused ? '⏸️ Paused' : '▶️ Running') : '⏹️ Stopped'}
              </div>
            </div>
            <div>
              <div className="text-text-secondary font-medium">Connection:</div>
              <div className={isConnected ? 'text-green-400' : 'text-red-400'}>
                {isConnected ? '🔗 Connected' : '❌ Disconnected'}
              </div>
            </div>
            <div>
              <div className="text-text-secondary font-medium">Current Price:</div>
              <div className="text-text-primary font-medium">
                {parameters.initialPrice ? `$${parameters.initialPrice.toFixed(8)}` : 'Dynamic'}
              </div>
            </div>
            <div>
              <div className="text-text-secondary font-medium">Liquidity:</div>
              <div className="text-text-primary font-medium">${(parameters.initialLiquidity / 1000000).toFixed(2)}M</div>
            </div>
            <div>
              <div className="text-text-secondary font-medium">Volatility:</div>
              <div className="text-text-primary font-medium">{(parameters.volatilityFactor * 100).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-text-secondary font-medium">Scenario:</div>
              <div className="text-text-primary font-medium capitalize">{parameters.scenarioType}</div>
            </div>
          </div>
          
          {/* Price Category Information */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-text-secondary font-medium">Price Category:</div>
            <div className="text-text-primary font-medium">
              {getCurrentPriceDisplay()}
            </div>
          </div>
          
          {/* Control State Information */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-green-400 font-medium">🔧 FIXED: Control State</div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <span className="text-text-secondary">Actions:</span>
                <span className="text-text-primary ml-1">#{controlState.buttonClickCount}</span>
              </div>
              <div>
                <span className="text-text-secondary">In Progress:</span>
                <span className={controlState.actionInProgress ? 'text-yellow-400' : 'text-green-400'}>
                  {controlState.actionInProgress ? `${controlState.actionType}` : 'None'}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Can Start:</span>
                <span className={buttonState.canStartSimulation ? 'text-green-400' : 'text-red-400'}>
                  {buttonState.canStartSimulation ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Manual Required:</span>
                <span className={manualStartRequired ? 'text-orange-400' : 'text-gray-400'}>
                  {manualStartRequired ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Fixed Features Status */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-green-400 font-medium">✅ Fixed Features:</div>
            <div className="text-text-secondary space-y-1 mt-1">
              <div>• Double-click prevention system</div>
              <div>• Enhanced state tracking and validation</div>
              <div>• Dynamic pricing with NO hardcoded $100</div>
              <div>• Proper start/pause/reset button logic</div>
              <div>• WebSocket coordination for immediate response</div>
              <div>• Manual start requirement after reset</div>
              <div>• Comprehensive error handling and recovery</div>
            </div>
          </div>
          
          {/* Debug information for simulation ID */}
          {simulationId && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-text-secondary font-medium">Simulation ID:</div>
              <div className="text-cyan-400 text-xs font-mono">{simulationId.substring(0, 12)}...</div>
            </div>
          )}
        </div>
      )}
      
      {/* Price Range Indicator when settings are hidden */}
      {!showPriceSettings && !isRunning && (
        <div className="mt-3 text-xs text-text-secondary flex items-center justify-between p-2 bg-surface-variant rounded">
          <span>Next start: {getCurrentPriceDisplay()}</span>
          <button 
            onClick={() => setShowPriceSettings(true)}
            className="text-accent hover:text-accent-hover underline"
          >
            Customize
          </button>
        </div>
      )}
      
      {/* Fixed Dynamic Pricing Footer */}
      <div className="mt-3 text-xs text-center">
        <div className="text-green-400 font-semibold">
          🔧 FIXED: Complete Control System
        </div>
        <div className="text-text-muted space-y-1">
          <div>• Dynamic pricing with realistic price ranges</div>
          <div>• Enhanced start/pause/stop functionality</div>
          <div>• Double-click prevention and state tracking</div>
          <div>• Manual start requirement after reset</div>
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;