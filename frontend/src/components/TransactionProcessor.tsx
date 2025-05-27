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
    peakThroughput: 0
  });
  
  const [processingMode, setProcessingMode] = useState<'normal' | 'burst' | 'stress'>('normal');
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Processing queue management
  const queueRef = useRef<Transaction[]>([]);
  const processingRef = useRef<Transaction[]>([]);
  const completedRef = useRef<Transaction[]>([]);
  const statsRef = useRef<ProcessingStats>(stats);
  const intervalRef = useRef<NodeJS.Timeout>();
  
  // Generate realistic transaction
  const generateTransaction = useCallback((): Transaction => {
    const types: Transaction['type'][] = ['trade', 'order_place', 'order_cancel', 'liquidation'];
    const priorities: Transaction['priority'][] = ['low', 'medium', 'high', 'critical'];
    
    // Simulate different transaction patterns based on mode
    const typeWeights = processingMode === 'stress' 
      ? [0.6, 0.2, 0.15, 0.05]  // More trades during stress
      : [0.4, 0.35, 0.2, 0.05]; // Normal distribution
    
    const randomType = () => {
      const rand = Math.random();
      let cumulative = 0;
      for (let i = 0; i < typeWeights.length; i++) {
        cumulative += typeWeights[i];
        if (rand <= cumulative) return types[i];
      }
      return types[0];
    };
    
    const type = randomType();
    const priority = type === 'liquidation' ? 'critical' : 
                    type === 'trade' ? priorities[Math.floor(Math.random() * 3)] :
                    priorities[Math.floor(Math.random() * 2)]; // order operations are usually lower priority
    
    return {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      status: 'pending',
      processingTime: 0,
      priority,
      size: Math.random() * 1000 + 10, // $10-$1010
      trader: `0x${Math.random().toString(16).substr(2, 8)}`
    };
  }, [processingMode]);
  
  // Process transactions with realistic delays and priorities
  const processTransactions = useCallback(() => {
    const queue = queueRef.current;
    const processing = processingRef.current;
    const completed = completedRef.current;
    
    // Sort queue by priority (critical > high > medium > low)
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    queue.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    
    // Simulate concurrent processing (max 5 concurrent transactions)
    const maxConcurrent = 5;
    const availableSlots = maxConcurrent - processing.length;
    
    if (availableSlots > 0 && queue.length > 0) {
      const toProcess = queue.splice(0, availableSlots);
      
      toProcess.forEach(tx => {
        tx.status = 'processing';
        processing.push(tx);
        
        // Simulate processing time based on transaction type and priority
        const baseTime = {
          'trade': 50,
          'order_place': 30,
          'order_cancel': 20,
          'liquidation': 100
        }[tx.type];
        
        const priorityMultiplier = {
          'critical': 0.5,
          'high': 0.7,
          'medium': 1.0,
          'low': 1.5
        }[tx.priority];
        
        const processingTime = baseTime * priorityMultiplier + (Math.random() * 20 - 10);
        
        setTimeout(() => {
          // Simulate occasional failures (2% failure rate)
          const failed = Math.random() < 0.02;
          
          tx.status = failed ? 'failed' : 'completed';
          tx.processingTime = processingTime;
          
          // Move from processing to completed
          const index = processing.indexOf(tx);
          if (index > -1) {
            processing.splice(index, 1);
            completed.push(tx);
            
            // Keep only last 1000 completed transactions
            if (completed.length > 1000) {
              completed.splice(0, completed.length - 1000);
            }
          }
        }, processingTime);
      });
    }
    
    // Update stats
    const now = Date.now();
    const recentCompleted = completed.filter(tx => now - tx.timestamp < 1000); // Last second
    const recentFailed = completed.filter(tx => tx.status === 'failed' && now - tx.timestamp < 5000);
    
    const newStats: ProcessingStats = {
      totalProcessed: completed.length,
      averageProcessingTime: completed.length > 0 
        ? completed.reduce((sum, tx) => sum + tx.processingTime, 0) / completed.length 
        : 0,
      throughputPerSecond: recentCompleted.length,
      queueSize: queue.length,
      errorRate: completed.length > 0 ? (recentFailed.length / Math.max(completed.length, 100)) * 100 : 0,
      peakThroughput: Math.max(statsRef.current.peakThroughput, recentCompleted.length)
    };
    
    statsRef.current = newStats;
    setStats(newStats);
    
    // Update UI state
    setTransactions([
      ...queue.map(tx => ({ ...tx })),
      ...processing.map(tx => ({ ...tx })),
      ...completed.slice(-20).map(tx => ({ ...tx })) // Show last 20 completed
    ]);
    
  }, []);
  
  // Generate transactions based on processing mode
  const generateTransactions = useCallback(() => {
    if (!simulationRunning) return;
    
    const rates = {
      normal: 2,   // 2 transactions per second
      burst: 8,    // 8 transactions per second
      stress: 15   // 15 transactions per second
    };
    
    const rate = rates[processingMode];
    const shouldGenerate = Math.random() < (rate / 10); // Called 10 times per second
    
    if (shouldGenerate) {
      const newTx = generateTransaction();
      queueRef.current.push(newTx);
    }
  }, [simulationRunning, processingMode, generateTransaction]);
  
  // Main processing loop
  useEffect(() => {
    if (simulationRunning) {
      intervalRef.current = setInterval(() => {
        generateTransactions();
        processTransactions();
      }, 100); // 10 times per second
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
  }, [simulationRunning, generateTransactions, processTransactions]);
  
  // Format numbers for display
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
        title="Show Transaction Processor"
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
    <div className="fixed top-20 right-4 z-40 bg-gray-900 text-white p-4 rounded-lg shadow-xl border border-gray-700 min-w-[400px] max-h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          <span className="text-sm font-semibold">Transaction Processor</span>
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

      {/* Processing Mode Controls */}
      <div className="flex space-x-1 mb-3">
        {(['normal', 'burst', 'stress'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setProcessingMode(mode)}
            className={`px-3 py-1 text-xs rounded transition ${
              processingMode === mode 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Throughput</div>
          <div className="text-lg font-bold text-blue-400">{stats.throughputPerSecond}/s</div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Queue Size</div>
          <div className={`text-lg font-bold ${
            stats.queueSize > 50 ? 'text-red-400' : 
            stats.queueSize > 20 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {stats.queueSize}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Avg Time</div>
          <div className="text-lg font-bold text-purple-400">{stats.averageProcessingTime.toFixed(0)}ms</div>
        </div>
      </div>

      {/* Expanded Stats */}
      {isExpanded && (
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div className="bg-gray-800 p-2 rounded">
            <div className="text-gray-400">Error Rate</div>
            <div className={`font-bold ${
              stats.errorRate > 5 ? 'text-red-400' : 
              stats.errorRate > 2 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {stats.errorRate.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-800 p-2 rounded">
            <div className="text-gray-400">Peak TPS</div>
            <div className="font-bold text-cyan-400">{stats.peakThroughput}</div>
          </div>
        </div>
      )}

      {/* Transaction Queue */}
      <div className="bg-gray-800 rounded p-2 max-h-[300px] overflow-y-auto">
        <div className="text-xs text-gray-400 mb-2">Live Transaction Stream</div>
        <div className="space-y-1">
          {transactions.slice(-15).map(tx => (
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
                <span className={getPriorityColor(tx.priority)}>{tx.priority}</span>
                <span className={getStatusColor(tx.status)}>{tx.status}</span>
                {tx.processingTime > 0 && (
                  <span className="text-gray-400">{tx.processingTime.toFixed(0)}ms</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Insights */}
      {isExpanded && (
        <div className="mt-3 p-2 bg-gray-800 rounded text-[10px]">
          <div className="text-gray-300 mb-1">🔧 System Insights:</div>
          {stats.queueSize > 30 && (
            <div className="text-yellow-300">• High queue size - consider scaling workers</div>
          )}
          {stats.averageProcessingTime > 100 && (
            <div className="text-orange-300">• Slow processing - optimize transaction logic</div>
          )}
          {stats.errorRate > 3 && (
            <div className="text-red-300">• High error rate - check system stability</div>
          )}
          {stats.throughputPerSecond > 10 && (
            <div className="text-green-300">• High throughput achieved - system performing well</div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionProcessor;