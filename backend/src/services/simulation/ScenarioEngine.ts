// backend/src/services/simulation/ScenarioEngine.ts - BACKEND MARKET SCENARIO ENGINE
import { SimulationState, ExtendedSimulationState } from './types';

export interface MarketScenario {
  id: string;
  name: string;
  description: string;
  duration: number; // in seconds
  phases: ScenarioPhase[];
  traderBehaviorModifiers: TraderBehaviorModifier[];
}

export interface ScenarioPhase {
  name: string;
  duration: number; // in seconds
  priceAction: PriceAction;
  volumeMultiplier: number;
  spreadMultiplier: number;
  marketCondition: 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash';
}

export interface PriceAction {
  type: 'trend' | 'consolidation' | 'breakout' | 'crash' | 'pump' | 'accumulation' | 'distribution';
  intensity: number; // 0.1 to 2.0
  volatility: number; // 0.1 to 3.0
  direction?: 'up' | 'down' | 'sideways';
}

export interface TraderBehaviorModifier {
  traderType: 'whale' | 'retail' | 'bot' | 'all';
  behaviorChange: {
    aggression?: number; // -1 to 1
    riskTolerance?: number; // -1 to 1
    followTrend?: number; // -1 to 1
    liquidityProviding?: number; // -1 to 1
  };
}

export interface ActiveScenario {
  scenario: MarketScenario;
  startTime: number;
  currentPhaseIndex: number;
  phaseStartTime: number;
  progress: number;
  isActive: boolean;
}

export class ScenarioEngine {
  private activeScenarios: Map<string, ActiveScenario> = new Map();
  private scenarioLibrary: MarketScenario[] = [];
  private updateInterval: NodeJS.Timeout | null = null;
  
  constructor(
    private clearCache: (simulationId: string) => void,
    private broadcastEvent: (simulationId: string, event: any) => void
  ) {
    this.initializeScenarioLibrary();
    this.startScenarioUpdater();
  }
  
  private initializeScenarioLibrary(): void {
    this.scenarioLibrary = [
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
    ];
    
    console.log(`📚 Scenario library initialized with ${this.scenarioLibrary.length} scenarios`);
  }
  
  private startScenarioUpdater(): void {
    this.updateInterval = setInterval(() => {
      this.updateActiveScenarios();
    }, 1000); // Update every second
  }
  
  private updateActiveScenarios(): void {
    const now = Date.now();
    
    for (const [simulationId, activeScenario] of this.activeScenarios.entries()) {
      if (!activeScenario.isActive) continue;
      
      const totalElapsed = now - activeScenario.startTime;
      const phaseElapsed = now - activeScenario.phaseStartTime;
      const currentPhase = activeScenario.scenario.phases[activeScenario.currentPhaseIndex];
      
      if (!currentPhase) {
        this.endScenario(simulationId);
        continue;
      }
      
      const phaseProgress = Math.min(1, phaseElapsed / (currentPhase.duration * 1000));
      activeScenario.progress = phaseProgress;
      
      // Broadcast phase update
      this.broadcastEvent(simulationId, {
        type: 'scenario_phase_update',
        timestamp: now,
        data: {
          scenarioId: activeScenario.scenario.id,
          scenarioName: activeScenario.scenario.name,
          currentPhase: currentPhase,
          phaseIndex: activeScenario.currentPhaseIndex,
          totalPhases: activeScenario.scenario.phases.length,
          phaseProgress: phaseProgress,
          totalProgress: (activeScenario.currentPhaseIndex + phaseProgress) / activeScenario.scenario.phases.length
        }
      });
      
      // Check if phase is complete
      if (phaseProgress >= 1) {
        if (activeScenario.currentPhaseIndex < activeScenario.scenario.phases.length - 1) {
          // Move to next phase
          activeScenario.currentPhaseIndex++;
          activeScenario.phaseStartTime = now;
          activeScenario.progress = 0;
          
          const nextPhase = activeScenario.scenario.phases[activeScenario.currentPhaseIndex];
          console.log(`🎬 Scenario "${activeScenario.scenario.name}" phase transition: ${currentPhase.name} → ${nextPhase.name}`);
          
          this.broadcastEvent(simulationId, {
            type: 'scenario_phase_transition',
            timestamp: now,
            data: {
              scenarioId: activeScenario.scenario.id,
              fromPhase: currentPhase.name,
              toPhase: nextPhase.name,
              phaseIndex: activeScenario.currentPhaseIndex
            }
          });
        } else {
          // Scenario complete
          this.endScenario(simulationId);
        }
      }
    }
  }
  
  startScenario(simulationId: string, scenarioId: string): boolean {
    const scenario = this.scenarioLibrary.find(s => s.id === scenarioId);
    if (!scenario) {
      console.error(`❌ Scenario not found: ${scenarioId}`);
      return false;
    }
    
    // End any existing scenario
    if (this.activeScenarios.has(simulationId)) {
      this.endScenario(simulationId);
    }
    
    const now = Date.now();
    const activeScenario: ActiveScenario = {
      scenario,
      startTime: now,
      currentPhaseIndex: 0,
      phaseStartTime: now,
      progress: 0,
      isActive: true
    };
    
    this.activeScenarios.set(simulationId, activeScenario);
    
    console.log(`🎬 Started scenario "${scenario.name}" for simulation ${simulationId}`);
    
    // Broadcast scenario start
    this.broadcastEvent(simulationId, {
      type: 'scenario_started',
      timestamp: now,
      data: {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        description: scenario.description,
        duration: scenario.duration,
        phases: scenario.phases.map(p => p.name),
        traderModifiers: scenario.traderBehaviorModifiers
      }
    });
    
    return true;
  }
  
  startRandomScenario(simulationId: string): boolean {
    const randomScenario = this.scenarioLibrary[Math.floor(Math.random() * this.scenarioLibrary.length)];
    return this.startScenario(simulationId, randomScenario.id);
  }
  
  endScenario(simulationId: string): void {
    const activeScenario = this.activeScenarios.get(simulationId);
    if (!activeScenario) return;
    
    activeScenario.isActive = false;
    this.activeScenarios.delete(simulationId);
    
    console.log(`🎬 Ended scenario "${activeScenario.scenario.name}" for simulation ${simulationId}`);
    
    // Broadcast scenario end
    this.broadcastEvent(simulationId, {
      type: 'scenario_ended',
      timestamp: Date.now(),
      data: {
        scenarioId: activeScenario.scenario.id,
        scenarioName: activeScenario.scenario.name
      }
    });
    
    // Clear cache
    this.clearCache(simulationId);
  }
  
  getActiveScenario(simulationId: string): ActiveScenario | null {
    return this.activeScenarios.get(simulationId) || null;
  }
  
  getCurrentPhase(simulationId: string): ScenarioPhase | null {
    const activeScenario = this.activeScenarios.get(simulationId);
    if (!activeScenario || !activeScenario.isActive) return null;
    
    return activeScenario.scenario.phases[activeScenario.currentPhaseIndex] || null;
  }
  
  applyScenario(simulation: SimulationState, scenarioType: string): void {
    const extendedSim = simulation as ExtendedSimulationState;
    this.startScenario(extendedSim.id, scenarioType);
  }
  
  applyScenarioPhase(simulation: SimulationState, phase: ScenarioPhase, progress: number): void {
    const extendedSim = simulation as ExtendedSimulationState;
    
    // Apply phase effects to market conditions
    const baseVolatility = extendedSim.marketConditions.volatility;
    const baseVolume = extendedSim.marketConditions.volume;
    
    // Modify volatility based on phase
    extendedSim.marketConditions.volatility = baseVolatility * (1 + phase.priceAction.volatility * 0.1);
    
    // Modify volume based on phase
    extendedSim.marketConditions.volume = baseVolume * phase.volumeMultiplier;
    
    // Set market trend based on phase
    extendedSim.marketConditions.trend = this.mapConditionToTrend(phase.marketCondition);
    
    // Store active scenario info
    (extendedSim as any).activeScenario = {
      phase,
      progress,
      priceAction: phase.priceAction
    };
  }
  
  private mapConditionToTrend(condition: string): 'bullish' | 'bearish' | 'sideways' {
    switch (condition) {
      case 'bullish':
      case 'building':
        return 'bullish';
      case 'bearish':
      case 'crash':
        return 'bearish';
      default:
        return 'sideways';
    }
  }
  
  updateScenarioProgress(simulation: SimulationState): void {
    const extendedSim = simulation as ExtendedSimulationState;
    const activeScenario = this.getActiveScenario(extendedSim.id);
    
    if (activeScenario && activeScenario.isActive) {
      const currentPhase = this.getCurrentPhase(extendedSim.id);
      if (currentPhase) {
        this.applyScenarioPhase(simulation, currentPhase, activeScenario.progress);
      }
    }
  }
  
  clearScenarioEffects(simulation: SimulationState): void {
    const extendedSim = simulation as ExtendedSimulationState;
    this.endScenario(extendedSim.id);
    
    // Reset market conditions to baseline
    const baseVolatility = 0.02; // 2% base volatility
    extendedSim.marketConditions.volatility = baseVolatility;
    extendedSim.marketConditions.trend = 'sideways';
    
    // Clear active scenario data
    delete (extendedSim as any).activeScenario;
  }
  
  getAllScenarios(): MarketScenario[] {
    return [...this.scenarioLibrary];
  }
  
  getScenarioById(id: string): MarketScenario | null {
    return this.scenarioLibrary.find(s => s.id === id) || null;
  }
  
  cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.activeScenarios.clear();
    console.log('🧹 ScenarioEngine cleanup complete');
  }
}