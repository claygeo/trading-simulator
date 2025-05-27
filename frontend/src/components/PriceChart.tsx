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

// Market patterns for crypto-like behavior
type MarketPattern = 'parabolic_rise' | 'steady_uptrend' | 'volatile_uptrend' | 
                    'accumulation' | 'distribution' | 'ranging' | 'breakdown' | 
                    'steady_downtrend' | 'capitulation' | 'recovery' | 'pump_and_dump';

interface MarketState {
  pattern: MarketPattern;
  patternStrength: number;
  patternProgress: number;
  baseVolatility: number;
  trendBias: number;
  momentum: number;
  volumeProfile: 'low' | 'normal' | 'high' | 'extreme';
  supportLevels: number[];
  resistanceLevels: number[];
  priceMemory: number[];
  lastPatternChange: number;
  accumulatedChange: number;
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
  const [displayPrice, setDisplayPrice] = useState<number>(propCurrentPrice || 50000);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);
  const [scenarioActive, setScenarioActive] = useState<boolean>(true);
  const [currentPattern, setCurrentPattern] = useState<MarketPattern>('ranging');
  
  // Market state for realistic crypto price generation
  const marketStateRef = useRef<MarketState>({
    pattern: 'ranging',
    patternStrength: 0.5,
    patternProgress: 0,
    baseVolatility: 0.02,
    trendBias: 0,
    momentum: 0,
    volumeProfile: 'normal',
    supportLevels: [],
    resistanceLevels: [],
    priceMemory: [],
    lastPatternChange: 0,
    accumulatedChange: 0
  });

  // Pattern configurations for crypto-like movements (duration in number of candles)
  const patternConfigs = {
    parabolic_rise: {
      volatility: 0.03,
      trendBias: 0.008,
      momentumGain: 0.02,
      duration: 30, // 30 candles
      description: 'Parabolic Rise'
    },
    steady_uptrend: {
      volatility: 0.015,
      trendBias: 0.003,
      momentumGain: 0.005,
      duration: 60, // 60 candles
      description: 'Steady Uptrend'
    },
    volatile_uptrend: {
      volatility: 0.04,
      trendBias: 0.004,
      momentumGain: 0.008,
      duration: 45, // 45 candles
      description: 'Volatile Rally'
    },
    accumulation: {
      volatility: 0.008,
      trendBias: 0.0005,
      momentumGain: 0,
      duration: 80, // 80 candles
      description: 'Accumulation'
    },
    distribution: {
      volatility: 0.012,
      trendBias: -0.0005,
      momentumGain: -0.002,
      duration: 60, // 60 candles
      description: 'Distribution'
    },
    ranging: {
      volatility: 0.01,
      trendBias: 0,
      momentumGain: 0,
      duration: 90, // 90 candles
      description: 'Sideways'
    },
    breakdown: {
      volatility: 0.025,
      trendBias: -0.006,
      momentumGain: -0.015,
      duration: 20, // 20 candles
      description: 'Breakdown'
    },
    steady_downtrend: {
      volatility: 0.018,
      trendBias: -0.003,
      momentumGain: -0.005,
      duration: 50, // 50 candles
      description: 'Downtrend'
    },
    capitulation: {
      volatility: 0.05,
      trendBias: -0.012,
      momentumGain: -0.025,
      duration: 15, // 15 candles
      description: 'Capitulation'
    },
    recovery: {
      volatility: 0.02,
      trendBias: 0.005,
      momentumGain: 0.01,
      duration: 35, // 35 candles
      description: 'Recovery'
    },
    pump_and_dump: {
      volatility: 0.06,
      trendBias: 0.015,
      momentumGain: 0.03,
      duration: 12, // 12 candles
      description: 'Pump & Dump'
    }
  };

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

  // Select next pattern based on current market state
  const selectNextPattern = useCallback((): MarketPattern => {
    const currentPattern = marketStateRef.current.pattern;
    const accumulated = marketStateRef.current.accumulatedChange;
    
    // Pattern transition probabilities
    const transitions: { [key in MarketPattern]: { pattern: MarketPattern, weight: number }[] } = {
      ranging: [
        { pattern: 'steady_uptrend', weight: 20 },
        { pattern: 'steady_downtrend', weight: 20 },
        { pattern: 'accumulation', weight: 25 },
        { pattern: 'distribution', weight: 15 },
        { pattern: 'volatile_uptrend', weight: 10 },
        { pattern: 'breakdown', weight: 5 },
        { pattern: 'pump_and_dump', weight: 5 }
      ],
      accumulation: [
        { pattern: 'steady_uptrend', weight: 35 },
        { pattern: 'volatile_uptrend', weight: 25 },
        { pattern: 'parabolic_rise', weight: 15 },
        { pattern: 'ranging', weight: 20 },
        { pattern: 'distribution', weight: 5 }
      ],
      distribution: [
        { pattern: 'steady_downtrend', weight: 30 },
        { pattern: 'breakdown', weight: 25 },
        { pattern: 'ranging', weight: 25 },
        { pattern: 'volatile_uptrend', weight: 10 },
        { pattern: 'capitulation', weight: 10 }
      ],
      steady_uptrend: [
        { pattern: 'parabolic_rise', weight: 20 },
        { pattern: 'volatile_uptrend', weight: 20 },
        { pattern: 'distribution', weight: 25 },
        { pattern: 'ranging', weight: 25 },
        { pattern: 'steady_uptrend', weight: 10 }
      ],
      volatile_uptrend: [
        { pattern: 'parabolic_rise', weight: 15 },
        { pattern: 'distribution', weight: 30 },
        { pattern: 'breakdown', weight: 20 },
        { pattern: 'ranging', weight: 25 },
        { pattern: 'steady_uptrend', weight: 10 }
      ],
      parabolic_rise: [
        { pattern: 'breakdown', weight: 40 },
        { pattern: 'distribution', weight: 30 },
        { pattern: 'capitulation', weight: 15 },
        { pattern: 'volatile_uptrend', weight: 10 },
        { pattern: 'ranging', weight: 5 }
      ],
      steady_downtrend: [
        { pattern: 'capitulation', weight: 20 },
        { pattern: 'ranging', weight: 30 },
        { pattern: 'recovery', weight: 25 },
        { pattern: 'accumulation', weight: 15 },
        { pattern: 'steady_downtrend', weight: 10 }
      ],
      breakdown: [
        { pattern: 'capitulation', weight: 30 },
        { pattern: 'steady_downtrend', weight: 25 },
        { pattern: 'recovery', weight: 20 },
        { pattern: 'ranging', weight: 20 },
        { pattern: 'volatile_uptrend', weight: 5 }
      ],
      capitulation: [
        { pattern: 'recovery', weight: 50 },
        { pattern: 'accumulation', weight: 25 },
        { pattern: 'ranging', weight: 15 },
        { pattern: 'steady_uptrend', weight: 10 }
      ],
      recovery: [
        { pattern: 'steady_uptrend', weight: 30 },
        { pattern: 'volatile_uptrend', weight: 25 },
        { pattern: 'ranging', weight: 25 },
        { pattern: 'accumulation', weight: 15 },
        { pattern: 'distribution', weight: 5 }
      ],
      pump_and_dump: [
        { pattern: 'capitulation', weight: 60 },
        { pattern: 'breakdown', weight: 25 },
        { pattern: 'ranging', weight: 10 },
        { pattern: 'recovery', weight: 5 }
      ]
    };
    
    // Adjust weights based on accumulated change
    const possibleTransitions = transitions[currentPattern] || transitions.ranging;
    let adjustedTransitions = possibleTransitions.map(t => ({ ...t }));
    
    // If price has moved up significantly, increase downward pattern probability
    if (accumulated > 0.2) {
      adjustedTransitions = adjustedTransitions.map(t => ({
        ...t,
        weight: ['breakdown', 'steady_downtrend', 'capitulation', 'distribution'].includes(t.pattern) 
          ? t.weight * 1.5 : t.weight * 0.8
      }));
    }
    // If price has moved down significantly, increase upward pattern probability
    else if (accumulated < -0.2) {
      adjustedTransitions = adjustedTransitions.map(t => ({
        ...t,
        weight: ['steady_uptrend', 'volatile_uptrend', 'parabolic_rise', 'recovery'].includes(t.pattern)
          ? t.weight * 1.5 : t.weight * 0.8
      }));
    }
    
    // Select based on weighted random
    const totalWeight = adjustedTransitions.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const transition of adjustedTransitions) {
      random -= transition.weight;
      if (random <= 0) {
        return transition.pattern;
      }
    }
    
    return 'ranging';
  }, []);

  // Update support and resistance levels
  const updateSupportResistance = useCallback((prices: number[]) => {
    if (prices.length < 20) return;
    
    const state = marketStateRef.current;
    const recentPrices = prices.slice(-100);
    
    // Find significant levels using pivot points
    const levels: number[] = [];
    
    for (let i = 10; i < recentPrices.length - 10; i += 5) {
      const segment = recentPrices.slice(i - 10, i + 10);
      const max = Math.max(...segment);
      const min = Math.min(...segment);
      const avg = segment.reduce((a, b) => a + b, 0) / segment.length;
      
      if (recentPrices[i] === max || recentPrices[i] === min) {
        levels.push(recentPrices[i]);
      }
      
      // Add psychological levels (round numbers)
      const roundLevel = Math.round(avg / 1000) * 1000;
      if (Math.abs(avg - roundLevel) / avg < 0.02) {
        levels.push(roundLevel);
      }
    }
    
    // Cluster and filter levels
    const currentPrice = prices[prices.length - 1];
    const uniqueLevels = Array.from(new Set(levels)).sort((a, b) => a - b);
    
    state.supportLevels = uniqueLevels
      .filter(level => level < currentPrice * 0.98)
      .slice(-3);
    
    state.resistanceLevels = uniqueLevels
      .filter(level => level > currentPrice * 1.02)
      .slice(0, 3);
  }, []);

  // Generate realistic crypto price movement
  const generateCryptoPrice = useCallback((basePrice: number): number => {
    const state = marketStateRef.current;
    const config = patternConfigs[state.pattern];
    
    // Update pattern progress
    state.patternProgress += 1 / config.duration;
    
    // Check if pattern should change
    if (state.patternProgress >= 1 || Date.now() - state.lastPatternChange > 60000) {
      const newPattern = selectNextPattern();
      state.pattern = newPattern;
      state.patternProgress = 0;
      state.lastPatternChange = Date.now();
      state.patternStrength = 0.5 + Math.random() * 0.5;
      setCurrentPattern(newPattern);
    }
    
    // Calculate base movement components
    let volatilityComponent = (Math.random() - 0.5) * config.volatility * state.patternStrength;
    let trendComponent = config.trendBias * state.patternStrength;
    let momentumComponent = state.momentum * 0.3;
    
    // Add pattern-specific behaviors
    switch (state.pattern) {
      case 'parabolic_rise':
        // Exponential growth with increasing volatility
        trendComponent *= (1 + state.patternProgress * 2);
        volatilityComponent *= (1 + state.patternProgress);
        break;
        
      case 'pump_and_dump':
        // Sharp rise then sharp fall
        if (state.patternProgress < 0.6) {
          trendComponent *= 2;
          volatilityComponent *= 1.5;
        } else {
          trendComponent = -Math.abs(trendComponent) * 3;
          volatilityComponent *= 2;
        }
        break;
        
      case 'capitulation':
        // Accelerating decline
        trendComponent *= (1 + state.patternProgress * 1.5);
        volatilityComponent *= (1 + state.patternProgress * 0.5);
        break;
        
      case 'ranging':
        // Mean reversion within range
        const rangeCenter = state.priceMemory.length > 0 
          ? state.priceMemory.reduce((a, b) => a + b, 0) / state.priceMemory.length
          : basePrice;
        const deviation = (basePrice - rangeCenter) / rangeCenter;
        trendComponent = -deviation * 0.01; // Pull back to center
        break;
        
      case 'accumulation':
        // Tight range with slight upward bias
        volatilityComponent *= 0.5;
        if (Math.random() < 0.3) {
          trendComponent += 0.001; // Occasional small pumps
        }
        break;
        
      case 'distribution':
        // Increased volatility with slight downward bias
        volatilityComponent *= 1.2;
        if (Math.random() < 0.3) {
          trendComponent -= 0.002; // Occasional small dumps
        }
        break;
    }
    
    // Support and resistance influence
    let srInfluence = 0;
    
    for (const support of state.supportLevels) {
      const distance = (basePrice - support) / support;
      if (distance > 0 && distance < 0.02) {
        srInfluence += 0.005 * (1 - distance / 0.02);
      }
    }
    
    for (const resistance of state.resistanceLevels) {
      const distance = (resistance - basePrice) / resistance;
      if (distance > 0 && distance < 0.02) {
        srInfluence -= 0.005 * (1 - distance / 0.02);
      }
    }
    
    // Update momentum
    state.momentum = state.momentum * 0.9 + (trendComponent + config.momentumGain) * 0.1;
    
    // Apply scenario influence if active
    let scenarioInfluence = 0;
    if (scenarioActive && scenarioData && scenarioData.phase) {
      scenarioInfluence = calculateScenarioInfluence(scenarioData.phase, scenarioData.progress);
    }
    
    // Calculate final price change
    const totalChange = volatilityComponent + trendComponent + momentumComponent + srInfluence + scenarioInfluence;
    const newPrice = basePrice * (1 + totalChange);
    
    // Update price memory
    state.priceMemory.push(newPrice);
    if (state.priceMemory.length > 50) {
      state.priceMemory.shift();
    }
    
    // Track accumulated change
    state.accumulatedChange += totalChange;
    
    return Math.max(newPrice, 0.01);
  }, [scenarioActive, scenarioData, selectNextPattern]);

  // Calculate scenario influence on price
  const calculateScenarioInfluence = (phase: any, progress: number): number => {
    if (!phase || !phase.priceAction) return 0;
    
    const { priceAction } = phase;
    let influence = 0;
    
    switch (priceAction.type) {
      case 'trend':
        influence = priceAction.intensity * 0.005 * (priceAction.direction === 'up' ? 1 : -1);
        break;
      case 'breakout':
        influence = priceAction.intensity * 0.008 * (priceAction.direction === 'up' ? 1 : -1) * 
                   (progress < 0.3 ? 2 : 0.5);
        break;
      case 'crash':
        influence = -priceAction.intensity * 0.015 * (progress < 0.5 ? 1.5 : 0.8);
        break;
      case 'pump':
        influence = priceAction.intensity * 0.012 * (progress < 0.4 ? 1.5 : 0.3);
        break;
      case 'accumulation':
        influence = 0.002 * (priceAction.direction === 'up' ? 1 : -1);
        break;
      case 'distribution':
        influence = -0.003;
        break;
      default:
        influence = 0;
    }
    
    // Add volatility from scenario
    influence += (Math.random() - 0.5) * priceAction.volatility * 0.005;
    
    return influence;
  };

  // Generate realistic candle with crypto-style wicks
  const generateCryptoCandle = useCallback((open: number, close: number, pattern: MarketPattern): { high: number; low: number } => {
    const bodySize = Math.abs(close - open);
    const priceLevel = (open + close) / 2;
    const config = patternConfigs[pattern];
    
    // Base wick ratios depend on pattern
    let upperWickRatio: number;
    let lowerWickRatio: number;
    
    const candleRandom = Math.random();
    
    // Pattern-specific candle shapes
    switch (pattern) {
      case 'parabolic_rise':
      case 'pump_and_dump':
        // Long upper wicks on rises (profit taking)
        upperWickRatio = 1.5 + Math.random() * 2;
        lowerWickRatio = 0.3 + Math.random() * 0.5;
        break;
        
      case 'capitulation':
      case 'breakdown':
        // Long lower wicks on falls (support seeking)
        upperWickRatio = 0.3 + Math.random() * 0.5;
        lowerWickRatio = 1.5 + Math.random() * 2;
        break;
        
      case 'ranging':
      case 'accumulation':
        // Balanced wicks
        upperWickRatio = 0.5 + Math.random();
        lowerWickRatio = 0.5 + Math.random();
        break;
        
      default:
        // Normal distribution
        upperWickRatio = 0.3 + Math.random() * 1.2;
        lowerWickRatio = 0.3 + Math.random() * 1.2;
    }
    
    // Special candle patterns
    if (candleRandom < 0.05) {
      // Doji (5% chance)
      const dojiWick = 2 + Math.random() * 2;
      upperWickRatio = dojiWick;
      lowerWickRatio = dojiWick;
    } else if (candleRandom < 0.1 && close > open) {
      // Hammer (5% chance on up moves)
      upperWickRatio = 0.2;
      lowerWickRatio = 3 + Math.random();
    } else if (candleRandom < 0.1 && close < open) {
      // Shooting star (5% chance on down moves)
      upperWickRatio = 3 + Math.random();
      lowerWickRatio = 0.2;
    }
    
    // Scale wicks by volatility
    const volatilityMultiplier = config.volatility * 50;
    upperWickRatio *= volatilityMultiplier;
    lowerWickRatio *= volatilityMultiplier;
    
    // Calculate actual wick sizes
    const avgPrice = (open + close) / 2;
    const upperWick = avgPrice * (upperWickRatio / 100);
    const lowerWick = avgPrice * (lowerWickRatio / 100);
    
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

    // Generate initial data with random starting pattern
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const candleCount = 100;
    const startTime = now - (intervalSec * candleCount);
    
    // Random starting conditions
    const startingPatterns: MarketPattern[] = ['ranging', 'steady_uptrend', 'steady_downtrend', 'accumulation'];
    const startPattern = startingPatterns[Math.floor(Math.random() * startingPatterns.length)];
    
    let currentPrice = propCurrentPrice || (40000 + Math.random() * 20000);
    const initialData = [];
    const priceHistory: number[] = [];
    
    // Initialize market state
    marketStateRef.current = {
      pattern: startPattern,
      patternStrength: 0.7,
      patternProgress: 0,
      baseVolatility: 0.02,
      trendBias: 0,
      momentum: 0,
      volumeProfile: 'normal',
      supportLevels: [currentPrice * 0.95, currentPrice * 0.90],
      resistanceLevels: [currentPrice * 1.05, currentPrice * 1.10],
      priceMemory: [],
      lastPatternChange: Date.now(),
      accumulatedChange: 0
    };
    
    setCurrentPattern(startPattern);
    
    // Generate historical data
    for (let i = 0; i < candleCount; i++) {
      const time = startTime + (i * intervalSec);
      
      // Update support/resistance periodically
      if (i % 10 === 0 && priceHistory.length > 20) {
        updateSupportResistance(priceHistory);
      }
      
      const open = currentPrice;
      const newPrice = generateCryptoPrice(currentPrice);
      const close = newPrice;
      
      const { high, low } = generateCryptoCandle(open, close, marketStateRef.current.pattern);
      
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
  }, [generateCryptoPrice, generateCryptoCandle, updateSupportResistance, interval, propCurrentPrice]);

  // Update prices in real-time with proper candle flow
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    
    // Update every second for smoother price updates within candles
    const updateInterval = setInterval(() => {
      const intervalSec = getIntervalSeconds(interval);
      const now = Math.floor(Date.now() / 1000);
      const currentCandleTime = Math.floor(now / intervalSec) * intervalSec;
      
      const lastCandle = dataRef.current[dataRef.current.length - 1];
      if (!lastCandle) return;
      
      // Generate new price
      const newPrice = propCurrentPrice || generateCryptoPrice(displayPrice);
      
      if (currentCandleTime > lastCandle.time) {
        // NEW CANDLE - This is when we increment pattern progress
        marketStateRef.current.patternProgress += 1;
        
        // Update support/resistance every 10 candles
        if (dataRef.current.length % 10 === 0) {
          const prices = dataRef.current.slice(-100).map(c => c.close);
          updateSupportResistance(prices);
        }
        
        // Create new candle
        const { high, low } = generateCryptoCandle(lastCandle.close, newPrice, marketStateRef.current.pattern);
        
        const newCandle = {
          time: currentCandleTime as Time,
          open: parseFloat(lastCandle.close.toFixed(2)),
          high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)),
          close: parseFloat(newPrice.toFixed(2))
        };
        
        dataRef.current.push(newCandle);
        
        // Keep reasonable number of candles
        if (dataRef.current.length > 200) {
          dataRef.current = dataRef.current.slice(-150);
        }
        
        seriesRef.current.setData(dataRef.current);
        if (chartRef.current) {
          chartRef.current.timeScale().scrollToRealTime();
        }
      } else {
        // UPDATE CURRENT CANDLE - Don't change pattern, just update price
        const { high, low } = generateCryptoCandle(lastCandle.open, newPrice, marketStateRef.current.pattern);
        
        const updatedCandle = {
          ...lastCandle,
          high: parseFloat(Math.max(lastCandle.high, high, newPrice).toFixed(2)),
          low: parseFloat(Math.min(lastCandle.low, low, newPrice).toFixed(2)),
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
    }, 1000); // Update every second for smooth price movement
    
    return () => clearInterval(updateInterval);
  }, [propCurrentPrice, interval, displayPrice, generateCryptoPrice, generateCryptoCandle, updateSupportResistance]);

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
          
          {/* Pattern indicator */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-gray-400">Pattern:</span>
            <span className={`font-medium px-2 py-0.5 rounded ${
              currentPattern.includes('rise') || currentPattern.includes('uptrend') ? 'bg-green-600 text-white' :
              currentPattern.includes('down') || currentPattern.includes('capitulation') ? 'bg-red-600 text-white' :
              currentPattern === 'pump_and_dump' ? 'bg-orange-600 text-white animate-pulse' :
              currentPattern === 'accumulation' ? 'bg-blue-600 text-white' :
              currentPattern === 'distribution' ? 'bg-yellow-600 text-white' :
              'bg-gray-600 text-white'
            }`}>
              {patternConfigs[currentPattern].description}
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
          <div className="text-gray-400">
            Progress: {Math.round((marketStateRef.current.patternProgress / patternConfigs[marketStateRef.current.pattern].duration) * 100)}%
          </div>
          {marketStateRef.current.supportLevels.length > 0 && (
            <div className="text-green-300">
              Support: ${marketStateRef.current.supportLevels[marketStateRef.current.supportLevels.length - 1].toFixed(0)}
            </div>
          )}
          {marketStateRef.current.resistanceLevels.length > 0 && (
            <div className="text-red-300">
              Resistance: ${marketStateRef.current.resistanceLevels[0].toFixed(0)}
            </div>
          )}
          <div className="text-blue-300 mt-1">
            Momentum: {(marketStateRef.current.momentum * 100).toFixed(1)}%
          </div>
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