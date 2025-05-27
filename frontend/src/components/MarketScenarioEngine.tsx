import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface MarketScenario {
  id: string;
  name: string;
  description: string;
  duration: number; // in seconds
  phases: ScenarioPhase[];
  traderBehaviorModifiers: TraderBehaviorModifier[];
}

interface ScenarioPhase {
  name: string;
  duration: number; // in seconds
  priceAction: PriceAction;
  volumeMultiplier: number;
  spreadMultiplier: number;
  marketCondition: 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash';
}

interface PriceAction {
  type: 'trend' | 'consolidation' | 'breakout' | 'crash' | 'pump' | 'accumulation' | 'distribution';
  intensity: number; // 0.1 to 2.0
  volatility: number; // 0.1 to 3.0
  direction?: 'up' | 'down' | 'sideways';
}

interface TraderBehaviorModifier {
  traderType: 'whale' | 'retail' | 'bot' | 'all';
  behaviorChange: {
    aggression?: number; // -1 to 1
    riskTolerance?: number; // -1 to 1
    followTrend?: number; // -1 to 1
    liquidityProviding?: number; // -1 to 1
  };
}

interface MarketScenarioEngineProps {
  isActive: boolean;
  onActiveToggle?: (active: boolean) => void;
  onScenarioStart: (scenario: MarketScenario) => void;
  onScenarioEnd: () => void;
  onScenarioUpdate: (phase: ScenarioPhase, progress: number) => void;
  simulationRunning: boolean;
}

const MarketScenarioEngine: React.FC<MarketScenarioEngineProps> = ({
  isActive,
  onActiveToggle,
  onScenarioStart,
  onScenarioEnd,
  onScenarioUpdate,
  simulationRunning
}) => {
  const [availableScenarios] = useState<MarketScenario[]>([
    {
      id: 'opening_bell_gap_up',
      name: 'Opening Bell Gap Up',
      description: 'Pre-market news causes gap up at open, followed by consolidation and potential continuation',
      duration: 300, // 5 minutes
      phases: [
        {
          name: 'Pre-Market Buildup',
          duration: 60,
          priceAction: { type: 'accumulation', intensity: 0.3, volatility: 0.5, direction: 'up' },
          volumeMultiplier: 0.4,
          spreadMultiplier: 2.0,
          marketCondition: 'building'
        },
        {
          name: 'Gap Opening',
          duration: 30,
          priceAction: { type: 'breakout', intensity: 1.5, volatility: 1.2, direction: 'up' },
          volumeMultiplier: 3.0,
          spreadMultiplier: 1.5,
          marketCondition: 'volatile'
        },
        {
          name: 'Initial Rejection',
          duration: 60,
          priceAction: { type: 'consolidation', intensity: 0.8, volatility: 1.0, direction: 'down' },
          volumeMultiplier: 1.5,
          spreadMultiplier: 1.2,
          marketCondition: 'bearish'
        },
        {
          name: 'Support Test',
          duration: 90,
          priceAction: { type: 'consolidation', intensity: 0.4, volatility: 0.8, direction: 'sideways' },
          volumeMultiplier: 0.8,
          spreadMultiplier: 1.0,
          marketCondition: 'calm'
        },
        {
          name: 'Continuation Move',
          duration: 60,
          priceAction: { type: 'trend', intensity: 1.2, volatility: 0.9, direction: 'up' },
          volumeMultiplier: 2.0,
          spreadMultiplier: 0.8,
          marketCondition: 'bullish'
        }
      ],
      traderBehaviorModifiers: [
        {
          traderType: 'retail',
          behaviorChange: { aggression: 0.3, followTrend: 0.5 }
        },
        {
          traderType: 'bot',
          behaviorChange: { aggression: 0.8, riskTolerance: -0.2 }
        }
      ]
    },
    {
      id: 'whale_accumulation',
      name: 'Whale Accumulation',
      description: 'Large player slowly accumulates position, causing gradual price rise with periods of consolidation',
      duration: 420, // 7 minutes
      phases: [
        {
          name: 'Silent Accumulation',
          duration: 120,
          priceAction: { type: 'accumulation', intensity: 0.2, volatility: 0.3, direction: 'up' },
          volumeMultiplier: 1.2,
          spreadMultiplier: 0.9,
          marketCondition: 'calm'
        },
        {
          name: 'Price Discovery',
          duration: 90,
          priceAction: { type: 'trend', intensity: 0.6, volatility: 0.5, direction: 'up' },
          volumeMultiplier: 1.5,
          spreadMultiplier: 0.8,
          marketCondition: 'building'
        },
        {
          name: 'Retail FOMO',
          duration: 60,
          priceAction: { type: 'pump', intensity: 1.3, volatility: 1.1, direction: 'up' },
          volumeMultiplier: 2.5,
          spreadMultiplier: 1.2,
          marketCondition: 'volatile'
        },
        {
          name: 'Profit Taking',
          duration: 90,
          priceAction: { type: 'distribution', intensity: 0.8, volatility: 0.9, direction: 'down' },
          volumeMultiplier: 1.8,
          spreadMultiplier: 1.3,
          marketCondition: 'bearish'
        },
        {
          name: 'New Support',
          duration: 60,
          priceAction: { type: 'consolidation', intensity: 0.4, volatility: 0.6, direction: 'sideways' },
          volumeMultiplier: 0.9,
          spreadMultiplier: 1.0,
          marketCondition: 'bullish'
        }
      ],
      traderBehaviorModifiers: [
        {
          traderType: 'whale',
          behaviorChange: { aggression: -0.3, liquidityProviding: 0.8 }
        },
        {
          traderType: 'retail',
          behaviorChange: { followTrend: 0.7, riskTolerance: 0.4 }
        }
      ]
    },
    {
      id: 'flash_crash',
      name: 'Flash Crash',
      description: 'Sudden massive sell order triggers stop-loss cascade, followed by smart money buying the dip',
      duration: 240, // 4 minutes
      phases: [
        {
          name: 'Normal Trading',
          duration: 60,
          priceAction: { type: 'consolidation', intensity: 0.3, volatility: 0.4, direction: 'sideways' },
          volumeMultiplier: 1.0,
          spreadMultiplier: 1.0,
          marketCondition: 'calm'
        },
        {
          name: 'Initial Dump',
          duration: 20,
          priceAction: { type: 'crash', intensity: 2.0, volatility: 2.5, direction: 'down' },
          volumeMultiplier: 5.0,
          spreadMultiplier: 3.0,
          marketCondition: 'crash'
        },
        {
          name: 'Panic Cascade',
          duration: 40,
          priceAction: { type: 'crash', intensity: 1.8, volatility: 2.2, direction: 'down' },
          volumeMultiplier: 4.0,
          spreadMultiplier: 2.5,
          marketCondition: 'crash'
        },
        {
          name: 'Smart Money Entry',
          duration: 60,
          priceAction: { type: 'accumulation', intensity: 1.2, volatility: 1.5, direction: 'up' },
          volumeMultiplier: 2.5,
          spreadMultiplier: 1.8,
          marketCondition: 'volatile'
        },
        {
          name: 'Recovery',
          duration: 60,
          priceAction: { type: 'trend', intensity: 0.8, volatility: 1.0, direction: 'up' },
          volumeMultiplier: 1.5,
          spreadMultiplier: 1.2,
          marketCondition: 'bullish'
        }
      ],
      traderBehaviorModifiers: [
        {
          traderType: 'retail',
          behaviorChange: { aggression: -0.5, riskTolerance: -0.8 }
        },
        {
          traderType: 'whale',
          behaviorChange: { aggression: 0.6, riskTolerance: 0.3 }
        },
        {
          traderType: 'bot',
          behaviorChange: { aggression: 0.9, followTrend: -0.4 }
        }
      ]
    },
    {
      id: 'breakout_pattern',
      name: 'Technical Breakout',
      description: 'Classic ascending triangle pattern with volume confirmation and continuation',
      duration: 360, // 6 minutes
      phases: [
        {
          name: 'Triangle Formation',
          duration: 180,
          priceAction: { type: 'consolidation', intensity: 0.4, volatility: 0.6, direction: 'sideways' },
          volumeMultiplier: 0.7,
          spreadMultiplier: 1.1,
          marketCondition: 'calm'
        },
        {
          name: 'Volume Buildup',
          duration: 60,
          priceAction: { type: 'consolidation', intensity: 0.6, volatility: 0.8, direction: 'up' },
          volumeMultiplier: 1.4,
          spreadMultiplier: 1.0,
          marketCondition: 'building'
        },
        {
          name: 'Breakout',
          duration: 30,
          priceAction: { type: 'breakout', intensity: 1.6, volatility: 1.3, direction: 'up' },
          volumeMultiplier: 3.5,
          spreadMultiplier: 1.4,
          marketCondition: 'volatile'
        },
        {
          name: 'Retest',
          duration: 60,
          priceAction: { type: 'consolidation', intensity: 0.7, volatility: 0.9, direction: 'down' },
          volumeMultiplier: 1.2,
          spreadMultiplier: 1.2,
          marketCondition: 'bearish'
        },
        {
          name: 'Continuation',
          duration: 30,
          priceAction: { type: 'trend', intensity: 1.4, volatility: 1.0, direction: 'up' },
          volumeMultiplier: 2.2,
          spreadMultiplier: 0.9,
          marketCondition: 'bullish'
        }
      ],
      traderBehaviorModifiers: [
        {
          traderType: 'bot',
          behaviorChange: { followTrend: 0.8, aggression: 0.4 }
        },
        {
          traderType: 'retail',
          behaviorChange: { followTrend: 0.6, riskTolerance: 0.2 }
        }
      ]
    },
    {
      id: 'rug_pull',
      name: 'Coordinated Exit',
      description: 'Insiders coordinate massive exit, causing liquidity crisis and retail panic',
      duration: 180, // 3 minutes
      phases: [
        {
          name: 'Normal Activity',
          duration: 30,
          priceAction: { type: 'consolidation', intensity: 0.3, volatility: 0.4, direction: 'sideways' },
          volumeMultiplier: 1.0,
          spreadMultiplier: 1.0,
          marketCondition: 'calm'
        },
        {
          name: 'Coordinated Selling',
          duration: 60,
          priceAction: { type: 'distribution', intensity: 1.8, volatility: 1.8, direction: 'down' },
          volumeMultiplier: 4.0,
          spreadMultiplier: 2.8,
          marketCondition: 'crash'
        },
        {
          name: 'Liquidity Crisis',
          duration: 45,
          priceAction: { type: 'crash', intensity: 2.2, volatility: 2.8, direction: 'down' },
          volumeMultiplier: 2.0,
          spreadMultiplier: 4.0,
          marketCondition: 'crash'
        },
        {
          name: 'Capitulation',
          duration: 45,
          priceAction: { type: 'crash', intensity: 1.5, volatility: 2.0, direction: 'down' },
          volumeMultiplier: 1.5,
          spreadMultiplier: 3.0,
          marketCondition: 'crash'
        }
      ],
      traderBehaviorModifiers: [
        {
          traderType: 'whale',
          behaviorChange: { aggression: 0.9, liquidityProviding: -0.8 }
        },
        {
          traderType: 'retail',
          behaviorChange: { aggression: -0.7, riskTolerance: -0.9 }
        },
        {
          traderType: 'bot',
          behaviorChange: { aggression: 0.3, followTrend: 0.8 }
        }
      ]
    }
  ]);

  const [currentScenario, setCurrentScenario] = useState<MarketScenario | null>(null);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState<number>(0);
  const [phaseProgress, setPhaseProgress] = useState<number>(0);
  const [scenarioStartTime, setScenarioStartTime] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  const scenarioTimerRef = useRef<NodeJS.Timeout | null>(null);
  const phaseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Start a random scenario
  const startRandomScenario = useCallback(() => {
    if (!simulationRunning || currentScenario) return;

    const randomScenario = availableScenarios[Math.floor(Math.random() * availableScenarios.length)];
    setCurrentScenario(randomScenario);
    setCurrentPhaseIndex(0);
    setPhaseProgress(0);
    setScenarioStartTime(Date.now());
    onScenarioStart(randomScenario);

    console.log(`🎬 Starting scenario: ${randomScenario.name}`);
  }, [availableScenarios, simulationRunning, currentScenario, onScenarioStart]);

  // Start a specific scenario
  const startScenario = useCallback((scenarioId: string) => {
    if (!simulationRunning || currentScenario) return;

    const scenario = availableScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    setCurrentScenario(scenario);
    setCurrentPhaseIndex(0);
    setPhaseProgress(0);
    setScenarioStartTime(Date.now());
    onScenarioStart(scenario);

    console.log(`🎬 Starting scenario: ${scenario.name}`);
  }, [availableScenarios, simulationRunning, currentScenario, onScenarioStart]);

  // End current scenario
  const endScenario = useCallback(() => {
    if (scenarioTimerRef.current) {
      clearTimeout(scenarioTimerRef.current);
    }
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
    }

    setCurrentScenario(null);
    setCurrentPhaseIndex(0);
    setPhaseProgress(0);
    setScenarioStartTime(0);
    onScenarioEnd();

    console.log('🎬 Scenario ended');
  }, [onScenarioEnd]);

  // Update scenario progress
  useEffect(() => {
    if (!currentScenario || !simulationRunning) return;

    const updateProgress = () => {
      const currentPhase = currentScenario.phases[currentPhaseIndex];
      if (!currentPhase) {
        endScenario();
        return;
      }

      const phaseStartTime = scenarioStartTime + 
        currentScenario.phases.slice(0, currentPhaseIndex).reduce((sum, phase) => sum + phase.duration * 1000, 0);
      
      const elapsed = Date.now() - phaseStartTime;
      const progress = Math.min(elapsed / (currentPhase.duration * 1000), 1);

      setPhaseProgress(progress);
      onScenarioUpdate(currentPhase, progress);

      if (progress >= 1) {
        // Move to next phase
        if (currentPhaseIndex < currentScenario.phases.length - 1) {
          setCurrentPhaseIndex(prev => prev + 1);
          setPhaseProgress(0);
          console.log(`🎬 Phase transition: ${currentPhase.name} → ${currentScenario.phases[currentPhaseIndex + 1].name}`);
        } else {
          // Scenario complete
          endScenario();
        }
      }
    };

    phaseTimerRef.current = setInterval(updateProgress, 100);

    return () => {
      if (phaseTimerRef.current) {
        clearInterval(phaseTimerRef.current);
      }
    };
  }, [currentScenario, currentPhaseIndex, scenarioStartTime, simulationRunning, onScenarioUpdate, endScenario]);

  // Auto-start scenarios randomly
  useEffect(() => {
    if (!simulationRunning || !isActive) return;

    const startRandomScenarios = () => {
      // 20% chance every 2 minutes to start a scenario
      if (Math.random() < 0.2 && !currentScenario) {
        startRandomScenario();
      }
    };

    const randomTimer = setInterval(startRandomScenarios, 120000); // Every 2 minutes

    return () => {
      clearInterval(randomTimer);
    };
  }, [simulationRunning, isActive, currentScenario, startRandomScenario]);

  // Get current phase
  const getCurrentPhase = (): ScenarioPhase | null => {
    if (!currentScenario) return null;
    return currentScenario.phases[currentPhaseIndex] || null;
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed top-36 right-4 z-40 bg-purple-800 text-white p-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors"
        title="Show Market Scenario Engine"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10,9 9,9 8,9"></polyline>
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed top-36 right-4 z-40 bg-gray-900 text-white p-4 rounded-lg shadow-xl border border-gray-700 min-w-[400px] max-h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${currentScenario ? 'bg-purple-500 animate-pulse' : 'bg-gray-500'}`}></div>
          <span className="text-sm font-semibold">Market Scenario Engine</span>
          {currentScenario && (
            <span className="text-xs bg-purple-600 px-2 py-0.5 rounded">ACTIVE</span>
          )}
        </div>
        <button onClick={() => setIsVisible(false)} className="text-gray-400 hover:text-white p-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Current Scenario Status */}
      {currentScenario && (
        <div className="mb-4 p-3 bg-gray-800 rounded">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold text-purple-300">{currentScenario.name}</h3>
            <button 
              onClick={endScenario}
              className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
            >
              End
            </button>
          </div>
          <p className="text-xs text-gray-300 mb-3">{currentScenario.description}</p>
          
          {/* Current Phase */}
          {getCurrentPhase() && (
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-purple-400">{getCurrentPhase()!.name}</span>
                <span className="text-gray-400">
                  Phase {currentPhaseIndex + 1}/{currentScenario.phases.length}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full transition-all duration-100"
                  style={{ width: `${phaseProgress * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs mt-1 text-gray-400">
                <span>Market: {getCurrentPhase()!.marketCondition}</span>
                <span>Vol: {(getCurrentPhase()!.volumeMultiplier * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Scenario Controls */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold mb-2 text-gray-300">Manual Scenarios</h3>
        <div className="grid grid-cols-1 gap-1 max-h-[300px] overflow-y-auto">
          {availableScenarios.map(scenario => (
            <button
              key={scenario.id}
              onClick={() => startScenario(scenario.id)}
              disabled={!!currentScenario || !simulationRunning}
              className={`text-left p-2 rounded text-xs transition ${
                currentScenario?.id === scenario.id 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              } ${(!simulationRunning || currentScenario) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium">{scenario.name}</div>
              <div className="text-gray-400 text-[10px] mt-1">{scenario.description}</div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-purple-400">
                  {Math.floor(scenario.duration / 60)}m {scenario.duration % 60}s
                </span>
                <span className="text-[10px] text-gray-500">
                  {scenario.phases.length} phases
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Auto-scenario toggle */}
      <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
        <span className="text-xs text-gray-300">Auto Scenarios</span>
        <button
          onClick={() => onActiveToggle?.(!isActive)}
          disabled={!onActiveToggle}
          className={`px-3 py-1 text-xs rounded transition ${
            isActive ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-300'
          } ${!onActiveToggle ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          {isActive ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Random scenario button */}
      <div className="mt-2">
        <button
          onClick={startRandomScenario}
          disabled={!!currentScenario || !simulationRunning}
          className={`w-full py-2 text-xs rounded transition ${
            (!simulationRunning || currentScenario) 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-purple-600 hover:bg-purple-700 text-white'
          }`}
        >
          🎲 Start Random Scenario
        </button>
      </div>
    </div>
  );
};

export default MarketScenarioEngine;