import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, Time } from 'lightweight-charts';
import { PricePoint, Trade } from '../types';

interface PriceChartProps {
  symbol?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  priceHistory?: PricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: any; // Scenario phase data for enhanced price generation
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  symbol = 'BTC/USDT',
  interval = '1h', // Changed from 15m to 1h for better visual representation
  priceHistory = [],
  currentPrice: propCurrentPrice,
  trades = [],
  scenarioData = null
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const dataRef = useRef<any[]>([]);
  const lastTimeRef = useRef<number>(0);
  const scenarioBasePrice = useRef<number>(0);
  const scenarioStartTime = useRef<number>(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [displayPrice, setDisplayPrice] = useState<number>(propCurrentPrice || 125);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  // Simple interval to seconds conversion
  const getIntervalSeconds = (interval: string): number => {
    const map: { [key: string]: number } = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400
    };
    return map[interval] || 900; // Default to 15 minutes
  };

  // Enhanced price generation based on scenario phase
  const generateScenarioPrice = (basePrice: number, phase: any, progress: number): number => {
    if (!phase) {
      // Default realistic random walk with tendency to consolidate
      const consolidationChance = Math.random();
      
      if (consolidationChance < 0.6) {
        // 60% chance of sideways movement
        const change = (Math.random() - 0.5) * 0.0005 * basePrice;
        return basePrice + change;
      } else if (consolidationChance < 0.8) {
        // 20% chance of small trend
        const direction = Math.random() > 0.5 ? 1 : -1;
        const change = direction * (0.0005 + Math.random() * 0.0005) * basePrice;
        return basePrice + change;
      } else {
        // 20% chance of larger move
        const direction = Math.random() > 0.5 ? 1 : -1;
        const change = direction * (0.001 + Math.random() * 0.001) * basePrice;
        return basePrice + change;
      }
    }

    const { priceAction } = phase;
    let priceChange = 0;
    
    // Base random component for all movements
    const randomness = (Math.random() - 0.5) * 0.0003 * basePrice;
    
    switch (priceAction.type) {
      case 'trend':
        // Steady movement with pauses
        const trendStrength = priceAction.intensity * 0.0005;
        const direction = priceAction.direction === 'up' ? 1 : priceAction.direction === 'down' ? -1 : 0;
        const pauseChance = Math.random();
        if (pauseChance < 0.3) {
          // 30% chance of pause in trend
          priceChange = randomness * 2;
        } else {
          priceChange = direction * trendStrength * basePrice + randomness;
        }
        break;
        
      case 'consolidation':
        // Range-bound movement
        const range = priceAction.intensity * 0.0003 * basePrice;
        priceChange = (Math.random() - 0.5) * range;
        break;
        
      case 'breakout':
        // Sharp move with follow-through
        const breakoutStrength = priceAction.intensity * 0.0015;
        const breakoutDirection = priceAction.direction === 'up' ? 1 : -1;
        const followThrough = progress < 0.3 ? 1.2 : 0.6; // Strong at start, weaker later
        priceChange = breakoutDirection * breakoutStrength * basePrice * followThrough + randomness;
        break;
        
      case 'crash':
        // Cascading downward movement
        const crashStrength = priceAction.intensity * 0.002;
        const panic = progress < 0.5 ? 1.2 : 0.5; // Panic selling early, then stabilization
        priceChange = -crashStrength * basePrice * panic + randomness;
        break;
        
      case 'pump':
        // FOMO-driven upward movement
        const pumpStrength = priceAction.intensity * 0.0015;
        const fomo = progress < 0.4 ? 1.2 : 0.4; // Strong FOMO early, then exhaustion
        priceChange = pumpStrength * basePrice * fomo + randomness;
        break;
        
      case 'accumulation':
        // Quiet buying with occasional pops
        const accumStrength = priceAction.intensity * 0.0004;
        const accumDirection = priceAction.direction === 'up' ? 1 : -1;
        const pop = Math.random() < 0.05 ? 1.5 : 1; // 5% chance of a pop
        priceChange = accumDirection * accumStrength * basePrice * pop + randomness;
        break;
        
      case 'distribution':
        // Quiet selling with occasional dumps
        const distStrength = priceAction.intensity * 0.0005;
        const dump = Math.random() < 0.05 ? 1.5 : 1; // 5% chance of a dump
        priceChange = -distStrength * basePrice * dump + randomness;
        break;
        
      default:
        priceChange = randomness * 2;
    }
    
    // Add volatility component
    const volatility = priceAction.volatility * 0.0002 * basePrice;
    const volatilityComponent = (Math.random() - 0.5) * volatility;
    
    return basePrice + priceChange + volatilityComponent;
  };

  // Initialize chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart with enhanced settings
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.3)' },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,    // Reduced from 0.3 to 0.1 for tighter view
          bottom: 0.1, // Reduced from 0.25 to 0.1
        },
        autoScale: true, // Enable auto-scaling
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12, // Increased from 5 to 12 for more space on the right
        barSpacing: 12,  // Increased from 6 to 12 for wider candles
        minBarSpacing: 8, // Minimum bar spacing
      },
      crosshair: {
        mode: 0, // Normal crosshair
        vertLine: {
          width: 1,
          color: 'rgba(224, 227, 235, 0.5)',
          style: 0,
        },
        horzLine: {
          width: 1,
          color: 'rgba(224, 227, 235, 0.5)',
          style: 0,
        },
      },
    });

    // Add candlestick series with enhanced styling
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Generate enhanced initial data with fewer, more realistic candles
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const candleCount = 72; // 72 hours of 1h candles = 3 days
    const startTime = now - (intervalSec * candleCount);
    
    let currentPrice = propCurrentPrice || 125;
    scenarioBasePrice.current = currentPrice;
    const initialData = [];
    
    // Create realistic price movements without patterns
    let trendDirection = 0; // Start neutral (0 = sideways, 1 = up, -1 = down)
    let trendStrength = 0;
    let consolidationCounter = 0;
    let trendCounter = 0;
    let lastPriceLevel = currentPrice;
    
    for (let i = 0; i < candleCount; i++) {
      const time = startTime + (i * intervalSec);
      
      // Implement more realistic market phases
      let priceChange = 0;
      
      // Determine market phase
      if (consolidationCounter > 0) {
        // Sideways/consolidation phase
        consolidationCounter--;
        trendDirection = 0;
        
        // Price oscillates around a level
        const meanReversion = (lastPriceLevel - currentPrice) * 0.1;
        const noise = (Math.random() - 0.5) * 0.001 * currentPrice;
        priceChange = meanReversion + noise;
        
      } else if (trendCounter > 0) {
        // Trending phase
        trendCounter--;
        
        // Trend with some noise
        const trendMove = trendDirection * trendStrength * currentPrice;
        const noise = (Math.random() - 0.5) * 0.001 * currentPrice;
        priceChange = trendMove + noise;
        
        // Occasionally pause the trend (20% chance)
        if (Math.random() < 0.2) {
          priceChange = noise; // Just noise, no trend
        }
        
      } else {
        // Decide on next phase
        const phaseRoll = Math.random();
        
        if (phaseRoll < 0.5) {
          // Start consolidation (50% chance)
          consolidationCounter = 5 + Math.floor(Math.random() * 10); // 5-15 candles
          lastPriceLevel = currentPrice;
          trendDirection = 0;
          
        } else if (phaseRoll < 0.75) {
          // Start uptrend (25% chance)
          trendCounter = 3 + Math.floor(Math.random() * 7); // 3-10 candles
          trendDirection = 1;
          trendStrength = 0.0005 + Math.random() * 0.0015; // 0.05% - 0.2% per candle
          
        } else {
          // Start downtrend (25% chance)
          trendCounter = 3 + Math.floor(Math.random() * 7); // 3-10 candles
          trendDirection = -1;
          trendStrength = 0.0005 + Math.random() * 0.0015; // 0.05% - 0.2% per candle
        }
        
        // This candle is transition, small random move
        priceChange = (Math.random() - 0.5) * 0.0005 * currentPrice;
      }
      
      // Add occasional volatility spikes (3% chance)
      if (Math.random() < 0.03) {
        const spikeDirection = Math.random() > 0.5 ? 1 : -1;
        priceChange += spikeDirection * (0.002 + Math.random() * 0.003) * currentPrice;
      }
      
      // Prevent price from going negative
      const open = currentPrice;
      const close = Math.max(currentPrice + priceChange, 0.01);
      
      // Realistic candle body and wick generation
      const bodySize = Math.abs(close - open);
      
      // Calculate wicks based on volatility
      const volatility = Math.abs(priceChange) / currentPrice;
      
      // Normal wicks (20-80% of body size)
      let upperWickRatio = 0.2 + Math.random() * 0.6;
      let lowerWickRatio = 0.2 + Math.random() * 0.6;
      
      // During consolidation, create more doji-like candles
      if (consolidationCounter > 0 && Math.random() < 0.3) {
        upperWickRatio = 1 + Math.random() * 2; // Larger wicks
        lowerWickRatio = 1 + Math.random() * 2;
      }
      
      // Sometimes create long wicks (5% chance)
      if (Math.random() < 0.05) {
        if (Math.random() > 0.5) {
          upperWickRatio = 2 + Math.random() * 2; // Very long upper wick
        } else {
          lowerWickRatio = 2 + Math.random() * 2; // Very long lower wick
        }
      }
      
      const upperWick = Math.max(bodySize * upperWickRatio, currentPrice * 0.0001);
      const lowerWick = Math.max(bodySize * lowerWickRatio, currentPrice * 0.0001);
      
      const high = Math.max(open, close) + upperWick;
      const low = Math.min(open, close) - lowerWick;
      
      initialData.push({
        time: time as Time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(Math.max(low, 0.01).toFixed(2)),
        close: parseFloat(close.toFixed(2))
      });
      
      currentPrice = close;
    }
    
    // Set the data
    candlestickSeries.setData(initialData);
    dataRef.current = initialData;
    lastTimeRef.current = now;
    scenarioBasePrice.current = currentPrice;
    
    // Store initial price for change calculation
    if (initialData.length > 0) {
      const firstPrice = initialData[0].open;
      const lastPrice = initialData[initialData.length - 1].close;
      setPriceChange(lastPrice - firstPrice);
      setPriceChangePercent(((lastPrice - firstPrice) / firstPrice) * 100);
      setDisplayPrice(lastPrice);
    }

    setIsLoading(false);

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []); // Only run once on mount

  // Handle scenario changes
  useEffect(() => {
    if (scenarioData && scenarioData.phase && scenarioData.progress === 0) {
      // New scenario phase started, set base price
      scenarioBasePrice.current = displayPrice;
      scenarioStartTime.current = Date.now();
    }
  }, [scenarioData, displayPrice]);

  // Enhanced price updates with scenario integration
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const currentCandleTime = Math.floor(now / intervalSec) * intervalSec;
    
    // Get the last candle
    const lastCandle = dataRef.current[dataRef.current.length - 1];
    if (!lastCandle) return;
    
    // Generate new price based on scenario or use provided price
    let newPrice = propCurrentPrice;
    if (!newPrice && scenarioData) {
      newPrice = generateScenarioPrice(displayPrice, scenarioData.phase, scenarioData.progress);
    } else if (!newPrice) {
      newPrice = generateScenarioPrice(displayPrice, null, 0);
    }
    
    // Check if we need a new candle
    if (currentCandleTime > lastCandle.time) {
      // Create new candle
      const wickSize = Math.abs(newPrice - lastCandle.close) * 0.1;
      const newCandle = {
        time: currentCandleTime as Time,
        open: parseFloat(lastCandle.close.toFixed(2)),
        high: parseFloat((Math.max(lastCandle.close, newPrice) + wickSize * Math.random()).toFixed(2)),
        low: parseFloat((Math.max(Math.min(lastCandle.close, newPrice) - wickSize * Math.random(), 0.01)).toFixed(2)),
        close: parseFloat(newPrice.toFixed(2))
      };
      
      // Add to our data
      dataRef.current.push(newCandle);
      
      // Keep only last 96 candles for better performance (4 days of 1h candles)
      if (dataRef.current.length > 96) {
        dataRef.current = dataRef.current.slice(-72);
      }
      
      // Update the whole dataset
      seriesRef.current.setData(dataRef.current);
      
      // Auto scroll to the right
      chartRef.current.timeScale().scrollToRealTime();
    } else {
      // Update current candle with more dynamic price action
      const volatilityFactor = scenarioData ? 
        (scenarioData.phase.priceAction.volatility || 1) : 1;
      
      const wickSize = Math.abs(newPrice - lastCandle.open) * 0.15 * volatilityFactor;
      const updatedCandle = {
        ...lastCandle,
        high: parseFloat(Math.max(lastCandle.high, newPrice + wickSize * Math.random()).toFixed(2)),
        low: parseFloat(Math.max(Math.min(lastCandle.low, newPrice - wickSize * Math.random()), 0.01).toFixed(2)),
        close: parseFloat(newPrice.toFixed(2))
      };
      
      // Update the last candle
      dataRef.current[dataRef.current.length - 1] = updatedCandle;
      seriesRef.current.update(updatedCandle);
    }
    
    // Update display values
    setDisplayPrice(newPrice);
    
    // Calculate change from first candle
    if (dataRef.current.length > 0) {
      const firstPrice = dataRef.current[0].open;
      const change = newPrice - firstPrice;
      setPriceChange(change);
      setPriceChangePercent((change / firstPrice) * 100);
    }
    
  }, [propCurrentPrice, interval, scenarioData, displayPrice]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white">{symbol}</h2>
            {scenarioData && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-purple-400">
                  {scenarioData.phase.name}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-white">
              ${displayPrice.toFixed(2)}
            </span>
            <span className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {/* Market condition indicator */}
          {scenarioData && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400">Phase:</span>
              <div className="w-16 bg-gray-700 rounded-full h-1">
                <div 
                  className="bg-purple-500 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${(scenarioData.progress || 0) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">Interval:</span>
            <span className="text-sm text-white font-medium">{interval}</span>
          </div>
        </div>
      </div>

      {/* Chart with scenario indicators */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="text-white">Loading enhanced chart...</div>
          </div>
        )}
        <div 
          ref={chartContainerRef} 
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />
        
        {/* Scenario overlay information */}
        {scenarioData && (
          <div className="absolute top-4 left-4 bg-gray-800 bg-opacity-90 p-2 rounded text-xs text-white">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="font-semibold">Market Scenario Active</span>
            </div>
            <div className="text-gray-300">
              Phase: {scenarioData.phase.name}
            </div>
            <div className="text-gray-300">
              Type: {scenarioData.phase.priceAction.type}
            </div>
            <div className="text-gray-300">
              Volume: {(scenarioData.phase.volumeMultiplier * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceChart;