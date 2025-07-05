// frontend/src/components/PriceChart.tsx - FIXED CHART ZOOM & PROPER CANDLE PROPORTIONS
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

  // Performance optimization refs
  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  
  // FIXED: Chart zoom state management
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);

  // Track chart state for clean start verification
  const chartState = useRef({
    lastCandleCount: 0,
    hasEverHadData: false,
    buildStarted: false,
    initialRenderComplete: false
  });

  // FIXED: Professional candle width calculation
  const calculateOptimalVisibleRange = useCallback((candleCount: number): { from: number; to: number } => {
    // Professional trading chart standards:
    // - Show 50-100 candles for optimal viewing
    // - Maintain consistent candle width regardless of total count
    // - Similar to TradingView's default zoom level
    
    const MIN_VISIBLE_CANDLES = 25;  // Minimum for meaningful view
    const MAX_VISIBLE_CANDLES = 80;  // Maximum for readable candles
    const PREFERRED_VISIBLE_CANDLES = 50; // Ideal candle count
    
    if (candleCount <= MIN_VISIBLE_CANDLES) {
      // Show all candles if we have very few
      return { from: 0, to: Math.max(1, candleCount - 1) };
    }
    
    let visibleCandles = PREFERRED_VISIBLE_CANDLES;
    
    // Adjust based on candle count
    if (candleCount < PREFERRED_VISIBLE_CANDLES) {
      visibleCandles = candleCount;
    } else if (candleCount > 200) {
      // For many candles, show slightly more for context
      visibleCandles = Math.min(MAX_VISIBLE_CANDLES, candleCount * 0.4);
    }
    
    // Always show the most recent candles
    const from = Math.max(0, candleCount - visibleCandles);
    const to = candleCount - 1;
    
    console.log(`📊 Optimal view: showing ${visibleCandles} candles (${from} to ${to}) out of ${candleCount} total`);
    
    return { from, to };
  }, []);

  // OPTIMIZED: Throttled chart data converter
  const convertPriceHistory = useMemo((): { candleData: CandlestickData[]; volumeData: HistogramData[] } => {
    if (!priceHistory || priceHistory.length === 0) {
      return { candleData: [], volumeData: [] };
    }
    
    const candleData: CandlestickData[] = [];
    const volumeData: HistogramData[] = [];
    
    priceHistory.forEach((candle) => {
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

  // Create chart instance
  useEffect(() => {
    if (!chartContainerRef.current) return;

    console.log('🚀 Creating professional chart with fixed zoom...');
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
          // FIXED: Proper time scale options for consistent candle width
          barSpacing: 12, // Optimal candle spacing (6-20 range)
          minBarSpacing: 0.5, // Minimum spacing to prevent over-compression
          rightOffset: 5, // Small right margin
          shiftVisibleRangeOnNewBar: false, // Prevent auto-shifting that causes zoom issues
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

      // Create candlestick series with professional styling
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

      // Create volume series
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

      // Store references
      chartRef.current = chart;
      candlestickSeriesRef.current = candlestickSeries;
      volumeSeriesRef.current = volumeSeries;
      
      // Start with empty chart
      candlestickSeries.setData([]);
      volumeSeries.setData([]);
      
      // Reset zoom state
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      // Reset state
      chartState.current = {
        lastCandleCount: 0,
        hasEverHadData: false,
        buildStarted: false,
        initialRenderComplete: true
      };
      
      lastCandleCountRef.current = 0;
      lastUpdateRef.current = 0;
      
      setIsChartReady(true);
      setChartStatus('empty');
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);
      
      console.log('✅ Professional chart created with fixed zoom settings');

    } catch (error) {
      console.error('❌ Failed to create chart:', error);
      setChartStatus('error');
    }

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up chart...');
      
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
        updateThrottleRef.current = null;
      }
      
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.warn('Chart cleanup warning:', error);
        }
      }
      
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setIsChartReady(false);
      setChartStatus('initializing');
      
      // Reset all state
      chartState.current = {
        lastCandleCount: 0,
        hasEverHadData: false,
        buildStarted: false,
        initialRenderComplete: false
      };
      
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);
      isUpdatingRef.current = false;
    };
  }, []); // Only create once

  // FIXED: Professional chart zoom management
  const setOptimalZoom = useCallback((candleData: CandlestickData[], force: boolean = false) => {
    if (!chartRef.current || !candleData.length) return;

    const candleCount = candleData.length;
    
    // Set initial zoom only once, or if forced (reset)
    if (!initialZoomSetRef.current || force) {
      console.log(`🎯 Setting initial professional zoom for ${candleCount} candles...`);
      
      const { from, to } = calculateOptimalVisibleRange(candleCount);
      
      try {
        // Set the optimal visible range for professional appearance
        chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        
        initialZoomSetRef.current = true;
        shouldAutoFitRef.current = false; // Disable auto-fit after manual zoom
        
        console.log(`✅ Professional zoom set: showing candles ${from} to ${to}`);
      } catch (error) {
        console.warn('Initial zoom setting failed:', error);
        // Fallback to fit content
        try {
          chartRef.current.timeScale().fitContent();
          initialZoomSetRef.current = true;
        } catch (fallbackError) {
          console.warn('Fallback zoom failed:', fallbackError);
        }
      }
    } else if (dynamicView && shouldAutoFitRef.current && candleCount > lastCandleCountRef.current) {
      // Only do subtle adjustments for new candles in dynamic view
      if (Math.random() < 0.1) { // Throttle to 10% of updates
        try {
          const { from, to } = calculateOptimalVisibleRange(candleCount);
          chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        } catch (error) {
          console.warn('Dynamic zoom adjustment failed:', error);
        }
      }
    }
  }, [calculateOptimalVisibleRange, dynamicView]);

  // OPTIMIZED: Throttled chart update function
  const updateChart = useCallback((candleData: CandlestickData[], volumeData: HistogramData[]) => {
    if (!isChartReady || !candlestickSeriesRef.current || !volumeSeriesRef.current || isUpdatingRef.current) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    // Throttle updates to max 30fps for performance
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
      
      console.log(`📊 Chart update: ${incomingCandleCount} candles`);

      // Handle empty state
      if (incomingCandleCount === 0) {
        console.log('🎯 Empty state: clearing chart');
        candlestickSeriesRef.current.setData([]);
        volumeSeriesRef.current.setData([]);
        
        setChartStatus('empty');
        setCandleCount(0);
        setIsLiveBuilding(false);
        setBuildingStartTime(null);
        
        chartState.current.lastCandleCount = 0;
        chartState.current.buildStarted = false;
        lastCandleCountRef.current = 0;
        initialZoomSetRef.current = false; // Reset zoom state
        shouldAutoFitRef.current = true;
        
        isUpdatingRef.current = false;
        return;
      }

      // Handle first data
      if (incomingCandleCount > 0 && lastCandleCountRef.current === 0) {
        console.log('🚀 First candles received - starting professional live build');
        
        if (!chartState.current.hasEverHadData) {
          chartState.current.hasEverHadData = true;
          chartState.current.buildStarted = true;
          setIsLiveBuilding(true);
          setBuildingStartTime(Date.now());
          setChartStatus('building');
        }
      }

      // Handle reset detection
      if (incomingCandleCount < lastCandleCountRef.current) {
        console.log('🔄 Reset detected - clearing chart and zoom state');
        candlestickSeriesRef.current.setData([]);
        volumeSeriesRef.current.setData([]);
        
        setChartStatus('empty');
        setCandleCount(0);
        setIsLiveBuilding(false);
        setBuildingStartTime(null);
        
        chartState.current.lastCandleCount = 0;
        chartState.current.buildStarted = false;
        chartState.current.hasEverHadData = false;
        lastCandleCountRef.current = 0;
        initialZoomSetRef.current = false; // FIXED: Reset zoom on reset
        shouldAutoFitRef.current = true;
        
        isUpdatingRef.current = false;
        return;
      }

      // Validate data ordering (quick check)
      let isOrdered = true;
      if (candleData.length > 1) {
        for (let i = 1; i < Math.min(candleData.length, 10); i++) {
          if (candleData[i].time <= candleData[i - 1].time) {
            isOrdered = false;
            console.error(`❌ Data ordering issue at index ${i}`);
            break;
          }
        }
      }

      if (!isOrdered) {
        console.error('💥 Chart data not ordered - skipping update');
        isUpdatingRef.current = false;
        return;
      }

      // Apply data efficiently
      candlestickSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);

      // FIXED: Apply professional zoom management
      setOptimalZoom(candleData);

      // Update state
      chartState.current.lastCandleCount = incomingCandleCount;
      lastCandleCountRef.current = incomingCandleCount;
      setCandleCount(incomingCandleCount);

      // Update status
      if (incomingCandleCount >= 50) {
        setChartStatus('ready');
      } else if (incomingCandleCount > 0) {
        setChartStatus('building');
      }

      console.log(`✅ Professional chart updated: ${candleData.length} candles with optimal zoom`);

    } catch (error) {
      console.error('❌ Error updating chart:', error);
      setChartStatus('error');
    } finally {
      isUpdatingRef.current = false;
    }
  }, [isChartReady, setOptimalZoom]);

  // OPTIMIZED: Chart data update effect
  useEffect(() => {
    const { candleData, volumeData } = convertPriceHistory;
    updateChart(candleData, volumeData);
  }, [convertPriceHistory, updateChart]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        try {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        } catch (error) {
          console.warn('Resize failed:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // FIXED: Enhanced control functions
  const resetView = useCallback(() => {
    try {
      if (chartRef.current) {
        chartRef.current.timeScale().resetTimeScale();
        // Reset zoom state to allow re-optimization
        initialZoomSetRef.current = false;
        shouldAutoFitRef.current = true;
        
        // Reapply optimal zoom if we have data
        const { candleData } = convertPriceHistory;
        if (candleData.length > 0) {
          setTimeout(() => setOptimalZoom(candleData, true), 100);
        }
        
        console.log('🔄 Chart view reset with professional zoom');
      }
    } catch (error) {
      console.warn('Reset view failed:', error);
    }
  }, [convertPriceHistory, setOptimalZoom]);

  const fitContent = useCallback(() => {
    try {
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
        // Mark that manual fitting was done
        initialZoomSetRef.current = true;
        shouldAutoFitRef.current = false;
        console.log('📏 Chart content fitted manually');
      }
    } catch (error) {
      console.warn('Fit content failed:', error);
    }
  }, []);

  const optimizeZoom = useCallback(() => {
    const { candleData } = convertPriceHistory;
    if (candleData.length > 0) {
      setOptimalZoom(candleData, true);
      console.log('🎯 Professional zoom optimization applied');
    }
  }, [convertPriceHistory, setOptimalZoom]);

  // Calculate building stats
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

  // Status indicator
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
      {/* Chart container */}
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* Status overlay */}
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="flex items-center space-x-4">
          <h3 className="text-white text-lg font-bold">{symbol}</h3>
          
          {/* Enhanced status indicator */}
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
            <div className={`w-2 h-2 rounded-full ${
              chartStatus === 'building' || chartStatus === 'ready' ? 'bg-green-400 animate-pulse' :
              chartStatus === 'empty' ? 'bg-blue-400 animate-pulse' :
              chartStatus === 'error' ? 'bg-red-400' :
              'bg-yellow-400 animate-pulse'
            }`}></div>
            <span>{statusInfo.icon} {statusInfo.text}</span>
          </div>
          
          {/* FIXED: Professional zoom indicator */}
          <div className="bg-purple-900 bg-opacity-75 px-3 py-1 rounded text-xs text-purple-300">
            🎯 Pro Zoom
          </div>
          
          {/* Live building indicator */}
          {isLiveBuilding && buildingStats && (
            <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
              🔴 LIVE: {buildingStats.candlesPerSecond}/sec
            </div>
          )}
          
          {/* Current price */}
          {currentPrice > 0 && (
            <div className="bg-gray-900 bg-opacity-75 px-3 py-1 rounded">
              <span className="text-gray-400 text-sm">Last: </span>
              <span className="text-white text-lg font-mono">
                ${currentPrice < 1 ? currentPrice.toFixed(6) : currentPrice.toFixed(2)}
              </span>
            </div>
          )}
          
          {/* Performance indicator */}
          <div className="bg-gray-900 bg-opacity-75 px-2 py-1 rounded text-xs text-gray-400">
            FPS: {Math.round(1000 / Math.max(Date.now() - lastUpdateRef.current, 16))}
          </div>
        </div>
      </div>
      
      {/* FIXED: Enhanced controls with zoom optimization */}
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
      
      {/* Chart info */}
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-gray-400 text-xs space-y-1">
          <div>📊 Candles: {candleCount}</div>
          <div>🔄 Trades: {trades.length}</div>
          <div>🎯 Status: {chartStatus}</div>
          <div>🏗️ Building: {isLiveBuilding ? 'YES' : 'NO'}</div>
          <div>⚡ Updates: {isUpdatingRef.current ? 'ACTIVE' : 'IDLE'}</div>
          <div>🎯 Pro Zoom: {initialZoomSetRef.current ? 'SET' : 'PENDING'}</div>
          {buildingStats && (
            <>
              <div>⏱️ Time: {buildingStats.elapsed}s</div>
              <div>📈 Rate: {buildingStats.candlesPerSecond}/s</div>
            </>
          )}
        </div>
      </div>
      
      {/* Error state */}
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
      
      {/* Empty state */}
      {chartStatus === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-6xl mb-6">📊</div>
            <h3 className="text-xl font-bold mb-3">Professional Chart Ready</h3>
            <p className="text-sm mb-4">Fixed zoom with optimal candle proportions</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for backend candle data...</span>
              </div>
              <div>🎯 Professional zoom management</div>
              <div>⚡ 30fps update throttling</div>
              <div>📈 Optimal candle proportions</div>
              <div>🔧 TradingView-style display</div>
            </div>
          </div>
        </div>
      )}

      {/* Building state */}
      {chartStatus === 'building' && candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 PROFESSIONAL LIVE BUILDING: {candleCount} candles
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • Pro zoom active
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChart;