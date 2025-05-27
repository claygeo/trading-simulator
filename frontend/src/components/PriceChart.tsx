import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, Time } from 'lightweight-charts';

interface PricePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Trade {
  id: string;
  timestamp: number;
  price: number;
  quantity: number;
  action: 'buy' | 'sell';
  trader: any;
  value: number;
  impact: number;
}

interface PriceChartProps {
  symbol?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  priceHistory?: PricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: any;
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  symbol = 'XBT/USD',
  interval = '1h',
  priceHistory = [],
  currentPrice: propCurrentPrice,
  trades = [],
  scenarioData = null
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const candlesRef = useRef<any[]>([]);
  const isInitializedRef = useRef<boolean>(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [displayPrice, setDisplayPrice] = useState<number>(50000);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
  const [scenarioActive, setScenarioActive] = useState<boolean>(true);
  
  // Price generation state - simple and clean
  const priceStateRef = useRef({
    currentPrice: 50000,
    trend: 0, // -1 to 1
    volatility: 0.001, // 0.1% base volatility - reduced for smoother movement
    momentum: 0,
    lastUpdateTime: Date.now()
  });

  // Get interval in milliseconds
  const getIntervalMs = useCallback((interval: string): number => {
    const map: { [key: string]: number } = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000
    };
    return map[interval] || 3600000;
  }, []);

  // Generate realistic price movement
  const generateNextPrice = useCallback((currentPrice: number): number => {
    const state = priceStateRef.current;
    
    // Smaller, more realistic movements
    const randomWalk = (Math.random() - 0.5) * 2;
    
    // Trend component with strong mean reversion for stability
    state.trend = state.trend * 0.95 + randomWalk * 0.05;
    
    // Momentum (smooths price movement even more)
    state.momentum = state.momentum * 0.98 + state.trend * 0.02;
    
    // Calculate price change - smaller base volatility
    let priceChangePercent = state.momentum * state.volatility * 0.5; // Reduced by 50%
    
    // Apply scenario influence if active (also reduced)
    if (scenarioActive && scenarioData && scenarioData.phase) {
      const phase = scenarioData.phase;
      const scenarioInfluence = phase.priceAction.intensity * 0.0005; // Reduced from 0.001
      
      switch (phase.priceAction.type) {
        case 'trend':
          priceChangePercent += scenarioInfluence * (phase.priceAction.direction === 'up' ? 1 : -1);
          break;
        case 'breakout':
          priceChangePercent += scenarioInfluence * 1.2 * (phase.priceAction.direction === 'up' ? 1 : -1);
          state.volatility = Math.min(0.003, state.volatility * 1.1); // Reduced max volatility
          break;
        case 'crash':
          priceChangePercent -= scenarioInfluence * 1.5;
          state.volatility = Math.min(0.004, state.volatility * 1.2);
          break;
        case 'pump':
          priceChangePercent += scenarioInfluence * 1.3;
          state.volatility = Math.min(0.0035, state.volatility * 1.15);
          break;
        case 'consolidation':
          state.volatility = Math.max(0.0005, state.volatility * 0.95); // Lower minimum
          break;
      }
    }
    
    // Natural volatility decay
    state.volatility = Math.max(0.001, state.volatility * 0.998); // Slower decay, lower minimum
    
    // Apply price change
    const newPrice = currentPrice * (1 + priceChangePercent);
    state.currentPrice = newPrice;
    
    return newPrice;
  }, [scenarioActive, scenarioData]);

  // Initialize chart only once
  useEffect(() => {
    if (!chartContainerRef.current || isInitializedRef.current) return;
    
    isInitializedRef.current = true;

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
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 12,
        minBarSpacing: 8,
      },
      crosshair: {
        mode: 0,
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

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Generate initial candles
    const intervalMs = getIntervalMs(interval);
    const now = Date.now();
    const candleCount = 100;
    
    // Initialize price
    let currentPrice = propCurrentPrice || 50000;
    priceStateRef.current.currentPrice = currentPrice;
    setDisplayPrice(currentPrice);
    
    // Generate historical candles
    const candles = [];
    for (let i = 0; i < candleCount; i++) {
      const time = Math.floor((now - (candleCount - i) * intervalMs) / 1000);
      
      // Generate OHLC for this candle
      const open = currentPrice;
      
      // Generate intra-candle price movements
      const intraCandlePrices = [open];
      for (let j = 0; j < 20; j++) {
        const nextPrice = generateNextPrice(intraCandlePrices[intraCandlePrices.length - 1]);
        intraCandlePrices.push(nextPrice);
      }
      
      const close = intraCandlePrices[intraCandlePrices.length - 1];
      const high = Math.max(...intraCandlePrices);
      const low = Math.min(...intraCandlePrices);
      
      candles.push({
        time: time as Time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2))
      });
      
      currentPrice = close;
    }
    
    candlesRef.current = candles;
    candlestickSeries.setData(candles);
    
    // Calculate initial price change
    if (candles.length > 0) {
      const firstPrice = candles[0].open;
      const lastPrice = candles[candles.length - 1].close;
      setPriceChange(lastPrice - firstPrice);
      setPriceChangePercent(((lastPrice - firstPrice) / firstPrice) * 100);
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
      if (chart && chartRef.current) {
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, []); // Empty dependencies - only run once

  // Real-time price updates
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || isLoading) return;

    const intervalMs = getIntervalMs(interval);
    
    // Track last candle time to detect new candle creation
    let lastCandleTime = candlesRef.current[candlesRef.current.length - 1]?.time || 0;
    let lastPropPrice = propCurrentPrice || 0;

    // Price update loop - smooth updates
    const priceUpdateInterval = setInterval(() => {
      const now = Date.now();
      const currentCandleTime = Math.floor(now / intervalMs) * intervalMs / 1000;
      
      // Get the current candle (always the last one in our array)
      const currentCandleIndex = candlesRef.current.length - 1;
      const currentCandle = candlesRef.current[currentCandleIndex];
      
      if (!currentCandle) return;
      
      // Generate price based on internal state, not prop
      const newPrice = generateNextPrice(priceStateRef.current.currentPrice);
      
      // Only use prop price if it's significantly different (WebSocket update)
      if (propCurrentPrice && Math.abs(propCurrentPrice - lastPropPrice) > 0.01) {
        // Blend the WebSocket price with our generated price for smoothness
        const blendedPrice = newPrice * 0.7 + propCurrentPrice * 0.3;
        priceStateRef.current.currentPrice = blendedPrice;
        lastPropPrice = propCurrentPrice;
      }
      
      if (currentCandleTime > lastCandleTime) {
        // Time for a new candle
        const newCandle = {
          time: currentCandleTime as Time,
          open: parseFloat(currentCandle.close.toFixed(2)),
          high: parseFloat(priceStateRef.current.currentPrice.toFixed(2)),
          low: parseFloat(priceStateRef.current.currentPrice.toFixed(2)),
          close: parseFloat(priceStateRef.current.currentPrice.toFixed(2))
        };
        
        candlesRef.current.push(newCandle);
        
        // Keep last 150 candles
        if (candlesRef.current.length > 150) {
          candlesRef.current.shift();
        }
        
        // Use setData only when adding new candle
        seriesRef.current.setData(candlesRef.current);
        lastCandleTime = currentCandleTime;
        
        // Scroll to latest
        if (chartRef.current) {
          chartRef.current.timeScale().scrollToRealTime();
        }
      } else {
        // Update only the current candle - no setData!
        const updatedCandle = {
          ...currentCandle,
          close: parseFloat(priceStateRef.current.currentPrice.toFixed(2)),
          high: parseFloat(Math.max(currentCandle.high, priceStateRef.current.currentPrice).toFixed(2)),
          low: parseFloat(Math.min(currentCandle.low, priceStateRef.current.currentPrice).toFixed(2))
        };
        
        // Update our reference
        candlesRef.current[currentCandleIndex] = updatedCandle;
        
        // Use update() method for smooth updates
        seriesRef.current.update(updatedCandle);
      }
      
      // Update display values smoothly
      setDisplayPrice(priceStateRef.current.currentPrice);
      
      const firstCandle = candlesRef.current[0];
      if (firstCandle) {
        const change = priceStateRef.current.currentPrice - firstCandle.open;
        setPriceChange(change);
        setPriceChangePercent((change / firstCandle.open) * 100);
      }
    }, 1000); // Update every second for smooth movement

    return () => clearInterval(priceUpdateInterval);
  }, [generateNextPrice, getIntervalMs, interval, isLoading]); // Removed propCurrentPrice from dependencies

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white">{symbol}</h2>
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
          {/* Scenario toggle */}
          {scenarioData && (
            <button
              onClick={() => setScenarioActive(!scenarioActive)}
              className={`flex items-center space-x-2 px-3 py-1 rounded text-xs transition ${
                scenarioActive 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${scenarioActive ? 'bg-white animate-pulse' : 'bg-gray-400'}`}></div>
              <span>Scenario: {scenarioData.phase?.name || 'None'}</span>
            </button>
          )}
          
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">Interval:</span>
            <span className="text-sm text-white font-medium">{interval}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="text-white">Loading chart...</div>
          </div>
        )}
        <div 
          ref={chartContainerRef} 
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />
        
        {/* Scenario info overlay */}
        {scenarioData && scenarioActive && (
          <div className="absolute top-4 left-4 bg-purple-800 bg-opacity-90 p-2 rounded text-xs text-white">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              <span className="font-semibold">Scenario Active</span>
            </div>
            <div className="text-purple-200">
              Phase: {scenarioData.phase.name}
            </div>
            <div className="text-purple-200">
              Impact: {scenarioData.phase.priceAction.type}
            </div>
            <div className="w-full bg-purple-700 rounded-full h-1 mt-1">
              <div 
                className="bg-purple-400 h-1 rounded-full transition-all duration-300"
                style={{ width: `${(scenarioData.progress || 0) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceChart;