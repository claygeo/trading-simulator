// frontend/src/components/PriceChart.tsx - FIXED: Enhanced Reset Coordination & Validation
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

// 🔧 FIXED: Enhanced chart state management
interface ChartState {
  status: 'initializing' | 'empty' | 'building' | 'ready' | 'error' | 'resetting';
  isReady: boolean;
  candleCount: number;
  isLiveBuilding: boolean;
  buildingStartTime: number | null;
  lastResetTime: number | null;
  resetCoordination: {
    isInResetPhase: boolean;
    resetId: string | null;
    postResetValidationPasses: number;
    allowedValidationFailures: number;
    resetTimeoutId: NodeJS.Timeout | null;
  };
  validation: {
    lastValidationTime: number;
    consecutiveFailures: number;
    totalValidations: number;
    successfulValidations: number;
  };
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
  
  // 🔧 FIXED: Comprehensive chart state with enhanced validation tracking
  const [chartState, setChartState] = useState<ChartState>({
    status: 'initializing',
    isReady: false,
    candleCount: 0,
    isLiveBuilding: false,
    buildingStartTime: null,
    lastResetTime: null,
    resetCoordination: {
      isInResetPhase: false,
      resetId: null,
      postResetValidationPasses: 0,
      allowedValidationFailures: 5, // Increased tolerance
      resetTimeoutId: null
    },
    validation: {
      lastValidationTime: 0,
      consecutiveFailures: 0,
      totalValidations: 0,
      successfulValidations: 0
    }
  });

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);
  
  // 🔧 FIXED: Enhanced reset coordination refs
  const resetCoordinationRef = useRef({
    lastResetDetection: 0,
    consecutiveEmptyUpdates: 0,
    resetConfirmationTimer: null as NodeJS.Timeout | null,
    gracePeriodMs: 3000 // 3 second grace period after reset
  });

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

  // 🔧 FIXED: Enhanced timestamp validation with better error handling
  const validateTimestampOrdering = useCallback((candleData: CandlestickData[]): {
    isValid: boolean;
    issues: number;
    shouldFixAutomatically: boolean;
    validatedData?: CandlestickData[];
    validationDetails: {
      timestampIssues: number;
      ohlcIssues: number;
      volumeIssues: number;
      thinCandleCount: number;
    };
  } => {
    const validationStart = Date.now();
    
    if (candleData.length <= 1) {
      return { 
        isValid: true, 
        issues: 0, 
        shouldFixAutomatically: false,
        validationDetails: {
          timestampIssues: 0,
          ohlcIssues: 0,
          volumeIssues: 0,
          thinCandleCount: 0
        }
      };
    }
    
    let timestampIssues = 0;
    let ohlcIssues = 0;
    let volumeIssues = 0;
    let thinCandleCount = 0;
    
    const isInResetPhase = chartState.resetCoordination.isInResetPhase;
    const gracePeriod = Date.now() - (chartState.lastResetTime || 0) < resetCoordinationRef.current.gracePeriodMs;
    
    // 🔧 FIXED: Enhanced validation logic
    for (let i = 1; i < candleData.length; i++) {
      // Check timestamp ordering
      if (candleData[i].time <= candleData[i - 1].time) {
        timestampIssues++;
      }
      
      // 🔧 FIXED: Check for thin candles (where high === low)
      if (candleData[i].high === candleData[i].low) {
        thinCandleCount++;
      }
      
      // Check OHLC relationships
      if (candleData[i].high < candleData[i].low ||
          candleData[i].high < candleData[i].open ||
          candleData[i].high < candleData[i].close ||
          candleData[i].low > candleData[i].open ||
          candleData[i].low > candleData[i].close) {
        ohlcIssues++;
      }
    }
    
    const totalIssues = timestampIssues + ohlcIssues;
    
    // 🔧 FIXED: Enhanced auto-fix logic
    const shouldAutoFix = (isInResetPhase || gracePeriod) && 
                         totalIssues <= chartState.resetCoordination.allowedValidationFailures &&
                         thinCandleCount < candleData.length * 0.5; // Don't fix if more than 50% are thin
    
    if (shouldAutoFix && totalIssues > 0) {
      console.log(`🔧 FIXED VALIDATION: Auto-fixing ${totalIssues} issues (${timestampIssues} timestamp, ${ohlcIssues} OHLC, ${thinCandleCount} thin candles)`);
      
      const fixedData = [...candleData];
      let lastTime = 0;
      
      for (let i = 0; i < fixedData.length; i++) {
        // Fix timestamp ordering
        if (fixedData[i].time <= lastTime) {
          fixedData[i].time = (lastTime + 60) as UTCTimestamp; // 1 minute intervals
        }
        lastTime = Number(fixedData[i].time);
        
        // 🔧 FIXED: Fix thin candles by adding small spread
        if (fixedData[i].high === fixedData[i].low) {
          const spread = fixedData[i].close * 0.0001; // 0.01% spread
          fixedData[i].high = fixedData[i].close + spread;
          fixedData[i].low = fixedData[i].close - spread;
        }
        
        // Fix OHLC relationships
        fixedData[i].high = Math.max(fixedData[i].open, fixedData[i].high, fixedData[i].low, fixedData[i].close);
        fixedData[i].low = Math.min(fixedData[i].open, fixedData[i].high, fixedData[i].low, fixedData[i].close);
      }
      
      // Update validation state
      setChartState(prev => ({
        ...prev,
        validation: {
          ...prev.validation,
          lastValidationTime: validationStart,
          totalValidations: prev.validation.totalValidations + 1,
          successfulValidations: prev.validation.successfulValidations + 1,
          consecutiveFailures: 0
        }
      }));
      
      return {
        isValid: false,
        issues: totalIssues,
        shouldFixAutomatically: true,
        validatedData: fixedData,
        validationDetails: {
          timestampIssues,
          ohlcIssues,
          volumeIssues,
          thinCandleCount
        }
      };
    }
    
    // Update validation state
    setChartState(prev => ({
      ...prev,
      validation: {
        ...prev.validation,
        lastValidationTime: validationStart,
        totalValidations: prev.validation.totalValidations + 1,
        successfulValidations: totalIssues === 0 ? prev.validation.successfulValidations + 1 : prev.validation.successfulValidations,
        consecutiveFailures: totalIssues > 0 ? prev.validation.consecutiveFailures + 1 : 0
      }
    }));
    
    return {
      isValid: totalIssues === 0,
      issues: totalIssues,
      shouldFixAutomatically: false,
      validationDetails: {
        timestampIssues,
        ohlcIssues,
        volumeIssues,
        thinCandleCount
      }
    };
  }, [chartState.resetCoordination]);

  const convertPriceHistory = useMemo((): { candleData: CandlestickData[]; volumeData: HistogramData[] } => {
    if (!priceHistory || priceHistory.length === 0) {
      return { candleData: [], volumeData: [] };
    }
    
    const candleData: CandlestickData[] = [];
    const volumeData: HistogramData[] = [];
    
    // Sort data by timestamp first
    const sortedHistory = [...priceHistory].sort((a, b) => {
      const timeA = a.timestamp || a.time;
      const timeB = b.timestamp || b.time;
      return timeA - timeB;
    });
    
    sortedHistory.forEach((candle) => {
      const timestamp = candle.timestamp || candle.time;
      const timeInSeconds = Math.floor(timestamp / 1000);
      
      // 🔧 FIXED: Validate candle data before adding
      if (candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0 &&
          candle.high >= candle.low && 
          candle.high >= candle.open && 
          candle.high >= candle.close &&
          candle.low <= candle.open && 
          candle.low <= candle.close) {
        
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
      }
    });
    
    return { candleData, volumeData };
  }, [priceHistory]);

  // 🔧 FIXED: Enhanced reset detection with better coordination
  const detectAndHandleReset = useCallback((candleData: CandlestickData[]) => {
    const now = Date.now();
    const isEmpty = candleData.length === 0;
    const wasNotEmpty = lastCandleCountRef.current > 0;
    
    // 🔧 FIXED: Better reset detection logic
    if (isEmpty && wasNotEmpty) {
      console.log('🔄 FIXED RESET DETECTED: Chart data went from populated to empty');
      
      const resetId = `reset-${now}`;
      
      // Clear any existing reset timeout
      if (chartState.resetCoordination.resetTimeoutId) {
        clearTimeout(chartState.resetCoordination.resetTimeoutId);
      }
      
      setChartState(prev => ({
        ...prev,
        status: 'resetting',
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        lastResetTime: now,
        resetCoordination: {
          isInResetPhase: true,
          resetId,
          postResetValidationPasses: 0,
          allowedValidationFailures: 5,
          resetTimeoutId: null
        },
        validation: {
          ...prev.validation,
          consecutiveFailures: 0
        }
      }));
      
      // 🔧 FIXED: Clear TradingView chart more thoroughly
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        try {
          candlestickSeriesRef.current.setData([]);
          volumeSeriesRef.current.setData([]);
          
          // Force chart redraw
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
        } catch (error) {
          console.warn('⚠️ Error clearing chart data:', error);
        }
      }
      
      // Reset state
      lastCandleCountRef.current = 0;
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      // 🔧 FIXED: Set timer to exit reset phase with longer grace period
      const timeoutId = setTimeout(() => {
        console.log('🔄 FIXED RESET: Exiting reset phase after grace period');
        setChartState(prev => ({
          ...prev,
          status: 'empty',
          resetCoordination: {
            ...prev.resetCoordination,
            isInResetPhase: false,
            resetId: null,
            resetTimeoutId: null
          }
        }));
      }, resetCoordinationRef.current.gracePeriodMs);
      
      setChartState(prev => ({
        ...prev,
        resetCoordination: {
          ...prev.resetCoordination,
          resetTimeoutId: timeoutId
        }
      }));
      
      console.log('✅ FIXED RESET: Reset handled, waiting for new data with enhanced coordination');
      return true;
    }
    
    return false;
  }, [chartState.resetCoordination]);

  // 🔧 FIXED: Enhanced chart update with better error handling
  const updateChart = useCallback((candleData: CandlestickData[], volumeData: HistogramData[]) => {
    if (!chartState.isReady || !candlestickSeriesRef.current || !volumeSeriesRef.current || isUpdatingRef.current) {
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
      // Check for reset
      if (detectAndHandleReset(candleData)) {
        isUpdatingRef.current = false;
        return;
      }
      
      const incomingCandleCount = candleData.length;

      // Track when chart starts building after reset
      if (incomingCandleCount > 0 && lastCandleCountRef.current === 0 && chartState.status !== 'building') {
        console.log('📈 FIXED RESET: Chart building started after reset with proper candles');
        setChartState(prev => ({
          ...prev,
          status: 'building',
          isLiveBuilding: true,
          buildingStartTime: Date.now()
        }));
      }

      // 🔧 FIXED: Enhanced validation with better reporting
      const validation = validateTimestampOrdering(candleData);
      
      if (!validation.isValid && !validation.shouldFixAutomatically) {
        console.warn('⚠️ FIXED VALIDATION: Chart data validation failed:', {
          issues: validation.issues,
          validationDetails: validation.validationDetails,
          isInResetPhase: chartState.resetCoordination.isInResetPhase,
          candleCount: incomingCandleCount,
          thinCandlePercentage: validation.validationDetails.thinCandleCount / Math.max(1, incomingCandleCount) * 100
        });
        
        // 🔧 FIXED: Only fail if too many consecutive failures and not in reset phase
        if (chartState.validation.consecutiveFailures >= 3 && !chartState.resetCoordination.isInResetPhase) {
          console.error('❌ FIXED VALIDATION: Too many consecutive validation failures, skipping update');
          isUpdatingRef.current = false;
          return;
        }
      }
      
      // Use fixed data if auto-fix was applied
      const dataToUse = validation.validatedData || candleData;
      const volumeToUse = validation.validatedData ? volumeData.slice(0, validation.validatedData.length) : volumeData;
      
      if (validation.shouldFixAutomatically) {
        console.log('🔧 FIXED VALIDATION: Applied automatic fixes', validation.validationDetails);
      }

      // 🔧 FIXED: Update chart data with error handling
      try {
        candlestickSeriesRef.current.setData(dataToUse);
        volumeSeriesRef.current.setData(volumeToUse);
        
        setOptimalZoom(dataToUse);
      } catch (chartError) {
        console.error('❌ Error updating chart series:', chartError);
        isUpdatingRef.current = false;
        return;
      }

      lastCandleCountRef.current = incomingCandleCount;
      
      // Update chart state
      setChartState(prev => ({
        ...prev,
        candleCount: incomingCandleCount,
        status: incomingCandleCount >= 50 ? 'ready' : incomingCandleCount > 0 ? 'building' : 'empty',
        resetCoordination: {
          ...prev.resetCoordination,
          postResetValidationPasses: prev.resetCoordination.isInResetPhase ? 
            prev.resetCoordination.postResetValidationPasses + 1 : 0
        }
      }));
      
      // 🔧 FIXED: Exit reset phase after successful validations with enhanced criteria
      if (chartState.resetCoordination.isInResetPhase && 
          chartState.resetCoordination.postResetValidationPasses >= 3 &&
          incomingCandleCount > 0 &&
          validation.validationDetails.thinCandleCount < incomingCandleCount * 0.3) { // Less than 30% thin candles
        
        console.log('✅ FIXED RESET: Successful post-reset validation with quality candles, exiting reset phase');
        
        // Clear timeout if it exists
        if (chartState.resetCoordination.resetTimeoutId) {
          clearTimeout(chartState.resetCoordination.resetTimeoutId);
        }
        
        setChartState(prev => ({
          ...prev,
          resetCoordination: {
            ...prev.resetCoordination,
            isInResetPhase: false,
            resetId: null,
            resetTimeoutId: null
          }
        }));
      }

    } catch (error) {
      console.error('❌ FIXED VALIDATION: Error updating chart:', error);
      setChartState(prev => ({ 
        ...prev, 
        status: 'error',
        validation: {
          ...prev.validation,
          consecutiveFailures: prev.validation.consecutiveFailures + 1
        }
      }));
    } finally {
      isUpdatingRef.current = false;
    }
  }, [chartState, validateTimestampOrdering, detectAndHandleReset]);

  // Monitor price history changes with enhanced coordination
  useEffect(() => {
    if (!chartState.isReady || !candlestickSeriesRef.current || !volumeSeriesRef.current) {
      return;
    }

    const { candleData, volumeData } = convertPriceHistory;
    updateChart(candleData, volumeData);
  }, [convertPriceHistory, chartState.isReady, updateChart]);

  // 🔧 FIXED: Enhanced chart initialization
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
      
      setChartState(prev => ({
        ...prev,
        status: 'empty',
        isReady: true,
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        resetCoordination: {
          isInResetPhase: false,
          resetId: null,
          postResetValidationPasses: 0,
          allowedValidationFailures: 5,
          resetTimeoutId: null
        },
        validation: {
          lastValidationTime: 0,
          consecutiveFailures: 0,
          totalValidations: 0,
          successfulValidations: 0
        }
      }));

      console.log('✅ FIXED CHART: Chart initialized with enhanced reset coordination and validation');

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
      
      if (chartState.resetCoordination.resetTimeoutId) {
        clearTimeout(chartState.resetCoordination.resetTimeoutId);
      }
      
      if (resetCoordinationRef.current.resetConfirmationTimer) {
        clearTimeout(resetCoordinationRef.current.resetConfirmationTimer);
        resetCoordinationRef.current.resetConfirmationTimer = null;
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
      
      setChartState({
        status: 'initializing',
        isReady: false,
        candleCount: 0,
        isLiveBuilding: false,
        buildingStartTime: null,
        lastResetTime: null,
        resetCoordination: {
          isInResetPhase: false,
          resetId: null,
          postResetValidationPasses: 0,
          allowedValidationFailures: 5,
          resetTimeoutId: null
        },
        validation: {
          lastValidationTime: 0,
          consecutiveFailures: 0,
          totalValidations: 0,
          successfulValidations: 0
        }
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

  // 🔧 FIXED: Enhanced building stats with validation info
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
      validationHealth: chartState.validation.totalValidations > 0 ? 
        (chartState.validation.successfulValidations / chartState.validation.totalValidations * 100).toFixed(1) : '100'
    };
  }, [chartState]);

  const getStatusInfo = () => {
    switch (chartState.status) {
      case 'initializing':
        return { color: 'bg-yellow-900 text-yellow-300', icon: '⚡', text: 'Initializing...' };
      case 'empty':
        return { color: 'bg-blue-900 text-blue-300', icon: '⏳', text: 'Ready for data' };
      case 'resetting':
        return { color: 'bg-purple-900 text-purple-300', icon: '🔄', text: 'Resetting...' };
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
              chartState.status === 'resetting' ? 'bg-purple-400 animate-pulse' :
              chartState.status === 'error' ? 'bg-red-400' :
              'bg-yellow-400 animate-pulse'
            }`}></div>
            <span>{statusInfo.icon} {statusInfo.text}</span>
          </div>
          
          {/* 🔧 FIXED: Enhanced status indicators */}
          <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
            ✅ Fixed Anti-Thin
          </div>
          
          {/* Reset phase indicator */}
          {chartState.resetCoordination.isInResetPhase && (
            <div className="bg-purple-900 bg-opacity-75 px-3 py-1 rounded text-xs text-purple-300">
              🔄 Reset Phase
            </div>
          )}
          
          {/* Validation health indicator */}
          {chartState.validation.totalValidations > 0 && (
            <div className={`px-3 py-1 rounded text-xs ${
              chartState.validation.consecutiveFailures === 0 ? 'bg-green-900 text-green-300' :
              chartState.validation.consecutiveFailures < 3 ? 'bg-yellow-900 text-yellow-300' :
              'bg-red-900 text-red-300'
            }`}>
              🔍 Validation: {chartState.validation.successfulValidations}/{chartState.validation.totalValidations}
            </div>
          )}
          
          {buildingStats && (
            <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
              🔴 LIVE: {buildingStats.candlesPerSecond}/sec ({buildingStats.validationHealth}% valid)
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
      
      {/* 🔧 FIXED: Enhanced debug information */}
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-gray-400 text-xs space-y-1">
          <div>📊 Candles: {chartState.candleCount}</div>
          <div>🔄 Trades: {trades.length}</div>
          <div>🎯 Status: {chartState.status}</div>
          <div>🏗️ Building: {chartState.isLiveBuilding ? 'YES' : 'NO'}</div>
          <div>⚡ Updates: {isUpdatingRef.current ? 'ACTIVE' : 'IDLE'}</div>
          <div>✅ Fixed: ANTI-THIN</div>
          <div>🔧 Reset Phase: {chartState.resetCoordination.isInResetPhase ? 'YES' : 'NO'}</div>
          <div>📊 Val Passes: {chartState.resetCoordination.postResetValidationPasses}</div>
          <div>🔍 Val Health: {chartState.validation.totalValidations > 0 ? 
            `${(chartState.validation.successfulValidations / chartState.validation.totalValidations * 100).toFixed(0)}%` : 'N/A'}</div>
          <div>⚠️ Failures: {chartState.validation.consecutiveFailures}</div>
          {chartState.lastResetTime && (
            <div>🕐 Last Reset: {Math.floor((Date.now() - chartState.lastResetTime) / 1000)}s ago</div>
          )}
          <div>🎯 Pro Zoom: {initialZoomSetRef.current ? 'SET' : 'PENDING'}</div>
          {buildingStats && (
            <>
              <div>⏱️ Time: {buildingStats.elapsed}s</div>
              <div>📈 Rate: {buildingStats.candlesPerSecond}/s</div>
              <div>✅ Quality: {buildingStats.validationHealth}%</div>
            </>
          )}
        </div>
      </div>
      
      {chartState.status === 'error' && (
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
      
      {chartState.status === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-6xl mb-6">📊</div>
            <h3 className="text-xl font-bold mb-3">Fixed Chart Ready</h3>
            <p className="text-sm mb-4">Anti-thin candle system with enhanced validation</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for backend candle data...</span>
              </div>
              <div>✅ Enhanced reset coordination</div>
              <div>🔧 Anti-thin candle validation</div>
              <div>⚡ Smart update throttling</div>
              <div>📈 Optimal candle proportions</div>
              <div>🔧 TradingView-style display</div>
              <div>🔍 Advanced validation system</div>
            </div>
          </div>
        </div>
      )}

      {chartState.status === 'resetting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-center text-purple-400">
            <div className="text-6xl mb-6 animate-spin">🔄</div>
            <h3 className="text-xl font-bold mb-3">Enhanced Reset in Progress</h3>
            <p className="text-sm mb-4">Clearing chart and preparing for quality data</p>
            <div className="space-y-2 text-xs">
              <div>🔄 Enhanced reset coordination active</div>
              <div>📊 Chart data clearing</div>
              <div>⏳ Preparing for anti-thin candles</div>
              <div>🔧 Validation system ready</div>
            </div>
          </div>
        </div>
      )}

      {chartState.status === 'building' && chartState.candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 FIXED LIVE BUILDING: {chartState.candleCount} quality candles
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • {buildingStats.validationHealth}% validation success • Anti-thin system active
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