import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, Time } from 'lightweight-charts';
import { PricePoint, Trade } from '../types';

interface PriceChartProps {
  symbol?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  priceHistory?: PricePoint[];
  currentPrice?: number;
  trades?: Trade[];
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  symbol = 'BTC/USDT',
  interval = '15m',
  priceHistory = [],
  currentPrice: propCurrentPrice,
  trades = []
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

  // Initialize chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart with clean settings
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
    });

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Generate initial data
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (intervalSec * 300); // 300 candles back
    
    let currentPrice = propCurrentPrice || 125;
    const initialData = [];
    
    // Create 300 candles of history
    for (let i = 0; i < 300; i++) {
      const time = startTime + (i * intervalSec);
      
      // Simple price movement
      const change = (Math.random() - 0.5) * 0.002 * currentPrice; // ±0.2% max
      const open = currentPrice;
      const close = currentPrice + change;
      const high = Math.max(open, close) * (1 + Math.random() * 0.001); // Small wick
      const low = Math.min(open, close) * (1 - Math.random() * 0.001);  // Small wick
      
      initialData.push({
        time: time as Time,
        open: open,
        high: high,
        low: low,
        close: close
      });
      
      currentPrice = close;
    }
    
    // Set the data
    candlestickSeries.setData(initialData);
    dataRef.current = initialData;
    lastTimeRef.current = now;
    
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

  // Handle price updates
  useEffect(() => {
    if (!seriesRef.current || !propCurrentPrice || !chartRef.current) return;
    
    const intervalSec = getIntervalSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const currentCandleTime = Math.floor(now / intervalSec) * intervalSec;
    
    // Get the last candle
    const lastCandle = dataRef.current[dataRef.current.length - 1];
    
    if (!lastCandle) return;
    
    // Check if we need a new candle
    if (currentCandleTime > lastCandle.time) {
      // Create new candle
      const newCandle = {
        time: currentCandleTime as Time,
        open: lastCandle.close,
        high: propCurrentPrice,
        low: propCurrentPrice,
        close: propCurrentPrice
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
      const updatedCandle = {
        ...lastCandle,
        high: Math.max(lastCandle.high, propCurrentPrice),
        low: Math.min(lastCandle.low, propCurrentPrice),
        close: propCurrentPrice
      };
      
      // Update the last candle
      dataRef.current[dataRef.current.length - 1] = updatedCandle;
      seriesRef.current.update(updatedCandle);
    }
    
    // Update display values
    setDisplayPrice(propCurrentPrice);
    
    // Calculate change from first candle
    if (dataRef.current.length > 0) {
      const firstPrice = dataRef.current[0].open;
      const change = propCurrentPrice - firstPrice;
      setPriceChange(change);
      setPriceChangePercent((change / firstPrice) * 100);
    }
    
  }, [propCurrentPrice, interval]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">{symbol}</h2>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-white">
              ${displayPrice.toFixed(2)}
            </span>
            <span className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">Interval:</span>
          <span className="text-sm text-white font-medium">{interval}</span>
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
      </div>
    </div>
  );
};

export default PriceChart;