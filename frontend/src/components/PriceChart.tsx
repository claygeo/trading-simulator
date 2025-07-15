// frontend/src/components/PriceChart.tsx - ENHANCED: Reset Coordination & Timestamp Validation
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

// ENHANCED: Chart state management with reset coordination
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
  
  // ENHANCED: Comprehensive chart state
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
      allowedValidationFailures: 3
    }
  });

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);
  
  // ENHANCED: Reset coordination refs
  const resetCoordinationRef = useRef({
    lastResetDetection: 0,
    consecutiveEmptyUpdates: 0,
    resetConfirmationTimer: null as NodeJS.Timeout | null
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

  // ENHANCED: Timestamp validation with reset awareness
  const validateTimestampOrdering = useCallback((candleData: CandlestickData[]): {
    isValid: boolean;
    issues: number;
    shouldFixAutomatically: boolean;
    validatedData?: CandlestickData[];
  } => {
    if (candleData.length <= 1) {
      return { isValid: true, issues: 0, shouldFixAutomatically: false };
    }
    
    let issues = 0;
    const isInResetPhase = chartState.resetCoordination.isInResetPhase;
    
    // Check timestamp ordering
    for (let i = 1; i < candleData.length; i++) {
      if (candleData[i].time <= candleData[i - 1].time) {
        issues++;
      }
    }
    
    // During reset phase, be more lenient
    if (isInResetPhase && issues <= chartState.resetCoordination.allowedValidationFailures) {
      console.log(`🔧 RESET COORDINATION: Allowing ${issues} validation issues during reset phase`);
      
      // Auto-fix timestamp issues during reset
      const fixedData = [...candleData];
      let lastTime = 0;
      
      for (let i = 0; i < fixedData.length; i++) {
        if (fixedData[i].time <= lastTime) {
          fixedData[i].time = (lastTime + 60) as UTCTimestamp;
        }
        lastTime = fixedData[i].time;
      }
      
      return {
        isValid: false,
        issues,
        shouldFixAutomatically: true,
        validatedData: fixedData
      };
    }
    
    return {
      isValid: issues === 0,
      issues,
      shouldFixAutomatically: false
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

  // ENHANCED: Reset detection and coordination
  const detectAndHandleReset = useCallback((candleData: CandlestickData[]) => {
    const now = Date.now();
    const isEmpty = candleData.length === 0;
    const wasNotEmpty = lastCandleCountRef.current > 0;
    
    if (isEmpty && wasNotEmpty) {
      // Reset detected
      console.log('🔄 RESET DETECTED: Chart data went from populated to empty');
      
      const resetId = `reset-${now}`;
      
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
          allowedValidationFailures: 3
        }
      }));
      
      // Clear TradingView chart
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        candlestickSeriesRef.current.setData([]);
        volumeSeriesRef.current.setData([]);
      }
      
      // Reset state
      lastCandleCountRef.current = 0;
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      // Set timer to exit reset phase
      if (resetCoordinationRef.current.resetConfirmationTimer) {
        clearTimeout(resetCoordinationRef.current.resetConfirmationTimer);
      }
      
      resetCoordinationRef.current.resetConfirmationTimer = setTimeout(() => {
        console.log('🔄 RESET COORDINATION: Exiting reset phase');
        setChartState(prev => ({
          ...prev,
          status: 'empty',
          resetCoordination: {
            ...prev.resetCoordination,
            isInResetPhase: false,
            resetId: null
          }
        }));
      }, 2000);
      
      console.log('✅ RESET COORDINATION: Reset handled, waiting for new data');
      return true;
    }
    
    return false;
  }, []);

  // ENHANCED: Chart update with reset coordination
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
        console.log('📈 RESET COORDINATION: Chart building started after reset');
        setChartState(prev => ({
          ...prev,
          status: 'building',
          isLiveBuilding: true,
          buildingStartTime: Date.now()
        }));
      }

      // ENHANCED: Validation with reset coordination
      const validation = validateTimestampOrdering(candleData);
      
      if (!validation.isValid && !validation.shouldFixAutomatically) {
        console.warn('⚠️ RESET COORDINATION: Chart data validation failed:', {
          issues: validation.issues,
          isInResetPhase: chartState.resetCoordination.isInResetPhase,
          candleCount: incomingCandleCount,
          firstFewTimes: candleData.slice(0, 3).map(c => ({ time: c.time, date: new Date(Number(c.time) * 1000).toISOString() }))
        });
        
        isUpdatingRef.current = false;
        return;
      }
      
      // Use fixed data if auto-fix was applied
      const dataToUse = validation.validatedData || candleData;
      const volumeToUse = validation.validatedData ? volumeData.slice(0, validation.validatedData.length) : volumeData;
      
      if (validation.shouldFixAutomatically) {
        console.log('🔧 RESET COORDINATION: Applied automatic timestamp fixes');
      }

      // Update chart data
      candlestickSeriesRef.current.setData(dataToUse);
      volumeSeriesRef.current.setData(volumeToUse);

      setOptimalZoom(dataToUse);

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
      
      // Exit reset phase after successful validations
      if (chartState.resetCoordination.isInResetPhase && 
          chartState.resetCoordination.postResetValidationPasses >= 2 &&
          incomingCandleCount > 0) {
        console.log('✅ RESET COORDINATION: Successful post-reset validation, exiting reset phase');
        setChartState(prev => ({
          ...prev,
          resetCoordination: {
            ...prev.resetCoordination,
            isInResetPhase: false,
            resetId: null
          }
        }));
      }

    } catch (error) {
      console.error('❌ RESET COORDINATION: Error updating chart:', error);
      setChartState(prev => ({ ...prev, status: 'error' }));
    } finally {
      isUpdatingRef.current = false;
    }
  }, [chartState, validateTimestampOrdering, detectAndHandleReset]);

  // ENHANCED: Monitor price history changes with reset coordination
  useEffect(() => {
    if (!chartState.isReady || !candlestickSeriesRef.current || !volumeSeriesRef.current) {
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
          allowedValidationFailures: 3
        }
      }));

      console.log('✅ RESET COORDINATION: Chart initialized with enhanced reset coordination');

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
          allowedValidationFailures: 3
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

  // ENHANCED: Building stats with reset coordination info
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
                   chartState.buildingStartTime > chartState.lastResetTime
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
          
          {/* ENHANCED: Reset coordination indicator */}
          <div className="bg-green-900 bg-opacity-75 px-3 py-1 rounded text-xs text-green-300">
            ✅ Enhanced Reset
          </div>
          
          {/* Reset phase indicator */}
          {chartState.resetCoordination.isInResetPhase && (
            <div className="bg-purple-900 bg-opacity-75 px-3 py-1 rounded text-xs text-purple-300">
              🔄 Reset Phase
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
          <div>⚡ Updates: {isUpdatingRef.current ? 'ACTIVE' : 'IDLE'}</div>
          <div>✅ Reset: ENHANCED</div>
          <div>🔧 Reset Phase: {chartState.resetCoordination.isInResetPhase ? 'YES' : 'NO'}</div>
          <div>📊 Validation Passes: {chartState.resetCoordination.postResetValidationPasses}</div>
          {chartState.lastResetTime && (
            <div>🕐 Last Reset: {Math.floor((Date.now() - chartState.lastResetTime) / 1000)}s ago</div>
          )}
          <div>🎯 Pro Zoom: {initialZoomSetRef.current ? 'SET' : 'PENDING'}</div>
          {buildingStats && (
            <>
              <div>⏱️ Time: {buildingStats.elapsed}s</div>
              <div>📈 Rate: {buildingStats.candlesPerSecond}/s</div>
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
            <h3 className="text-xl font-bold mb-3">Enhanced Chart Ready</h3>
            <p className="text-sm mb-4">Advanced reset coordination system active</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for backend candle data...</span>
              </div>
              <div>✅ Enhanced reset coordination</div>
              <div>🔧 Timestamp validation with auto-fix</div>
              <div>⚡ Smart update throttling</div>
              <div>📈 Optimal candle proportions</div>
              <div>🔧 TradingView-style display</div>
            </div>
          </div>
        </div>
      )}

      {chartState.status === 'resetting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-center text-purple-400">
            <div className="text-6xl mb-6 animate-spin">🔄</div>
            <h3 className="text-xl font-bold mb-3">Coordinated Reset in Progress</h3>
            <p className="text-sm mb-4">Clearing chart and preparing for new data</p>
            <div className="space-y-2 text-xs">
              <div>🔄 Reset coordination active</div>
              <div>📊 Chart data clearing</div>
              <div>⏳ Preparing for fresh data</div>
            </div>
          </div>
        </div>
      )}

      {chartState.status === 'building' && chartState.candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 ENHANCED LIVE BUILDING: {chartState.candleCount} candles
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • Enhanced reset coordination
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