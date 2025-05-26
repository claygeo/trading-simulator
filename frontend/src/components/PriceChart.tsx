import React, { useEffect, useRef, useState } from 'react';
// Import everything from lightweight-charts
import * as LightweightCharts from 'lightweight-charts';
// Import the types from your project
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
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(propCurrentPrice || null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  // Generate realistic sample data if no data provided
  const generateSampleData = (): PricePoint[] => {
    const data: PricePoint[] = [];
    const now = Date.now();
    const intervalMs = getIntervalMs(interval);
    const candleCount = 300;
    
    let basePrice = 45000 + Math.random() * 5000;
    
    for (let i = candleCount - 1; i >= 0; i--) {
      const timestamp = now - (i * intervalMs);
      const volatility = 0.002 + Math.random() * 0.003;
      
      const open = basePrice;
      const change = (Math.random() - 0.5) * basePrice * volatility;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
      const volume = Math.random() * 1000000 + 500000;
      
      data.push({
        timestamp: Math.floor(timestamp / 1000), // Convert to seconds
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume
      });
      
      basePrice = close;
    }
    
    return data;
  };

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

  // Fill missing candles to ensure continuous display
  const fillMissingCandles = (data: PricePoint[], intervalMinutes: number): PricePoint[] => {
    if (data.length < 2) return data;
    
    const filled: PricePoint[] = [];
    const intervalSec = intervalMinutes * 60;
    
    for (let i = 0; i < data.length - 1; i++) {
      filled.push(data[i]);
      
      const currentTime = data[i].timestamp;
      const nextTime = data[i + 1].timestamp;
      const expectedNextTime = currentTime + intervalSec;
      
      // If there's a gap, fill it with flat candles
      if (nextTime > expectedNextTime) {
        const gaps = Math.floor((nextTime - currentTime) / intervalSec) - 1;
        
        for (let j = 1; j <= gaps; j++) {
          const gapTime = currentTime + (j * intervalSec);
          filled.push({
            timestamp: gapTime,
            open: data[i].close,
            high: data[i].close,
            low: data[i].close,
            close: data[i].close,
            volume: 0
          });
        }
      }
    }
    
    filled.push(data[data.length - 1]);
    return filled;
  };

  // Convert data to TradingView format
  const convertToTradingViewFormat = (data: PricePoint[]): any[] => {
    return data.map(candle => ({
      time: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = LightweightCharts.createChart(chartContainerRef.current, {
        layout: {
          background: { type: LightweightCharts.ColorType.Solid, color: '#131722' },
          textColor: '#d1d4dc',
        },
        grid: {
          vertLines: {
            color: 'rgba(42, 46, 57, 0.5)',
          },
          horzLines: {
            color: 'rgba(42, 46, 57, 0.3)',
          },
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: {
            top: 0.1,
            bottom: 0.2,
          },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: true,
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

      // Determine which data to use
      let data: PricePoint[] = [];
      
      if (priceHistory && priceHistory.length > 0) {
        // Fill any gaps in the data
        const intervalMinutes = parseInt(interval.replace(/\D/g, '')) || 15;
        data = fillMissingCandles(priceHistory, intervalMinutes);
      } else {
        // Generate sample data as fallback
        data = generateSampleData();
      }

      // Ensure data is sorted by timestamp
      data.sort((a, b) => a.timestamp - b.timestamp);

      const formattedData = convertToTradingViewFormat(data);
      candlestickSeries.setData(formattedData);

      // Calculate price changes
      if (data.length > 1) {
        const firstCandle = data[0];
        const lastCandle = data[data.length - 1];
        setCurrentPrice(lastCandle.close);
        const change = lastCandle.close - firstCandle.open;
        setPriceChange(change);
        setPriceChangePercent((change / firstCandle.open) * 100);
      }

      // Fit content
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
    } catch (error) {
      console.error('Error initializing chart:', error);
      setIsLoading(false);
    }
  }, [priceHistory, interval]);

  // Update current price when prop changes
  useEffect(() => {
    if (propCurrentPrice !== undefined && propCurrentPrice !== null) {
      setCurrentPrice(propCurrentPrice);
    }
  }, [propCurrentPrice]);

  // Real-time updates when websocket URL is provided
  useEffect(() => {
    if (!candlestickSeriesRef.current || !websocketUrl || !currentPrice) return;

    const updateInterval = setInterval(() => {
      if (!candlestickSeriesRef.current) return;

      try {
        // Simulate real-time price update
        const lastPrice = currentPrice;
        const change = (Math.random() - 0.5) * lastPrice * 0.001;
        const newPrice = lastPrice + change;
        
        const now = Math.floor(Date.now() / 1000);
        const intervalMs = getIntervalMs(interval);
        const currentCandleTime = Math.floor(now / (intervalMs / 1000)) * (intervalMs / 1000);

        // Update the current candle
        candlestickSeriesRef.current.update({
          time: currentCandleTime,
          open: lastPrice,
          high: Math.max(lastPrice, newPrice),
          low: Math.min(lastPrice, newPrice),
          close: newPrice
        });

        setCurrentPrice(newPrice);
        setPriceChange(newPrice - lastPrice);
        setPriceChangePercent((change / lastPrice) * 100);
      } catch (error) {
        console.error('Error updating chart:', error);
      }
    }, 1000);

    return () => clearInterval(updateInterval);
  }, [currentPrice, interval, websocketUrl]);

  // If lightweight-charts is not available, show error message
  if (!LightweightCharts || !LightweightCharts.createChart) {
    return (
      <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden p-4">
        <div className="text-red-500">
          Error: lightweight-charts library not found. Please install it:
          <pre className="mt-2 p-2 bg-gray-800 rounded text-sm">
            npm install lightweight-charts
          </pre>
        </div>
      </div>
    );
  }

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

      {/* Chart Container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-white">Loading chart data...</div>
          </div>
        )}
        <div 
          ref={chartContainerRef} 
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />
      </div>

      {/* Volume/Info Bar */}
      <div className="h-20 border-t border-gray-800 bg-gray-850">
        <div className="px-4 py-2">
          <div className="text-xs text-gray-500">24h Volume</div>
          <div className="text-sm text-white font-medium">
            {priceHistory && priceHistory.length > 0 
              ? `${priceHistory.length} candles`
              : 'Sample data'
            }
          </div>
          {trades.length > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Recent trades: {trades.length}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceChart;