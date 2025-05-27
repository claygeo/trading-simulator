import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  createChart, 
  IChartApi, 
  Time, 
  CandlestickData, 
  UTCTimestamp
} from 'lightweight-charts';
import { Trade } from '../types';

interface PriceChartProps {
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  priceHistory: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }[];
  currentPrice: number;
  trades?: Trade[];
  scenarioData?: {
    phase: any;
    progress: number;
  } | null;
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  interval = '1h',
  priceHistory, 
  currentPrice, 
  trades = [],
  scenarioData
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasDataRef = useRef(false);

  // Interval to seconds mapping
  const intervalToSeconds = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400
  };

  // Format time based on interval
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    
    switch(interval) {
      case '1m':
      case '5m':
      case '15m':
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      case '1h':
      case '4h':
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }) + '\n' + date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      case '1d':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: '2-digit'
        });
      default:
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
    }
  };

  // Convert price history to candlestick data with proper time intervals
  const candlestickData = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return [];

    // First, ensure the input data is sorted
    const sortedHistory = [...priceHistory].sort((a, b) => a.time - b.time);

    const intervalSeconds = intervalToSeconds[interval];
    const aggregatedData: { [key: number]: CandlestickData } = {};

    sortedHistory.forEach(point => {
      // Convert milliseconds to seconds for lightweight-charts
      const pointTimeInSeconds = Math.floor(point.time / 1000);
      // Round timestamp to nearest interval
      const intervalTime = Math.floor(pointTimeInSeconds / intervalSeconds) * intervalSeconds;
      
      if (!aggregatedData[intervalTime]) {
        aggregatedData[intervalTime] = {
          time: intervalTime as UTCTimestamp,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close
        };
      } else {
        // Update existing candle
        aggregatedData[intervalTime].high = Math.max(aggregatedData[intervalTime].high, point.high);
        aggregatedData[intervalTime].low = Math.min(aggregatedData[intervalTime].low, point.low);
        aggregatedData[intervalTime].close = point.close;
      }
    });

    // Convert to array and ensure proper sorting
    const sortedData = Object.values(aggregatedData)
      .sort((a, b) => (a.time as number) - (b.time as number))
      .filter((candle, index, array) => {
        // Remove any duplicates
        if (index === 0) return true;
        return (candle.time as number) > (array[index - 1].time as number);
      });

    return sortedData;
  }, [priceHistory, interval]);

  // Volume data
  const volumeData = useMemo(() => {
    return candlestickData.map(candle => ({
      time: candle.time,
      value: Math.random() * 1000000 + 100000, // Simulated volume
      color: candle.close >= candle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
    }));
  }, [candlestickData]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (isInitialized) return;
    if (candlestickData.length === 0) return;

    console.log('Initializing chart...');

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { color: '#131722' },
        textColor: '#d9d9d9',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#758696',
          style: 3,
        },
        horzLine: {
          width: 1,
          color: '#758696',
          style: 3,
        },
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          const timestamp = typeof time === 'string' ? parseInt(time) : time as number;
          return formatTime(timestamp);
        },
        fixRightEdge: true,
        fixLeftEdge: false,
        rightBarStaysOnScroll: true,
        rightOffset: 12,
        minBarSpacing: 3,
      },
    });

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    
    // Set the price scale margins after adding the series
    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;
    hasDataRef.current = true;

    setIsInitialized(true);

    return () => {
      console.log('Cleaning up chart...');
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      hasDataRef.current = false;
      setIsInitialized(false);
    };
  }, []); // Empty dependency array - only run once on mount

  // Update chart data when candlestick data changes
  useEffect(() => {
    if (!isInitialized) return;
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
    if (candlestickData.length === 0) return;

    try {
      candlestickSeriesRef.current.setData(candlestickData);
      volumeSeriesRef.current.setData(volumeData);

      // Auto-scroll to the latest data
      if (chartRef.current) {
        const timeScale = chartRef.current.timeScale();
        const lastCandle = candlestickData[candlestickData.length - 1];
        const candlesToShow = Math.min(100, candlestickData.length);
        const firstVisibleCandle = candlestickData[Math.max(0, candlestickData.length - candlesToShow)];
        
        const rightPadding = intervalToSeconds[interval] * 10;
        const to = (lastCandle.time as number) + rightPadding;
        
        timeScale.setVisibleRange({
          from: firstVisibleCandle.time,
          to: to as Time,
        });
      }
    } catch (error) {
      console.error('Error updating chart data:', error);
    }
  }, [candlestickData, volumeData, interval, isInitialized]);

  // Handle real-time price updates separately
  useEffect(() => {
    if (!isInitialized) return;
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
    if (candlestickData.length === 0) return;

    const lastCandle = candlestickData[candlestickData.length - 1];
    if (!lastCandle) return;

    const currentTime = Math.floor(Date.now() / 1000);
    const intervalSeconds = intervalToSeconds[interval];
    const currentIntervalTime = Math.floor(currentTime / intervalSeconds) * intervalSeconds;

    // Only update if we're in the same interval as the last candle
    if (currentIntervalTime === (lastCandle.time as number)) {
      const updatedCandle: CandlestickData = {
        time: currentIntervalTime as UTCTimestamp,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, currentPrice),
        low: Math.min(lastCandle.low, currentPrice),
        close: currentPrice
      };

      try {
        candlestickSeriesRef.current.update(updatedCandle);
        
        volumeSeriesRef.current.update({
          time: currentIntervalTime as UTCTimestamp,
          value: Math.random() * 1000000 + 100000,
          color: currentPrice >= lastCandle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
        });
      } catch (error) {
        console.error('Error updating real-time data:', error);
      }
    }
  }, [currentPrice, interval, isInitialized]); // Removed candlestickData dependency

  // Handle window resize
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isInitialized]);

  // Add trade markers
  useEffect(() => {
    if (!isInitialized) return;
    if (!candlestickSeriesRef.current) return;
    if (!trades || trades.length === 0) {
      candlestickSeriesRef.current.setMarkers([]);
      return;
    }

    try {
      const sortedTrades = [...trades]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-50);

      const markers = sortedTrades.map(trade => ({
        time: Math.floor(trade.timestamp / 1000) as UTCTimestamp,
        position: trade.action === 'buy' ? 'belowBar' : 'aboveBar',
        color: trade.action === 'buy' ? '#26a69a' : '#ef5350',
        shape: trade.action === 'buy' ? 'arrowUp' : 'arrowDown',
        text: trade.action === 'buy' ? 'B' : 'S',
        size: 1
      }));

      candlestickSeriesRef.current.setMarkers(markers as any);
    } catch (error) {
      console.error('Error setting trade markers:', error);
    }
  }, [trades, isInitialized]);

  // Loading state
  if (candlestickData.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#131722] text-gray-400">
        <div className="text-center">
          <div className="text-lg mb-2">No data available</div>
          <div className="text-sm">Start the simulation to see price data</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* Interval indicator */}
      <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
        {interval.toUpperCase()}
      </div>
      
      {/* Current price overlay */}
      <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
        <span className="text-sm font-mono">${currentPrice.toFixed(2)}</span>
      </div>
      
      {/* Scenario indicator */}
      {scenarioData && (
        <div className="absolute top-12 right-2 bg-purple-600 bg-opacity-80 text-white px-2 py-1 rounded text-xs">
          <div>Phase: {scenarioData.phase.name}</div>
          <div>Progress: {(scenarioData.progress * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
};

export default PriceChart;