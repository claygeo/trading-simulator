// frontend/src/components/mobile/MobileChart.tsx - FIXED: Chart Reset + Dynamic Resizing
import React, { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
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

interface MobileChartProps {
  priceHistory?: ChartPricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: any;
  symbol?: string;
  dynamicView?: boolean;
  isTabContentExpanded?: boolean;  // ISSUE 3 FIX: New prop for expansion state
  // RESET FIX: Add simulation tracking props (same as desktop)
  simulationId?: string;
  resetCounter?: number;
}

// RESET FIX: Add ref interface for manual reset capability (same as desktop)
export interface MobileChartRef {
  forceReset: () => void;
  clearChart: () => void;
}

const MobileChart = forwardRef<MobileChartRef, MobileChartProps>(({
  priceHistory = [],
  currentPrice = 0,
  trades = [],
  scenarioData,
  symbol = 'TOKEN/USDT',
  dynamicView = true,
  isTabContentExpanded = false,  // ISSUE 3 FIX: Default to collapsed
  simulationId,
  resetCounter = 0
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  
  const [isChartReady, setIsChartReady] = useState(false);
  const [chartStatus, setChartStatus] = useState<'initializing' | 'empty' | 'building' | 'ready' | 'error'>('initializing');
  const [candleCount, setCandleCount] = useState(0);
  const [isLiveBuilding, setIsLiveBuilding] = useState(false);
  const [buildingStartTime, setBuildingStartTime] = useState<number | null>(null);

  // ISSUE 3 FIX: State for chart dimensions tracking
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
  const [isResizing, setIsResizing] = useState(false);

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // RESET FIX: Track simulation and reset state (same as desktop)
  const lastSimulationIdRef = useRef<string | null>(null);
  const lastResetCounterRef = useRef<number>(0);
  const isResettingRef = useRef<boolean>(false);
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);

  const chartState = useRef({
    lastCandleCount: 0,
    hasEverHadData: false,
    buildStarted: false,
    initialRenderComplete: false
  });

  // ISSUE 3 FIX: Calculate dynamic chart height based on expansion state
  const calculateChartHeight = useCallback(() => {
    if (!chartContainerRef.current) return 300;
    
    const containerWidth = chartContainerRef.current.clientWidth;
    
    if (isTabContentExpanded) {
      // When expanded, use more space for better chart visibility
      return Math.max(400, Math.min(600, containerWidth * 0.6));
    } else {
      // When collapsed, use standard mobile height
      return Math.max(250, Math.min(350, containerWidth * 0.5));
    }
  }, [isTabContentExpanded]);

  // Mobile-optimized visible range calculation
  const calculateOptimalVisibleRange = useCallback((candleCount: number): { from: number; to: number } => {
    // Mobile shows fewer candles for better readability
    const MIN_VISIBLE_CANDLES = 15;
    const MAX_VISIBLE_CANDLES = 40;
    const PREFERRED_VISIBLE_CANDLES = 25;
    
    if (candleCount <= MIN_VISIBLE_CANDLES) {
      return { from: 0, to: Math.max(1, candleCount - 1) };
    }
    
    let visibleCandles = PREFERRED_VISIBLE_CANDLES;
    
    if (candleCount < PREFERRED_VISIBLE_CANDLES) {
      visibleCandles = candleCount;
    } else if (candleCount > 100) {
      visibleCandles = Math.min(MAX_VISIBLE_CANDLES, candleCount * 0.3);
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

  // RESET FIX: Enhanced chart clearing function (same as desktop)
  const clearChartData = useCallback(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
    
    try {
      // Clear all series data
      candlestickSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      
      // Reset chart state
      chartState.current = {
        lastCandleCount: 0,
        hasEverHadData: false,
        buildStarted: false,
        initialRenderComplete: true
      };
      
      // Reset refs
      lastCandleCountRef.current = 0;
      lastUpdateRef.current = 0;
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      isUpdatingRef.current = false;
      
      // Update component state
      setChartStatus('empty');
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);
      
      console.log('📱 Mobile chart data cleared successfully');
      
    } catch (error) {
      console.error('❌ Error clearing mobile chart data:', error);
    }
  }, []);

  // RESET FIX: Force reset function for external calls (same as desktop)
  const forceReset = useCallback(() => {
    console.log('🚨 MOBILE FORCE RESET: Manually resetting chart');
    isResettingRef.current = true;
    
    clearChartData();
    
    // Small delay to ensure clearing is complete
    setTimeout(() => {
      isResettingRef.current = false;
      console.log('✅ MOBILE FORCE RESET: Complete');
    }, 100);
  }, [clearChartData]);

  // RESET FIX: Expose reset methods via ref (same as desktop)
  useImperativeHandle(ref, () => ({
    forceReset,
    clearChart: clearChartData
  }), [forceReset, clearChartData]);

  // ISSUE 3 FIX: Dynamic chart resize function
  const resizeChart = useCallback(() => {
    if (!chartRef.current || !chartContainerRef.current || isResettingRef.current) return;

    setIsResizing(true);
    
    const newWidth = chartContainerRef.current.clientWidth;
    const newHeight = calculateChartHeight();
    
    try {
      chartRef.current.applyOptions({
        width: newWidth,
        height: newHeight,
      });
      
      setChartDimensions({ width: newWidth, height: newHeight });
      
      // Call TradingView chart.resize() method for proper resizing
      chartRef.current.timeScale().fitContent();
      
    } catch (error) {
      console.error('Error resizing mobile chart:', error);
    } finally {
      // Clear resizing state after animation
      setTimeout(() => setIsResizing(false), 300);
    }
  }, [calculateChartHeight]);

  // RESET FIX: Detect simulation changes and reset counter changes (same as desktop)
  useEffect(() => {
    const simulationChanged = simulationId && simulationId !== lastSimulationIdRef.current;
    const resetCounterChanged = resetCounter !== lastResetCounterRef.current;
    
    if (simulationChanged || resetCounterChanged) {
      console.log('📱 MOBILE SIMULATION CHANGE DETECTED:', {
        oldSimId: lastSimulationIdRef.current,
        newSimId: simulationId,
        oldResetCounter: lastResetCounterRef.current,
        newResetCounter: resetCounter,
        simulationChanged,
        resetCounterChanged
      });
      
      // Update tracking refs
      lastSimulationIdRef.current = simulationId || null;
      lastResetCounterRef.current = resetCounter;
      
      // Force chart reset
      if (isChartReady) {
        forceReset();
      }
    }
  }, [simulationId, resetCounter, isChartReady, forceReset]);

  // ISSUE 3 FIX: Effect to handle expansion state changes
  useEffect(() => {
    if (chartRef.current && chartContainerRef.current && !isResettingRef.current) {
      // Clear any existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      // Debounce resize to prevent excessive calls
      resizeTimeoutRef.current = setTimeout(() => {
        resizeChart();
      }, 100);
    }
    
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [isTabContentExpanded, resizeChart]);

  // RESET FIX: Enhanced chart initialization with better cleanup (same as desktop)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    setChartStatus('initializing');
    isResettingRef.current = false;

    try {
      const initialHeight = calculateChartHeight();
      
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: initialHeight,
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
          scaleMargins: { top: 0.1, bottom: 0.25 }, // More space at bottom for mobile
        },
        timeScale: {
          borderColor: '#1C2951',
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 8, // Slightly tighter for mobile
          minBarSpacing: 0.5,
          rightOffset: 3, // Less offset for mobile
          shiftVisibleRangeOnNewBar: false,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true, // Important for mobile
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
        scaleMargins: { top: 0.9, bottom: 0 }, // More space for price scale on mobile
      });

      chartRef.current = chart;
      candlestickSeriesRef.current = candlestickSeries;
      volumeSeriesRef.current = volumeSeries;
      
      // RESET FIX: Ensure series start completely empty
      candlestickSeries.setData([]);
      volumeSeries.setData([]);
      
      // RESET FIX: Initialize all state properly
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      chartState.current = {
        lastCandleCount: 0,
        hasEverHadData: false,
        buildStarted: false,
        initialRenderComplete: true
      };
      
      lastCandleCountRef.current = 0;
      lastUpdateRef.current = 0;
      isUpdatingRef.current = false;
      isResettingRef.current = false;
      
      // RESET FIX: Track current simulation
      lastSimulationIdRef.current = simulationId || null;
      lastResetCounterRef.current = resetCounter;
      
      setChartDimensions({ 
        width: chartContainerRef.current.clientWidth, 
        height: initialHeight 
      });
      
      setIsChartReady(true);
      setChartStatus('empty');
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);

      console.log('✅ Mobile chart initialized successfully for simulation:', simulationId);

    } catch (error) {
      console.error('❌ Failed to create mobile chart:', error);
      setChartStatus('error');
    }

    return () => {
      console.log('🧹 Cleaning up mobile chart component');
      
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
        updateThrottleRef.current = null;
      }
      
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.warn('Warning during mobile chart cleanup:', error);
        }
      }
      
      // RESET FIX: Complete state reset on cleanup
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setIsChartReady(false);
      setChartStatus('initializing');
      
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
      isResettingRef.current = false;
      
      lastSimulationIdRef.current = null;
      lastResetCounterRef.current = 0;
    };
  }, [calculateChartHeight]); // RESET FIX: Only depend on height calculation

  const setOptimalZoom = useCallback((candleData: CandlestickData[], force: boolean = false) => {
    if (!chartRef.current || !candleData.length || isResettingRef.current) return;

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
      if (Math.random() < 0.15) { // Slightly more frequent updates for mobile
        try {
          const { from, to } = calculateOptimalVisibleRange(candleCount);
          chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        } catch (error) {
          // Ignore dynamic zoom errors
        }
      }
    }
  }, [calculateOptimalVisibleRange, dynamicView]);

  // RESET FIX: Enhanced chart update with better reset detection (same as desktop logic)
  const updateChart = useCallback((candleData: CandlestickData[], volumeData: HistogramData[]) => {
    if (!isChartReady || !candlestickSeriesRef.current || !volumeSeriesRef.current || isUpdatingRef.current || isResettingRef.current) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    // Slightly more aggressive throttling for mobile
    if (timeSinceLastUpdate < 50) {
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
      }
      
      updateThrottleRef.current = setTimeout(() => {
        updateChart(candleData, volumeData);
      }, 50 - timeSinceLastUpdate);
      return;
    }

    isUpdatingRef.current = true;
    lastUpdateRef.current = now;

    try {
      const incomingCandleCount = candleData.length;

      // RESET FIX: Enhanced empty data handling
      if (incomingCandleCount === 0) {
        console.log('📱 MOBILE CHART RESET: Clearing chart due to empty data');
        
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
        initialZoomSetRef.current = false;
        shouldAutoFitRef.current = true;
        
        isUpdatingRef.current = false;
        return;
      }

      // RESET FIX: Detect significant data reduction (likely a reset)
      if (incomingCandleCount > 0 && lastCandleCountRef.current > 0 && incomingCandleCount < lastCandleCountRef.current * 0.5) {
        console.log('📱 MOBILE CHART RESET: Detected significant data reduction', {
          previous: lastCandleCountRef.current,
          incoming: incomingCandleCount,
          ratio: incomingCandleCount / lastCandleCountRef.current
        });
        
        // Force complete reset
        candlestickSeriesRef.current.setData([]);
        volumeSeriesRef.current.setData([]);
        
        // Reset state
        chartState.current.lastCandleCount = 0;
        chartState.current.buildStarted = false;
        chartState.current.hasEverHadData = false;
        lastCandleCountRef.current = 0;
        initialZoomSetRef.current = false;
        shouldAutoFitRef.current = true;
        
        // Small delay then set new data
        setTimeout(() => {
          if (candlestickSeriesRef.current && volumeSeriesRef.current && !isResettingRef.current) {
            candlestickSeriesRef.current.setData(candleData);
            volumeSeriesRef.current.setData(volumeData);
            
            chartState.current.lastCandleCount = incomingCandleCount;
            lastCandleCountRef.current = incomingCandleCount;
            setCandleCount(incomingCandleCount);
            
            if (incomingCandleCount > 0) {
              chartState.current.hasEverHadData = true;
              chartState.current.buildStarted = true;
              setIsLiveBuilding(true);
              setBuildingStartTime(Date.now());
              setChartStatus('building');
            }
            
            setOptimalZoom(candleData);
          }
        }, 50);
        
        isUpdatingRef.current = false;
        return;
      }

      if (incomingCandleCount > 0 && lastCandleCountRef.current === 0) {
        if (!chartState.current.hasEverHadData) {
          chartState.current.hasEverHadData = true;
          chartState.current.buildStarted = true;
          setIsLiveBuilding(true);
          setBuildingStartTime(Date.now());
          setChartStatus('building');
        }
      }

      // Data validation
      let isOrdered = true;
      if (candleData.length > 1) {
        for (let i = 1; i < Math.min(candleData.length, 10); i++) {
          if (candleData[i].time <= candleData[i - 1].time) {
            isOrdered = false;
            break;
          }
        }
      }

      if (!isOrdered) {
        console.warn('⚠️ Mobile chart data is not properly ordered, skipping update');
        isUpdatingRef.current = false;
        return;
      }

      candlestickSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);

      setOptimalZoom(candleData);

      chartState.current.lastCandleCount = incomingCandleCount;
      lastCandleCountRef.current = incomingCandleCount;
      setCandleCount(incomingCandleCount);

      if (incomingCandleCount >= 30) { // Lower threshold for mobile
        setChartStatus('ready');
      } else if (incomingCandleCount > 0) {
        setChartStatus('building');
      }

    } catch (error) {
      console.error('❌ Error updating mobile chart:', error);
      setChartStatus('error');
    } finally {
      isUpdatingRef.current = false;
    }
  }, [isChartReady, setOptimalZoom]);

  useEffect(() => {
    const { candleData, volumeData } = convertPriceHistory;
    updateChart(candleData, volumeData);
  }, [convertPriceHistory, updateChart]);

  // ISSUE 3 FIX: Enhanced resize handling with orientation change support
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeTimeoutRef.current = setTimeout(() => {
        resizeChart();
      }, 100);
    };

    const handleOrientationChange = () => {
      // Orientation change needs longer delay for mobile browsers
      setTimeout(() => {
        resizeChart();
      }, 300);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [resizeChart]);

  const resetView = useCallback(() => {
    try {
      if (chartRef.current && !isResettingRef.current) {
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
      if (chartRef.current && !isResettingRef.current) {
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
    if (candleData.length > 0 && !isResettingRef.current) {
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
          text: `Building: ${candleCount}`
        };
      case 'ready':
        return { 
          color: 'bg-green-900 text-green-300', 
          icon: '✅', 
          text: `Live: ${candleCount}`
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
      {/* ISSUE 3 FIX: Dynamic container with smooth transitions */}
      <div 
        ref={chartContainerRef} 
        className={`w-full transition-all duration-300 ease-in-out ${
          isResizing ? 'opacity-90' : 'opacity-100'
        }`}
        style={{ 
          height: calculateChartHeight(),
          minHeight: '250px',
          maxHeight: '600px'
        }}
      />
      
      {/* Mobile-optimized overlay */}
      <div className="absolute top-2 left-2 pointer-events-none">
        <div className="flex items-center space-x-2">
          <h3 className="text-white text-sm font-bold">{symbol}</h3>
          
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              chartStatus === 'building' || chartStatus === 'ready' ? 'bg-green-400 animate-pulse' :
              chartStatus === 'empty' ? 'bg-blue-400 animate-pulse' :
              chartStatus === 'error' ? 'bg-red-400' :
              'bg-yellow-400 animate-pulse'
            }`}></div>
            <span>{statusInfo.text}</span>
          </div>
          
          {/* ISSUE 3 FIX: Chart size indicator */}
          <div className="bg-purple-900 bg-opacity-75 px-2 py-1 rounded text-xs">
            <span className="text-purple-300">
              {isTabContentExpanded ? 'Expanded' : 'Standard'}
            </span>
          </div>
          
          {/* RESET FIX: Reset tracking info */}
          <div className="bg-red-900 bg-opacity-75 px-2 py-1 rounded text-xs text-red-300">
            🔄 R{resetCounter}
          </div>
          
          {currentPrice > 0 && (
            <div className="bg-gray-900 bg-opacity-75 px-2 py-1 rounded">
              <span className="text-white text-sm font-mono">
                ${currentPrice < 1 ? currentPrice.toFixed(6) : currentPrice.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile chart controls */}
      <div className="absolute bottom-2 right-2 flex space-x-1">
        <button
          onClick={optimizeZoom}
          className="px-2 py-1 bg-blue-700 bg-opacity-80 text-blue-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Optimize zoom"
        >
          🎯
        </button>
        <button
          onClick={resetView}
          className="px-2 py-1 bg-gray-700 bg-opacity-80 text-gray-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Reset view"
        >
          🔄
        </button>
        {/* ISSUE 3 FIX: Manual resize trigger */}
        <button
          onClick={resizeChart}
          disabled={isResizing}
          className={`px-2 py-1 text-xs rounded transition ${
            isResizing 
              ? 'bg-yellow-700 bg-opacity-80 text-yellow-300 cursor-not-allowed' 
              : 'bg-purple-700 bg-opacity-80 text-purple-300 hover:bg-opacity-100'
          }`}
          title="Manual resize"
        >
          {isResizing ? '↻' : '📐'}
        </button>
        {/* RESET FIX: Manual reset button for testing */}
        <button
          onClick={forceReset}
          className="px-2 py-1 bg-red-700 bg-opacity-80 text-red-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Force reset mobile chart"
        >
          ⚡
        </button>
      </div>
      
      {/* Mobile building indicator */}
      {isLiveBuilding && buildingStats && (
        <div className="absolute top-8 left-2 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-2 py-1 rounded">
            <div className="text-green-300 text-xs font-medium">
              🔴 LIVE: {buildingStats.candlesPerSecond}/sec
            </div>
          </div>
        </div>
      )}
      
      {/* ISSUE 3 FIX: Resize indicator */}
      {isResizing && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-purple-900 bg-opacity-90 px-4 py-2 rounded-lg border border-purple-500">
            <div className="text-purple-300 text-sm font-medium flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
              <span>Resizing Chart...</span>
            </div>
            <div className="text-purple-400 text-xs text-center mt-1">
              {chartDimensions.width} × {chartDimensions.height}
            </div>
          </div>
        </div>
      )}
      
      {/* RESET FIX: Show reset indicator */}
      {isResettingRef.current && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-red-900 bg-opacity-90 px-4 py-2 rounded-lg border border-red-500">
            <div className="text-red-300 text-sm font-medium flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin"></div>
              <span>📱 Resetting Mobile Chart...</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Mobile error state */}
      {chartStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-red-900 text-red-100 p-4 rounded-lg max-w-xs text-center">
            <h3 className="font-bold text-lg mb-2">Chart Error</h3>
            <p className="text-sm">Failed to initialize chart on mobile device.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-3 px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm transition"
            >
              Reload
            </button>
          </div>
        </div>
      )}
      
      {/* Mobile empty state */}
      {chartStatus === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-bold mb-2">Mobile Chart Ready</h3>
            <p className="text-sm mb-3">Enhanced with reset management</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for candle data...</span>
              </div>
              <div>📱 Mobile optimized • Dynamic sizing</div>
              <div>🤏 Pinch to zoom • Touch friendly</div>
              <div>🔄 Advanced reset detection</div>
              <div>📐 Responsive: {isTabContentExpanded ? 'Expanded' : 'Standard'} mode</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

MobileChart.displayName = 'MobileChart';

export default MobileChart;