// frontend/src/components/TransactionProcessor.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';

// Add API base URL constant at the top
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Transaction {
  id: string;
  timestamp: number;
  type: 'trade' | 'order_place' | 'order_cancel' | 'liquidation';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processingTime: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  size: number;
  trader: string;
  // Add fields for backend integration
  action?: 'buy' | 'sell';
  price?: number;
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
  processedOrders?: number; // Track successful backend submissions
}

interface TransactionProcessorProps {
  isVisible: boolean;
  onToggle: () => void;
  simulationRunning: boolean;
  simulationId?: string; // Add this prop
}

const TransactionProcessor: React.FC<TransactionProcessorProps> = ({
  isVisible,
  onToggle,
  simulationRunning,
  simulationId
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
    slowTrades: 0,
    processedOrders: 0
  });
  
  const [processingMode, setProcessingMode] = useState<'normal' | 'burst' | 'stress' | 'hft'>('normal');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOptimizedMode, setIsOptimizedMode] = useState<boolean>(false);
  const [sendToBackend, setSendToBackend] = useState<boolean>(true); // Toggle for backend integration
  
  // CRITICAL FIX: Add memory management
  const MAX_QUEUE_SIZE = 10000;
  const MAX_COMPLETED_SIZE = 5000;
  const MAX_DISPLAY_TRANSACTIONS = 30;
  
  // Ultra-low latency refs
  const queueRef = useRef<Transaction[]>([]);
  const processingRef = useRef<Transaction[]>([]);
  const completedRef = useRef<Transaction[]>([]);
  const statsRef = useRef<ProcessingStats>(stats);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const performanceBufferRef = useRef<number[]>([]);
  
  // Pre-allocated object pools for zero GC pressure
  const transactionPoolRef = useRef<Transaction[]>([]);
  const poolIndexRef = useRef<number>(0);
  
  // CRITICAL FIX: Add performance monitoring
  const lastStatsUpdateRef = useRef<number>(0);
  const throughputSamplesRef = useRef<number[]>([]);
  
  // Track base price for more realistic pricing
  const basePriceRef = useRef<number>(100);
  
  // Track success/failure stats
  const successCountRef = useRef<number>(0);
  const failureCountRef = useRef<number>(0);
  
  // Add balanced buy/sell tracking refs
  const buyCountRef = useRef<number>(0);
  const sellCountRef = useRef<number>(0);
  const marketTrendRef = useRef<number>(0); // -1 to 1, negative is bearish, positive is bullish
  
  // Error suppression for production
  const errorLogCountRef = useRef<number>(0);
  const MAX_ERROR_LOGS = 5; // Only log first 5 errors
  const lastErrorTimeRef = useRef<number>(0);
  const ERROR_LOG_COOLDOWN = 30000; // 30 seconds between error logs
  
  // Send transaction to backend
  const sendTransactionToBackend = useCallback(async (transaction: Transaction) => {
    if (!simulationId || !sendToBackend) return;
    
    try {
      // FIXED: Use backend URL instead of relative path
      const url = `${API_BASE_URL}/api/simulation/${simulationId}/external-trade`;
      
      // Production: Only log URL in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Sending trade to:', url);
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          id: transaction.id,
          traderId: transaction.trader,
          traderName: `TXP-${transaction.trader.slice(-6)}`,
          action: transaction.action || (transaction.type === 'trade' ? (Math.random() > 0.5 ? 'buy' : 'sell') : 'buy'),
          price: transaction.price || basePriceRef.current,
          quantity: transaction.size,
          timestamp: transaction.timestamp
        })
      });
      
      if (!response.ok) {
        // Production error handling: Suppress repeated errors
        const now = Date.now();
        if (errorLogCountRef.current < MAX_ERROR_LOGS && (now - lastErrorTimeRef.current) > ERROR_LOG_COOLDOWN) {
          const errorText = await response.text();
          console.error(`Failed to send transaction to backend: ${response.status} ${response.statusText}`, errorText);
          errorLogCountRef.current++;
          lastErrorTimeRef.current = now;
          
          if (errorLogCountRef.current === MAX_ERROR_LOGS) {
            console.warn('🔇 Transaction error logging suppressed. Further errors will be silent.');
          }
        }
        failureCountRef.current++;
      } else {
        const result = await response.json();
        successCountRef.current++;
        
        // Update base price from the result if available
        if (result.trade && result.trade.price) {
          basePriceRef.current = result.trade.price;
        }
        
        // Update stats to show successful integration
        if (result.newPrice) {
          statsRef.current.processedOrders = (statsRef.current.processedOrders || 0) + 1;
        }
      }
    } catch (error) {
      // Production error handling: Suppress repeated errors
      const now = Date.now();
      if (errorLogCountRef.current < MAX_ERROR_LOGS && (now - lastErrorTimeRef.current) > ERROR_LOG_COOLDOWN) {
        console.error('Error sending transaction to backend:', error);
        errorLogCountRef.current++;
        lastErrorTimeRef.current = now;
        
        if (errorLogCountRef.current === MAX_ERROR_LOGS) {
          console.warn('🔇 Transaction error logging suppressed. Further errors will be silent.');
        }
      }
      failureCountRef.current++;
    }
  }, [simulationId, sendToBackend]);
  
  // Pre-allocate transaction objects to eliminate GC
  const initializePool = useCallback(() => {
    const pool: Transaction[] = [];
    for (let i = 0; i < 10000; i++) { // Increased pool size
      pool.push({
        id: '',
        timestamp: 0,
        type: 'trade',
        status: 'pending',
        processingTime: 0,
        priority: 'medium',
        size: 0,
        trader: '',
        action: 'buy',
        price: 0
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

  // Ultra-optimized transaction generation with balanced buy/sell and TIMESTAMP FIX
  const generateTransaction = useCallback((): Transaction => {
    const tx = getPooledTransaction();
    
    // CRITICAL FIX: Use real epoch time instead of performance.now()
    const now = Date.now();
    tx.id = `tx_${now}_${(Math.random() * 1000).toFixed(0)}`;
    tx.timestamp = now; // Use real timestamp for backend compatibility
    
    // Calculate market trend based on recent price changes
    const recentPriceChange = (basePriceRef.current - 100) / 100; // Assuming 100 was initial
    marketTrendRef.current = Math.max(-1, Math.min(1, recentPriceChange * 10));
    
    // Optimized type selection using bit operations
    const rand = Math.random();
    if (rand < 0.6) {
      tx.type = 'trade';
      tx.priority = rand < 0.2 ? 'critical' : rand < 0.4 ? 'high' : 'medium';
      
      // BALANCED BUY/SELL LOGIC with market bias
      const buyRatio = buyCountRef.current / Math.max(1, buyCountRef.current + sellCountRef.current);
      const sellRatio = sellCountRef.current / Math.max(1, buyCountRef.current + sellCountRef.current);
      
      // Base 50/50 chance with adjustments
      let buyProbability = 0.5;
      
      // Adjust based on current ratio (rebalancing mechanism)
      if (buyRatio > 0.55) {
        buyProbability -= 0.1; // Reduce buy probability if too many buys
      } else if (sellRatio > 0.55) {
        buyProbability += 0.1; // Increase buy probability if too many sells
      }
      
      // Add slight market trend influence
      buyProbability += marketTrendRef.current * 0.05; // ±5% based on trend
      
      // Add some randomness to avoid perfect patterns
      buyProbability += (Math.random() - 0.5) * 0.1; // ±5% random
      
      // Ensure probability stays in valid range
      buyProbability = Math.max(0.2, Math.min(0.8, buyProbability));
      
      tx.action = Math.random() < buyProbability ? 'buy' : 'sell';
      
      // Track counts
      if (tx.action === 'buy') {
        buyCountRef.current++;
      } else {
        sellCountRef.current++;
      }
      
      // Reset counters periodically to avoid overflow
      if (buyCountRef.current + sellCountRef.current > 1000) {
        buyCountRef.current = Math.floor(buyCountRef.current / 2);
        sellCountRef.current = Math.floor(sellCountRef.current / 2);
      }
      
    } else if (rand < 0.8) {
      tx.type = 'order_place';
      tx.priority = 'medium';
      // Orders can be more directional based on market
      const orderBuyProb = 0.5 + (marketTrendRef.current * 0.2);
      tx.action = Math.random() < orderBuyProb ? 'buy' : 'sell';
    } else if (rand < 0.95) {
      tx.type = 'order_cancel';
      tx.priority = 'high';
    } else {
      tx.type = 'liquidation';
      tx.priority = 'critical';
      tx.action = 'sell'; // Liquidations are always sells
    }
    
    tx.status = 'pending';
    tx.processingTime = 0;
    
    // Vary size based on type and market conditions
    const volatilityMultiplier = 1 + Math.abs(marketTrendRef.current);
    if (tx.type === 'liquidation') {
      tx.size = (Math.random() * 5000 + 2000) * volatilityMultiplier; // Larger liquidations
    } else if (tx.type === 'trade' && tx.priority === 'critical') {
      tx.size = (Math.random() * 3000 + 1000) * volatilityMultiplier; // Large critical trades
    } else {
      tx.size = Math.random() * 1000 + 10;
    }
    
    tx.trader = `0x${(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
    
    // Generate realistic price based on type and action
    const priceVariation = (Math.random() - 0.5) * 2; // ±1% variation
    if (tx.type === 'trade') {
      // Trades happen near market price
      tx.price = basePriceRef.current * (1 + priceVariation / 100);
    } else if (tx.type === 'liquidation') {
      // Liquidations happen at worse prices
      tx.price = basePriceRef.current * (1 - Math.abs(priceVariation) / 100);
    } else {
      // Orders can be at various prices
      tx.price = basePriceRef.current * (1 + (priceVariation * 3) / 100);
    }
    
    return tx;
  }, [getPooledTransaction]);
  
  // Ultra-fast processing with pre-computed lookup tables
  const processingTimesRef = useRef({
    trade: { critical: 0.1, high: 0.3, medium: 0.8, low: 2.1 },
    order_place: { critical: 0.1, high: 0.2, medium: 0.5, low: 1.2 },
    order_cancel: { critical: 0.05, high: 0.1, medium: 0.3, low: 0.8 },
    liquidation: { critical: 0.5, high: 1.2, medium: 2.1, low: 4.2 }
  });
  
  // CRITICAL FIX: Batch processing with memory management
  const processTransactionsBatch = useCallback(() => {
    const batchStartTime = Date.now();
    const queue = queueRef.current;
    const processing = processingRef.current;
    const completed = completedRef.current;
    
    // CRITICAL: Prevent queue overflow
    if (queue.length > MAX_QUEUE_SIZE) {
      const dropped = queue.length - MAX_QUEUE_SIZE;
      queue.splice(0, dropped);
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Dropped ${dropped} transactions to prevent overflow`);
      }
    }
    
    // Ultra-fast priority sort using single pass (only if needed)
    if (queue.length > 1 && processingMode !== 'hft') {
      queue.sort((a, b) => {
        const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityMap[b.priority] - priorityMap[a.priority];
      });
    }
    
    // Process more concurrent transactions in HFT mode
    const maxConcurrent = processingMode === 'hft' ? 100 : processingMode === 'stress' ? 50 : 10;
    const availableSlots = maxConcurrent - processing.length;
    
    if (availableSlots > 0 && queue.length > 0) {
      const toProcess = queue.splice(0, Math.min(availableSlots, 100)); // Limit batch size
      
      toProcess.forEach(tx => {
        const processStartTime = Date.now();
        tx.status = 'processing';
        processing.push(tx);
        
        // Ultra-optimized processing time calculation
        const baseTime = processingTimesRef.current[tx.type][tx.priority];
        const jitter = isOptimizedMode ? 0.05 : 0.2;
        const processingTime = baseTime * (1 + (Math.random() - 0.5) * jitter);
        
        // Use immediate processing for critical HFT transactions
        if (processingMode === 'hft' && tx.priority === 'critical') {
          // Immediate processing
          setImmediate(async () => {
            const execTime = Date.now() - processStartTime;
            tx.status = Math.random() < 0.0001 ? 'failed' : 'completed'; // 0.01% failure rate
            tx.processingTime = execTime;
            
            const index = processing.indexOf(tx);
            if (index > -1) {
              processing.splice(index, 1);
              completed.push(tx);
              
              // Track performance
              if (execTime < 1) {
                statsRef.current.ultraFastTrades++;
              } else if (execTime < 5) {
                statsRef.current.fastTrades++;
              }
              
              // Send to backend if it's a trade
              if (tx.status === 'completed' && tx.type === 'trade') {
                await sendTransactionToBackend(tx);
              }
            }
          });
        } else {
          // Asynchronous processing
          setTimeout(async () => {
            const execTime = Date.now() - processStartTime;
            tx.status = Math.random() < 0.001 ? 'failed' : 'completed'; // 0.1% failure rate
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
              
              // Send to backend if it's a completed trade
              if (tx.status === 'completed' && tx.type === 'trade') {
                await sendTransactionToBackend(tx);
              }
            }
            
            // CRITICAL: Prevent memory leak
            if (completed.length > MAX_COMPLETED_SIZE) {
              completed.splice(0, completed.length - MAX_COMPLETED_SIZE);
            }
          }, processingTime);
        }
      });
    }
    
    // Update stats only every 100ms to reduce overhead
    const now = Date.now();
    if (now - lastStatsUpdateRef.current > 100) {
      lastStatsUpdateRef.current = now;
      
      // Calculate throughput
      const recentWindow = 1000;
      const recentCompleted = completed.filter(tx => now - tx.timestamp < recentWindow);
      const currentThroughput = recentCompleted.length;
      
      // Track throughput samples
      throughputSamplesRef.current.push(currentThroughput);
      if (throughputSamplesRef.current.length > 10) {
        throughputSamplesRef.current.shift();
      }
      
      // Calculate stats
      const avgProcessingTime = completed.length > 0 
        ? completed.slice(-Math.min(100, completed.length)).reduce((sum, tx) => sum + tx.processingTime, 0) / Math.min(100, completed.length)
        : 0;
      
      const failedCount = completed.filter(tx => tx.status === 'failed').length;
      
      const newStats: ProcessingStats = {
        totalProcessed: completed.length,
        averageProcessingTime: avgProcessingTime,
        throughputPerSecond: currentThroughput,
        queueSize: queue.length,
        errorRate: completed.length > 0 ? (failedCount / completed.length) * 100 : 0,
        peakThroughput: Math.max(statsRef.current.peakThroughput, currentThroughput),
        ultraFastTrades: statsRef.current.ultraFastTrades,
        fastTrades: statsRef.current.fastTrades,
        mediumTrades: statsRef.current.mediumTrades,
        slowTrades: statsRef.current.slowTrades,
        processedOrders: statsRef.current.processedOrders || 0
      };
      
      statsRef.current = newStats;
      setStats(newStats);
      
      // Update UI with limited transactions
      const displayTransactions = [
        ...queue.slice(0, 10),
        ...processing.slice(0, 10),
        ...completed.slice(-10)
      ].slice(0, MAX_DISPLAY_TRANSACTIONS);
      
      setTransactions(displayTransactions);
      
      // Production: Only log balance in development mode and occasionally
      if (process.env.NODE_ENV === 'development' && Math.random() < 0.05) { // 5% chance to log
        const totalTrades = buyCountRef.current + sellCountRef.current;
        if (totalTrades > 0) {
          const buyPercentage = ((buyCountRef.current / totalTrades) * 100).toFixed(1);
          const sellPercentage = ((sellCountRef.current / totalTrades) * 100).toFixed(1);
          console.log(`Transaction Processor Balance - Buys: ${buyPercentage}% Sells: ${sellPercentage}% (Total: ${totalTrades})`);
        }
      }
    }
  }, [processingMode, isOptimizedMode, sendTransactionToBackend]);
  
  // Ultra-high frequency transaction generation
  const generateTransactions = useCallback(() => {
    if (!simulationRunning) return;
    
    const rates = {
      normal: 10,    // 10 TPS
      burst: 100,    // 100 TPS
      stress: 1000,  // 1K TPS
      hft: 10000     // 10K TPS target
    };
    
    const rate = rates[processingMode];
    const interval = processingMode === 'hft' ? 10 : 50; // Generation interval
    const transactionsPerInterval = Math.ceil(rate * interval / 1000);
    
    // Generate multiple transactions per tick in HFT mode
    for (let i = 0; i < transactionsPerInterval; i++) {
      if (queueRef.current.length < MAX_QUEUE_SIZE) {
        const newTx = generateTransaction();
        queueRef.current.push(newTx);
      }
    }
  }, [simulationRunning, processingMode, generateTransaction]);
  
  // Initialize object pool
  useEffect(() => {
    initializePool();
  }, [initializePool]);
  
  // High-frequency processing loop
  useEffect(() => {
    if (simulationRunning) {
      // Use different intervals based on mode
      const updateInterval = processingMode === 'hft' ? 10 : processingMode === 'stress' ? 20 : 50;
      
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
          slowTrades: 0,
          processedOrders: 0
        };
        setStats(statsRef.current);
        
        // Clear queues
        queueRef.current = [];
        processingRef.current = [];
        completedRef.current = [];
        
        // Reset counters
        successCountRef.current = 0;
        failureCountRef.current = 0;
        buyCountRef.current = 0;
        sellCountRef.current = 0;
        
        // Reset error logging
        errorLogCountRef.current = 0;
        lastErrorTimeRef.current = 0;
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
          <span className="text-sm font-semibold">100K TPS Transaction Processor</span>
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
            title={
              mode === 'hft' ? 'High Frequency Trading Mode - 10K TPS target' : 
              mode === 'stress' ? '1K TPS stress test' :
              mode === 'burst' ? '100 TPS burst mode' :
              '10 TPS normal mode'
            }
          >
            {mode === 'hft' ? '🚀 HFT 10K' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            {mode !== 'normal' && (
              <span className="ml-1 text-[10px]">
                {mode === 'hft' ? '10K' : mode === 'stress' ? '1K' : mode === 'burst' ? '100' : ''} TPS
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Optimization Toggle and Backend Connection */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
          <span className="text-xs text-gray-300">Ultra-Low Latency</span>
          <button
            onClick={toggleOptimizedMode}
            className={`px-3 py-1 text-xs rounded transition ${
              isOptimizedMode ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}
          >
            {isOptimizedMode ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
          <span className="text-xs text-gray-300">Send to Chart</span>
          <button
            onClick={() => setSendToBackend(!sendToBackend)}
            className={`px-3 py-1 text-xs rounded transition ${
              sendToBackend ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}
            disabled={!simulationId}
            title={simulationId ? 'Toggle sending trades to price chart' : 'No simulation connected'}
          >
            {sendToBackend ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Performance Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Throughput</div>
          <div className={`text-lg font-bold ${
            stats.throughputPerSecond > 5000 ? 'text-red-400' :
            stats.throughputPerSecond > 1000 ? 'text-orange-400' :
            stats.throughputPerSecond > 100 ? 'text-yellow-400' : 'text-blue-400'
          }`}>
            {formatNumber(stats.throughputPerSecond)}/s
          </div>
          <div className="text-[10px] text-gray-500">
            Peak: {formatNumber(stats.peakThroughput)}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Queue</div>
          <div className={`text-lg font-bold ${
            stats.queueSize > 5000 ? 'text-red-400' : 
            stats.queueSize > 1000 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {formatNumber(stats.queueSize)}
          </div>
          <div className="text-[10px] text-gray-500">
            Max: {formatNumber(MAX_QUEUE_SIZE)}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Avg Time</div>
          <div className={`text-lg font-bold ${
            stats.averageProcessingTime < 0.1 ? 'text-green-400' :
            stats.averageProcessingTime < 1 ? 'text-blue-400' :
            stats.averageProcessingTime < 5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {stats.averageProcessingTime.toFixed(2)}ms
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Error Rate</div>
          <div className={`text-lg font-bold ${
            stats.errorRate < 0.1 ? 'text-green-400' :
            stats.errorRate < 1 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {stats.errorRate.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Ultra-Fast Performance Breakdown */}
      <div className="grid grid-cols-4 gap-1 mb-3 text-[10px]">
        <div className="bg-green-900 p-1 rounded text-center">
          <div className="text-green-300">Ultra Fast</div>
          <div className="font-bold text-green-400">{formatNumber(stats.ultraFastTrades)}</div>
          <div className="text-green-200">&lt;1ms</div>
        </div>
        <div className="bg-blue-900 p-1 rounded text-center">
          <div className="text-blue-300">Fast</div>
          <div className="font-bold text-blue-400">{formatNumber(stats.fastTrades)}</div>
          <div className="text-blue-200">1-5ms</div>
        </div>
        <div className="bg-yellow-900 p-1 rounded text-center">
          <div className="text-yellow-300">Medium</div>
          <div className="font-bold text-yellow-400">{formatNumber(stats.mediumTrades)}</div>
          <div className="text-yellow-200">5-15ms</div>
        </div>
        <div className="bg-red-900 p-1 rounded text-center">
          <div className="text-red-300">Slow</div>
          <div className="font-bold text-red-400">{formatNumber(stats.slowTrades)}</div>
          <div className="text-red-200">&gt;15ms</div>
        </div>
      </div>

      {/* Transaction Stream */}
      <div className="bg-gray-800 rounded p-2 max-h-[250px] overflow-y-auto">
        <div className="text-xs text-gray-400 mb-2 flex justify-between">
          <span>Live Transaction Stream</span>
          <span className="text-green-400">
            {stats.totalProcessed > 0 ? 
              Math.round((stats.ultraFastTrades + stats.fastTrades) / stats.totalProcessed * 100) : 0
            }% sub-5ms
          </span>
        </div>
        <div className="space-y-1">
          {transactions.map(tx => (
            <div key={tx.id} className="flex items-center justify-between text-[10px] py-1 border-b border-gray-700 last:border-b-0">
              <div className="flex items-center space-x-2 flex-1">
                <div className={`w-1 h-1 rounded-full ${
                  tx.type === 'trade' ? 'bg-green-400' :
                  tx.type === 'liquidation' ? 'bg-red-400' :
                  tx.type === 'order_place' ? 'bg-blue-400' : 'bg-yellow-400'
                }`}></div>
                <span className="font-mono">{tx.id.slice(-8)}</span>
                <span className="text-gray-400">{tx.type}</span>
                {tx.action && tx.type === 'trade' && (
                  <span className={tx.action === 'buy' ? 'text-green-300' : 'text-red-300'}>
                    {tx.action.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <span className={getPriorityColor(tx.priority)}>{tx.priority.charAt(0).toUpperCase()}</span>
                <span className={getStatusColor(tx.status)}>{tx.status.charAt(0).toUpperCase()}</span>
                {tx.processingTime > 0 && (
                  <span className={`font-mono ${
                    tx.processingTime < 0.1 ? 'text-green-400' :
                    tx.processingTime < 1 ? 'text-blue-400' :
                    tx.processingTime < 5 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {tx.processingTime.toFixed(2)}ms
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
          <div className="text-gray-300 mb-1">⚡ Ultra Performance Insights:</div>
          {stats.throughputPerSecond > 5000 && (
            <div className="text-red-300">• BEAST MODE: {formatNumber(stats.throughputPerSecond)} TPS achieved!</div>
          )}
          {stats.throughputPerSecond > 1000 && stats.throughputPerSecond <= 5000 && (
            <div className="text-orange-300">• High Performance: {formatNumber(stats.throughputPerSecond)} TPS</div>
          )}
          {stats.averageProcessingTime < 0.1 && (
            <div className="text-green-300">• Sub-100μs average execution!</div>
          )}
          {stats.queueSize > MAX_QUEUE_SIZE * 0.8 && (
            <div className="text-yellow-300">• Warning: Queue approaching capacity ({Math.round(stats.queueSize / MAX_QUEUE_SIZE * 100)}%)</div>
          )}
          {stats.peakThroughput > 10000 && (
            <div className="text-cyan-300">• 🎯 TARGET ACHIEVED: Peak {formatNumber(stats.peakThroughput)} TPS!</div>
          )}
          {processingMode === 'hft' && (
            <div className="text-purple-300">• HFT Mode: Processing up to 100 concurrent transactions</div>
          )}
          {sendToBackend && simulationId && (
            <div className="text-blue-300">• Connected to simulation: Trades affecting price chart</div>
          )}
          <div className="text-gray-400 mt-1">
            • Total capacity: {formatNumber(MAX_QUEUE_SIZE)} queue, {formatNumber(MAX_COMPLETED_SIZE)} history
          </div>
          {/* Buy/Sell Balance Display */}
          <div className="text-green-300 mt-1">
            • Buy/Sell Balance: {buyCountRef.current > 0 || sellCountRef.current > 0 ? (
              <>Buys: {((buyCountRef.current / (buyCountRef.current + sellCountRef.current)) * 100).toFixed(1)}% 
              | Sells: {((sellCountRef.current / (buyCountRef.current + sellCountRef.current)) * 100).toFixed(1)}%</>
            ) : 'No trades yet'}
          </div>
          {/* Error suppression notice */}
          {errorLogCountRef.current >= MAX_ERROR_LOGS && (
            <div className="text-orange-300 mt-1">
              • Error logging suppressed after {MAX_ERROR_LOGS} errors (production mode)
            </div>
          )}
        </div>
      )}
      
      {/* Connection Status */}
      {simulationId && (
        <div className="mt-2 text-xs text-gray-500 flex justify-between items-center">
          <span>Connected to: {simulationId.slice(0, 8)}...</span>
          {sendToBackend && (
            <div className="flex items-center space-x-2">
              <span className="text-green-400">✓ Sending trades to chart</span>
              <span className="text-gray-400">
                Success: {successCountRef.current} | Failed: {failureCountRef.current}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionProcessor;