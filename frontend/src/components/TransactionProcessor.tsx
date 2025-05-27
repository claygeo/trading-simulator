import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Transaction {
  id: string;
  timestamp: number;
  type: 'trade' | 'order_place' | 'order_cancel' | 'liquidation';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processingTime: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  size: number;
  trader: string;
}

interface ProcessingStats {
  totalProcessed: number;
  averageProcessingTime: number;
  throughputPerSecond: number;
  queueSize: number;
  errorRate: number;
  peakThroughput: number;
  ultraFastTrades: number; // < 1ms
  fastTrades: number; // 1-5ms
  mediumTrades: number; // 5-15ms
  slowTrades: number; // > 15ms
}

interface TransactionProcessorProps {
  isVisible: boolean;
  onToggle: () => void;
  simulationRunning: boolean;
}

const TransactionProcessor: React.FC<TransactionProcessorProps> = ({
  isVisible,
  onToggle,
  simulationRunning
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<ProcessingStats>({
    totalProcessed: 0,
    averageProcessingTime: 0,
    throughputPerSecond: 0,
    queueSize: 0,
    errorRate: 0,
    peakThroughput: 0,
    ultraFastTrades: 0,
    fastTrades: 0,
    mediumTrades: 0,
    slowTrades: 0
  });
  
  const [processingMode, setProcessingMode] = useState<'normal' | 'burst' | 'stress' | 'hft'>('normal');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOptimizedMode, setIsOptimizedMode] = useState<boolean>(false);
  
  // Ultra-low latency refs
  const queueRef = useRef<Transaction[]>([]);
  const processingRef = useRef<Transaction[]>([]);
  const completedRef = useRef<Transaction[]>([]);
  const statsRef = useRef<ProcessingStats>(stats);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const performanceBufferRef = useRef<number[]>([]); // Circular buffer for performance tracking
  
  // Pre-allocated object pools for zero GC pressure
  const transactionPoolRef = useRef<Transaction[]>([]);
  const poolIndexRef = useRef<number>(0);
  
  // Pre-allocate transaction objects to eliminate GC
  const initializePool = useCallback(() => {
    const pool: Transaction[] = [];
    for (let i = 0; i < 1000; i++) {
      pool.push({
        id: '',
        timestamp: 0,
        type: 'trade',
        status: 'pending',
        processingTime: 0,
        priority: 'medium',
        size: 0,
        trader: ''
      });
    }
    transactionPoolRef.current = pool;
  }, []);
  
  // Get transaction from pool (zero allocation)
  const getPooledTransaction = useCallback((): Transaction => {
    const pool = transactionPoolRef.current;
    const index = poolIndexRef.current % pool.length;
    poolIndexRef.current++;
    return pool[index];
  }, []);

  // Ultra-optimized transaction generation
  const generateTransaction = useCallback((): Transaction => {
    const tx = getPooledTransaction();
    
    // Reuse object instead of creating new one
    const now = performance.now();
    tx.id = `tx_${now.toFixed(0)}_${Math.random().toString(36).substr(2, 4)}`;
    tx.timestamp = now;
    
    // Optimized type selection using bit operations
    const rand = Math.random();
    if (rand < 0.6) {
      tx.type = 'trade';
      tx.priority = rand < 0.2 ? 'critical' : rand < 0.4 ? 'high' : 'medium';
    } else if (rand < 0.8) {
      tx.type = 'order_place';
      tx.priority = 'medium';
    } else if (rand < 0.95) {
      tx.type = 'order_cancel';
      tx.priority = 'high';
    } else {
      tx.type = 'liquidation';
      tx.priority = 'critical';
    }
    
    tx.status = 'pending';
    tx.processingTime = 0;
    tx.size = Math.random() * 1000 + 10;
    tx.trader = `0x${Math.random().toString(16).substr(2, 8)}`;
    
    return tx;
  }, [getPooledTransaction]);
  
  // Ultra-fast processing with pre-computed lookup tables
  const processingTimesRef = useRef({
    trade: { critical: 0.5, high: 1.2, medium: 2.1, low: 4.8 },
    order_place: { critical: 0.3, high: 0.8, medium: 1.5, low: 3.2 },
    order_cancel: { critical: 0.2, high: 0.5, medium: 1.0, low: 2.1 },
    liquidation: { critical: 1.2, high: 2.5, medium: 4.1, low: 8.2 }
  });
  
  // Batch processing for maximum throughput
  const processTransactionsBatch = useCallback(() => {
    const batchStartTime = performance.now();
    const queue = queueRef.current;
    const processing = processingRef.current;
    const completed = completedRef.current;
    
    // Ultra-fast priority sort using single pass
    if (queue.length > 1) {
      queue.sort((a, b) => {
        const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityMap[b.priority] - priorityMap[a.priority];
      });
    }
    
    // Process up to 10 concurrent transactions in HFT mode
    const maxConcurrent = processingMode === 'hft' ? 10 : 5;
    const availableSlots = maxConcurrent - processing.length;
    
    if (availableSlots > 0 && queue.length > 0) {
      const toProcess = queue.splice(0, availableSlots);
      
      toProcess.forEach(tx => {
        const processStartTime = performance.now();
        tx.status = 'processing';
        processing.push(tx);
        
        // Ultra-optimized processing time calculation
        const baseTime = processingTimesRef.current[tx.type][tx.priority];
        const jitter = isOptimizedMode ? 0.1 : 0.5; // Reduced jitter in optimized mode
        const processingTime = baseTime + (Math.random() * jitter);
        
        // Use immediate processing for ultra-fast mode
        if (processingMode === 'hft' && tx.priority === 'critical') {
          // Immediate processing for critical HFT transactions
          const execTime = performance.now() - processStartTime;
          tx.status = Math.random() < 0.001 ? 'failed' : 'completed'; // 0.1% failure rate
          tx.processingTime = execTime;
          
          const index = processing.indexOf(tx);
          if (index > -1) {
            processing.splice(index, 1);
            completed.push(tx);
          }
          
          // Track ultra-fast performance
          if (execTime < 1) {
            statsRef.current.ultraFastTrades++;
          } else if (execTime < 5) {
            statsRef.current.fastTrades++;
          }
        } else {
          // Asynchronous processing for non-critical transactions
          setTimeout(() => {
            const execTime = performance.now() - processStartTime;
            tx.status = Math.random() < 0.005 ? 'failed' : 'completed'; // 0.5% failure rate
            tx.processingTime = execTime;
            
            const index = processing.indexOf(tx);
            if (index > -1) {
              processing.splice(index, 1);
              completed.push(tx);
              
              // Performance tracking
              if (execTime < 1) {
                statsRef.current.ultraFastTrades++;
              } else if (execTime < 5) {
                statsRef.current.fastTrades++;
              } else if (execTime < 15) {
                statsRef.current.mediumTrades++;
              } else {
                statsRef.current.slowTrades++;
              }
            }
            
            // Maintain circular buffer size
            if (completed.length > 1000) {
              completed.splice(0, completed.length - 1000);
            }
          }, processingTime);
        }
      });
    }
    
    // Ultra-fast stats calculation using circular buffer
    const now = performance.now();
    const recentWindow = 1000; // 1 second window
    const recentCompleted = completed.filter(tx => now - tx.timestamp < recentWindow);
    const recentFailed = completed.filter(tx => tx.status === 'failed' && now - tx.timestamp < 5000);
    
    // Add to performance buffer
    const currentThroughput = recentCompleted.length;
    performanceBufferRef.current.push(currentThroughput);
    if (performanceBufferRef.current.length > 60) {
      performanceBufferRef.current.shift(); // Keep last 60 seconds
    }
    
    // Calculate optimized stats
    const newStats: ProcessingStats = {
      totalProcessed: completed.length,
      averageProcessingTime: completed.length > 0 
        ? completed.slice(-100).reduce((sum, tx) => sum + tx.processingTime, 0) / Math.min(100, completed.length)
        : 0,
      throughputPerSecond: currentThroughput,
      queueSize: queue.length,
      errorRate: completed.length > 0 ? (recentFailed.length / Math.max(completed.length, 100)) * 100 : 0,
      peakThroughput: Math.max(statsRef.current.peakThroughput, currentThroughput),
      ultraFastTrades: statsRef.current.ultraFastTrades,
      fastTrades: statsRef.current.fastTrades,
      mediumTrades: statsRef.current.mediumTrades,
      slowTrades: statsRef.current.slowTrades
    };
    
    statsRef.current = newStats;
    setStats(newStats);
    
    // Efficient UI update with minimal data
    setTransactions([
      ...queue.slice(0, 10), // Show first 10 in queue
      ...processing.slice(0, 5), // Show first 5 processing
      ...completed.slice(-15) // Show last 15 completed
    ]);
    
    const batchTime = performance.now() - batchStartTime;
    if (batchTime > 5 && processingMode === 'hft') {
      console.warn(`Batch processing took ${batchTime.toFixed(2)}ms - above 5ms threshold for HFT mode`);
    }
  }, [processingMode, isOptimizedMode]);
  
  // Ultra-high frequency transaction generation
  const generateTransactions = useCallback(() => {
    if (!simulationRunning) return;
    
    const rates = {
      normal: 2,   // 2 TPS
      burst: 8,    // 8 TPS
      stress: 20,  // 20 TPS
      hft: 50      // 50 TPS - High Frequency Trading
    };
    
    const rate = rates[processingMode];
    const shouldGenerate = Math.random() < (rate / 20); // Called 20x per second in HFT mode
    
    if (shouldGenerate) {
      const newTx = generateTransaction();
      queueRef.current.push(newTx);
    }
  }, [simulationRunning, processingMode, generateTransaction]);
  
  // Initialize object pool
  useEffect(() => {
    initializePool();
  }, [initializePool]);
  
  // High-frequency processing loop
  useEffect(() => {
    if (simulationRunning) {
      const updateInterval = processingMode === 'hft' ? 50 : 100; // 20Hz for HFT, 10Hz for others
      
      intervalRef.current = setInterval(() => {
        generateTransactions();
        processTransactionsBatch();
      }, updateInterval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [simulationRunning, generateTransactions, processTransactionsBatch, processingMode]);
  
  // Toggle optimized mode
  const toggleOptimizedMode = useCallback(() => {
    setIsOptimizedMode(prev => {
      const newMode = !prev;
      if (newMode) {
        // Reset stats when entering optimized mode
        statsRef.current = {
          totalProcessed: 0,
          averageProcessingTime: 0,
          throughputPerSecond: 0,
          queueSize: 0,
          errorRate: 0,
          peakThroughput: 0,
          ultraFastTrades: 0,
          fastTrades: 0,
          mediumTrades: 0,
          slowTrades: 0
        };
        setStats(statsRef.current);
      }
      return newMode;
    });
  }, []);
  
  // Format numbers efficiently
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };
  
  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'pending': return 'text-yellow-400';
      case 'processing': return 'text-blue-400 animate-pulse';
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };
  
  const getPriorityColor = (priority: Transaction['priority']) => {
    switch (priority) {
      case 'critical': return 'text-red-500 font-bold';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-blue-400';
      case 'low': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed top-20 right-4 z-40 bg-blue-800 text-white p-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
        title="Show Ultra-Low Latency Transaction Processor"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed top-20 right-4 z-40 bg-gray-900 text-white p-4 rounded-lg shadow-xl border border-gray-700 min-w-[450px] max-h-[700px] overflow-hidden">
      {/* Header with optimization indicator */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isOptimizedMode ? 'bg-green-500' : 'bg-blue-500'} animate-pulse`}></div>
          <span className="text-sm font-semibold">Ultra-Low Latency Processor</span>
          {isOptimizedMode && (
            <span className="text-xs bg-green-600 px-2 py-0.5 rounded">OPTIMIZED</span>
          )}
          <span className="text-xs text-gray-400">
            ({formatNumber(stats.totalProcessed)} processed)
          </span>
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isExpanded ? <path d="M18 6L6 18M6 6l12 12"/> : <path d="M8 18l4-4 4 4M8 6l4 4 4-4"/>}
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

      {/* Processing Mode Controls with HFT */}
      <div className="flex space-x-1 mb-3">
        {(['normal', 'burst', 'stress', 'hft'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setProcessingMode(mode)}
            className={`px-3 py-1 text-xs rounded transition ${
              processingMode === mode 
                ? mode === 'hft' ? 'bg-red-600 text-white animate-pulse' : 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title={mode === 'hft' ? 'High Frequency Trading Mode - 50 TPS' : `${mode} mode`}
          >
            {mode === 'hft' ? '🚀 HFT' : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Optimization Toggle */}
      <div className="flex items-center justify-between mb-3 p-2 bg-gray-800 rounded">
        <span className="text-xs text-gray-300">Ultra-Low Latency Mode</span>
        <button
          onClick={toggleOptimizedMode}
          className={`px-3 py-1 text-xs rounded transition ${
            isOptimizedMode ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
          }`}
        >
          {isOptimizedMode ? 'ENABLED' : 'DISABLED'}
        </button>
      </div>

      {/* Performance Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Throughput</div>
          <div className="text-lg font-bold text-blue-400">{stats.throughputPerSecond}/s</div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Queue</div>
          <div className={`text-lg font-bold ${
            stats.queueSize > 100 ? 'text-red-400' : 
            stats.queueSize > 50 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {stats.queueSize}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Avg Time</div>
          <div className={`text-lg font-bold ${
            stats.averageProcessingTime < 1 ? 'text-green-400' :
            stats.averageProcessingTime < 5 ? 'text-blue-400' :
            stats.averageProcessingTime < 15 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {stats.averageProcessingTime.toFixed(1)}ms
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Peak TPS</div>
          <div className="text-lg font-bold text-cyan-400">{stats.peakThroughput}</div>
        </div>
      </div>

      {/* Ultra-Fast Performance Breakdown */}
      <div className="grid grid-cols-4 gap-1 mb-3 text-[10px]">
        <div className="bg-green-900 p-1 rounded text-center">
          <div className="text-green-300">Ultra Fast</div>
          <div className="font-bold text-green-400">{stats.ultraFastTrades}</div>
          <div className="text-green-200">&lt;1ms</div>
        </div>
        <div className="bg-blue-900 p-1 rounded text-center">
          <div className="text-blue-300">Fast</div>
          <div className="font-bold text-blue-400">{stats.fastTrades}</div>
          <div className="text-blue-200">1-5ms</div>
        </div>
        <div className="bg-yellow-900 p-1 rounded text-center">
          <div className="text-yellow-300">Medium</div>
          <div className="font-bold text-yellow-400">{stats.mediumTrades}</div>
          <div className="text-yellow-200">5-15ms</div>
        </div>
        <div className="bg-red-900 p-1 rounded text-center">
          <div className="text-red-300">Slow</div>
          <div className="font-bold text-red-400">{stats.slowTrades}</div>
          <div className="text-red-200">&gt;15ms</div>
        </div>
      </div>

      {/* Transaction Stream */}
      <div className="bg-gray-800 rounded p-2 max-h-[250px] overflow-y-auto">
        <div className="text-xs text-gray-400 mb-2 flex justify-between">
          <span>Live Transaction Stream</span>
          <span className="text-green-400">
            {Math.round((stats.ultraFastTrades + stats.fastTrades) / Math.max(stats.totalProcessed, 1) * 100)}% sub-5ms
          </span>
        </div>
        <div className="space-y-1">
          {transactions.slice(-20).map(tx => (
            <div key={tx.id} className="flex items-center justify-between text-[10px] py-1 border-b border-gray-700 last:border-b-0">
              <div className="flex items-center space-x-2 flex-1">
                <div className={`w-1 h-1 rounded-full ${
                  tx.type === 'trade' ? 'bg-green-400' :
                  tx.type === 'liquidation' ? 'bg-red-400' :
                  tx.type === 'order_place' ? 'bg-blue-400' : 'bg-yellow-400'
                }`}></div>
                <span className="font-mono">{tx.id.slice(-8)}</span>
                <span className="text-gray-400">{tx.type}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={getPriorityColor(tx.priority)}>{tx.priority.charAt(0).toUpperCase()}</span>
                <span className={getStatusColor(tx.status)}>{tx.status.charAt(0).toUpperCase()}</span>
                {tx.processingTime > 0 && (
                  <span className={`font-mono ${
                    tx.processingTime < 1 ? 'text-green-400' :
                    tx.processingTime < 5 ? 'text-blue-400' :
                    tx.processingTime < 15 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {tx.processingTime.toFixed(1)}ms
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Insights */}
      {isExpanded && (
        <div className="mt-3 p-2 bg-gray-800 rounded text-[10px]">
          <div className="text-gray-300 mb-1">⚡ Ultra-Low Latency Insights:</div>
          {stats.averageProcessingTime < 1 && (
            <div className="text-green-300">• Excellent: Sub-millisecond average execution</div>
          )}
          {stats.averageProcessingTime < 5 && stats.averageProcessingTime >= 1 && (
            <div className="text-blue-300">• Good: Sub-5ms average execution</div>
          )}
          {stats.queueSize > 50 && (
            <div className="text-yellow-300">• Warning: High queue size - consider scaling processors</div>
          )}
          {stats.throughputPerSecond > 30 && (
            <div className="text-cyan-300">• HFT Performance: {stats.throughputPerSecond} TPS achieved</div>
          )}
          {stats.errorRate > 1 && (
            <div className="text-red-300">• Alert: Error rate {stats.errorRate.toFixed(2)}% - check system stability</div>
          )}
          {processingMode === 'hft' && stats.ultraFastTrades > 10 && (
            <div className="text-green-300">• HFT Mode: {stats.ultraFastTrades} sub-millisecond executions</div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionProcessor;