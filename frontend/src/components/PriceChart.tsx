// frontend/src/components/PriceChart.tsx - FIXED: Enhanced Data Validation
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
  validationErrors: number;
  lastErrorTime: number | null;
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
    validationErrors: 0,
    lastErrorTime: null
  });

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);
  const lastValidDataRef = useRef<CandlestickData[]>([]);

  // FIXED: Enhanced data validation for TradingView Charts
  const validateChartData = useCallback((backendPriceHistory: any[]): { isValid: boolean; candleData: CandlestickData[]; errors: string[] } => {
    const errors: string[] = [];
    
    // FIXED: Check if data exists and is array
    if (!Array.isArray(backendPriceHistory)) {
      errors.push('Price history is not an array');
      return { isValid: false, candleData: [], errors };
    }
    
    if (backendPriceHistory.length === 0) {
      console.log('📊 CHART: Waiting for price history data...');
      return { isValid: false, candleData: [], errors: ['No price history data'] };
    }
    
    const validCandles: CandlestickData[] = [];
    let lastValidTime = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < backendPriceHistory.length; i++) {
      const candle = backendPriceHistory[i];
      
      // FIXED: Strict null/undefined checking
      if (!candle || typeof candle !== 'object') {
        skippedCount++;
        continue;
      }
      
      // FIXED: Enhanced timestamp validation
      const timestamp = candle.timestamp || candle.time;
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
        skippedCount++;
        continue;
      }
      
      // FIXED: Convert to seconds with proper rounding for TradingView
      const timeInSeconds = Math.floor(timestamp / 1000);
      
      // FIXED: Ensure chronological order (TradingView requirement)
      if (timeInSeconds <= lastValidTime) {
        skippedCount++;
        continue;
      }
      
      // FIXED: Enhanced OHLC validation
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      
      // FIXED: Check for any invalid numbers
      if (!Number.isFinite(open) || !Number.isFinite(high) || 
          !Number.isFinite(low) || !Number.isFinite(close)) {
        skippedCount++;
        continue;
      }
      
      // FIXED: Check for negative or zero values
      if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
        skippedCount++;
        continue;
      }
      
      // FIXED: Check for NaN values explicitly
      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
        skippedCount++;
        continue;
      }
      
      // FIXED: Validate OHLC relationships
      if (high < low || high < open || high < close || low > open || low > close) {
        skippedCount++;
        continue;
      }
      
      // FIXED: Round values to prevent floating point issues
      const roundedOpen = Number(open.toFixed(8));
      const roundedHigh = Number(high.toFixed(8));
      const roundedLow = Number(low.toFixed(8));
      const roundedClose = Number(close.toFixed(8));
      
      // FIXED: Final validation after rounding
      if (!Number.isFinite(roundedOpen) || !Number.isFinite(roundedHigh) || 
          !Number.isFinite(roundedLow) || !Number.isFinite(roundedClose)) {
        skippedCount++;
        continue;
      }
      
      // FIXED: Create TradingView-compatible candle with explicit type casting
      const tradingViewCandle: CandlestickData = {
        time: timeInSeconds as UTCTimestamp,
        open: roundedOpen,
        high: roundedHigh,
        low: roundedLow,
        close: roundedClose
      };
      
      // FIXED: Final object validation
      if (typeof tradingViewCandle.time !== 'number' || 
          typeof tradingViewCandle.open !== 'number' ||
          typeof tradingViewCandle.high !== 'number' ||
          typeof tradingViewCandle.low !== 'number' ||
          typeof tradingViewCandle.close !== 'number') {
        skippedCount++;
        continue;
      }
      
      validCandles.push(tradingViewCandle);
      lastValidTime = timeInSeconds;
    }
    
    // FIXED: Sort by time to ensure perfect chronological order
    validCandles.sort((a, b) => Number(a.time) - Number(b.time));
    
    // FIXED: Remove any duplicates by timestamp
    const uniqueCandles: CandlestickData[] = [];
    let lastTime = 0;
    for (const candle of validCandles) {
      if (Number(candle.time) !== lastTime) {
        uniqueCandles.push(candle);
        lastTime = Number(candle.time);
      }
    }
    
    // Update validation error count
    if (skippedCount > 0) {
      setChartState(prev => ({
        ...prev,
        validationErrors: prev.validationErrors + skippedCount
      }));
      errors.push(`Filtered ${skippedCount} invalid candles`);
    }
    
    console.log(`📊 FIXED: ${backendPriceHistory.length} → ${uniqueCandles.length} validated TradingView candles (skipped ${skippedCount})`);
    
    return { 
      isValid: uniqueCandles.length > 0, 
      candleData: uniqueCandles, 
      errors 
    };
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

  // FIXED: Enhanced reset detection
  const detectAndHandleReset = useCallback((validationResult: { isValid: boolean; candleData: CandlestickData[]; errors: string[] }) => {
    const isEmpty = !validationResult.isValid || validationResult.candleData.length === 0;
    const wasNotEmpty = lastCandleCountRef.current > 0;
    
    if (isEmpty && wasNotEmpty) {
      console.log('🔄 RESET: Chart data cleared (Dashboard reset simulation)');
      
      // Clear chart data
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
      
      // Reset state
      setChartState(prev => ({
        ...prev,
        status: 'empty',
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        lastResetTime: Date.now(),
        validationErrors: 0
      }));
      
      lastCandleCountRef.current = 0;
      lastValidDataRef.current = [];
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      console.log('✅ RESET: Complete, ready for new candles');
      return true;
    }
    
    return false;
  }, []);

  // FIXED: Enhanced chart update function with comprehensive error prevention
  const updateChart = useCallback((validationResult: { isValid: boolean; candleData: CandlestickData[]; errors: string[] }, volumeData: HistogramData[]) => {
    if (!chartState.isReady || !candlestickSeriesRef.current || !volumeSeriesRef.current || isUpdatingRef.current) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    // Throttle updates for fast timeframes
    const minUpdateInterval = 50; // 50ms throttling
    
    if (timeSinceLastUpdate < minUpdateInterval) {
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
      }
      
      updateThrottleRef.current = setTimeout(() => {
        updateChart(validationResult, volumeData);
      }, minUpdateInterval - timeSinceLastUpdate);
      return;
    }

    isUpdatingRef.current = true;
    lastUpdateRef.current = now;

    try {
      // Check for reset condition first
      if (detectAndHandleReset(validationResult)) {
        isUpdatingRef.current = false;
        return;
      }
      
      // FIXED: Use validation result
      if (!validationResult.isValid) {
        console.log('📊 ABORT: Invalid chart data validation failed');
        isUpdatingRef.current = false;
        return;
      }
      
      const { candleData } = validationResult;
      const incomingCandleCount = candleData.length;

      // Track when chart starts building
      if (incomingCandleCount > 0 && lastCandleCountRef.current === 0) {
        console.log('📈 BUILDING: Chart started with backend candles');
        setChartState(prev => ({
          ...prev,
          status: 'building',
          isLiveBuilding: true,
          buildingStartTime: Date.now()
        }));
      }

      // FIXED: Enhanced TradingView Charts update with comprehensive error handling
      try {
        // FIXED: Use defensive copy to prevent reference issues
        const safeCandleData = candleData.map(candle => ({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        }));
        
        const safeVolumeData = volumeData.map(vol => ({
          time: vol.time,
          value: Number.isFinite(vol.value) ? vol.value : 0,
          color: vol.color
        }));
        
        // FIXED: Update TradingView with validated data
        candlestickSeriesRef.current.setData(safeCandleData);
        volumeSeriesRef.current.setData(safeVolumeData);
        
        // Store successful data for recovery
        lastValidDataRef.current = safeCandleData;
        
        setOptimalZoom(safeCandleData);
        
        console.log(`📊 FIXED UPDATE: ${safeCandleData.length} validated candles`);
        
      } catch (chartError: any) {
        console.error('❌ FIXED ERROR: TradingView chart error:', chartError);
        
        setChartState(prev => ({ 
          ...prev, 
          lastErrorTime: now
        }));
        
        // FIXED: Recovery strategy
        try {
          console.log('🔧 FIXED RECOVERY: Attempting chart recovery...');
          
          // Strategy: Clear and use last known good data
          candlestickSeriesRef.current.setData([]);
          volumeSeriesRef.current.setData([]);
          
          setTimeout(() => {
            if (candlestickSeriesRef.current && volumeSeriesRef.current && lastValidDataRef.current.length > 0) {
              try {
                // Use last known good data
                candlestickSeriesRef.current.setData([...lastValidDataRef.current]);
                
                const safeVolumeData = lastValidDataRef.current.map(candle => ({
                  time: candle.time,
                  value: 0,
                  color: candle.close >= candle.open ? '#22C55E44' : '#EF444444'
                }));
                volumeSeriesRef.current.setData(safeVolumeData);
                
                console.log('✅ FIXED RECOVERY: Success with last known data');
              } catch (recoveryError) {
                console.error('❌ FIXED RECOVERY: Failed:', recoveryError);
                setChartState(prev => ({ ...prev, status: 'error' }));
              }
            }
          }, 200);
          
        } catch (recoveryError) {
          console.error('❌ FIXED RECOVERY: Initial attempt failed:', recoveryError);
          setChartState(prev => ({ ...prev, status: 'error' }));
        }
        
        isUpdatingRef.current = false;
        return;
      }

      lastCandleCountRef.current = incomingCandleCount;
      
      // Update chart state based on candle generation
      setChartState(prev => ({
        ...prev,
        candleCount: incomingCandleCount,
        status: incomingCandleCount >= 50 ? 'ready' : incomingCandleCount > 0 ? 'building' : 'empty'
      }));

    } catch (error: any) {
      console.error('❌ FIXED: Outer chart update error:', error);
      setChartState(prev => ({ 
        ...prev, 
        status: 'error',
        lastErrorTime: now
      }));
    } finally {
      isUpdatingRef.current = false;
    }
  }, [chartState.isReady, detectAndHandleReset]);

  // FIXED: Convert backend data to TradingView format with validation
  const convertPriceHistory = useMemo((): { 
    validationResult: { isValid: boolean; candleData: CandlestickData[]; errors: string[] }; 
    volumeData: HistogramData[] 
  } => {
    const validationResult = validateChartData(priceHistory);
    
    const volumeData: HistogramData[] = validationResult.candleData.map((candle, index) => {
      // Get volume from original data
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
    
    return { validationResult, volumeData };
  }, [priceHistory, validateChartData]);

  // Monitor price history changes from WebSocket
  useEffect(() => {
    if (!chartState.isReady) {
      return;
    }

    const { validationResult, volumeData } = convertPriceHistory;
    updateChart(validationResult, volumeData);
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
          secondsVisible: true,
          barSpacing: 12,
          minBarSpacing: 0.5,
          rightOffset: 5,
          shiftVisibleRangeOnNewBar: true,
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
      lastValidDataRef.current = [];
      
      setChartState(prev => ({
        ...prev,
        status: 'empty',
        isReady: true,
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        validationErrors: 0,
        lastErrorTime: null
      }));

      console.log('✅ FIXED: Chart ready with enhanced validation');

    } catch (error) {
      console.error('❌ Failed to create chart:', error);
      setChartState(prev => ({ ...prev, status: 'error' }));
    }

    return () => {
      console.log('🧹 Cleaning up chart');
      
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
      
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lastValidDataRef.current = [];
      
      setChartState({
        status: 'initializing',
        isReady: false,
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        lastResetTime: null,
        validationErrors: 0,
        lastErrorTime: null
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
      // For fast updates, occasionally adjust zoom
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
        
        const { validationResult } = convertPriceHistory;
        if (validationResult.isValid && validationResult.candleData.length > 0) {
          setTimeout(() => setOptimalZoom(validationResult.candleData, true), 100);
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
    const { validationResult } = convertPriceHistory;
    if (validationResult.isValid && validationResult.candleData.length > 0) {
      setOptimalZoom(validationResult.candleData, true);
    }
  }, [convertPriceHistory, setOptimalZoom]);

  // Building stats
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
      validationErrors: chartState.validationErrors,
      hasRecentErrors: chartState.lastErrorTime && (Date.now() - chartState.lastErrorTime) < 10000
    };
  }, [chartState]);

  const getStatusInfo = () => {
    switch (chartState.status) {
      case 'initializing':
        return { color: 'bg-yellow-900 text-yellow-300', icon: '⚡', text: 'Initializing...' };
      case 'empty':
        return { color: 'bg-blue-900 text-blue-300', icon: '⏳', text: 'Ready for backend' };
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

  // FIXED: Show loading state if no valid data
  const { validationResult } = convertPriceHistory;
  if (!chartState.isReady) {
    return (
      <div className="relative w-full h-full bg-[#0B1426] rounded-lg overflow-hidden flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-6">📊</div>
          <h3 className="text-xl font-bold mb-3">Initializing Chart</h3>
          <p className="text-sm">Setting up enhanced validation...</p>
        </div>
      </div>
    );
  }

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
            ✅ FIXED
          </div>
          
          {chartState.validationErrors > 0 && (
            <div className="bg-yellow-900 bg-opacity-75 px-3 py-1 rounded text-xs text-yellow-300">
              ⚠️ Filtered: {chartState.validationErrors}
            </div>
          )}
          
          {buildingStats && (
            <div className={`bg-opacity-75 px-3 py-1 rounded text-xs ${
              buildingStats.hasRecentErrors ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'
            }`}>
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
          title="Optimize zoom"
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
          <div>⚡ Updates: {isUpdatingRef.current ? 'ACTIVE' : 'IDLE'}</div>
          <div>✅ FIXED: Enhanced validation</div>
          <div>🛡️ ERRORS: {chartState.validationErrors} filtered</div>
          <div>📡 MICRO-CAP: ${currentPrice.toFixed(6)} support</div>
          {chartState.lastResetTime && (
            <div>🕐 Last Reset: {Math.floor((Date.now() - chartState.lastResetTime) / 1000)}s ago</div>
          )}
          <div>🎯 Zoom: {initialZoomSetRef.current ? 'SET' : 'PENDING'}</div>
          {buildingStats && (
            <>
              <div>⏱️ Time: {buildingStats.elapsed}s</div>
              <div>📈 Rate: {buildingStats.candlesPerSecond}/s</div>
              <div>⚠️ Validation: {buildingStats.validationErrors} errors</div>
            </>
          )}
        </div>
      </div>
      
      {chartState.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-red-900 text-red-100 p-6 rounded-lg max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Chart Error</h3>
            <p className="text-sm">
              TradingView chart encountered an error. 
              {chartState.lastErrorTime && ` Last error: ${new Date(chartState.lastErrorTime).toLocaleTimeString()}`}
            </p>
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
            <h3 className="text-xl font-bold mb-3">Chart Ready</h3>
            <p className="text-sm mb-4">Enhanced validation for all token types</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for validated candle data...</span>
              </div>
              <div>🛡️ Enhanced validation: Null-safe</div>
              <div>📊 Micro-cap support: $0.000001+ precision</div>
              <div>⚡ Fast intervals: 3-15 seconds</div>
              <div>🔧 OHLC validation: 8-decimal precision</div>
              <div>📈 Recovery system: Last-known-good data</div>
              <div>🔄 Reset: Triggered by Dashboard</div>
              <div>✅ TradingView: Zero null errors</div>
            </div>
          </div>
        </div>
      )}

      {chartState.status === 'building' && chartState.candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 LIVE: {chartState.candleCount} enhanced validated candles
              {chartState.validationErrors > 0 && ` (${chartState.validationErrors} filtered)`}
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • Enhanced validation
                {buildingStats.isPostReset && ' • Post-Reset Build'}
                {buildingStats.hasRecentErrors && ' • ⚠️ Recent errors detected'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChart;