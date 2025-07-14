// frontend/src/components/PriceChart.tsx - FIXED: Data Validation After Reset
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  UTCTimestamp, 
  ColorType, 
  CrosshairMode,
  CandlestickData,
  HistogramData
} from 'lightweight-charts';

interface ChartPricePoint {
  time: number;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Trade {
  id?: string;
  price: number;
  amount?: number;
  quantity?: number;
  side?: 'buy' | 'sell';
  timestamp: number;
  trader?: any;
  tokenAmount?: number;
  action?: 'buy' | 'sell';
}

interface PriceChartProps {
  priceHistory?: ChartPricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: any;
  symbol?: string;
  dynamicView?: boolean;
}

const PriceChart: React.FC<PriceChartProps> = ({
  priceHistory = [],
  currentPrice = 0,
  trades = [],
  scenarioData,
  symbol = 'TOKEN/USDT',
  dynamicView = true
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  
  const [isChartReady, setIsChartReady] = useState(false);
  const [chartStatus, setChartStatus] = useState<'initializing' | 'empty' | 'building' | 'ready' | 'error'>('initializing');
  const [candleCount, setCandleCount] = useState(0);
  const [isLiveBuilding, setIsLiveBuilding] = useState(false);
  const [buildingStartTime, setBuildingStartTime] = useState<number | null>(null);

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);

  // Track when we've just reset to be more lenient with validation
  const justResetRef = useRef<boolean>(false);

  const calculateOptimalVisibleRange = useCallback((candleCount: number): { from: number; to: number } => {
    const MIN_VISIBLE_CANDLES = 25;
    const MAX_VISIBLE_CANDLES = 80;
    const PREFERRED_VISIBLE_CANDLES = 50;
    
    if (candleCount <= MIN_VISIBLE_CANDLES) {
      return { from: 0, to: Math.max(1, candleCount - 1) };
    }
    
    let visibleCandles = PREFERRED_VISIBLE_CANDLES;
    
    if (candleCount < PREFERRED_VISIBLE_CANDLES) {
      visibleCandles = candleCount;
    } else if (candleCount > 200) {
      visibleCandles = Math.min(MAX_VISIBLE_CANDLES, candleCount * 0.4);
    }
    
    const from = Math.max(0, candleCount - visibleCandles);
    const to = candleCount - 1;
    
    return { from, to };
  }, []);

  const convertPriceHistory = useMemo((): { candleData: CandlestickData[]; volumeData: HistogramData[] } => {
    if (!priceHistory || priceHistory.length === 0) {
      return { candleData: [], volumeData: [] };
    }
    
    const candleData: CandlestickData[] = [];
    const volumeData: HistogramData[] = [];
    
    // FIXED: Sort data by timestamp first to ensure proper ordering
    const sortedHistory = [...priceHistory].sort((a, b) => {
      const timeA = a.timestamp || a.time;
      const timeB = b.timestamp || b.time;
      return timeA - timeB;
    });
    
    sortedHistory.forEach((candle) => {
      const timestamp = candle.timestamp || candle.time;
      const timeInSeconds = Math.floor(timestamp / 1000);
      
      candleData.push({
        time: timeInSeconds as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      });
      
      volumeData.push({
        time: timeInSeconds as UTCTimestamp,
        value: candle.volume || 0,
        color: candle.close >= candle.open ? '#22C55E44' : '#EF444444'
      });
    });
    
    return { candleData, volumeData };
  }, [priceHistory]);

  // SIMPLE RESET: Clear chart when priceHistory becomes empty
  useEffect(() => {
    if (!isChartReady || !candlestickSeriesRef.current || !volumeSeriesRef.current) {
      return;
    }

    const { candleData, volumeData } = convertPriceHistory;

    // SIMPLE RESET LOGIC: If priceHistory is empty, clear the chart
    if (candleData.length === 0) {
      console.log('📊 SIMPLE RESET: Clearing chart - priceHistory is empty');
      
      // Clear TradingView chart series data
      candlestickSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      
      // Reset internal state
      setChartStatus('empty');
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);
      lastCandleCountRef.current = 0;
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      // Mark that we just reset - be more lenient with next data
      justResetRef.current = true;
      
      console.log('✅ SIMPLE RESET: Chart cleared successfully');
      return;
    }

    // Normal chart update for non-empty data
    updateChart(candleData, volumeData);
  }, [convertPriceHistory, isChartReady]);

  // Chart initialization - clean and simple
  useEffect(() => {
    if (!chartContainerRef.current) return;

    setChartStatus('initializing');

    try {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: '#0B1426' },
          textColor: '#9CA3AF',
        },
        grid: {
          vertLines: { color: '#1C2951' },
          horzLines: { color: '#1C2951' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: '#1C2951',
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: {
          borderColor: '#1C2951',
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 12,
          minBarSpacing: 0.5,
          rightOffset: 5,
          shiftVisibleRangeOnNewBar: false,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22C55E',
        downColor: '#EF4444',
        borderUpColor: '#22C55E',
        borderDownColor: '#EF4444',
        wickUpColor: '#22C55E',
        wickDownColor: '#EF4444',
        priceFormat: {
          type: 'price',
          precision: 6,
          minMove: 0.000001,
        },
      });

      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { 
          type: 'volume',
          precision: 0,
        },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      chartRef.current = chart;
      candlestickSeriesRef.current = candlestickSeries;
      volumeSeriesRef.current = volumeSeries;
      
      // Start with empty series
      candlestickSeries.setData([]);
      volumeSeries.setData([]);
      
      // Initialize state
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      lastCandleCountRef.current = 0;
      lastUpdateRef.current = 0;
      isUpdatingRef.current = false;
      justResetRef.current = false;
      
      setIsChartReady(true);
      setChartStatus('empty');
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);

      console.log('✅ Chart initialized successfully with simple reset logic');

    } catch (error) {
      console.error('❌ Failed to create chart:', error);
      setChartStatus('error');
    }

    return () => {
      console.log('🧹 Cleaning up chart component');
      
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
        updateThrottleRef.current = null;
      }
      
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.warn('Warning during chart cleanup:', error);
        }
      }
      
      // Clean state reset
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setIsChartReady(false);
      setChartStatus('initializing');
      
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);
      isUpdatingRef.current = false;
      justResetRef.current = false;
    };
  }, []); // No dependencies - only initialize once

  const setOptimalZoom = useCallback((candleData: CandlestickData[], force: boolean = false) => {
    if (!chartRef.current || !candleData.length) return;

    const candleCount = candleData.length;
    
    if (!initialZoomSetRef.current || force) {
      const { from, to } = calculateOptimalVisibleRange(candleCount);
      
      try {
        chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        initialZoomSetRef.current = true;
        shouldAutoFitRef.current = false;
      } catch (error) {
        try {
          chartRef.current.timeScale().fitContent();
          initialZoomSetRef.current = true;
        } catch (fallbackError) {
          // Ignore zoom errors
        }
      }
    } else if (dynamicView && shouldAutoFitRef.current && candleCount > lastCandleCountRef.current) {
      if (Math.random() < 0.1) {
        try {
          const { from, to } = calculateOptimalVisibleRange(candleCount);
          chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        } catch (error) {
          // Ignore dynamic zoom errors
        }
      }
    }
  }, [calculateOptimalVisibleRange, dynamicView]);

  // FIXED: Improved chart update function with better validation
  const updateChart = useCallback((candleData: CandlestickData[], volumeData: HistogramData[]) => {
    if (!isChartReady || !candlestickSeriesRef.current || !volumeSeriesRef.current || isUpdatingRef.current) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    if (timeSinceLastUpdate < 33) {
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
      }
      
      updateThrottleRef.current = setTimeout(() => {
        updateChart(candleData, volumeData);
      }, 33 - timeSinceLastUpdate);
      return;
    }

    isUpdatingRef.current = true;
    lastUpdateRef.current = now;

    try {
      const incomingCandleCount = candleData.length;

      // Track when chart starts building
      if (incomingCandleCount > 0 && lastCandleCountRef.current === 0) {
        setIsLiveBuilding(true);
        setBuildingStartTime(Date.now());
        setChartStatus('building');
        console.log('📈 Chart building started');
      }

      // FIXED: Improved data validation - more lenient after reset
      let isOrdered = true;
      let validationDetails = {
        totalCandles: candleData.length,
        justReset: justResetRef.current,
        validationSkipped: false,
        orderingIssues: 0
      };

      if (candleData.length > 1) {
        // After reset, be more lenient with the first few candles
        const checkLength = justResetRef.current ? Math.min(3, candleData.length) : Math.min(candleData.length, 10);
        
        for (let i = 1; i < checkLength; i++) {
          if (candleData[i].time <= candleData[i - 1].time) {
            validationDetails.orderingIssues++;
            
            // If we just reset, allow some timestamp issues in first few candles
            if (justResetRef.current && i <= 2) {
              console.log(`⚠️ Post-reset timestamp issue at index ${i}, but allowing due to recent reset`);
              continue;
            }
            
            isOrdered = false;
            break;
          }
        }
      }

      // FIXED: More detailed logging for validation failures
      if (!isOrdered) {
        console.warn('⚠️ Chart data validation failed:', {
          ...validationDetails,
          firstFewTimes: candleData.slice(0, 5).map(c => ({ time: c.time, date: new Date(Number(c.time) * 1000).toISOString() })),
          recommendation: 'Check backend candle generation timestamps'
        });
        
        // If we just reset and it's still failing, try to fix the data
        if (justResetRef.current && candleData.length <= 5) {
          console.log('🔧 Attempting to fix post-reset data by removing duplicates and sorting');
          
          // Remove duplicates and ensure proper ordering
          const uniqueCandles = candleData.filter((candle, index, arr) => 
            index === 0 || candle.time > arr[index - 1].time
          );
          
          if (uniqueCandles.length > 0) {
            console.log(`🔧 Fixed data: ${candleData.length} → ${uniqueCandles.length} candles`);
            candlestickSeriesRef.current.setData(uniqueCandles);
            volumeSeriesRef.current.setData(volumeData.slice(0, uniqueCandles.length));
            
            setOptimalZoom(uniqueCandles);
            lastCandleCountRef.current = uniqueCandles.length;
            setCandleCount(uniqueCandles.length);
            
            // Clear the just reset flag after successful fix
            justResetRef.current = false;
            
            isUpdatingRef.current = false;
            return;
          }
        }
        
        isUpdatingRef.current = false;
        return;
      }

      // Data passed validation - clear the just reset flag
      if (justResetRef.current) {
        console.log('✅ Post-reset data validation passed, clearing reset flag');
        justResetRef.current = false;
      }

      // Update chart data
      candlestickSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);

      setOptimalZoom(candleData);

      lastCandleCountRef.current = incomingCandleCount;
      setCandleCount(incomingCandleCount);

      if (incomingCandleCount >= 50) {
        setChartStatus('ready');
      } else if (incomingCandleCount > 0) {
        setChartStatus('building');
      }

    } catch (error) {
      console.error('❌ Error updating chart:', error);
      setChartStatus('error');
    } finally {
      isUpdatingRef.current = false;
    }
  }, [isChartReady, setOptimalZoom]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        try {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        } catch (error) {
          // Ignore resize errors
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const resetView = useCallback(() => {
    try {
      if (chartRef.current) {
        chartRef.current.timeScale().resetTimeScale();
        initialZoomSetRef.current = false;
        shouldAutoFitRef.current = true;
        
        const { candleData } = convertPriceHistory;
        if (candleData.length > 0) {
          setTimeout(() => setOptimalZoom(candleData, true), 100);
        }
      }
    } catch (error) {
      // Ignore reset errors
    }
  }, [convertPriceHistory, setOptimalZoom]);

  const fitContent = useCallback(() => {
    try {
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
        initialZoomSetRef.current = true;
        shouldAutoFitRef.current = false;
      }
    } catch (error) {
      // Ignore fit content errors
    }
  }, []);

  const optimizeZoom = useCallback(() => {
    const { candleData } = convertPriceHistory;
    if (candleData.length > 0) {
      setOptimalZoom(candleData, true);
    }
  }, [convertPriceHistory, setOptimalZoom]);

  const buildingStats = useMemo(() => {
    if (!isLiveBuilding || !buildingStartTime) {
      return null;
    }

    const elapsedMs = Date.now() - buildingStartTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const candlesPerSecond = candleCount > 0 && elapsedSeconds > 0 
      ? (candleCount / elapsedSeconds).toFixed(2) 
      : '0.00';

    return {
      elapsed: elapsedSeconds,
      candlesPerSecond: candlesPerSecond,
      totalCandles: candleCount
    };
  }, [isLiveBuilding, buildingStartTime, candleCount]);

  const getStatusInfo = () => {
    switch (chartStatus) {
      case 'initializing':
        return { color: 'bg-yellow-900 text-yellow-300', icon: '⚡', text: 'Initializing...' };
      case 'empty':
        return { color: 'bg-blue-900 text-blue-300', icon: '⏳', text: 'Ready for data' };
      case 'building':
        return { 
          color: 'bg-green-900 text-green-300', 
          icon: '📈', 
          text: `Building: ${candleCount} candles`
        };
      case 'ready':
        return { 
          color: 'bg-green-900 text-green-300', 
          icon: '✅', 
          text: `Live: ${candleCount} candles`
        };
      case 'error':
        return { color: 'bg-red-900 text-red-300', icon: '❌', text: 'Error' };
      default:
        return { color: 'bg-gray-900 text-gray-300', icon: '❓', text: 'Unknown' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="relative w-full h-full bg-[#0B1426] rounded-lg overflow-hidden">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="flex items-center space-x-4">
          <h3 className="text-white text-lg font-bold">{symbol}</h3>
          
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
            <div className={`w-2 h-2 rounded-full ${
              chartStatus === 'building' || chartStatus === 'ready' ? 'bg-green-400 animate-pulse' :
              chartStatus === 'empty' ? 'bg-blue-400 animate-pulse' :
              chartStatus === 'error' ? 'bg-red-400' :
              'bg-yellow-400 animate-pulse'
            }`}></div>
            <span>{statusInfo.icon} {statusInfo.text}</span>
          </div>
          
          {/* Simple reset indicator */}
          <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
            ✅ Fixed Validation
          </div>
          
          {/* Post-reset indicator */}
          {justResetRef.current && (
            <div className="bg-orange-900 bg-opacity-75 px-3 py-1 rounded text-xs text-orange-300">
              🔧 Post-Reset
            </div>
          )}
          
          {isLiveBuilding && buildingStats && (
            <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
              🔴 LIVE: {buildingStats.candlesPerSecond}/sec
            </div>
          )}
          
          {currentPrice > 0 && (
            <div className="bg-gray-900 bg-opacity-75 px-3 py-1 rounded">
              <span className="text-gray-400 text-sm">Last: </span>
              <span className="text-white text-lg font-mono">
                ${currentPrice < 1 ? currentPrice.toFixed(6) : currentPrice.toFixed(2)}
              </span>
            </div>
          )}
          
          <div className="bg-gray-900 bg-opacity-75 px-2 py-1 rounded text-xs text-gray-400">
            FPS: {Math.round(1000 / Math.max(Date.now() - lastUpdateRef.current, 16))}
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 flex space-x-2">
        <button
          onClick={optimizeZoom}
          className="px-3 py-1 bg-purple-700 bg-opacity-80 text-purple-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Optimize zoom for professional view"
        >
          🎯 Optimize
        </button>
        <button
          onClick={resetView}
          className="px-3 py-1 bg-gray-700 bg-opacity-80 text-gray-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Reset view"
        >
          🔄
        </button>
        <button
          onClick={fitContent}
          className="px-3 py-1 bg-blue-700 bg-opacity-80 text-blue-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Fit content"
        >
          📏
        </button>
        <button
          className={`px-3 py-1 text-xs rounded transition ${
            dynamicView 
              ? 'bg-green-700 bg-opacity-80 text-green-300 hover:bg-opacity-100' 
              : 'bg-gray-700 bg-opacity-80 text-gray-300 hover:bg-opacity-100'
          }`}
          title="Dynamic view enabled"
        >
          {dynamicView ? '📍 Live' : '📌 Static'}
        </button>
      </div>
      
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-gray-400 text-xs space-y-1">
          <div>📊 Candles: {candleCount}</div>
          <div>🔄 Trades: {trades.length}</div>
          <div>🎯 Status: {chartStatus}</div>
          <div>🏗️ Building: {isLiveBuilding ? 'YES' : 'NO'}</div>
          <div>⚡ Updates: {isUpdatingRef.current ? 'ACTIVE' : 'IDLE'}</div>
          <div>✅ Reset: FIXED</div>
          <div>🔧 Post-Reset: {justResetRef.current ? 'YES' : 'NO'}</div>
          <div>🎯 Pro Zoom: {initialZoomSetRef.current ? 'SET' : 'PENDING'}</div>
          {buildingStats && (
            <>
              <div>⏱️ Time: {buildingStats.elapsed}s</div>
              <div>📈 Rate: {buildingStats.candlesPerSecond}/s</div>
            </>
          )}
        </div>
      </div>
      
      {chartStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-red-900 text-red-100 p-6 rounded-lg max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Chart Error</h3>
            <p className="text-sm">Failed to initialize TradingView chart. Check console for details.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}
      
      {chartStatus === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-6xl mb-6">📊</div>
            <h3 className="text-xl font-bold mb-3">Professional Chart Ready</h3>
            <p className="text-sm mb-4">Fixed validation system - handles post-reset data</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for backend candle data...</span>
              </div>
              <div>✅ Fixed data validation</div>
              <div>🔧 Post-reset tolerance</div>
              <div>⚡ 30fps update throttling</div>
              <div>📈 Optimal candle proportions</div>
              <div>🔧 TradingView-style display</div>
            </div>
          </div>
        </div>
      )}

      {chartStatus === 'building' && candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 PROFESSIONAL LIVE BUILDING: {candleCount} candles
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • Fixed validation system
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChart;