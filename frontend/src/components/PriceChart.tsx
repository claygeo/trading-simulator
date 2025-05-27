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
  interval = '15m',
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
      // Default random walk when no scenario
      return basePrice + (Math.random() - 0.5) * 0.002 * basePrice;
    }

    const { priceAction } = phase;
    let priceChange = 0;
    
    switch (priceAction.type) {
      case 'trend':
        // Steady directional movement
        const trendStrength = priceAction.intensity * 0.001;
        const direction = priceAction.direction === 'up' ? 1 : priceAction.direction === 'down' ? -1 : 0;
        priceChange = direction * trendStrength * basePrice * (0.5 + Math.random() * 0.5);
        break;
        
      case 'consolidation':
        // Sideways movement with mean reversion
        const consolidationRange = priceAction.intensity * 0.0005;
        priceChange = (Math.random() - 0.5) * consolidationRange * basePrice;
        // Add mean reversion
        if (Math.abs(basePrice - scenarioBasePrice.current) > scenarioBasePrice.current * 0.02) {
          const reversion = (scenarioBasePrice.current - basePrice) * 0.1;
          priceChange += reversion;
        }
        break;
        
      case 'breakout':
        // Sharp directional move with high volatility
        const breakoutStrength = priceAction.intensity * 0.003;
        const breakoutDirection = priceAction.direction === 'up' ? 1 : -1;
        priceChange = breakoutDirection * breakoutStrength * basePrice * (0.8 + Math.random() * 0.4);
        break;
        
      case 'crash':
        // Rapid downward movement
        const crashStrength = priceAction.intensity * 0.004;
        priceChange = -crashStrength * basePrice * (0.7 + Math.random() * 0.6);
        break;
        
      case 'pump':
        // Rapid upward movement
        const pumpStrength = priceAction.intensity * 0.003;
        priceChange = pumpStrength * basePrice * (0.8 + Math.random() * 0.4);
        break;
        
      case 'accumulation':
        // Slow, steady buying pressure
        const accumStrength = priceAction.intensity * 0.0008;
        const accumDirection = priceAction.direction === 'up' ? 1 : priceAction.direction === 'down' ? -1 : 0.5;
        priceChange = accumDirection * accumStrength * basePrice * (0.3 + Math.random() * 0.7);
        break;
        
      case 'distribution':
        // Gradual selling pressure
        const distStrength = priceAction.intensity * 0.001;
        priceChange = -distStrength * basePrice * (0.4 + Math.random() * 0.6);
        break;
        
      default:
        priceChange = (Math.random() - 0.5) * 0.001 * basePrice;
    }
    
    // Add volatility
    const volatility = priceAction.volatility * 0.0003 * basePrice;
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
          top: 0.3,    // 30% margin top
          bottom: 0.25, // 25% margin bottom
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
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

    // Generate enhanced initial data
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (intervalSec * 300); // 300 candles back
    
    let currentPrice = propCurrentPrice || 125;
    scenarioBasePrice.current = currentPrice;
    const initialData = [];
    
    // Create 300 candles of more realistic history
    for (let i = 0; i < 300; i++) {
      const time = startTime + (i * intervalSec);
      
      // More sophisticated price movement
      let priceChange = 0;
      
      // Add some trending periods
      if (i % 50 < 20) {
        // Trending period
        const trendDirection = Math.sin(i / 50) > 0 ? 1 : -1;
        priceChange = trendDirection * 0.001 * currentPrice * (0.5 + Math.random() * 0.5);
      } else if (i % 50 < 40) {
        // Consolidation period
        priceChange = (Math.random() - 0.5) * 0.0005 * currentPrice;
      } else {
        // Breakout period
        const breakoutDirection = Math.random() > 0.5 ? 1 : -1;
        priceChange = breakoutDirection * 0.002 * currentPrice * Math.random();
      }
      
      const open = currentPrice;
      const close = Math.max(currentPrice + priceChange, 0.01); // Prevent negative prices
      
      // Enhanced wick generation
      const range = Math.abs(close - open);
      const wickSize = range * (0.2 + Math.random() * 0.8);
      const high = Math.max(open, close) + wickSize * Math.random();
      const low = Math.min(open, close) - wickSize * Math.random();
      
      initialData.push({
        time: time as Time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(Math.max(low, 0.01).toFixed(2)), // Prevent negative prices
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
      
      // Keep only last 400 candles
      if (dataRef.current.length > 400) {
        dataRef.current = dataRef.current.slice(-350);
      }
      
      // Update the whole dataset
      seriesRef.current.setData(dataRef.current);
      
      // Auto scroll to the right
      chartRef.current.timeScale().scrollToRealTime();
    } else {
      // Update current candle
      const wickSize = Math.abs(newPrice - lastCandle.open) * 0.05;
      const updatedCandle = {
        ...lastCandle,
        high: Math.max(lastCandle.high, newPrice + wickSize * Math.random()),
        low: Math.max(Math.min(lastCandle.low, newPrice - wickSize * Math.random()), 0.01),
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