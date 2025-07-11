// frontend/src/components/PriceChart.tsx - FIXED: Complete Chart Reset Solution
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

interface PriceChartProps {
  priceHistory?: ChartPricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: any;
  symbol?: string;
  dynamicView?: boolean;
  // RESET FIX: Add simulation ID to detect resets
  simulationId?: string;
  // RESET FIX: Add reset counter for forcing resets
  resetCounter?: number;
}

// RESET FIX: Add ref interface for manual reset capability
export interface PriceChartRef {
  forceReset: () => void;
  clearChart: () => void;
  recreateChart: () => void; // NEW: Complete chart recreation
}

const PriceChart = forwardRef<PriceChartRef, PriceChartProps>(({
  priceHistory = [],
  currentPrice = 0,
  trades = [],
  scenarioData,
  symbol = 'TOKEN/USDT',
  dynamicView = true,
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

  const lastUpdateRef = useRef<number>(0);
  const lastCandleCountRef = useRef<number>(0);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  
  // RESET FIX: Track simulation and reset state
  const lastSimulationIdRef = useRef<string | null>(null);
  const lastResetCounterRef = useRef<number>(0);
  const isResettingRef = useRef<boolean>(false);
  const chartCreationKeyRef = useRef<number>(0); // NEW: Track chart recreations
  
  const initialZoomSetRef = useRef<boolean>(false);
  const shouldAutoFitRef = useRef<boolean>(true);

  const chartState = useRef({
    lastCandleCount: 0,
    hasEverHadData: false,
    buildStarted: false,
    initialRenderComplete: false
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

  // RESET FIX: Create chart series - separated into its own function
  const createChartSeries = useCallback(() => {
    if (!chartRef.current) return;

    try {
      // CRITICAL: Remove existing series completely before creating new ones
      if (candlestickSeriesRef.current) {
        chartRef.current.removeSeries(candlestickSeriesRef.current);
        candlestickSeriesRef.current = null;
      }
      
      if (volumeSeriesRef.current) {
        chartRef.current.removeSeries(volumeSeriesRef.current);
        volumeSeriesRef.current = null;
      }

      // Create fresh candlestick series
      const candlestickSeries = chartRef.current.addCandlestickSeries({
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

      // Create fresh volume series
      const volumeSeries = chartRef.current.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { 
          type: 'volume',
          precision: 0,
        },
        priceScaleId: 'volume',
      });

      // Configure volume scale
      chartRef.current.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      // Update refs
      candlestickSeriesRef.current = candlestickSeries;
      volumeSeriesRef.current = volumeSeries;

      console.log('✅ CHART SERIES: Created fresh series');

    } catch (error) {
      console.error('❌ Error creating chart series:', error);
      throw error;
    }
  }, []);

  // RESET FIX: Enhanced chart clearing function
  const clearChartData = useCallback(() => {
    try {
      console.log('🧹 CLEARING CHART: Starting complete clear');
      
      // Method 1: Clear existing series data
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        candlestickSeriesRef.current.setData([]);
        volumeSeriesRef.current.setData([]);
      }

      // Method 2: Recreate series entirely (THIS IS THE KEY FIX)
      createChartSeries();
      
      // Reset all state
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
      
      console.log('✅ CLEARING CHART: Complete clear successful');
      
    } catch (error) {
      console.error('❌ Error clearing chart data:', error);
      // Fallback: try to recreate entire chart
      recreateChart();
    }
  }, [createChartSeries]);

  // RESET FIX: Complete chart recreation function
  const recreateChart = useCallback(() => {
    if (!chartContainerRef.current) return;

    console.log('🔄 RECREATING CHART: Starting complete recreation');
    isResettingRef.current = true;

    try {
      // Step 1: Destroy existing chart completely
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.warn('Warning during chart removal:', error);
        }
      }

      // Step 2: Clear all refs
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;

      // Step 3: Increment creation key to force new instance
      chartCreationKeyRef.current += 1;

      // Step 4: Small delay to ensure cleanup
      setTimeout(() => {
        if (!chartContainerRef.current) {
          isResettingRef.current = false;
          return;
        }

        try {
          // Step 5: Create completely fresh chart
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

          chartRef.current = chart;

          // Step 6: Create fresh series
          createChartSeries();

          // Step 7: Reset all state
          chartState.current = {
            lastCandleCount: 0,
            hasEverHadData: false,
            buildStarted: false,
            initialRenderComplete: true
          };
          
          lastCandleCountRef.current = 0;
          lastUpdateRef.current = 0;
          initialZoomSetRef.current = false;
          shouldAutoFitRef.current = true;
          isUpdatingRef.current = false;
          
          setIsChartReady(true);
          setChartStatus('empty');
          setCandleCount(0);
          setIsLiveBuilding(false);
          setBuildingStartTime(null);

          console.log('✅ RECREATING CHART: Complete recreation successful');

        } catch (error) {
          console.error('❌ Error recreating chart:', error);
          setChartStatus('error');
        } finally {
          isResettingRef.current = false;
        }
      }, 100);

    } catch (error) {
      console.error('❌ Error during chart recreation:', error);
      isResettingRef.current = false;
      setChartStatus('error');
    }
  }, [createChartSeries]);

  // RESET FIX: Force reset function for external calls
  const forceReset = useCallback(() => {
    console.log('🚨 FORCE RESET: Starting aggressive chart reset');
    
    // Use the nuclear option: complete chart recreation
    recreateChart();
  }, [recreateChart]);

  // RESET FIX: Expose reset methods via ref
  useImperativeHandle(ref, () => ({
    forceReset,
    clearChart: clearChartData,
    recreateChart
  }), [forceReset, clearChartData, recreateChart]);

  // RESET FIX: Detect simulation changes and reset counter changes
  useEffect(() => {
    const simulationChanged = simulationId && simulationId !== lastSimulationIdRef.current;
    const resetCounterChanged = resetCounter !== lastResetCounterRef.current;
    
    if (simulationChanged || resetCounterChanged) {
      console.log('🔄 SIMULATION CHANGE DETECTED:', {
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
      
      // Force complete chart recreation on any change
      if (isChartReady) {
        recreateChart();
      }
    }
  }, [simulationId, resetCounter, isChartReady, recreateChart]);

  // RESET FIX: Enhanced chart initialization
  useEffect(() => {
    if (!chartContainerRef.current) return;

    setChartStatus('initializing');
    isResettingRef.current = false;

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

      chartRef.current = chart;
      
      // Create initial series
      createChartSeries();
      
      // Initialize all state
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
      initialZoomSetRef.current = false;
      shouldAutoFitRef.current = true;
      
      // Track current simulation
      lastSimulationIdRef.current = simulationId || null;
      lastResetCounterRef.current = resetCounter;
      chartCreationKeyRef.current = 1;
      
      setIsChartReady(true);
      setChartStatus('empty');
      setCandleCount(0);
      setIsLiveBuilding(false);
      setBuildingStartTime(null);

      console.log('✅ Chart initialized successfully for simulation:', simulationId);

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
      
      // Complete state reset on cleanup
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
  }, []); // No dependencies to prevent unnecessary recreations

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

  // RESET FIX: Enhanced chart update with nuclear reset detection
  const updateChart = useCallback((candleData: CandlestickData[], volumeData: HistogramData[]) => {
    if (!isChartReady || !candlestickSeriesRef.current || !volumeSeriesRef.current || isUpdatingRef.current || isResettingRef.current) {
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

      // RESET FIX: Enhanced empty data handling with series recreation
      if (incomingCandleCount === 0) {
        console.log('📊 CHART RESET: Clearing chart due to empty data (recreating series)');
        
        // Use aggressive clearing with series recreation
        createChartSeries();
        
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

      // RESET FIX: Detect significant data reduction and force nuclear reset
      if (incomingCandleCount > 0 && lastCandleCountRef.current > 0 && incomingCandleCount < lastCandleCountRef.current * 0.5) {
        console.log('📊 CHART RESET: Detected significant data reduction - NUCLEAR RESET', {
          previous: lastCandleCountRef.current,
          incoming: incomingCandleCount,
          ratio: incomingCandleCount / lastCandleCountRef.current
        });
        
        // NUCLEAR OPTION: Complete chart recreation
        isUpdatingRef.current = false;
        recreateChart();
        
        // Set new data after recreation delay
        setTimeout(() => {
          if (candlestickSeriesRef.current && volumeSeriesRef.current && !isResettingRef.current) {
            try {
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
            } catch (error) {
              console.error('Error setting data after nuclear reset:', error);
            }
          }
        }, 150);
        
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
        console.warn('⚠️ Chart data is not properly ordered, forcing recreation');
        isUpdatingRef.current = false;
        recreateChart();
        return;
      }

      // Set data on current series
      candlestickSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);

      setOptimalZoom(candleData);

      chartState.current.lastCandleCount = incomingCandleCount;
      lastCandleCountRef.current = incomingCandleCount;
      setCandleCount(incomingCandleCount);

      if (incomingCandleCount >= 50) {
        setChartStatus('ready');
      } else if (incomingCandleCount > 0) {
        setChartStatus('building');
      }

    } catch (error) {
      console.error('❌ Error updating chart, forcing recreation:', error);
      setChartStatus('error');
      isUpdatingRef.current = false;
      recreateChart();
      return;
    } finally {
      isUpdatingRef.current = false;
    }
  }, [isChartReady, setOptimalZoom, createChartSeries, recreateChart]);

  useEffect(() => {
    const { candleData, volumeData } = convertPriceHistory;
    updateChart(candleData, volumeData);
  }, [convertPriceHistory, updateChart]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current && !isResettingRef.current) {
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
          
          {/* RESET FIX: Show reset tracking info */}
          <div className="bg-purple-900 bg-opacity-75 px-3 py-1 rounded text-xs text-purple-300">
            🔄 R{resetCounter} | C{chartCreationKeyRef.current}
          </div>
          
          {simulationId && (
            <div className="bg-cyan-900 bg-opacity-75 px-3 py-1 rounded text-xs text-cyan-300">
              📡 {simulationId.substring(0, 8)}...
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
        {/* RESET FIX: Nuclear reset button */}
        <button
          onClick={recreateChart}
          className="px-3 py-1 bg-red-700 bg-opacity-80 text-red-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Nuclear reset - completely recreate chart"
        >
          💥 Nuclear
        </button>
        <button
          onClick={forceReset}
          className="px-3 py-1 bg-orange-700 bg-opacity-80 text-orange-300 text-xs rounded hover:bg-opacity-100 transition"
          title="Force reset chart"
        >
          ⚡ Reset
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
          <div>💥 Resetting: {isResettingRef.current ? 'YES' : 'NO'}</div>
          <div>📈 Chart Key: {chartCreationKeyRef.current}</div>
          <div>🎯 Pro Zoom: {initialZoomSetRef.current ? 'SET' : 'PENDING'}</div>
          {buildingStats && (
            <>
              <div>⏱️ Time: {buildingStats.elapsed}s</div>
              <div>📈 Rate: {buildingStats.candlesPerSecond}/s</div>
            </>
          )}
        </div>
      </div>
      
      {/* RESET FIX: Show reset indicator */}
      {isResettingRef.current && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-red-900 bg-opacity-90 px-6 py-3 rounded-lg border border-red-500">
            <div className="text-red-300 text-lg font-medium flex items-center space-x-3">
              <div className="w-6 h-6 border-4 border-red-300 border-t-transparent rounded-full animate-spin"></div>
              <span>💥 Nuclear Chart Reset...</span>
            </div>
            <div className="text-red-400 text-sm text-center mt-1">
              Completely recreating chart instance
            </div>
          </div>
        </div>
      )}
      
      {chartStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-red-900 text-red-100 p-6 rounded-lg max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Chart Error</h3>
            <p className="text-sm">Failed to initialize TradingView chart. Check console for details.</p>
            <div className="mt-4 space-x-2">
              <button 
                onClick={recreateChart} 
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm transition"
              >
                💥 Nuclear Reset
              </button>
              <button 
                onClick={() => window.location.reload()} 
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm transition"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )}
      
      {chartStatus === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-6xl mb-6">📊</div>
            <h3 className="text-xl font-bold mb-3">Nuclear Chart Ready</h3>
            <p className="text-sm mb-4">Complete TradingView reset solution implemented</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span>Waiting for candle data...</span>
              </div>
              <div>💥 Nuclear reset capability</div>
              <div>🔄 Series recreation on reset</div>
              <div>📡 Simulation tracking</div>
              <div>⚡ Aggressive data clearing</div>
              <div>📈 Complete state management</div>
              <div>🛡️ Error recovery system</div>
            </div>
          </div>
        </div>
      )}

      {chartStatus === 'building' && candleCount > 0 && (
        <div className="absolute top-20 left-4 pointer-events-none">
          <div className="bg-green-900 bg-opacity-75 px-4 py-2 rounded-lg">
            <div className="text-green-300 text-sm font-medium">
              🔴 NUCLEAR CHART BUILDING: {candleCount} candles
            </div>
            {buildingStats && (
              <div className="text-green-400 text-xs mt-1">
                {buildingStats.elapsed}s elapsed • {buildingStats.candlesPerSecond} candles/sec • Nuclear reset protection
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

PriceChart.displayName = 'PriceChart';

export default PriceChart;