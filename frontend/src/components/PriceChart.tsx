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
  const allCandlesRef = useRef<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(propCurrentPrice || null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  // Generate realistic sample data with proper timestamps
  const generateSampleData = useCallback((): PricePoint[] => {
    const data: PricePoint[] = [];
    const now = Date.now();
    const intervalMs = getIntervalMs(interval);
    const candleCount = 300;
    
    let basePrice = propCurrentPrice || 125;
    basePrice = basePrice * (0.98 + Math.random() * 0.04); // ±2% variance
    
    for (let i = candleCount - 1; i >= 0; i--) {
      const timestamp = Math.floor((now - (i * intervalMs)) / 1000);
      const alignedTimestamp = Math.floor(timestamp / (intervalMs / 1000)) * (intervalMs / 1000);
      
      const trend = Math.sin(i / 50) * (basePrice * 0.005); // 0.5% wave
      const volatility = 0.0005 + Math.random() * 0.001; // 0.05-0.15% volatility
      
      const open = basePrice + trend;
      const change = (Math.random() - 0.5) * basePrice * volatility;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.2;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.2;
      
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
    
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    
    const now = Math.floor(Date.now() / 1000);
    const alignedNow = Math.floor(now / intervalSec) * intervalSec;
    const startTime = alignedNow - (intervalSec * (targetCount - 1));
    
    let dataIndex = 0;
    let lastClose = sortedData[0]?.close || propCurrentPrice || 125;
    
    const baseVariance = lastClose * 0.0005; // 0.05% base variance
    
    for (let i = 0; i < targetCount; i++) {
      const candleTime = startTime + (i * intervalSec);
      
      let candle: PricePoint | null = null;
      while (dataIndex < sortedData.length && sortedData[dataIndex].timestamp <= candleTime) {
        if (Math.abs(sortedData[dataIndex].timestamp - candleTime) < intervalSec / 2) {
          candle = sortedData[dataIndex];
          lastClose = candle.close;
        }
        dataIndex++;
      }
      
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

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    console.log('Initializing chart with interval:', interval);

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
        mode: 0,
        autoScale: true,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12, // Keep some space on the right for new candles
        barSpacing: 6,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: true,
        borderColor: 'rgba(197, 203, 206, 0.8)',
        visible: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: false,
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

    // Prepare data
    const data = ensureEnoughCandles(priceHistory);
    console.log('Prepared data length:', data.length);

    // Convert to chart format
    const candleData = data.map(d => ({
      time: d.timestamp as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candlestickSeries.setData(candleData);
    allCandlesRef.current = [...candleData];
    
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

    // Scroll to the end to show latest data
    chart.timeScale().scrollToRealTime();
    
    // Set proper price scale to prevent god candles
    const prices = candleData.map(c => [c.high, c.low]).flat();
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    // Force a minimum visible range to prevent small moves looking huge
    const minVisibleRange = 10; // $10 minimum range
    if (priceRange < minVisibleRange) {
      const centerPrice = (maxPrice + minPrice) / 2;
      const padding = (minVisibleRange - priceRange) / 2;
      
      chart.priceScale('right').applyOptions({
        autoScale: false,
      });
      
      // Set visible range with padding
      setTimeout(() => {
        candlestickSeriesRef.current.priceScale().setVisiblePriceRange({
          from: minPrice - padding,
          to: maxPrice + padding,
        });
      }, 0);
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
  }, [priceHistory.length, interval]);

  // Update chart when current price changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !propCurrentPrice || !chartRef.current) return;
    
    setCurrentPrice(propCurrentPrice);
    
    const now = Math.floor(Date.now() / 1000);
    const intervalSec = getIntervalMs(interval) / 1000;
    const currentCandleTime = Math.floor(now / intervalSec) * intervalSec;
    
    // Check if we need to create a new candle
    const needNewCandle = !currentCandleRef.current || currentCandleRef.current.time < currentCandleTime;
    
    if (needNewCandle) {
      // Create new candle when time interval changes
      const newCandle = {
        time: currentCandleTime as Time,
        open: currentCandleRef.current ? currentCandleRef.current.close : propCurrentPrice,
        high: propCurrentPrice,
        low: propCurrentPrice,
        close: propCurrentPrice
      };
      
      // Add the new candle to our data
      allCandlesRef.current.push(newCandle);
      
      // Keep only the last 500 candles to prevent memory issues
      if (allCandlesRef.current.length > 500) {
        allCandlesRef.current = allCandlesRef.current.slice(-400);
      }
      
      // Update the entire dataset
      candlestickSeriesRef.current.setData(allCandlesRef.current);
      currentCandleRef.current = newCandle;
      
      // Scroll to show the latest candle
      chartRef.current.timeScale().scrollToRealTime();
    } else {
      // Update the current candle
      const updatedCandle = {
        time: currentCandleTime as Time,
        open: currentCandleRef.current.open,
        high: Math.max(currentCandleRef.current.high, propCurrentPrice),
        low: Math.min(currentCandleRef.current.low, propCurrentPrice),
        close: propCurrentPrice
      };
      
      // Update the last candle in our array
      allCandlesRef.current[allCandlesRef.current.length - 1] = updatedCandle;
      
      // Update just the current candle
      candlestickSeriesRef.current.update(updatedCandle);
      currentCandleRef.current = updatedCandle;
    }
    
    // Maintain proper price scale to prevent god candles
    try {
      const visibleRange = candlestickSeriesRef.current.priceScale().getVisiblePriceRange();
      if (visibleRange) {
        const currentRange = visibleRange.to - visibleRange.from;
        
        // If range is too small (making small moves look huge), expand it
        if (currentRange < 10) { // Less than $10 range
          const center = (visibleRange.to + visibleRange.from) / 2;
          candlestickSeriesRef.current.priceScale().setVisiblePriceRange({
            from: center - 5,
            to: center + 5,
          });
        }
        
        // If price is near the edge, recenter but maintain scale
        const buffer = currentRange * 0.1;
        if (propCurrentPrice > visibleRange.to - buffer || propCurrentPrice < visibleRange.from + buffer) {
          const shift = propCurrentPrice - (visibleRange.to + visibleRange.from) / 2;
          candlestickSeriesRef.current.priceScale().setVisiblePriceRange({
            from: visibleRange.from + shift,
            to: visibleRange.to + shift,
          });
        }
      }
    } catch (e) {
      // Ignore errors during scale adjustment
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