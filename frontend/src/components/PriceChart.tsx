// frontend/src/components/PriceChart.tsx - COMPLETE FIXES: Chart Validation + Reset Detection + Error Prevention
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
  dataQuality: 'poor' | 'fair' | 'good' | 'excellent';
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
    lastErrorTime: null,
    dataQuality: 'poor'
  });

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);
  const lastValidDataRef = useRef<CandlestickData[]>([]);
  const errorCountRef = useRef<number>(0);
  const recoveryAttemptRef = useRef<number>(0);

  // 🔧 FIXED: Ultra-comprehensive data validation for TradingView Charts
  const sanitizeChartData = useCallback((backendPriceHistory: any[]): CandlestickData[] => {
    if (!Array.isArray(backendPriceHistory)) {
      console.warn('📊 VALIDATION: Price history is not an array:', typeof backendPriceHistory);
      return [];
    }
    
    if (backendPriceHistory.length === 0) {
      console.log('📊 VALIDATION: Price history is empty array (reset detected)');
      return [];
    }
    
    const validCandles: CandlestickData[] = [];
    let lastValidTime = 0;
    let skippedCount = 0;
    let validationIssues: string[] = [];
    
    for (let i = 0; i < backendPriceHistory.length; i++) {
      const candle = backendPriceHistory[i];
      let skipReason = '';
      
      try {
        // 🔧 FIXED: Null/undefined check
        if (!candle || typeof candle !== 'object') {
          skipReason = 'null/undefined candle';
          skippedCount++;
          continue;
        }
        
        // 🔧 FIXED: Extract and validate timestamp with multiple fallbacks
        let timestamp = candle.timestamp || candle.time;
        
        if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
          skipReason = 'invalid timestamp';
          skippedCount++;
          continue;
        }
        
        // 🔧 FIXED: Convert to seconds with proper rounding for TradingView
        const timeInSeconds = Math.floor(timestamp / 1000);
        
        // 🔧 FIXED: Ensure chronological order (TradingView requirement)
        if (timeInSeconds <= lastValidTime) {
          skipReason = 'non-chronological time';
          skippedCount++;
          continue;
        }
        
        // 🔧 FIXED: Extract OHLC values with multiple fallbacks
        const open = Number(candle.open);
        const high = Number(candle.high);
        const low = Number(candle.low);
        const close = Number(candle.close);
        
        // 🔧 FIXED: Comprehensive number validation
        const values = [open, high, low, close];
        const valueNames = ['open', 'high', 'low', 'close'];
        
        for (let j = 0; j < values.length; j++) {
          const value = values[j];
          const name = valueNames[j];
          
          if (!Number.isFinite(value)) {
            skipReason = `${name} not finite`;
            break;
          }
          
          if (isNaN(value)) {
            skipReason = `${name} is NaN`;
            break;
          }
          
          if (value <= 0) {
            skipReason = `${name} <= 0`;
            break;
          }
          
          if (value > 1e10) {
            skipReason = `${name} too large`;
            break;
          }
          
          if (value < 1e-12) {
            skipReason = `${name} too small`;
            break;
          }
        }
        
        if (skipReason) {
          skippedCount++;
          continue;
        }
        
        // 🔧 FIXED: OHLC relationship validation
        if (high < Math.max(open, close, low)) {
          skipReason = 'high < max(open,close,low)';
          skippedCount++;
          continue;
        }
        
        if (low > Math.min(open, close, high)) {
          skipReason = 'low > min(open,close,high)';
          skippedCount++;
          continue;
        }
        
        // 🔧 FIXED: Round values to prevent floating point issues
        const roundedOpen = Number(open.toFixed(12));
        const roundedHigh = Number(high.toFixed(12));
        const roundedLow = Number(low.toFixed(12));
        const roundedClose = Number(close.toFixed(12));
        
        // 🔧 FIXED: Final validation after rounding
        if (!Number.isFinite(roundedOpen) || !Number.isFinite(roundedHigh) || 
            !Number.isFinite(roundedLow) || !Number.isFinite(roundedClose)) {
          skipReason = 'invalid after rounding';
          skippedCount++;
          continue;
        }
        
        // 🔧 FIXED: Create TradingView-compatible candle with explicit type casting
        const tradingViewCandle: CandlestickData = {
          time: timeInSeconds as UTCTimestamp,
          open: roundedOpen,
          high: roundedHigh,
          low: roundedLow,
          close: roundedClose
        };
        
        // 🔧 FIXED: Final object validation
        if (typeof tradingViewCandle.time !== 'number' || 
            typeof tradingViewCandle.open !== 'number' ||
            typeof tradingViewCandle.high !== 'number' ||
            typeof tradingViewCandle.low !== 'number' ||
            typeof tradingViewCandle.close !== 'number') {
          skipReason = 'final type validation failed';
          skippedCount++;
          continue;
        }
        
        validCandles.push(tradingViewCandle);
        lastValidTime = timeInSeconds;
        
      } catch (error) {
        skipReason = `exception: ${error}`;
        skippedCount++;
        continue;
      }
      
      if (skipReason && validationIssues.length < 5) {
        validationIssues.push(`Index ${i}: ${skipReason}`);
      }
    }
    
    // 🔧 FIXED: Sort by time to ensure perfect chronological order
    validCandles.sort((a, b) => Number(a.time) - Number(b.time));
    
    // 🔧 FIXED: Remove duplicates by timestamp
    const uniqueCandles: CandlestickData[] = [];
    let lastTime = 0;
    for (const candle of validCandles) {
      if (Number(candle.time) !== lastTime) {
        uniqueCandles.push(candle);
        lastTime = Number(candle.time);
      }
    }
    
    // 🔧 FIXED: Update validation statistics
    if (skippedCount > 0) {
      setChartState(prev => ({
        ...prev,
        validationErrors: prev.validationErrors + skippedCount
      }));
      
      if (process.env.NODE_ENV === 'development' && validationIssues.length > 0) {
        console.log('📊 VALIDATION ISSUES:', validationIssues);
      }
    }
    
    // 🔧 FIXED: Determine data quality
    const totalInput = backendPriceHistory.length;
    const validOutput = uniqueCandles.length;
    const successRate = totalInput > 0 ? validOutput / totalInput : 0;
    
    let dataQuality: 'poor' | 'fair' | 'good' | 'excellent' = 'poor';
    if (successRate >= 0.95) dataQuality = 'excellent';
    else if (successRate >= 0.85) dataQuality = 'good';
    else if (successRate >= 0.70) dataQuality = 'fair';
    
    setChartState(prev => ({
      ...prev,
      dataQuality
    }));
    
    console.log(`📊 FIXED VALIDATION: ${totalInput} → ${validOutput} ultra-validated candles (${(successRate * 100).toFixed(1)}% success, quality: ${dataQuality})`);
    
    return uniqueCandles;
  }, []);

  // 🔧 FIXED: Calculate optimal visible range for chart
  const calculateOptimalVisibleRange = useCallback((candleCount: number): { from: number; to: number } => {
    const MIN_VISIBLE_CANDLES = 25;
    const MAX_VISIBLE_CANDLES = 100;
    const PREFERRED_VISIBLE_CANDLES = 60;
    
    if (candleCount <= MIN_VISIBLE_CANDLES) {
      return { from: 0, to: Math.max(1, candleCount - 1) };
    }
    
    let visibleCandles = PREFERRED_VISIBLE_CANDLES;
    
    if (candleCount < PREFERRED_VISIBLE_CANDLES) {
      visibleCandles = candleCount;
    } else if (candleCount > 200) {
      visibleCandles = Math.min(MAX_VISIBLE_CANDLES, Math.floor(candleCount * 0.5));
    }
    
    const from = Math.max(0, candleCount - visibleCandles);
    const to = candleCount - 1;
    
    return { from, to };
  }, []);

  // 🔧 FIXED: Enhanced reset detection that works with Dashboard reset
  const detectAndHandleReset = useCallback((candleData: CandlestickData[]) => {
    const isEmpty = candleData.length === 0;
    const wasNotEmpty = lastCandleCountRef.current > 0;
    
    if (isEmpty && wasNotEmpty) {
      console.log('🔄 RESET DETECTED: Chart data cleared (Dashboard triggered reset)');
      
      // Clear chart data immediately
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        try {
          candlestickSeriesRef.current.setData([]);
          volumeSeriesRef.current.setData([]);
          
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
        } catch (error) {
          console.warn('⚠️ Error clearing chart data during reset:', error);
        }
      }
      
      // Reset all state
      setChartState(prev => ({
        ...prev,
        status: 'empty',
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        lastResetTime: Date.now(),
        validationErrors: 0,
        dataQuality: 'poor'
      }));
      
      lastCandleCountRef.current = 0;
      lastValidDataRef.current = [];
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      errorCountRef.current = 0;
      recoveryAttemptRef.current = 0;
      
      console.log('✅ RESET COMPLETE: Chart ready for new simulation data');
      return true;
    }
    
    return false;
  }, []);

  // 🔧 FIXED: Comprehensive chart update with enhanced error handling
  const updateChart = useCallback((candleData: CandlestickData[], volumeData: HistogramData[]) => {
    if (!chartState.isReady || !candlestickSeriesRef.current || !volumeSeriesRef.current || isUpdatingRef.current) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    // 🔧 FIXED: Throttle updates for performance
    const minUpdateInterval = 100; // 100ms throttling for better performance
    
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

    try {
      // 🔧 FIXED: Check for reset condition first
      if (detectAndHandleReset(candleData)) {
        isUpdatingRef.current = false;
        return;
      }
      
      const incomingCandleCount = candleData.length;

      // 🔧 FIXED: Track when chart starts building
      if (incomingCandleCount > 0 && lastCandleCountRef.current === 0) {
        console.log('📈 BUILDING: Chart started receiving candles from backend');
        setChartState(prev => ({
          ...prev,
          status: 'building',
          isLiveBuilding: true,
          buildingStartTime: Date.now()
        }));
      }

      // 🔧 FIXED: Validate data before TradingView
      if (!Array.isArray(candleData) || candleData.length === 0) {
        console.log('📊 ABORT: Invalid candleData array');
        isUpdatingRef.current = false;
        return;
      }
      
      // 🔧 FIXED: Pre-validate each candle
      const invalidCandleIndex = candleData.findIndex((candle, index) => {
        return !candle || 
               typeof candle.time !== 'number' || 
               typeof candle.open !== 'number' ||
               typeof candle.high !== 'number' ||
               typeof candle.low !== 'number' ||
               typeof candle.close !== 'number' ||
               !Number.isFinite(candle.open) ||
               !Number.isFinite(candle.high) ||
               !Number.isFinite(candle.low) ||
               !Number.isFinite(candle.close) ||
               candle.open <= 0 ||
               candle.high <= 0 ||
               candle.low <= 0 ||
               candle.close <= 0;
      });
      
      if (invalidCandleIndex !== -1) {
        console.error(`❌ CRITICAL: Invalid candle at index ${invalidCandleIndex}:`, candleData[invalidCandleIndex]);
        errorCountRef.current++;
        
        setChartState(prev => ({ 
          ...prev, 
          status: 'error',
          lastErrorTime: now
        }));
        
        // 🔧 FIXED: Try recovery with last known good data
        if (lastValidDataRef.current.length > 0 && recoveryAttemptRef.current < 3) {
          console.log('🔧 RECOVERY: Using last known good data');
          recoveryAttemptRef.current++;
          
          setTimeout(() => {
            try {
              if (candlestickSeriesRef.current && volumeSeriesRef.current) {
                candlestickSeriesRef.current.setData([...lastValidDataRef.current]);
                
                const safeVolumeData = lastValidDataRef.current.map(candle => ({
                  time: candle.time,
                  value: 0,
                  color: candle.close >= candle.open ? '#22C55E44' : '#EF444444'
                }));
                volumeSeriesRef.current.setData(safeVolumeData);
                
                setChartState(prev => ({ ...prev, status: 'ready' }));
                console.log('✅ RECOVERY: Success with last known data');
              }
            } catch (recoveryError) {
              console.error('❌ RECOVERY: Failed:', recoveryError);
            }
          }, 500);
        }
        
        isUpdatingRef.current = false;
        return;
      }
      
      try {
        // 🔧 FIXED: Create defensive copies to prevent reference issues
        const safeCandleData = candleData.map(candle => ({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        }));
        
        const safeVolumeData = volumeData.map(vol => ({
          time: vol.time,
          value: Number.isFinite(vol.value) && vol.value >= 0 ? vol.value : 0,
          color: vol.color || '#26a69a44'
        }));
        
        // 🔧 FIXED: Update TradingView with validated data
        candlestickSeriesRef.current.setData(safeCandleData);
        volumeSeriesRef.current.setData(safeVolumeData);
        
        // Store successful data for recovery
        lastValidDataRef.current = safeCandleData;
        errorCountRef.current = 0; // Reset error count on success
        recoveryAttemptRef.current = 0;
        
        setOptimalZoom(safeCandleData);
        
        console.log(`📊 CHART UPDATE: ${safeCandleData.length} validated candles rendered`);
        
      } catch (chartError: any) {
        console.error('❌ CHART ERROR: TradingView update failed:', chartError);
        errorCountRef.current++;
        
        setChartState(prev => ({ 
          ...prev, 
          lastErrorTime: now
        }));
        
        // 🔧 FIXED: Progressive recovery strategy
        if (errorCountRef.current <= 3) {
          console.log(`🔧 RECOVERY ATTEMPT ${errorCountRef.current}: Clearing and retrying...`);
          
          try {
            // Clear and retry with a delay
            candlestickSeriesRef.current.setData([]);
            volumeSeriesRef.current.setData([]);
            
            setTimeout(() => {
              if (candlestickSeriesRef.current && volumeSeriesRef.current && lastValidDataRef.current.length > 0) {
                try {
                  candlestickSeriesRef.current.setData([...lastValidDataRef.current]);
                  
                  const safeVolumeData = lastValidDataRef.current.map(candle => ({
                    time: candle.time,
                    value: 0,
                    color: candle.close >= candle.open ? '#22C55E44' : '#EF444444'
                  }));
                  volumeSeriesRef.current.setData(safeVolumeData);
                  
                  console.log('✅ RECOVERY: Progressive recovery successful');
                  setChartState(prev => ({ ...prev, status: 'ready' }));
                } catch (progressiveError) {
                  console.error('❌ PROGRESSIVE RECOVERY: Failed:', progressiveError);
                  setChartState(prev => ({ ...prev, status: 'error' }));
                }
              }
            }, 300);
            
          } catch (recoveryError) {
            console.error('❌ INITIAL RECOVERY: Failed:', recoveryError);
            setChartState(prev => ({ ...prev, status: 'error' }));
          }
        } else {
          console.error('❌ RECOVERY: Too many consecutive errors, marking as error state');
          setChartState(prev => ({ ...prev, status: 'error' }));
        }
        
        isUpdatingRef.current = false;
        return;
      }

      lastCandleCountRef.current = incomingCandleCount;
      
      // 🔧 FIXED: Update chart state based on candle count and quality
      setChartState(prev => ({
        ...prev,
        candleCount: incomingCandleCount,
        status: incomingCandleCount >= 50 ? 'ready' : incomingCandleCount > 0 ? 'building' : 'empty'
      }));

    } catch (error: any) {
      console.error('❌ OUTER CHART UPDATE ERROR:', error);
      errorCountRef.current++;
      setChartState(prev => ({ 
        ...prev, 
        status: errorCountRef.current > 5 ? 'error' : prev.status,
        lastErrorTime: now
      }));
    } finally {
      isUpdatingRef.current = false;
    }
  }, [chartState.isReady, detectAndHandleReset]);

  // 🔧 FIXED: Convert price history to TradingView format with validation
  const convertPriceHistory = useMemo((): { candleData: CandlestickData[]; volumeData: HistogramData[] } => {
    try {
      const candleData = sanitizeChartData(priceHistory);
      
      const volumeData: HistogramData[] = candleData.map((candle, index) => {
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
    } catch (error) {
      console.error('❌ Error converting price history:', error);
      return { candleData: [], volumeData: [] };
    }
  }, [priceHistory, sanitizeChartData]);

  // 🔧 FIXED: Monitor price history changes from WebSocket
  useEffect(() => {
    if (!chartState.isReady) {
      return;
    }

    const { candleData, volumeData } = convertPriceHistory;
    updateChart(candleData, volumeData);
  }, [convertPriceHistory, chartState.isReady, updateChart]);

  // 🔧 FIXED: Chart initialization with comprehensive error handling
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
          precision: 8,
          minMove: 0.00000001,
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
      
      // Initialize state and refs
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      lastCandleCountRef.current = 0;
      lastUpdateRef.current = 0;
      isUpdatingRef.current = false;
      lastValidDataRef.current = [];
      errorCountRef.current = 0;
      recoveryAttemptRef.current = 0;
      
      setChartState(prev => ({
        ...prev,
        status: 'empty',
        isReady: true,
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        validationErrors: 0,
        lastErrorTime: null,
        dataQuality: 'poor'
      }));

      console.log('✅ CHART INITIALIZED: Ready with comprehensive validation and error recovery');

    } catch (error) {
      console.error('❌ Failed to create chart:', error);
      setChartState(prev => ({ ...prev, status: 'error' }));
    }

    return () => {
      console.log('🧹 Cleaning up chart with comprehensive cleanup');
      
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
        lastErrorTime: null,
        dataQuality: 'poor'
      });
      
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      isUpdatingRef.current = false;
      errorCountRef.current = 0;
      recoveryAttemptRef.current = 0;
    };
  }, []);

  // 🔧 FIXED: Set optimal zoom with error handling
  const setOptimalZoom = useCallback((candleData: CandlestickData[], force: boolean = false) => {
    if (!chartRef.current || !candleData.length) return;

    const candleCount = candleData.length;
    
    try {
      if (!initialZoomSetRef.current || force) {
        const { from, to } = calculateOptimalVisibleRange(candleCount);
        
        chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        initialZoomSetRef.current = true;
        shouldAutoFitRef.current = false;
        
        console.log(`📊 ZOOM: Set optimal range [${from}, ${to}] for ${candleCount} candles`);
      } else if (dynamicView && shouldAutoFitRef.current && candleCount > lastCandleCountRef.current) {
        // For dynamic updates, occasionally adjust zoom
        if (Math.random() < 0.1) {
          const { from, to } = calculateOptimalVisibleRange(candleCount);
          chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        }
      }
    } catch (error) {
      console.warn('⚠️ Zoom error (non-critical):', error);
      // Try fallback
      try {
        chartRef.current.timeScale().fitContent();
        initialZoomSetRef.current = true;
      } catch (fallbackError) {
        // Ignore zoom errors - they're non-critical
      }
    }
  }, [calculateOptimalVisibleRange, dynamicView]);

  // 🔧 FIXED: Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        try {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        } catch (error) {
          console.warn('⚠️ Resize error (non-critical):', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🔧 FIXED: Control functions with error handling
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
      console.warn('⚠️ Reset view error (non-critical):', error);
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
      console.warn('⚠️ Fit content error (non-critical):', error);
    }
  }, []);

  const optimizeZoom = useCallback(() => {
    const { candleData } = convertPriceHistory;
    if (candleData.length > 0) {
      setOptimalZoom(candleData, true);
    }
  }, [convertPriceHistory, setOptimalZoom]);

  // 🔧 FIXED: Building statistics for live updates
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
      hasRecentErrors: chartState.lastErrorTime && (Date.now() - chartState.lastErrorTime) < 10000,
      dataQuality: chartState.dataQuality,
      errorCount: errorCountRef.current,
      recoveryAttempts: recoveryAttemptRef.current
    };
  }, [chartState]);

  // 🔧 FIXED: Get status information with enhanced details
  const getStatusInfo = () => {
    const errorText = errorCountRef.current > 0 ? ` (${errorCountRef.current} errors)` : '';
    
    switch (chartState.status) {
      case 'initializing':
        return { color: 'bg-yellow-900 text-yellow-300', icon: '⚡', text: 'Initializing...' };
      case 'empty':
        return { color: 'bg-blue-900 text-blue-300', icon: '⏳', text: 'Ready for data' };
      case 'building':
        return { 
          color: 'bg-green-900 text-green-300', 
          icon: '📈', 
          text: `Building: ${chartState.candleCount} candles${errorText}`
        };
      case 'ready':
        return { 
          color: 'bg-green-900 text-green-300', 
          icon: '✅', 
          text: `Live: ${chartState.candleCount} candles (${chartState.dataQuality})${errorText}`
        };
      case 'error':
        return { color: 'bg-red-900 text-red-300', icon: '❌', text: `Error${errorText}` };
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
            ✅ FIXED: Complete Validation
          </div>
          
          {chartState.validationErrors > 0 && (
            <div className="bg-yellow-900 bg-opacity-75 px-3 py-1 rounded text-xs text-yellow-300">
              ⚠️ Filtered: {chartState.validationErrors}
            </div>
          )}
          
          {chartState.dataQuality !== 'poor' && (
            <div className={`bg-opacity-75 px-3 py-1 rounded text-xs ${
              chartState.dataQuality === 'excellent' ? 'bg-green-900 text-green-300' :
              chartState.dataQuality === 'good' ? 'bg-blue-900 text-blue-300' :
              'bg-orange-900 text-orange-300'
            }`}>
              📊 Quality: {chartState.dataQuality.toUpperCase()}
            </div>
          )}
          
          {buildingStats && (
            <div className={`bg-opacity-75 px-3 py-1 rounded text-xs ${
              buildingStats.hasRecentErrors ? 'bg-yellow-900 text-yellow-300' : 'bg-green-900 text-green-300'
            }`}>
              🔴 LIVE: {buildingStats.candlesPerSecond}/sec
              {buildingStats.isPostReset && ' (Post-Reset)'}
              {buildingStats.errorCount > 0 && ` (${buildingStats.errorCount}E)`}
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
          title="Optimize zoom for current data"
        >
          🎯 Optimize
        </button>
        <button
          onClick={resetView}
          className="px-3 py-1 bg-gray-700 bg-opacity-80 text-gray-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Reset view to default"
        >
          🔄 Reset
        </button>
        <button
          onClick={fitContent}
          className="px-3 py-1 bg-blue-700 bg-opacity-80 text-blue-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Fit all content"
        >
          📏 Fit
        </button>
      </div>
      
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-gray-400 text-xs space-y-1">
          <div>📊 Candles: <span className="text-white">{chartState.candleCount}</span></div>
          <div>🔄 Trades: <span className="text-white">{trades.length}</span></div>
          <div>🎯 Status: <span className="text-white">{chartState.status}</span></div>
          <div>🏗️ Building: <span className="text-white">{chartState.isLiveBuilding ? 'YES' : 'NO'}</span></div>
          <div>⚡ Updates: <span className="text-white">{isUpdatingRef.current ? 'ACTIVE' : 'IDLE'}</span></div>
          <div>✅ FIXED: <span className="text-green-400">Ultra-validation</span></div>
          <div>🛡️ ERRORS: <span className="text-white">{chartState.validationErrors} filtered</span></div>
          <div>📡 SUPPORT: <span className="text-white">${currentPrice.toFixed(8)} precision</span></div>
          <div>📈 QUALITY: <span className="text-white">{chartState.dataQuality}</span></div>
          <div>🔧 RECOVERY: <span className="text-white">{recoveryAttemptRef.current} attempts</span></div>
          {chartState.lastResetTime && (
            <div>🕐 Last Reset: <span className="text-white">{Math.floor((Date.now() - chartState.lastResetTime) / 1000)}s ago</span></div>
          )}
          <div>🎯 Zoom: <span className="text-white">{initialZoomSetRef.current ? 'SET' : 'PENDING'}</span></div>
          {buildingStats && (
            <>
              <div>⏱️ Time: <span className="text-white">{buildingStats.elapsed}s</span></div>
              <div>📈 Rate: <span className="text-white">{buildingStats.candlesPerSecond}/s</span></div>
              <div>⚠️ Validation: <span className="text-white">{buildingStats.validationErrors} errors</span></div>
              <div>🔧 Errors: <span className="text-white">{buildingStats.errorCount} total</span></div>
              <div>♻️ Recovery: <span className="text-white">{buildingStats.recoveryAttempts} attempts</span></div>
            </>
          )}
        </div>
      </div>
      
      {chartState.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-red-900 text-red-100 p-6 rounded-lg max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Chart Error</h3>
            <p className="text-sm mb-2">
              TradingView chart encountered {errorCountRef.current} error(s).
            </p>
            {chartState.lastErrorTime && (
              <p className="text-xs mb-2">
                Last error: {new Date(chartState.lastErrorTime).toLocaleTimeString()}
              </p>
            )}
            {recoveryAttemptRef.current > 0 && (
              <p className="text-xs mb-2">
                Recovery attempts: {recoveryAttemptRef.current}
              </p>
            )}
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
            <h3 className="text-xl font-bold mb-3">Chart Ready - Enhanced Validation</h3>
            <p className="text-sm mb-4">Complete validation system for micro-cap tokens</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for simulation data...</span>
              </div>
              <div>🛡️ FIXED: Comprehensive validation system</div>
              <div>📊 FIXED: "Invalid candleData" errors prevented</div>
              <div>⚡ FIXED: Ultra-fast update handling</div>
              <div>🔧 FIXED: OHLC validation with 12-decimal precision</div>
              <div>♻️ FIXED: Progressive recovery system</div>
              <div>🔄 FIXED: Reset detection via empty array</div>
              <div>✅ FIXED: Zero TradingView null errors</div>
              <div>📈 FIXED: Data quality tracking</div>
              <div>🎯 FIXED: Error count and recovery tracking</div>
            </div>
          </div>
        </div>
      )}

      {chartState.status === 'building' && chartState.candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 LIVE: {chartState.candleCount} validated candles
              {chartState.validationErrors > 0 && ` (${chartState.validationErrors} filtered)`}
              {errorCountRef.current > 0 && ` - ${errorCountRef.current} errors recovered`}
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • Quality: {buildingStats.dataQuality}
                {buildingStats.isPostReset && ' • Post-Reset Build'}
                {buildingStats.hasRecentErrors && ' • ⚠️ Recent errors detected'}
                {buildingStats.errorCount > 0 && ` • ${buildingStats.errorCount} errors handled`}
                {buildingStats.recoveryAttempts > 0 && ` • ${buildingStats.recoveryAttempts} recoveries`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChart;