import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  wsMessagesPerSec: number;
  renderTime: number;
  totalTrades: number;
  activeConnections: number;
  latency: number;
  componentUpdates: number;
}

interface PerformanceMonitorProps {
  isVisible: boolean;
  onToggle: () => void;
  wsMessageCount?: number;
  tradeCount?: number;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isVisible,
  onToggle,
  wsMessageCount = 0,
  tradeCount = 0
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    memoryUsage: 0,
    wsMessagesPerSec: 0,
    renderTime: 0,
    totalTrades: 0,
    activeConnections: 1,
    latency: 0,
    componentUpdates: 0
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceMetrics[]>([]);
  
  // Refs for tracking
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const wsMessageCountRef = useRef(0);
  const lastWsCountRef = useRef(0);
  const renderStartTimeRef = useRef(0);
  const componentUpdateCountRef = useRef(0);
  const animationFrameRef = useRef<number>();

  // Track component updates
  const trackComponentUpdate = useCallback(() => {
    componentUpdateCountRef.current += 1;
  }, []);

  // FPS calculation
  const calculateFPS = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameTimeRef.current;
    
    if (delta >= 1000) { // Update every second
      const fps = Math.round((frameCountRef.current * 1000) / delta);
      
      // WebSocket messages per second
      const wsPerSec = wsMessageCount - lastWsCountRef.current;
      lastWsCountRef.current = wsMessageCount;
      
      // Memory usage (if available)
      const memoryInfo = (performance as any).memory;
      const memoryUsage = memoryInfo ? 
        Math.round((memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100) : 0;

      // Simulated latency (in real app, measure actual WebSocket roundtrip)
      const latency = Math.random() * 50 + 10; // 10-60ms simulation
      
      setMetrics(prev => ({
        ...prev,
        fps,
        memoryUsage,
        wsMessagesPerSec: wsPerSec,
        totalTrades: tradeCount,
        latency: Math.round(latency),
        componentUpdates: componentUpdateCountRef.current
      }));

      // Store history for mini chart
      setPerformanceHistory(prev => {
        const newHistory = [...prev, {
          fps,
          memoryUsage,
          wsMessagesPerSec: wsPerSec,
          renderTime: prev.renderTime || 0,
          totalTrades: tradeCount,
          activeConnections: 1,
          latency: Math.round(latency),
          componentUpdates: componentUpdateCountRef.current
        }].slice(-20); // Keep last 20 data points
        return newHistory;
      });

      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
      componentUpdateCountRef.current = 0;
    }
    
    frameCountRef.current++;
    animationFrameRef.current = requestAnimationFrame(calculateFPS);
  }, [wsMessageCount, tradeCount]);

  // Performance monitoring effect
  useEffect(() => {
    if (isVisible) {
      calculateFPS();
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVisible, calculateFPS]);

  // Track render performance
  useEffect(() => {
    renderStartTimeRef.current = performance.now();
    trackComponentUpdate();
    
    return () => {
      const renderTime = performance.now() - renderStartTimeRef.current;
      setMetrics(prev => ({
        ...prev,
        renderTime: Math.round(renderTime * 100) / 100
      }));
    };
  });

  // Performance status
  const getPerformanceStatus = () => {
    const { fps, memoryUsage, latency } = metrics;
    
    if (fps > 55 && memoryUsage < 70 && latency < 100) {
      return { status: 'excellent', color: 'text-green-500', text: 'Excellent' };
    } else if (fps > 45 && memoryUsage < 85 && latency < 150) {
      return { status: 'good', color: 'text-blue-500', text: 'Good' };
    } else if (fps > 30 && memoryUsage < 95 && latency < 250) {
      return { status: 'fair', color: 'text-yellow-500', text: 'Fair' };
    } else {
      return { status: 'poor', color: 'text-red-500', text: 'Poor' };
    }
  };

  const performanceStatus = getPerformanceStatus();

  // Mini chart for FPS history
  const renderMiniChart = (data: number[], color: string) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    
    return (
      <svg width="60" height="20" className="inline-block">
        <polyline
          points={data.map((value, index) => 
            `${(index / (data.length - 1)) * 60},${20 - ((value - min) / range) * 20}`
          ).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="1"
          className="opacity-80"
        />
      </svg>
    );
  };

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed top-4 right-4 z-50 bg-gray-800 text-white p-2 rounded-lg shadow-lg hover:bg-gray-700 transition-colors"
        title="Show Performance Monitor"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18V3H3zm16 16H5V5h14v14z"/>
          <path d="M7 10l2 2 2-2 2 2 2-2"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white p-3 rounded-lg shadow-xl border border-gray-700 min-w-[300px]">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            performanceStatus.status === 'excellent' ? 'bg-green-500' :
            performanceStatus.status === 'good' ? 'bg-blue-500' :
            performanceStatus.status === 'fair' ? 'bg-yellow-500' : 'bg-red-500'
          } animate-pulse`}></div>
          <span className="text-sm font-semibold">Performance Monitor</span>
          <span className={`text-xs ${performanceStatus.color}`}>
            {performanceStatus.text}
          </span>
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white p-1"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isExpanded ? (
                <path d="M18 6L6 18M6 6l12 12"/>
              ) : (
                <path d="M8 18l4-4 4 4M8 6l4 4 4-4"/>
              )}
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-white p-1"
            title="Hide Monitor"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Core Metrics */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">FPS</div>
          <div className="flex items-center justify-between">
            <span className={`text-lg font-bold ${
              metrics.fps > 55 ? 'text-green-400' : 
              metrics.fps > 45 ? 'text-blue-400' : 
              metrics.fps > 30 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {metrics.fps}
            </span>
            {performanceHistory.length > 1 && renderMiniChart(
              performanceHistory.map(h => h.fps), 
              metrics.fps > 45 ? '#10B981' : '#EF4444'
            )}
          </div>
        </div>

        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Memory</div>
          <div className="flex items-center justify-between">
            <span className={`text-lg font-bold ${
              metrics.memoryUsage < 70 ? 'text-green-400' : 
              metrics.memoryUsage < 85 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {metrics.memoryUsage}%
            </span>
            {performanceHistory.length > 1 && renderMiniChart(
              performanceHistory.map(h => h.memoryUsage), 
              metrics.memoryUsage < 80 ? '#10B981' : '#EF4444'
            )}
          </div>
        </div>

        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">WS/sec</div>
          <div className="text-lg font-bold text-blue-400">{metrics.wsMessagesPerSec}</div>
        </div>

        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Latency</div>
          <div className={`text-lg font-bold ${
            metrics.latency < 100 ? 'text-green-400' : 
            metrics.latency < 200 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {metrics.latency}ms
          </div>
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Render Time:</span>
              <span className="text-white">{metrics.renderTime}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Trades:</span>
              <span className="text-white">{metrics.totalTrades.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Component Updates:</span>
              <span className="text-white">{metrics.componentUpdates}/sec</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Active Connections:</span>
              <span className="text-green-400">{metrics.activeConnections}</span>
            </div>
          </div>

          {/* Performance Tips */}
          <div className="mt-3 p-2 bg-gray-800 rounded text-[10px]">
            <div className="text-gray-300 mb-1">💡 Performance Tips:</div>
            {metrics.fps < 45 && (
              <div className="text-yellow-300">• Low FPS detected - check component re-renders</div>
            )}
            {metrics.memoryUsage > 85 && (
              <div className="text-red-300">• High memory usage - potential memory leak</div>
            )}
            {metrics.wsMessagesPerSec > 100 && (
              <div className="text-blue-300">• High WebSocket traffic - consider batching</div>
            )}
            {metrics.latency > 200 && (
              <div className="text-orange-300">• High latency - check network conditions</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceMonitor;