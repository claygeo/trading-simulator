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
  symbol = 'BTC/USDT',
  interval = '1m', // Changed to 1 minute for better visibility
  priceHistory = [],
  currentPrice: propCurrentPrice,
  trades = [],
  scenarioData = null
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const candlesRef = useRef<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [displayPrice, setDisplayPrice] = useState<number>(20000 + Math.random() * 60000);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
  const [scenarioActive, setScenarioActive] = useState<boolean>(true);
  
  // Price interpolation state
  const priceStateRef = useRef({
    currentPrice: 20000 + Math.random() * 60000,
    targetPrice: 20000 + Math.random() * 60000,
    lastUpdateTime: Date.now(),
    interpolationStartPrice: 20000 + Math.random() * 60000,
    interpolationStartTime: Date.now()
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

  // Smooth interpolation function
  const interpolatePrice = useCallback((startPrice: number, targetPrice: number, progress: number): number => {
    // Use easing function for smooth movement
    const easeInOutQuad = (t: number): number => {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    };
    
    const easedProgress = easeInOutQuad(Math.min(progress, 1));
    return startPrice + (targetPrice - startPrice) * easedProgress;
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

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
        secondsVisible: true,
        rightOffset: 2,
        barSpacing: 12,
        minBarSpacing: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: true,
        borderColor: '#2B2B43',
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
    
    // Generate random starting price between $30,000 and $70,000
    const randomStartPrice = 30000 + Math.random() * 40000;
    let currentPrice = propCurrentPrice || randomStartPrice;
    
    priceStateRef.current = {
      currentPrice,
      targetPrice: currentPrice,
      lastUpdateTime: now,
      interpolationStartPrice: currentPrice,
      interpolationStartTime: now
    };
    setDisplayPrice(currentPrice);
    
    // Generate realistic historical candles
    const candles = [];
    
    // Market state for realistic price generation
    let trend = 0; // -1 to 1
    let momentum = 0;
    let volatility = 0.003; // 0.3% base
    let supportLevel = currentPrice * 0.98;
    let resistanceLevel = currentPrice * 1.02;
    
    // Pattern state
    let patternType = 'ranging'; // 'trending_up', 'trending_down', 'ranging', 'breakout'
    let patternDuration = 0;
    let consolidationCenter = currentPrice;
    
    for (let i = 0; i < candleCount; i++) {
      const time = Math.floor((now - (candleCount - i) * intervalMs) / 1000);
      
      // Decide on pattern changes
      patternDuration++;
      if (patternDuration > 15 + Math.random() * 20) { // 15-35 candles per pattern
        patternDuration = 0;
        const rand = Math.random();
        if (rand < 0.3) {
          patternType = 'trending_up';
          resistanceLevel = currentPrice * (1.05 + Math.random() * 0.05);
        } else if (rand < 0.6) {
          patternType = 'trending_down';
          supportLevel = currentPrice * (0.90 + Math.random() * 0.05);
        } else if (rand < 0.8) {
          patternType = 'ranging';
          consolidationCenter = currentPrice;
          supportLevel = currentPrice * 0.98;
          resistanceLevel = currentPrice * 1.02;
        } else {
          patternType = 'breakout';
        }
      }
      
      // Generate price based on pattern
      const open = currentPrice;
      let close = open;
      
      switch (patternType) {
        case 'trending_up':
          // Gradual move up with pullbacks
          momentum = momentum * 0.8 + 0.2;
          trend = trend * 0.9 + 0.1;
          close = open * (1 + (trend * 0.003 + (Math.random() - 0.3) * volatility));
          
          // Occasional pullback
          if (Math.random() < 0.3) {
            close = open * (1 - Math.random() * volatility * 0.5);
          }
          break;
          
        case 'trending_down':
          // Gradual move down with bounces
          momentum = momentum * 0.8 - 0.2;
          trend = trend * 0.9 - 0.1;
          close = open * (1 + (trend * 0.003 + (Math.random() - 0.7) * volatility));
          
          // Occasional bounce
          if (Math.random() < 0.3) {
            close = open * (1 + Math.random() * volatility * 0.5);
          }
          break;
          
        case 'ranging':
          // Oscillate around center
          const distanceFromCenter = (open - consolidationCenter) / consolidationCenter;
          const pullToCenter = -distanceFromCenter * 0.1;
          trend = trend * 0.8 + pullToCenter;
          close = open * (1 + trend * volatility + (Math.random() - 0.5) * volatility * 0.5);
          break;
          
        case 'breakout':
          // Sudden move with increased volatility
          const breakoutDirection = Math.random() > 0.5 ? 1 : -1;
          volatility = 0.008; // Increase volatility
          close = open * (1 + breakoutDirection * (0.005 + Math.random() * 0.005));
          patternType = breakoutDirection > 0 ? 'trending_up' : 'trending_down';
          break;
      }
      
      // Respect support and resistance
      if (close > resistanceLevel && Math.random() < 0.7) {
        close = resistanceLevel * (0.998 + Math.random() * 0.002);
      }
      if (close < supportLevel && Math.random() < 0.7) {
        close = supportLevel * (1 + Math.random() * 0.002);
      }
      
      // Generate realistic wicks
      let high, low;
      const wickSize = volatility * (0.5 + Math.random());
      
      if (close > open) {
        // Bullish candle
        high = Math.max(open, close) * (1 + wickSize * (0.3 + Math.random() * 0.7));
        low = Math.min(open, close) * (1 - wickSize * (0.1 + Math.random() * 0.3));
      } else {
        // Bearish candle
        high = Math.max(open, close) * (1 + wickSize * (0.1 + Math.random() * 0.3));
        low = Math.min(open, close) * (1 - wickSize * (0.3 + Math.random() * 0.7));
      }
      
      // Ensure price doesn't go negative
      low = Math.max(low, open * 0.9);
      
      candles.push({
        time: time as Time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2))
      });
      
      currentPrice = close;
      
      // Update support/resistance occasionally
      if (i % 10 === 0) {
        const recentPrices = candles.slice(-20).map(c => c.close);
        if (recentPrices.length > 0) {
          const maxPrice = Math.max(...recentPrices);
          const minPrice = Math.min(...recentPrices);
          resistanceLevel = maxPrice * 1.01;
          supportLevel = minPrice * 0.99;
        }
      }
      
      // Decay volatility back to normal
      volatility = Math.max(0.003, volatility * 0.98);
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

    // Set initial visible range to show last 50 candles
    const visibleCandles = 50;
    if (candles.length > visibleCandles) {
      const firstVisibleCandle = candles[candles.length - visibleCandles];
      const lastVisibleCandle = candles[candles.length - 1];
      chart.timeScale().setVisibleRange({
        from: firstVisibleCandle.time,
        to: lastVisibleCandle.time
      });
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
  }, [getIntervalMs, interval]);

  // Handle price updates from props
  useEffect(() => {
    if (propCurrentPrice && propCurrentPrice !== priceStateRef.current.targetPrice) {
      // Set new target price and reset interpolation
      priceStateRef.current = {
        ...priceStateRef.current,
        targetPrice: propCurrentPrice,
        interpolationStartPrice: priceStateRef.current.currentPrice,
        interpolationStartTime: Date.now()
      };
    }
  }, [propCurrentPrice]);

  // Real-time price updates with smooth interpolation
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || isLoading) return;

    const intervalMs = getIntervalMs(interval);
    let lastCandleTime = candlesRef.current[candlesRef.current.length - 1]?.time || 0;
    let currentCandleStartTime = lastCandleTime * 1000; // Convert back to milliseconds

    // Update loop - runs frequently for smooth price movement
    const updateInterval = setInterval(() => {
      const now = Date.now();
      const currentCandleTime = Math.floor(now / intervalMs) * intervalMs / 1000;
      
      // Interpolate price smoothly
      const timeSinceUpdate = now - priceStateRef.current.interpolationStartTime;
      const interpolationDuration = 3000; // 3 seconds to reach target
      const progress = timeSinceUpdate / interpolationDuration;
      
      const interpolatedPrice = interpolatePrice(
        priceStateRef.current.interpolationStartPrice,
        priceStateRef.current.targetPrice,
        progress
      );
      
      priceStateRef.current.currentPrice = interpolatedPrice;
      
      // Add small random movements for realism (±0.01%)
      const microMovement = interpolatedPrice * (0.0001 * (Math.random() - 0.5));
      const currentPrice = interpolatedPrice + microMovement;
      
      // Check if we need a new candle
      if (currentCandleTime > lastCandleTime) {
        // Get the last completed candle
        const lastCandle = candlesRef.current[candlesRef.current.length - 1];
        
        // Create new candle
        const newCandle = {
          time: currentCandleTime as Time,
          open: parseFloat(lastCandle.close.toFixed(2)),
          high: parseFloat(currentPrice.toFixed(2)),
          low: parseFloat(currentPrice.toFixed(2)),
          close: parseFloat(currentPrice.toFixed(2))
        };
        
        candlesRef.current.push(newCandle);
        
        // Keep last 150 candles
        if (candlesRef.current.length > 150) {
          candlesRef.current.shift();
        }
        
        // Update the entire dataset
        seriesRef.current.setData(candlesRef.current);
        
        // Update tracking variables
        lastCandleTime = currentCandleTime;
        currentCandleStartTime = currentCandleTime * 1000;
        
        // Auto-scroll to show latest candles with some history
        if (chartRef.current) {
          const visibleLogicalRange = chartRef.current.timeScale().getVisibleLogicalRange();
          if (visibleLogicalRange) {
            const barsToShow = 50; // Number of candles to keep visible
            const endIndex = candlesRef.current.length - 1;
            const startIndex = Math.max(0, endIndex - barsToShow + 1);
            
            chartRef.current.timeScale().setVisibleLogicalRange({
              from: startIndex,
              to: endIndex + 1 // Add 1 to show some empty space on the right
            });
          }
        }
      } else {
        // Update current candle (the last one in the array)
        const currentCandleIndex = candlesRef.current.length - 1;
        const currentCandle = candlesRef.current[currentCandleIndex];
        
        if (currentCandle) {
          // Update the candle with new price data
          const updatedCandle = {
            ...currentCandle,
            close: parseFloat(currentPrice.toFixed(2)),
            high: parseFloat(Math.max(currentCandle.high, currentPrice).toFixed(2)),
            low: parseFloat(Math.min(currentCandle.low, currentPrice).toFixed(2))
          };
          
          // Update in our data array
          candlesRef.current[currentCandleIndex] = updatedCandle;
          
          // Update just this candle on the chart
          seriesRef.current.update(updatedCandle);
        }
      }
      
      // Update display
      setDisplayPrice(currentPrice);
      
      const firstCandle = candlesRef.current[0];
      if (firstCandle) {
        const change = currentPrice - firstCandle.open;
        setPriceChange(change);
        setPriceChangePercent((change / firstCandle.open) * 100);
      }
    }, 100); // Update every 100ms for smooth movement

    return () => clearInterval(updateInterval);
  }, [getIntervalMs, interval, isLoading, interpolatePrice]);

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