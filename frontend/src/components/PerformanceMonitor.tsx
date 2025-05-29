// frontend/src/components/PerformanceMonitor.tsx - Enhanced version
import React, { useState, useEffect, useRef } from 'react';

interface PerformanceMonitorProps {
  isVisible: boolean;
  onToggle: () => void;
  wsMessageCount: number;
  tradeCount: number;
  queueSize?: number;
  droppedMessages?: number;
  batchesProcessed?: number;
  isHighFrequencyMode?: boolean;
  simulationSpeed?: number;
}

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  renderTime: number;
  messageRate: number;
  cpuLoad: number;
  networkLatency: number;
  frameDrops: number;
  gcTime: number;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isVisible,
  onToggle,
  wsMessageCount,
  tradeCount,
  queueSize = 0,
  droppedMessages = 0,
  batchesProcessed = 0,
  isHighFrequencyMode = false,
  simulationSpeed = 1
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    memoryUsage: 0,
    renderTime: 0,
    messageRate: 0,
    cpuLoad: 0,
    networkLatency: 0,
    frameDrops: 0,
    gcTime: 0
  });
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [peakMetrics, setPeakMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    memoryUsage: 0,
    renderTime: 0,
    messageRate: 0,
    cpuLoad: 0,
    networkLatency: 0,
    frameDrops: 0,
    gcTime: 0
  });
  
  // Performance tracking refs
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const frameDropCountRef = useRef(0);
  const lastMessageCountRef = useRef(0);
  const lastUpdateTimeRef = useRef(Date.now());
  const renderStartTimeRef = useRef(0);
  const animationIdRef = useRef<number>(0);
  const gcObserverRef = useRef<PerformanceObserver | null>(null);
  
  // FPS and frame drop counter with RAF
  useEffect(() => {
    if (!isVisible) return;
    
    let lastTime = performance.now();
    let frames = 0;
    
    const measurePerformance = (currentTime: number) => {
      frames++;
      
      // Check for frame drops (more than 16.67ms between frames)
      const deltaTime = currentTime - lastTime;
      if (deltaTime > 20) { // More than 20ms is considered a dropped frame
        frameDropCountRef.current++;
      }
      
      // Update FPS every second
      if (currentTime >= lastFrameTimeRef.current + 1000) {
        const fps = Math.round((frames * 1000) / (currentTime - lastFrameTimeRef.current));
        frameCountRef.current = fps;
        
        // Update metrics
        setMetrics(prev => {
          const newMetrics = { ...prev, fps, frameDrops: frameDropCountRef.current };
          
          // Update peak metrics
          setPeakMetrics(peak => ({
            fps: Math.max(peak.fps, fps),
            memoryUsage: Math.max(peak.memoryUsage, prev.memoryUsage),
            renderTime: Math.max(peak.renderTime, prev.renderTime),
            messageRate: Math.max(peak.messageRate, prev.messageRate),
            cpuLoad: Math.max(peak.cpuLoad, prev.cpuLoad),
            networkLatency: Math.max(peak.networkLatency, prev.networkLatency),
            frameDrops: Math.max(peak.frameDrops, frameDropCountRef.current),
            gcTime: Math.max(peak.gcTime, prev.gcTime)
          }));
          
          return newMetrics;
        });
        
        frames = 0;
        lastFrameTimeRef.current = currentTime;
        frameDropCountRef.current = 0; // Reset frame drop counter
      }
      
      lastTime = currentTime;
      animationIdRef.current = requestAnimationFrame(measurePerformance);
    };
    
    animationIdRef.current = requestAnimationFrame(measurePerformance);
    
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isVisible]);
  
  // Memory and performance monitoring
  useEffect(() => {
    if (!isVisible) return;
    
    const updateMetrics = () => {
      // Memory usage (Chrome only)
      // @ts-ignore
      if (performance.memory) {
        // @ts-ignore
        const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        // @ts-ignore
        const totalMB = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
        // @ts-ignore
        const limitMB = Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024);
        
        setMetrics(prev => ({
          ...prev,
          memoryUsage: usedMB,
          // Estimate CPU load based on memory pressure and frame rate
          cpuLoad: Math.min(100, Math.round((usedMB / totalMB) * 100 + (60 - prev.fps) * 2))
        }));
      }
      
      // Measure render time
      const startTime = performance.now();
      requestAnimationFrame(() => {
        const renderTime = performance.now() - startTime;
        setMetrics(prev => ({ ...prev, renderTime }));
      });
      
      // Calculate message rate
      const currentTime = Date.now();
      const timeDiff = (currentTime - lastUpdateTimeRef.current) / 1000;
      
      if (timeDiff >= 1) {
        const messages = wsMessageCount - lastMessageCountRef.current;
        const rate = Math.round(messages / timeDiff);
        
        setMetrics(prev => ({ ...prev, messageRate: rate }));
        
        lastMessageCountRef.current = wsMessageCount;
        lastUpdateTimeRef.current = currentTime;
      }
      
      // Simulate network latency (in real app, measure actual WebSocket ping)
      const simulatedLatency = isHighFrequencyMode ? 
        Math.random() * 5 + 1 : // 1-6ms in HFT mode
        Math.random() * 20 + 10; // 10-30ms in normal mode
      
      setMetrics(prev => ({ ...prev, networkLatency: simulatedLatency }));
    };
    
    const interval = setInterval(updateMetrics, 1000);
    updateMetrics(); // Initial update
    
    return () => clearInterval(interval);
  }, [isVisible, wsMessageCount, isHighFrequencyMode]);
  
  // Garbage Collection monitoring (if available)
  useEffect(() => {
    if (!isVisible || !('PerformanceObserver' in window)) return;
    
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (entry.name === 'gc') {
            setMetrics(prev => ({ ...prev, gcTime: entry.duration }));
          }
        });
      });
      
      // This might not be supported in all browsers
      observer.observe({ entryTypes: ['measure', 'navigation'] });
      gcObserverRef.current = observer;
    } catch (e) {
      // GC monitoring not supported
    }
    
    return () => {
      if (gcObserverRef.current) {
        gcObserverRef.current.disconnect();
      }
    };
  }, [isVisible]);
  
  // Helper functions for color coding
  const getFPSColor = (fps: number): string => {
    if (fps >= 55) return 'text-green-400';
    if (fps >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const getMemoryColor = (mb: number): string => {
    if (mb < 200) return 'text-green-400';
    if (mb < 500) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const getRenderTimeColor = (ms: number): string => {
    if (ms < 8.33) return 'text-green-400'; // 120fps
    if (ms < 16.67) return 'text-blue-400'; // 60fps
    if (ms < 33.33) return 'text-yellow-400'; // 30fps
    return 'text-red-400';
  };
  
  const getLatencyColor = (ms: number): string => {
    if (ms < 10) return 'text-green-400';
    if (ms < 50) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 left-4 z-40 bg-blue-800 text-white p-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
        title="Show Performance Monitor"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-4 left-4 z-40 bg-gray-900 text-white p-4 rounded-lg shadow-xl border border-gray-700 ${
      isExpanded ? 'w-[400px]' : 'w-[300px]'
    } transition-all duration-300`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            metrics.fps >= 55 ? 'bg-green-500' : 
            metrics.fps >= 30 ? 'bg-yellow-500' : 'bg-red-500'
          } animate-pulse`}></div>
          <h3 className="text-sm font-bold">Performance Monitor</h3>
          {isHighFrequencyMode && (
            <span className="text-xs bg-purple-600 px-2 py-0.5 rounded animate-pulse">HFT</span>
          )}
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isExpanded ? <path d="M6 9l6 6 6-6"/> : <path d="M18 15l-6-6-6 6"/>}
            </svg>
          </button>
          <button onClick={onToggle} className="text-gray-400 hover:text-white p-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Core Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">FPS</div>
          <div className={`text-lg font-bold ${getFPSColor(metrics.fps)}`}>
            {metrics.fps}
          </div>
          {metrics.frameDrops > 0 && (
            <div className="text-[10px] text-red-400">
              {metrics.frameDrops} drops
            </div>
          )}
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Render</div>
          <div className={`text-lg font-bold ${getRenderTimeColor(metrics.renderTime)}`}>
            {metrics.renderTime.toFixed(1)}ms
          </div>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Memory</div>
          <div className={`text-lg font-bold ${getMemoryColor(metrics.memoryUsage)}`}>
            {metrics.memoryUsage}MB
          </div>
        </div>
      </div>

      {/* Message Processing Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Message Rate</div>
          <div className="text-lg font-bold text-blue-400">
            {formatNumber(metrics.messageRate)}/s
          </div>
          <div className="text-[10px] text-gray-500">
            Total: {formatNumber(wsMessageCount)}
          </div>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Queue</div>
          <div className={`text-lg font-bold ${
            queueSize > 1000 ? 'text-red-400' : 
            queueSize > 500 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {formatNumber(queueSize)}
          </div>
          {droppedMessages > 0 && (
            <div className="text-[10px] text-red-400">
              {formatNumber(droppedMessages)} dropped
            </div>
          )}
        </div>
      </div>

      {/* Network and Processing */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Latency</div>
          <div className={`text-sm font-bold ${getLatencyColor(metrics.networkLatency)}`}>
            {metrics.networkLatency.toFixed(1)}ms
          </div>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Batches</div>
          <div className="text-sm font-bold text-purple-400">
            {formatNumber(batchesProcessed)}
          </div>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Trades</div>
          <div className="text-sm font-bold text-green-400">
            {formatNumber(tradeCount)}
          </div>
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <>
          {/* Performance Indicators */}
          <div className="mb-3 p-2 bg-gray-800 rounded">
            <div className="text-xs text-gray-400 mb-2">Performance Analysis</div>
            
            {/* CPU Load Estimate */}
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-300">Est. CPU Load</span>
              <div className="flex items-center">
                <div className="w-20 h-2 bg-gray-700 rounded-full mr-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      metrics.cpuLoad < 50 ? 'bg-green-500' :
                      metrics.cpuLoad < 80 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, metrics.cpuLoad)}%` }}
                  ></div>
                </div>
                <span className="text-xs font-mono">{metrics.cpuLoad}%</span>
              </div>
            </div>
            
            {/* Speed Mode Indicator */}
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-300">Simulation Speed</span>
              <span className={`text-xs font-bold ${
                simulationSpeed >= 50 ? 'text-red-400' :
                simulationSpeed >= 10 ? 'text-orange-400' :
                simulationSpeed >= 5 ? 'text-yellow-400' : 'text-blue-400'
              }`}>
                {simulationSpeed}x
              </span>
            </div>
            
            {/* GC Time if available */}
            {metrics.gcTime > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-300">GC Time</span>
                <span className="text-xs font-mono text-orange-400">
                  {metrics.gcTime.toFixed(2)}ms
                </span>
              </div>
            )}
          </div>

          {/* Peak Metrics */}
          <div className="mb-3 p-2 bg-gray-800 rounded">
            <div className="text-xs text-gray-400 mb-2">Peak Performance</div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Max FPS:</span>
                <span className="text-green-400 font-mono">{peakMetrics.fps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Memory:</span>
                <span className="text-yellow-400 font-mono">{peakMetrics.memoryUsage}MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Msg Rate:</span>
                <span className="text-blue-400 font-mono">{formatNumber(peakMetrics.messageRate)}/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Latency:</span>
                <span className="text-orange-400 font-mono">{peakMetrics.networkLatency.toFixed(1)}ms</span>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="p-2 bg-gray-800 rounded text-[10px]">
            <div className="text-gray-400 mb-1">System Information</div>
            <div className="space-y-1 text-gray-300">
              <div>Browser: {navigator.userAgent.split(' ').slice(-2).join(' ')}</div>
              <div>Cores: {navigator.hardwareConcurrency || 'N/A'}</div>
              <div>Platform: {navigator.platform}</div>
              {/* @ts-ignore */}
              {performance.memory && (
                <div>
                  Heap Limit: {/* @ts-ignore */}
                  {Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)}MB
                </div>
              )}
            </div>
          </div>

          {/* Performance Tips */}
          <div className="mt-3 p-2 bg-yellow-900 bg-opacity-50 rounded text-[10px] text-yellow-300">
            {metrics.fps < 30 && (
              <div>⚠️ Low FPS detected. Consider reducing simulation speed.</div>
            )}
            {metrics.memoryUsage > 500 && (
              <div>⚠️ High memory usage. Performance may degrade.</div>
            )}
            {droppedMessages > 100 && (
              <div>⚠️ Messages being dropped. System overloaded.</div>
            )}
            {queueSize > 1000 && (
              <div>⚠️ Large message queue. Processing delayed.</div>
            )}
            {metrics.fps >= 55 && metrics.memoryUsage < 200 && droppedMessages === 0 && (
              <div className="text-green-300">✓ Optimal performance achieved!</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PerformanceMonitor;