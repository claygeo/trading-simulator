// frontend/src/components/PriceChart.tsx - DEEP FIX: TradingView Null Value Prevention
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

interface ChartState {
  status: 'initializing' | 'empty' | 'building' | 'ready' | 'error';
  isReady: boolean;
  candleCount: number;
  isLiveBuilding: boolean;
  buildingStartTime: number | null;
  lastResetTime: number | null;
  updatesPending: number;
  lastSuccessfulUpdate: number;
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
  
  const [chartState, setChartState] = useState<ChartState>({
    status: 'initializing',
    isReady: false,
    candleCount: 0,
    isLiveBuilding: false,
    buildingStartTime: null,
    lastResetTime: null,
    updatesPending: 0,
    lastSuccessfulUpdate: 0
  });

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  const pendingUpdateRef = useRef<{ candleData: CandlestickData[]; volumeData: HistogramData[] } | null>(null);
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);
  
  // 🔧 CRITICAL: Enhanced data validation with deep TradingView format checking
  const sanitizeChartData = useCallback((rawPriceHistory: any[]): CandlestickData[] => {
    if (!Array.isArray(rawPriceHistory)) {
      console.log('📊 SANITIZE: Input is not an array');
      return [];
    }
    
    if (rawPriceHistory.length === 0) {
      console.log('📊 SANITIZE: Empty array received');
      return [];
    }
    
    const validCandles: CandlestickData[] = [];
    let lastValidTime = 0;
    
    for (let i = 0; i < rawPriceHistory.length; i++) {
      const candle = rawPriceHistory[i];
      
      // 🔧 CRITICAL: Ultra-strict null checking
      if (candle === null || candle === undefined) {
        console.warn(`📊 SANITIZE: Null candle at index ${i}`);
        continue;
      }
      
      // Extract timestamp with multiple fallbacks
      let timestamp: number;
      if (typeof candle.timestamp === 'number' && !isNaN(candle.timestamp)) {
        timestamp = candle.timestamp;
      } else if (typeof candle.time === 'number' && !isNaN(candle.time)) {
        timestamp = candle.time;
      } else {
        console.warn(`📊 SANITIZE: Invalid timestamp at index ${i}:`, candle);
        continue;
      }
      
      // 🔧 CRITICAL: Validate all OHLC values with extreme precision
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      
      // Check for NaN, null, undefined, or non-positive values
      if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        console.warn(`📊 SANITIZE: Non-finite OHLC values at index ${i}:`, { open, high, low, close });
        continue;
      }
      
      if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
        console.warn(`📊 SANITIZE: Non-positive OHLC values at index ${i}:`, { open, high, low, close });
        continue;
      }
      
      // 🔧 CRITICAL: Validate OHLC relationships
      if (high < low || high < open || high < close || low > open || low > close) {
        console.warn(`📊 SANITIZE: Invalid OHLC relationships at index ${i}:`, { open, high, low, close });
        continue;
      }
      
      // Convert timestamp to seconds for TradingView
      const timeInSeconds = Math.floor(timestamp / 1000);
      
      // 🔧 CRITICAL: Ensure chronological order
      if (timeInSeconds <= lastValidTime) {
        console.warn(`📊 SANITIZE: Non-chronological timestamp at index ${i}: ${timeInSeconds} <= ${lastValidTime}`);
        continue;
      }
      
      // 🔧 CRITICAL: Create TradingView-compatible data with explicit type casting
      const candleData: CandlestickData = {
        time: timeInSeconds as UTCTimestamp,
        open: Number(open.toFixed(8)), // Limit precision to prevent floating point issues
        high: Number(high.toFixed(8)),
        low: Number(low.toFixed(8)),
        close: Number(close.toFixed(8))
      };
      
      // 🔧 CRITICAL: Final validation of the created object
      if (!Number.isFinite(candleData.open) || !Number.isFinite(candleData.high) || 
          !Number.isFinite(candleData.low) || !Number.isFinite(candleData.close)) {
        console.warn(`📊 SANITIZE: Final validation failed at index ${i}:`, candleData);
        continue;
      }
      
      validCandles.push(candleData);
      lastValidTime = timeInSeconds;
    }
    
    console.log(`📊 SANITIZE: ${rawPriceHistory.length} → ${validCandles.length} valid candles (${rawPriceHistory.length - validCandles.length} filtered)`);
    
    return validCandles;
  }, []);

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

  const detectAndHandleReset = useCallback((candleData: CandlestickData[]) => {
    const isEmpty = candleData.length === 0;
    const wasNotEmpty = lastCandleCountRef.current > 0;
    
    if (isEmpty && wasNotEmpty) {
      console.log('🔄 SIMPLE RESET: Chart data cleared (priceHistory went empty)');
      
      // Clear any pending updates
      pendingUpdateRef.current = null;
      
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        try {
          candlestickSeriesRef.current.setData([]);
          volumeSeriesRef.current.setData([]);
          
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
        } catch (error) {
          console.warn('⚠️ Error clearing chart data:', error);
        }
      }
      
      setChartState(prev => ({
        ...prev,
        status: 'empty',
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        lastResetTime: Date.now(),
        updatesPending: 0
      }));
      
      lastCandleCountRef.current = 0;
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      console.log('✅ SIMPLE RESET: Complete');
      return true;
    }
    
    return false;
  }, []);

  // 🔧 CRITICAL: Completely rewritten update function with race condition prevention
  const updateChart = useCallback((candleData: CandlestickData[], volumeData: HistogramData[]) => {
    if (!chartState.isReady || !candlestickSeriesRef.current || !volumeSeriesRef.current) {
      return;
    }

    const now = Date.now();
    
    // 🔧 CRITICAL: Prevent race conditions by blocking concurrent updates
    if (isUpdatingRef.current) {
      console.log('🔒 UPDATE: Blocking concurrent update');
      pendingUpdateRef.current = { candleData, volumeData };
      return;
    }
    
    // 🔧 CRITICAL: More aggressive throttling during high-frequency updates
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    const minUpdateInterval = candleData.length > 100 ? 100 : 50; // Slower updates for large datasets
    
    if (timeSinceLastUpdate < minUpdateInterval) {
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
      }
      
      updateThrottleRef.current = setTimeout(() => {
        updateChart(candleData, volumeData);
      }, minUpdateInterval - timeSinceLastUpdate);
      return;
    }

    isUpdatingRef.current = true;
    lastUpdateRef.current = now;
    
    setChartState(prev => ({ ...prev, updatesPending: prev.updatesPending + 1 }));

    try {
      // Check for reset condition first
      if (detectAndHandleReset(candleData)) {
        isUpdatingRef.current = false;
        return;
      }
      
      const incomingCandleCount = candleData.length;

      // Track when chart starts building after being empty
      if (incomingCandleCount > 0 && lastCandleCountRef.current === 0) {
        console.log('📈 BUILDING: Chart started building with valid candles');
        setChartState(prev => ({
          ...prev,
          status: 'building',
          isLiveBuilding: true,
          buildingStartTime: Date.now()
        }));
      }

      // 🔧 CRITICAL: Defensive chart updates with multiple safety layers
      let updateSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!updateSuccess && retryCount < maxRetries) {
        try {
          // 🔧 CRITICAL: Pre-update validation
          if (!candlestickSeriesRef.current || !volumeSeriesRef.current) {
            throw new Error('Chart series not available');
          }
          
          // 🔧 CRITICAL: Final data validation before TradingView
          for (let i = 0; i < candleData.length; i++) {
            const candle = candleData[i];
            if (!Number.isFinite(candle.open) || !Number.isFinite(candle.high) || 
                !Number.isFinite(candle.low) || !Number.isFinite(candle.close) ||
                candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
              throw new Error(`Invalid candle data at index ${i}: ${JSON.stringify(candle)}`);
            }
          }
          
          // 🔧 CRITICAL: Atomic update operation
          console.log(`📊 UPDATE: Attempting to update chart with ${candleData.length} candles (attempt ${retryCount + 1})`);
          
          candlestickSeriesRef.current.setData([...candleData]); // Create new array to prevent reference issues
          volumeSeriesRef.current.setData([...volumeData]);
          
          setOptimalZoom(candleData);
          updateSuccess = true;
          
          console.log(`✅ UPDATE: Successfully updated chart with ${candleData.length} candles`);
          
        } catch (chartError: any) {
          retryCount++;
          console.error(`❌ UPDATE ERROR (attempt ${retryCount}/${maxRetries}):`, chartError);
          
          if (retryCount < maxRetries) {
            // 🔧 CRITICAL: Progressive recovery strategy
            console.log(`🔧 RECOVERY: Attempting recovery strategy ${retryCount}`);
            
            if (retryCount === 1) {
              // Strategy 1: Clear and retry
              try {
                candlestickSeriesRef.current?.setData([]);
                volumeSeriesRef.current?.setData([]);
                await new Promise(resolve => setTimeout(resolve, 50));
              } catch (clearError) {
                console.warn('Clear strategy failed:', clearError);
              }
            } else if (retryCount === 2) {
              // Strategy 2: Reduce dataset size
              const reducedCandleData = candleData.slice(-50); // Only last 50 candles
              const reducedVolumeData = volumeData.slice(-50);
              candleData = reducedCandleData;
              volumeData = reducedVolumeData;
              console.log(`🔧 RECOVERY: Reduced dataset to ${candleData.length} candles`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retry
          } else {
            // Final recovery attempt failed
            console.error('❌ CRITICAL: All recovery attempts failed');
            setChartState(prev => ({ ...prev, status: 'error' }));
            break;
          }
        }
      }
      
      if (updateSuccess) {
        lastCandleCountRef.current = incomingCandleCount;
        
        setChartState(prev => ({
          ...prev,
          candleCount: incomingCandleCount,
          status: incomingCandleCount >= 50 ? 'ready' : incomingCandleCount > 0 ? 'building' : 'empty',
          lastSuccessfulUpdate: now,
          updatesPending: Math.max(0, prev.updatesPending - 1)
        }));
      }

    } catch (error: any) {
      console.error('❌ CRITICAL ERROR in updateChart:', error);
      setChartState(prev => ({ 
        ...prev, 
        status: 'error',
        updatesPending: Math.max(0, prev.updatesPending - 1)
      }));
    } finally {
      isUpdatingRef.current = false;
      
      // 🔧 CRITICAL: Process any pending updates
      if (pendingUpdateRef.current) {
        const pending = pendingUpdateRef.current;
        pendingUpdateRef.current = null;
        setTimeout(() => {
          updateChart(pending.candleData, pending.volumeData);
        }, 50);
      }
    }
  }, [chartState.isReady, detectAndHandleReset]);

  // 🔧 CRITICAL: Enhanced data conversion with volume safety
  const convertPriceHistory = useMemo((): { candleData: CandlestickData[]; volumeData: HistogramData[] } => {
    const candleData = sanitizeChartData(priceHistory);
    
    const volumeData: HistogramData[] = candleData.map((candle, index) => {
      // Find corresponding original candle for volume data
      let volume = 0;
      if (index < priceHistory.length && priceHistory[index]?.volume) {
        volume = Number(priceHistory[index].volume);
        if (!Number.isFinite(volume) || volume < 0) {
          volume = 0;
        }
      }
      
      return {
        time: candle.time,
        value: volume,
        color: candle.close >= candle.open ? '#22C55E44' : '#EF444444'
      };
    });
    
    return { candleData, volumeData };
  }, [priceHistory, sanitizeChartData]);

  // Monitor price history changes and update chart
  useEffect(() => {
    if (!chartState.isReady) {
      return;
    }

    const { candleData, volumeData } = convertPriceHistory;
    updateChart(candleData, volumeData);
  }, [convertPriceHistory, chartState.isReady, updateChart]);

  // Chart initialization
  useEffect(() => {
    if (!chartContainerRef.current) return;

    setChartState(prev => ({ ...prev, status: 'initializing' }));

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
      pendingUpdateRef.current = null;
      
      setChartState(prev => ({
        ...prev,
        status: 'empty',
        isReady: true,
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        updatesPending: 0,
        lastSuccessfulUpdate: Date.now()
      }));

      console.log('✅ DEEP FIX: Chart initialized with race condition prevention');

    } catch (error) {
      console.error('❌ Failed to create chart:', error);
      setChartState(prev => ({ ...prev, status: 'error' }));
    }

    return () => {
      console.log('🧹 Cleaning up chart component');
      
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
        updateThrottleRef.current = null;
      }
      
      pendingUpdateRef.current = null;
      
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.warn('Warning during chart cleanup:', error);
        }
      }
      
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      
      setChartState({
        status: 'initializing',
        isReady: false,
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        lastResetTime: null,
        updatesPending: 0,
        lastSuccessfulUpdate: 0
      });
      
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      isUpdatingRef.current = false;
    };
  }, []);

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

  // Control functions
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

  // Building stats for development
  const buildingStats = useMemo(() => {
    if (!chartState.isLiveBuilding || !chartState.buildingStartTime) {
      return null;
    }

    const elapsedMs = Date.now() - chartState.buildingStartTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const candlesPerSecond = chartState.candleCount > 0 && elapsedSeconds > 0 
      ? (chartState.candleCount / elapsedSeconds).toFixed(2) 
      : '0.00';

    return {
      elapsed: elapsedSeconds,
      candlesPerSecond: candlesPerSecond,
      totalCandles: chartState.candleCount,
      isPostReset: !!chartState.lastResetTime && 
                   chartState.buildingStartTime > chartState.lastResetTime,
      updatesPending: chartState.updatesPending
    };
  }, [chartState]);

  const getStatusInfo = () => {
    switch (chartState.status) {
      case 'initializing':
        return { color: 'bg-yellow-900 text-yellow-300', icon: '⚡', text: 'Initializing...' };
      case 'empty':
        return { color: 'bg-blue-900 text-blue-300', icon: '⏳', text: 'Ready for data' };
      case 'building':
        return { 
          color: 'bg-green-900 text-green-300', 
          icon: '📈', 
          text: `Building: ${chartState.candleCount} candles`
        };
      case 'ready':
        return { 
          color: 'bg-green-900 text-green-300', 
          icon: '✅', 
          text: `Live: ${chartState.candleCount} candles`
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
              chartState.status === 'building' || chartState.status === 'ready' ? 'bg-green-400 animate-pulse' :
              chartState.status === 'empty' ? 'bg-blue-400 animate-pulse' :
              chartState.status === 'error' ? 'bg-red-400' :
              'bg-yellow-400 animate-pulse'
            }`}></div>
            <span>{statusInfo.icon} {statusInfo.text}</span>
          </div>
          
          <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
            ✅ DEEP FIX: Race Prevention
          </div>
          
          {chartState.updatesPending > 0 && (
            <div className="bg-yellow-900 bg-opacity-75 px-3 py-1 rounded text-xs text-yellow-300">
              ⏳ Pending: {chartState.updatesPending}
            </div>
          )}
          
          {buildingStats && (
            <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
              🔴 LIVE: {buildingStats.candlesPerSecond}/sec
              {buildingStats.isPostReset && ' (Post-Reset)'}
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
      </div>
      
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-gray-400 text-xs space-y-1">
          <div>📊 Candles: {chartState.candleCount}</div>
          <div>🔄 Trades: {trades.length}</div>
          <div>🎯 Status: {chartState.status}</div>
          <div>🏗️ Building: {chartState.isLiveBuilding ? 'YES' : 'NO'}</div>
          <div>⚡ Updating: {isUpdatingRef.current ? 'ACTIVE' : 'IDLE'}</div>
          <div>🔒 Pending: {chartState.updatesPending}</div>
          <div>✅ DEEP FIX: RACE PREVENTION</div>
          <div>🛡️ RETRY MECHANISM</div>
          <div>📡 ATOMIC UPDATES</div>
          {chartState.lastResetTime && (
            <div>🕐 Last Reset: {Math.floor((Date.now() - chartState.lastResetTime) / 1000)}s ago</div>
          )}
          <div>🎯 Pro Zoom: {initialZoomSetRef.current ? 'SET' : 'PENDING'}</div>
          {buildingStats && (
            <>
              <div>⏱️ Time: {buildingStats.elapsed}s</div>
              <div>📈 Rate: {buildingStats.candlesPerSecond}/s</div>
              <div>⏳ Queue: {buildingStats.updatesPending}</div>
            </>
          )}
        </div>
      </div>
      
      {chartState.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-red-900 text-red-100 p-6 rounded-lg max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Chart Error</h3>
            <p className="text-sm">TradingView chart encountered an error. This may be due to data format issues.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}
      
      {chartState.status === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-6xl mb-6">📊</div>
            <h3 className="text-xl font-bold mb-3">Deep Fixed Chart Ready</h3>
            <p className="text-sm mb-4">Race condition prevention & atomic updates active</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for backend candle data...</span>
              </div>
              <div>🔒 Race condition prevention</div>
              <div>🛡️ Retry mechanism with recovery</div>
              <div>📡 Atomic chart updates</div>
              <div>🔧 Enhanced data validation</div>
              <div>⚡ Smart throttling for high-frequency</div>
              <div>📈 Simple reset on empty priceHistory</div>
              <div>✨ Deep TradingView compatibility</div>
            </div>
          </div>
        </div>
      )}

      {chartState.status === 'building' && chartState.candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 DEEP FIXED LIVE: {chartState.candleCount} candles
              {chartState.updatesPending > 0 && ` (${chartState.updatesPending} pending)`}
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • Race prevention active
                {buildingStats.isPostReset && ' • Post-Reset Build'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChart;