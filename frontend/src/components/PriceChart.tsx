import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, Time } from 'lightweight-charts';
import { PricePoint, Trade } from '../types';

interface PriceChartProps {
  symbol?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  websocketUrl?: string;
  priceHistory?: PricePoint[];
  currentPrice?: number;
  trades?: Trade[];
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  symbol = 'BTC/USDT',
  interval = '15m',
  websocketUrl,
  priceHistory = [],
  currentPrice: propCurrentPrice,
  trades = []
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const currentCandleRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(propCurrentPrice || null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  // Generate realistic sample data with proper timestamps
  const generateSampleData = useCallback((): PricePoint[] => {
    const data: PricePoint[] = [];
    const now = Date.now();
    const intervalMs = getIntervalMs(interval);
    const candleCount = 300; // Always generate 300 candles
    
    // Start price around current price or default
    let basePrice = propCurrentPrice || 125;
    
    // Add some initial variance to avoid flat line
    basePrice = basePrice * (0.95 + Math.random() * 0.1); // ±5% variance
    
    for (let i = candleCount - 1; i >= 0; i--) {
      // Calculate timestamp aligned to interval
      const timestamp = Math.floor((now - (i * intervalMs)) / 1000);
      const alignedTimestamp = Math.floor(timestamp / (intervalMs / 1000)) * (intervalMs / 1000);
      
      // Add some trend and volatility
      const trend = Math.sin(i / 30) * (basePrice * 0.02); // 2% wave
      const volatility = 0.002 + Math.random() * 0.003; // 0.2-0.5% volatility
      
      const open = basePrice + trend;
      const change = (Math.random() - 0.5) * basePrice * volatility * 2;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
      
      data.push({
        timestamp: alignedTimestamp,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.random() * 1000000 + 500000
      });
      
      basePrice = close;
    }
    
    return data;
  }, [propCurrentPrice, interval]);

  const getIntervalMs = (interval: string): number => {
    const intervals: { [key: string]: number } = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    return intervals[interval] || intervals['15m'];
  };

  // Ensure we have enough candles and fill gaps
  const ensureEnoughCandles = (data: PricePoint[], targetCount: number = 300): PricePoint[] => {
    if (data.length === 0) return generateSampleData();
    
    const intervalMs = getIntervalMs(interval);
    const intervalSec = intervalMs / 1000;
    const result: PricePoint[] = [];
    
    // If we have data, ensure it's properly spaced
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    
    // Start from the earliest time we want (300 candles ago)
    const now = Math.floor(Date.now() / 1000);
    const alignedNow = Math.floor(now / intervalSec) * intervalSec;
    const startTime = alignedNow - (intervalSec * (targetCount - 1));
    
    let dataIndex = 0;
    let lastClose = sortedData[0]?.close || propCurrentPrice || 125;
    
    // Add some variance to avoid flat lines
    const baseVariance = lastClose * 0.001; // 0.1% base variance
    
    // Generate candles for each interval
    for (let i = 0; i < targetCount; i++) {
      const candleTime = startTime + (i * intervalSec);
      
      // Find if we have real data for this time
      let candle: PricePoint | null = null;
      while (dataIndex < sortedData.length && sortedData[dataIndex].timestamp <= candleTime) {
        if (Math.abs(sortedData[dataIndex].timestamp - candleTime) < intervalSec / 2) {
          candle = sortedData[dataIndex];
          lastClose = candle.close;
        }
        dataIndex++;
      }
      
      // If no data for this time, create a candle with slight variance
      if (!candle) {
        const variance = (Math.random() - 0.5) * baseVariance;
        const price = lastClose + variance;
        candle = {
          timestamp: candleTime,
          open: lastClose,
          high: Math.max(lastClose, price) + Math.abs(variance) * 0.1,
          low: Math.min(lastClose, price) - Math.abs(variance) * 0.1,
          close: price,
          volume: 100000 + Math.random() * 50000
        };
        lastClose = price;
      }
      
      result.push(candle);
    }
    
    return result;
  };

  // Initialize chart - only when priceHistory changes, not on every price update
  useEffect(() => {
    if (!chartContainerRef.current) return;

    console.log('Initializing chart with interval:', interval);
    console.log('Price history length:', priceHistory?.length);

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
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        mode: 0, // Normal mode
        autoScale: false, // Disable auto scale to control range manually
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
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
    candlestickSeriesRef.current = candlestickSeries;

    // Prepare data - ensure we have 300 candles
    const data = ensureEnoughCandles(priceHistory);
    console.log('Prepared data length:', data.length);
    console.log('First candle:', data[0]);
    console.log('Last candle:', data[data.length - 1]);

    // Convert to chart format
    const candleData = data.map(d => ({
      time: d.timestamp as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candlestickSeries.setData(candleData);
    
    // Set price scale to show a reasonable range around the current price
    const priceRange = 10; // Show ±$10 range for better visualization
    const minPrice = Math.min(...data.map(d => d.low));
    const maxPrice = Math.max(...data.map(d => d.high));
    const currentPrice = data[data.length - 1].close;
    
    // Set a reasonable visible range - either based on data or a fixed range
    if (maxPrice - minPrice < priceRange) {
      // If natural range is small, use a fixed range around current price
      chart.priceScale('right').applyOptions({
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        autoScale: false,
      });
      
      // Set visible range to ±2% of current price or ±$5, whichever is larger
      const buffer = Math.max(currentPrice * 0.02, 5);
      chart.timeScale().fitContent();
      
      // Use setTimeout to ensure the chart has rendered before setting range
      setTimeout(() => {
        const visibleRange = candlestickSeriesRef.current.priceScale().getVisiblePriceRange();
        if (visibleRange) {
          const center = currentPrice;
          candlestickSeriesRef.current.priceScale().setVisiblePriceRange({
            from: center - buffer,
            to: center + buffer,
          });
        }
      }, 0);
    } else {
      // If natural range is large enough, use auto scale
      chart.priceScale('right').applyOptions({
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        autoScale: true,
      });
    }
    
    // Store the current candle for updates
    if (data.length > 0) {
      currentCandleRef.current = candleData[candleData.length - 1];
    }

    // Calculate price changes
    if (data.length > 1) {
      const firstCandle = data[0];
      const lastCandle = data[data.length - 1];
      setCurrentPrice(lastCandle.close);
      const change = lastCandle.close - firstCandle.open;
      setPriceChange(change);
      setPriceChangePercent((change / firstCandle.open) * 100);
    }

    chart.timeScale().fitContent();
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
  }, [priceHistory.length, interval]); // Only reinit when priceHistory length or interval changes

  // Update chart when current price changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !propCurrentPrice) return;
    
    setCurrentPrice(propCurrentPrice);
    
    // Update the current candle with new price
    const now = Math.floor(Date.now() / 1000);
    const intervalSec = getIntervalMs(interval) / 1000;
    const currentCandleTime = Math.floor(now / intervalSec) * intervalSec;
    
    if (currentCandleRef.current && currentCandleRef.current.time === currentCandleTime) {
      // Update existing candle
      const updatedCandle = {
        time: currentCandleTime as Time,
        open: currentCandleRef.current.open,
        high: Math.max(currentCandleRef.current.high, propCurrentPrice),
        low: Math.min(currentCandleRef.current.low, propCurrentPrice),
        close: propCurrentPrice
      };
      
      candlestickSeriesRef.current.update(updatedCandle);
      currentCandleRef.current = updatedCandle;
    } else {
      // Create new candle
      const newCandle = {
        time: currentCandleTime as Time,
        open: propCurrentPrice,
        high: propCurrentPrice,
        low: propCurrentPrice,
        close: propCurrentPrice
      };
      
      candlestickSeriesRef.current.update(newCandle);
      currentCandleRef.current = newCandle;
    }
    
    // Adjust visible price range if price moves outside current view
    try {
      const visibleRange = candlestickSeriesRef.current.priceScale().getVisiblePriceRange();
      if (visibleRange) {
        const buffer = Math.max(propCurrentPrice * 0.02, 5); // 2% or $5
        const padding = buffer * 0.5;
        
        // Check if price is getting close to edges
        if (propCurrentPrice > visibleRange.to - padding || propCurrentPrice < visibleRange.from + padding) {
          // Re-center the view around current price
          candlestickSeriesRef.current.priceScale().setVisiblePriceRange({
            from: propCurrentPrice - buffer,
            to: propCurrentPrice + buffer,
          });
        }
      }
    } catch (e) {
      // Ignore errors if price scale is not ready
    }
    
    // Update price change
    if (priceHistory.length > 0) {
      const firstPrice = priceHistory[0].open;
      const change = propCurrentPrice - firstPrice;
      setPriceChange(change);
      setPriceChangePercent((change / firstPrice) * 100);
    }
  }, [propCurrentPrice, interval, priceHistory]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">{symbol}</h2>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-white">
              ${currentPrice?.toFixed(2) || '0.00'}
            </span>
            <span className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {['1m', '5m', '15m', '1h', '4h', '1d'].map((int) => (
            <button
              key={int}
              className={`px-3 py-1 text-sm rounded ${
                interval === int
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {int}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <div className="text-white">Loading chart data...</div>
          </div>
        )}
        <div 
          ref={chartContainerRef} 
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />
      </div>

      {/* Info Bar */}
      <div className="h-16 border-t border-gray-800 bg-gray-900 px-4 py-2">
        <div className="text-xs text-gray-500">
          Interval: {interval} | 24h Volume: ${(Math.random() * 10 + 5).toFixed(2)}B
        </div>
      </div>
    </div>
  );
};

export default PriceChart;