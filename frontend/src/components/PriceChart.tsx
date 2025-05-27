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

// Market microstructure state
interface MarketState {
  supportLevels: number[];
  resistanceLevels: number[];
  currentTrend: 'up' | 'down' | 'sideways';
  trendStrength: number;
  consolidationRange: { min: number; max: number } | null;
  consolidationDuration: number;
  volatilityRegime: 'low' | 'normal' | 'high';
  lastSignificantMove: number;
  priceMemory: number[]; // Recent prices for pattern detection
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  symbol = 'BTC/USDT',
  interval = '1h',
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
  
  const [isLoading, setIsLoading] = useState(true);
  const [displayPrice, setDisplayPrice] = useState<number>(propCurrentPrice || 125);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
  const [scenarioActive, setScenarioActive] = useState<boolean>(true);
  
  // Market state for realistic price generation
  const marketStateRef = useRef<MarketState>({
    supportLevels: [],
    resistanceLevels: [],
    currentTrend: 'sideways',
    trendStrength: 0,
    consolidationRange: null,
    consolidationDuration: 0,
    volatilityRegime: 'normal',
    lastSignificantMove: 0,
    priceMemory: []
  });

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
    return map[interval] || 3600;
  };

  // Detect support and resistance levels
  const updateSupportResistance = useCallback((prices: number[]) => {
    if (prices.length < 10) return;
    
    const state = marketStateRef.current;
    const recentPrices = prices.slice(-50);
    
    // Find local peaks and troughs
    const levels: number[] = [];
    for (let i = 2; i < recentPrices.length - 2; i++) {
      const price = recentPrices[i];
      const isPeak = price > recentPrices[i-1] && price > recentPrices[i-2] && 
                     price > recentPrices[i+1] && price > recentPrices[i+2];
      const isTrough = price < recentPrices[i-1] && price < recentPrices[i-2] && 
                       price < recentPrices[i+1] && price < recentPrices[i+2];
      
      if (isPeak || isTrough) {
        levels.push(price);
      }
    }
    
    // Cluster nearby levels
    const clustered: number[] = [];
    const sorted = levels.sort((a, b) => a - b);
    
    for (let i = 0; i < sorted.length; i++) {
      if (clustered.length === 0 || 
          Math.abs(sorted[i] - clustered[clustered.length - 1]) / clustered[clustered.length - 1] > 0.005) {
        clustered.push(sorted[i]);
      }
    }
    
    const currentPrice = prices[prices.length - 1];
    state.supportLevels = clustered.filter(level => level < currentPrice).slice(-3);
    state.resistanceLevels = clustered.filter(level => level > currentPrice).slice(0, 3);
  }, []);

  // Detect market regime and patterns
  const analyzeMarketState = useCallback((prices: number[]) => {
    if (prices.length < 5) return;
    
    const state = marketStateRef.current;
    const recentPrices = prices.slice(-20);
    
    // Calculate volatility
    let volatility = 0;
    for (let i = 1; i < recentPrices.length; i++) {
      volatility += Math.abs((recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1]);
    }
    volatility = volatility / (recentPrices.length - 1);
    
    // Update volatility regime
    if (volatility < 0.001) state.volatilityRegime = 'low';
    else if (volatility > 0.003) state.volatilityRegime = 'high';
    else state.volatilityRegime = 'normal';
    
    // Detect trend
    const shortMA = recentPrices.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const longMA = recentPrices.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, recentPrices.length);
    const priceChange = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0];
    
    if (shortMA > longMA * 1.002 && priceChange > 0.01) {
      state.currentTrend = 'up';
      state.trendStrength = Math.min(priceChange * 100, 1);
    } else if (shortMA < longMA * 0.998 && priceChange < -0.01) {
      state.currentTrend = 'down';
      state.trendStrength = Math.min(Math.abs(priceChange) * 100, 1);
    } else {
      state.currentTrend = 'sideways';
      state.trendStrength = 0;
    }
    
    // Detect consolidation
    const range = Math.max(...recentPrices) - Math.min(...recentPrices);
    const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const rangePercent = range / avgPrice;
    
    if (rangePercent < 0.02 && state.currentTrend === 'sideways') {
      if (!state.consolidationRange) {
        state.consolidationRange = {
          min: Math.min(...recentPrices.slice(-10)),
          max: Math.max(...recentPrices.slice(-10))
        };
        state.consolidationDuration = 0;
      }
      state.consolidationDuration++;
    } else {
      state.consolidationRange = null;
      state.consolidationDuration = 0;
    }
    
    // Update price memory
    state.priceMemory = recentPrices.slice(-10);
  }, []);

  // Generate realistic price movement
  const generateRealisticPrice = useCallback((basePrice: number): number => {
    const state = marketStateRef.current;
    const random = Math.random();
    let priceChange = 0;
    
    // Base probabilities for different market behaviors
    let probabilities = {
      noChange: 0.15,        // 15% chance of virtually no change (doji)
      tinyChange: 0.55,      // 55% chance of tiny movement
      smallChange: 0.20,     // 20% chance of small movement
      mediumChange: 0.08,    // 8% chance of medium movement
      largeChange: 0.02      // 2% chance of large movement
    };
    
    // Adjust probabilities based on market state
    if (state.volatilityRegime === 'low') {
      probabilities.noChange = 0.25;
      probabilities.tinyChange = 0.60;
      probabilities.smallChange = 0.12;
      probabilities.mediumChange = 0.025;
      probabilities.largeChange = 0.005;
    } else if (state.volatilityRegime === 'high') {
      probabilities.noChange = 0.05;
      probabilities.tinyChange = 0.40;
      probabilities.smallChange = 0.35;
      probabilities.mediumChange = 0.15;
      probabilities.largeChange = 0.05;
    }
    
    // Support and resistance influence
    let supportResistanceInfluence = 0;
    
    // Check proximity to support levels
    for (const support of state.supportLevels) {
      const distance = (basePrice - support) / support;
      if (distance > 0 && distance < 0.005) { // Within 0.5% of support
        supportResistanceInfluence = 0.3 * (1 - distance / 0.005); // Stronger bounce closer to support
      }
    }
    
    // Check proximity to resistance levels
    for (const resistance of state.resistanceLevels) {
      const distance = (resistance - basePrice) / resistance;
      if (distance > 0 && distance < 0.005) { // Within 0.5% of resistance
        supportResistanceInfluence = -0.3 * (1 - distance / 0.005); // Stronger rejection closer to resistance
      }
    }
    
    // Consolidation range enforcement
    if (state.consolidationRange) {
      const range = state.consolidationRange;
      const rangePosition = (basePrice - range.min) / (range.max - range.min);
      
      // Mean reversion within consolidation
      if (rangePosition > 0.8) {
        supportResistanceInfluence -= 0.2; // Push down from top of range
      } else if (rangePosition < 0.2) {
        supportResistanceInfluence += 0.2; // Push up from bottom of range
      }
      
      // Reduce volatility during consolidation
      probabilities.noChange = 0.30;
      probabilities.tinyChange = 0.60;
      probabilities.smallChange = 0.08;
      probabilities.mediumChange = 0.015;
      probabilities.largeChange = 0.005;
    }
    
    // Determine price change magnitude
    let changePercent = 0;
    const cumulativeRandom = random;
    
    if (cumulativeRandom < probabilities.noChange) {
      // Doji - virtually no change
      changePercent = (Math.random() - 0.5) * 0.00005; // ±0.005%
    } else if (cumulativeRandom < probabilities.noChange + probabilities.tinyChange) {
      // Tiny change - most common
      changePercent = (Math.random() - 0.5) * 0.0003; // ±0.03%
    } else if (cumulativeRandom < probabilities.noChange + probabilities.tinyChange + probabilities.smallChange) {
      // Small change
      changePercent = (Math.random() - 0.5) * 0.001; // ±0.1%
    } else if (cumulativeRandom < probabilities.noChange + probabilities.tinyChange + probabilities.smallChange + probabilities.mediumChange) {
      // Medium change
      changePercent = (Math.random() - 0.5) * 0.003; // ±0.3%
    } else {
      // Large change - rare
      changePercent = (Math.random() - 0.5) * 0.008; // ±0.8%
    }
    
    // Apply trend bias
    if (state.currentTrend === 'up') {
      changePercent += 0.0001 * state.trendStrength;
    } else if (state.currentTrend === 'down') {
      changePercent -= 0.0001 * state.trendStrength;
    }
    
    // Apply support/resistance influence
    changePercent += supportResistanceInfluence * 0.001;
    
    // Apply scenario influence if active
    if (scenarioActive && scenarioData && scenarioData.phase) {
      const scenarioInfluence = calculateScenarioInfluence(scenarioData.phase, scenarioData.progress);
      changePercent += scenarioInfluence * 0.0005;
    }
    
    // Calculate final price
    priceChange = basePrice * changePercent;
    const newPrice = basePrice + priceChange;
    
    // Prevent negative prices
    return Math.max(newPrice, 0.01);
  }, [scenarioActive, scenarioData]);

  // Calculate scenario influence on price
  const calculateScenarioInfluence = (phase: any, progress: number): number => {
    if (!phase || !phase.priceAction) return 0;
    
    const { priceAction } = phase;
    let influence = 0;
    
    // Scenario adds bias but doesn't control price completely
    switch (priceAction.type) {
      case 'trend':
        influence = priceAction.intensity * (priceAction.direction === 'up' ? 1 : -1) * 0.5;
        break;
      case 'breakout':
        influence = priceAction.intensity * (priceAction.direction === 'up' ? 1 : -1) * 
                   (progress < 0.3 ? 1.5 : 0.3); // Strong initially, then fades
        break;
      case 'crash':
        influence = -priceAction.intensity * (progress < 0.5 ? 1.2 : 0.5);
        break;
      case 'pump':
        influence = priceAction.intensity * (progress < 0.4 ? 1.2 : 0.3);
        break;
      case 'accumulation':
        influence = 0.3 * (priceAction.direction === 'up' ? 1 : -1);
        break;
      case 'distribution':
        influence = -0.3;
        break;
      default:
        influence = 0;
    }
    
    // Add volatility component
    influence += (Math.random() - 0.5) * priceAction.volatility * 0.3;
    
    return influence;
  };

  // Generate candle with realistic wicks
  const generateRealisticCandle = useCallback((open: number, close: number, volatility: number = 1): { high: number; low: number } => {
    const bodySize = Math.abs(close - open);
    const direction = close > open ? 1 : -1;
    
    // Determine candle type
    const candleRandom = Math.random();
    let upperWickRatio: number;
    let lowerWickRatio: number;
    
    if (bodySize / open < 0.0001) {
      // Doji candle
      upperWickRatio = 0.5 + Math.random() * 1.5;
      lowerWickRatio = 0.5 + Math.random() * 1.5;
    } else if (candleRandom < 0.1) {
      // Spinning top (10% chance)
      upperWickRatio = 1 + Math.random() * 2;
      lowerWickRatio = 1 + Math.random() * 2;
    } else if (candleRandom < 0.2 && direction > 0) {
      // Hammer/Hanging man (10% chance on up moves)
      upperWickRatio = 0.1 + Math.random() * 0.3;
      lowerWickRatio = 2 + Math.random() * 2;
    } else if (candleRandom < 0.2 && direction < 0) {
      // Inverted hammer/Shooting star (10% chance on down moves)
      upperWickRatio = 2 + Math.random() * 2;
      lowerWickRatio = 0.1 + Math.random() * 0.3;
    } else {
      // Normal candle (70% chance)
      upperWickRatio = 0.2 + Math.random() * 0.8;
      lowerWickRatio = 0.2 + Math.random() * 0.8;
    }
    
    // Apply volatility adjustment
    upperWickRatio *= volatility;
    lowerWickRatio *= volatility;
    
    // Calculate wicks
    const upperWick = Math.max(bodySize * upperWickRatio, open * 0.0001);
    const lowerWick = Math.max(bodySize * lowerWickRatio, open * 0.0001);
    
    const high = Math.max(open, close) + upperWick;
    const low = Math.max(Math.min(open, close) - lowerWick, 0.01);
    
    return { high, low };
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
        autoScale: true,
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

    // Generate initial realistic data
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const candleCount = 100;
    const startTime = now - (intervalSec * candleCount);
    
    let currentPrice = propCurrentPrice || 125;
    const initialData = [];
    const priceHistory: number[] = [];
    
    // Initialize market state
    marketStateRef.current = {
      supportLevels: [currentPrice * 0.98, currentPrice * 0.96],
      resistanceLevels: [currentPrice * 1.02, currentPrice * 1.04],
      currentTrend: 'sideways',
      trendStrength: 0,
      consolidationRange: null,
      consolidationDuration: 0,
      volatilityRegime: 'normal',
      lastSignificantMove: 0,
      priceMemory: []
    };
    
    // Generate historical data
    for (let i = 0; i < candleCount; i++) {
      const time = startTime + (i * intervalSec);
      
      // Update market analysis every 5 candles
      if (i % 5 === 0 && priceHistory.length > 10) {
        analyzeMarketState(priceHistory);
        updateSupportResistance(priceHistory);
      }
      
      const open = currentPrice;
      const newPrice = generateRealisticPrice(currentPrice);
      const close = newPrice;
      
      // Generate realistic wicks based on market state
      const volatilityMultiplier = 
        marketStateRef.current.volatilityRegime === 'high' ? 1.5 :
        marketStateRef.current.volatilityRegime === 'low' ? 0.5 : 1;
      
      const { high, low } = generateRealisticCandle(open, close, volatilityMultiplier);
      
      initialData.push({
        time: time as Time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2))
      });
      
      currentPrice = close;
      priceHistory.push(close);
    }
    
    candlestickSeries.setData(initialData);
    dataRef.current = initialData;
    lastTimeRef.current = now;
    
    if (initialData.length > 0) {
      const firstPrice = initialData[0].open;
      const lastPrice = initialData[initialData.length - 1].close;
      setPriceChange(lastPrice - firstPrice);
      setPriceChangePercent(((lastPrice - firstPrice) / firstPrice) * 100);
      setDisplayPrice(lastPrice);
    }

    setIsLoading(false);

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
  }, [analyzeMarketState, updateSupportResistance, generateRealisticPrice, generateRealisticCandle, interval, propCurrentPrice]);

  // Update prices with realistic movement
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const currentCandleTime = Math.floor(now / intervalSec) * intervalSec;
    
    const lastCandle = dataRef.current[dataRef.current.length - 1];
    if (!lastCandle) return;
    
    // Update market analysis periodically
    if (dataRef.current.length % 5 === 0) {
      const prices = dataRef.current.slice(-50).map(c => c.close);
      analyzeMarketState(prices);
      updateSupportResistance(prices);
    }
    
    // Generate new price
    const newPrice = propCurrentPrice || generateRealisticPrice(displayPrice);
    
    if (currentCandleTime > lastCandle.time) {
      // Create new candle
      const volatilityMultiplier = 
        marketStateRef.current.volatilityRegime === 'high' ? 1.5 :
        marketStateRef.current.volatilityRegime === 'low' ? 0.5 : 1;
      
      const { high, low } = generateRealisticCandle(lastCandle.close, newPrice, volatilityMultiplier);
      
      const newCandle = {
        time: currentCandleTime as Time,
        open: parseFloat(lastCandle.close.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(newPrice.toFixed(2))
      };
      
      dataRef.current.push(newCandle);
      
      if (dataRef.current.length > 150) {
        dataRef.current = dataRef.current.slice(-100);
      }
      
      seriesRef.current.setData(dataRef.current);
      chartRef.current.timeScale().scrollToRealTime();
    } else {
      // Update current candle
      const volatilityMultiplier = 
        marketStateRef.current.volatilityRegime === 'high' ? 1.2 :
        marketStateRef.current.volatilityRegime === 'low' ? 0.8 : 1;
      
      const { high, low } = generateRealisticCandle(lastCandle.open, newPrice, volatilityMultiplier);
      
      const updatedCandle = {
        ...lastCandle,
        high: parseFloat(Math.max(lastCandle.high, high).toFixed(2)),
        low: parseFloat(Math.min(lastCandle.low, low).toFixed(2)),
        close: parseFloat(newPrice.toFixed(2))
      };
      
      dataRef.current[dataRef.current.length - 1] = updatedCandle;
      seriesRef.current.update(updatedCandle);
    }
    
    setDisplayPrice(newPrice);
    
    if (dataRef.current.length > 0) {
      const firstPrice = dataRef.current[0].open;
      const change = newPrice - firstPrice;
      setPriceChange(change);
      setPriceChangePercent((change / firstPrice) * 100);
    }
    
  }, [propCurrentPrice, interval, displayPrice, generateRealisticPrice, generateRealisticCandle, analyzeMarketState, updateSupportResistance]);

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
          
          {/* Market state indicators */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-gray-400">Trend:</span>
            <span className={`font-medium ${
              marketStateRef.current.currentTrend === 'up' ? 'text-green-400' :
              marketStateRef.current.currentTrend === 'down' ? 'text-red-400' :
              'text-yellow-400'
            }`}>
              {marketStateRef.current.currentTrend.toUpperCase()}
            </span>
          </div>
          
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-gray-400">Vol:</span>
            <span className={`font-medium ${
              marketStateRef.current.volatilityRegime === 'high' ? 'text-red-400' :
              marketStateRef.current.volatilityRegime === 'low' ? 'text-green-400' :
              'text-yellow-400'
            }`}>
              {marketStateRef.current.volatilityRegime.toUpperCase()}
            </span>
          </div>
          
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
        
        {/* Market info overlay */}
        <div className="absolute top-4 right-4 bg-gray-800 bg-opacity-90 p-2 rounded text-xs text-white">
          <div className="text-gray-300 mb-1">Market Structure</div>
          {marketStateRef.current.consolidationRange && (
            <div className="text-yellow-300">
              Consolidating: ${marketStateRef.current.consolidationRange.min.toFixed(2)} - ${marketStateRef.current.consolidationRange.max.toFixed(2)}
            </div>
          )}
          {marketStateRef.current.supportLevels.length > 0 && (
            <div className="text-green-300">
              Support: ${marketStateRef.current.supportLevels[marketStateRef.current.supportLevels.length - 1].toFixed(2)}
            </div>
          )}
          {marketStateRef.current.resistanceLevels.length > 0 && (
            <div className="text-red-300">
              Resistance: ${marketStateRef.current.resistanceLevels[0].toFixed(2)}
            </div>
          )}
        </div>
        
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