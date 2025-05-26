import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from 'lightweight-charts';
// Import the types from your project
import { PricePoint, Trade } from '../types';

interface PriceData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface PriceChartProps {
  symbol?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  websocketUrl?: string;
  initialData?: PriceData[];
  priceHistory?: PricePoint[];
  currentPrice?: number;
  trades?: Trade[];
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  symbol = 'BTC/USDT',
  interval = '15m',
  websocketUrl,
  initialData = [],
  priceHistory = [],
  currentPrice: propCurrentPrice,
  trades = []
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<any>(null); // Using 'any' to avoid complex generic typing
  const [isLoading, setIsLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(propCurrentPrice || null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  // Convert price history to candle data if provided
  const convertPriceHistoryToCandles = (priceHistory: PricePoint[], intervalMinutes: number): PriceData[] => {
    if (priceHistory.length === 0) return [];
    
    const intervalMs = intervalMinutes * 60 * 1000;
    const candles = new Map<number, PriceData>();
    
    priceHistory.forEach((point) => {
      // PricePoint has 'timestamp' property based on your types
      const timestamp = point.timestamp || point.time || Date.now();
      const price = point.close || point.price || 0;
      const candleTime = Math.floor(timestamp / intervalMs) * intervalMs;
      
      if (!candles.has(candleTime)) {
        candles.set(candleTime, {
          time: candleTime / 1000,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: point.volume || 0
        });
      } else {
        const candle = candles.get(candleTime)!;
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
        candle.close = price;
        candle.volume = (candle.volume || 0) + (point.volume || 0);
      }
    });
    
    return Array.from(candles.values()).sort((a, b) => a.time - b.time);
  };

  // Generate realistic sample data if no initial data provided
  const generateSampleData = (): PriceData[] => {
    const data: PriceData[] = [];
    const now = Date.now();
    const intervalMs = getIntervalMs(interval);
    const candleCount = 300; // Generate 300 candles
    
    let basePrice = 45000 + Math.random() * 5000; // BTC price range
    
    for (let i = candleCount - 1; i >= 0; i--) {
      const time = now - (i * intervalMs);
      const volatility = 0.002 + Math.random() * 0.003; // 0.2% to 0.5% volatility
      
      // Generate realistic OHLC data
      const open = basePrice;
      const change = (Math.random() - 0.5) * basePrice * volatility;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
      const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
      const volume = Math.random() * 1000000 + 500000;
      
      data.push({
        time: Math.floor(time / 1000),
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

  // Convert data to TradingView format
  const convertToTradingViewFormat = (data: PriceData[]): CandlestickData[] => {
    return data.map(candle => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
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
        mode: 0,
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
    let data: PriceData[] = [];
    
    if (initialData.length > 0) {
      data = initialData;
    } else if (priceHistory.length > 0) {
      // Convert price history to candle data
      const intervalMinutes = parseInt(interval.replace(/\D/g, '')) || 15;
      data = convertPriceHistoryToCandles(priceHistory, intervalMinutes);
    } else {
      // Generate sample data as fallback
      data = generateSampleData();
    }

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
      if (chartContainerRef.current) {
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
  }, [priceHistory, initialData, interval]);

  // Update current price when prop changes
  useEffect(() => {
    if (propCurrentPrice !== undefined && propCurrentPrice !== null) {
      setCurrentPrice(propCurrentPrice);
    }
  }, [propCurrentPrice]);

  // Simulate real-time updates if websocket URL provided
  useEffect(() => {
    if (!candlestickSeriesRef.current || !websocketUrl) return;

    const updateInterval = setInterval(() => {
      if (!candlestickSeriesRef.current) return;

      // Simulate real-time price update
      const lastPrice = currentPrice || 45000;
      const change = (Math.random() - 0.5) * lastPrice * 0.001; // 0.1% max change
      const newPrice = lastPrice + change;
      
      const now = Math.floor(Date.now() / 1000);
      const intervalMs = getIntervalMs(interval);
      const currentCandleTime = Math.floor(now / (intervalMs / 1000)) * (intervalMs / 1000);

      // Update the current candle
      candlestickSeriesRef.current.update({
        time: currentCandleTime as UTCTimestamp,
        open: lastPrice,
        high: Math.max(lastPrice, newPrice),
        low: Math.min(lastPrice, newPrice),
        close: newPrice
      });

      setCurrentPrice(newPrice);
      setPriceChange(newPrice - lastPrice);
      setPriceChangePercent((change / lastPrice) * 100);
    }, 1000); // Update every second

    return () => clearInterval(updateInterval);
  }, [currentPrice, interval, websocketUrl]);

  // Process trades for display if needed
  useEffect(() => {
    if (!candlestickSeriesRef.current || trades.length === 0) return;

    // You can add trade markers or volume calculations here
    // For now, just log that we received trades
    console.log(`Received ${trades.length} trades for chart display`);
  }, [trades]);

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

      {/* Volume Bar (Optional) */}
      <div className="h-20 border-t border-gray-800 bg-gray-850">
        <div className="px-4 py-2">
          <div className="text-xs text-gray-500">Volume 24h</div>
          <div className="text-sm text-white font-medium">
            {trades.length > 0 ? `${trades.length} trades` : 'No recent trades'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceChart;