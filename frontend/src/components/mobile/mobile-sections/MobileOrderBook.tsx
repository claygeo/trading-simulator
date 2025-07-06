// frontend/src/components/mobile/mobile-sections/MobileOrderBook.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';

interface OrderBookLevel {
  price: number;
  quantity: number;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateTime: number;
}

interface MobileOrderBookProps {
  orderBook: OrderBook;
}

interface DepthLevel extends OrderBookLevel {
  depth: number;
  percentage: number;
}

const MobileOrderBook: React.FC<MobileOrderBookProps> = ({ orderBook }) => {
  const { bids, asks } = orderBook;
  const [viewMode, setViewMode] = useState<'table' | 'depth'>('table');
  const [maxDepth, setMaxDepth] = useState<number>(0);
  const [flashingPrices, setFlashingPrices] = useState<Map<string, 'up' | 'down'>>(new Map());
  const previousOrderBookRef = useRef<OrderBook | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Format functions
  const formatPrice = (price: number) => price.toFixed(2);
  const formatQuantity = (quantity: number) => quantity.toFixed(1);
  const formatTotal = (total: number) => {
    if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M`;
    if (total >= 1000) return `${(total / 1000).toFixed(1)}K`;
    return total.toFixed(0);
  };
  
  // Calculate depth levels with cumulative sums
  const calculateDepthLevels = (levels: OrderBookLevel[], isAsk: boolean = false): DepthLevel[] => {
    if (!levels || levels.length === 0) return [];
    
    let cumulative = 0;
    const depthLevels = levels.map(level => {
      cumulative += level.quantity;
      return {
        ...level,
        depth: cumulative
      };
    });
    
    const maxDepthValue = Math.max(...depthLevels.map(l => l.depth));
    
    return depthLevels.map(level => ({
      ...level,
      percentage: maxDepthValue > 0 ? (level.depth / maxDepthValue) * 100 : 0
    }));
  };
  
  // Prepare data for visualization
  const bidsDepth = useMemo(() => calculateDepthLevels(bids.slice(0, 15)), [bids]);
  const asksDepth = useMemo(() => calculateDepthLevels(asks.slice(0, 15), true), [asks]);
  
  // Update max depth
  useEffect(() => {
    const allDepths = [...bidsDepth, ...asksDepth].map(l => l.depth);
    const newMaxDepth = Math.max(...allDepths, 0);
    setMaxDepth(newMaxDepth);
  }, [bidsDepth, asksDepth]);
  
  // Calculate spread
  const spread = asks.length > 0 && bids.length > 0 ? asks[0].price - bids[0].price : 0;
  const midPrice = asks.length > 0 && bids.length > 0 ? (asks[0].price + bids[0].price) / 2 : 0;
  const spreadPercentage = midPrice > 0 ? (spread / midPrice) * 100 : 0;
  
  // Track price changes for flashing effect
  useEffect(() => {
    const newFlashing = new Map<string, 'up' | 'down'>();
    
    if (!previousOrderBookRef.current) {
      previousOrderBookRef.current = orderBook;
      return;
    }
    
    // Check for quantity changes at same price levels
    bids.forEach((bid, index) => {
      const prevBid = previousOrderBookRef.current?.bids[index];
      if (prevBid && bid.price === prevBid.price && bid.quantity !== prevBid.quantity) {
        const key = `bid-${bid.price}`;
        newFlashing.set(key, bid.quantity > prevBid.quantity ? 'up' : 'down');
      }
    });
    
    asks.forEach((ask, index) => {
      const prevAsk = previousOrderBookRef.current?.asks[index];
      if (prevAsk && ask.price === prevAsk.price && ask.quantity !== prevAsk.quantity) {
        const key = `ask-${ask.price}`;
        newFlashing.set(key, ask.quantity > prevAsk.quantity ? 'up' : 'down');
      }
    });
    
    setFlashingPrices(newFlashing);
    
    const timer = setTimeout(() => {
      setFlashingPrices(new Map());
    }, 600);
    
    previousOrderBookRef.current = orderBook;
    
    return () => clearTimeout(timer);
  }, [orderBook, bids, asks]);
  
  // Draw depth chart for mobile
  const drawDepthChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    
    if (bidsDepth.length === 0 && asksDepth.length === 0) return;
    
    // Get price range
    const allPrices = [...bidsDepth.map(b => b.price), ...asksDepth.map(a => a.price)];
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    
    if (priceRange === 0) return;
    
    // Drawing functions
    const priceToX = (price: number) => ((price - minPrice) / priceRange) * width;
    const depthToY = (depth: number) => height - (depth / maxDepth) * height;
    
    // Draw grid (mobile optimized)
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    
    // Fewer grid lines for mobile
    for (let i = 0; i <= 5; i++) {
      const x = (i / 5) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let i = 0; i <= 3; i++) {
      const y = (i / 3) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw bid area (green)
    if (bidsDepth.length > 0) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.moveTo(0, height);
      
      bidsDepth.forEach(bid => {
        const x = priceToX(bid.price);
        const y = depthToY(bid.depth);
        ctx.lineTo(x, y);
      });
      
      ctx.lineTo(priceToX(bidsDepth[bidsDepth.length - 1].price), height);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      bidsDepth.forEach((bid, index) => {
        const x = priceToX(bid.price);
        const y = depthToY(bid.depth);
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }
    
    // Draw ask area (red)
    if (asksDepth.length > 0) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.moveTo(priceToX(asksDepth[0].price), height);
      
      asksDepth.forEach(ask => {
        const x = priceToX(ask.price);
        const y = depthToY(ask.depth);
        ctx.lineTo(x, y);
      });
      
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      asksDepth.forEach((ask, index) => {
        const x = priceToX(ask.price);
        const y = depthToY(ask.depth);
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }
    
    // Draw mid price line
    if (midPrice > 0) {
      const midX = priceToX(midPrice);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, height);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }
  };
  
  // Redraw chart when data changes
  useEffect(() => {
    if (viewMode === 'depth') {
      drawDepthChart();
    }
  }, [bidsDepth, asksDepth, maxDepth, viewMode]);
  
  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = 150; // Fixed height for mobile
        drawDepthChart();
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const renderTableView = () => (
    <div className="h-full flex flex-col">
      {/* Asks (sell orders) - Reversed for mobile */}
      <div className="flex-1 overflow-y-auto bg-gray-900">
        <div className="sticky top-0 bg-gray-800 text-xs text-gray-400 py-2 px-3 border-b border-gray-700">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-left">Price</div>
            <div className="text-right">Size</div>
            <div className="text-right">Total</div>
          </div>
        </div>
        
        <div className="flex flex-col-reverse">
          {asksDepth.slice(0, 8).map((ask, index) => {
            const flashKey = `ask-${ask.price}`;
            const isFlashing = flashingPrices.get(flashKey);
            
            return (
              <div 
                key={`ask-${index}`} 
                className="relative hover:bg-gray-800 transition-colors duration-200"
              >
                {/* Depth bar */}
                <div 
                  className="absolute inset-0 bg-red-500 opacity-20 transition-all duration-300"
                  style={{ width: `${ask.percentage}%` }}
                />
                
                {/* Flash overlay */}
                {isFlashing && (
                  <div 
                    className={`absolute inset-0 ${
                      isFlashing === 'up' ? 'bg-green-400' : 'bg-red-400'
                    } opacity-30 animate-pulse`}
                  />
                )}
                
                <div className="grid grid-cols-3 gap-2 text-xs py-2 px-3 relative z-10">
                  <div className="text-left text-red-400 font-mono">
                    {formatPrice(ask.price)}
                  </div>
                  <div className="text-right text-white font-mono">
                    {formatQuantity(ask.quantity)}
                  </div>
                  <div className="text-right text-gray-400 font-mono">
                    {formatTotal(ask.depth)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Spread indicator */}
      <div className="py-3 px-3 border-y border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="text-xs">
            <span className="text-gray-400">Spread: </span>
            <span className="font-medium text-white">
              {formatPrice(spread)} ({spreadPercentage.toFixed(2)}%)
            </span>
          </div>
          <span className="text-lg font-bold text-yellow-400">
            ${formatPrice(midPrice)}
          </span>
        </div>
      </div>
      
      {/* Bids (buy orders) */}
      <div className="flex-1 overflow-y-auto bg-gray-900">
        {bidsDepth.slice(0, 8).map((bid, index) => {
          const flashKey = `bid-${bid.price}`;
          const isFlashing = flashingPrices.get(flashKey);
          
          return (
            <div 
              key={`bid-${index}`} 
              className="relative hover:bg-gray-800 transition-colors duration-200"
            >
              {/* Depth bar */}
              <div 
                className="absolute inset-0 bg-green-500 opacity-20 transition-all duration-300"
                style={{ width: `${bid.percentage}%` }}
              />
              
              {/* Flash overlay */}
              {isFlashing && (
                <div 
                  className={`absolute inset-0 ${
                    isFlashing === 'up' ? 'bg-green-400' : 'bg-red-400'
                  } opacity-30 animate-pulse`}
                />
              )}
              
              <div className="grid grid-cols-3 gap-2 text-xs py-2 px-3 relative z-10">
                <div className="text-left text-green-400 font-mono">
                  {formatPrice(bid.price)}
                </div>
                <div className="text-right text-white font-mono">
                  {formatQuantity(bid.quantity)}
                </div>
                <div className="text-right text-gray-400 font-mono">
                  {formatTotal(bid.depth)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
  
  const renderDepthView = () => (
    <div className="h-full flex flex-col">
      {/* Depth chart */}
      <div className="flex-1 bg-gray-900 p-3">
        <canvas 
          ref={canvasRef}
          className="w-full h-full rounded"
          style={{ maxHeight: '150px' }}
        />
      </div>
      
      {/* Summary stats */}
      <div className="p-3 bg-gray-800 border-t border-gray-700">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-center">
            <div className="text-gray-400 text-xs">Total Bids</div>
            <div className="text-green-400 font-mono text-sm">
              {formatTotal(bidsDepth.reduce((sum, b) => sum + b.quantity, 0))}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-xs">Total Asks</div>
            <div className="text-red-400 font-mono text-sm">
              {formatTotal(asksDepth.reduce((sum, a) => sum + a.quantity, 0))}
            </div>
          </div>
        </div>
        
        {/* Best bid/ask */}
        <div className="flex justify-between text-xs border-t border-gray-700 pt-2">
          <div>
            <span className="text-gray-400">Best Bid: </span>
            <span className="text-green-400 font-mono">
              {bids.length > 0 ? formatPrice(bids[0].price) : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Best Ask: </span>
            <span className="text-red-400 font-mono">
              {asks.length > 0 ? formatPrice(asks[0].price) : 'N/A'}
            </span>
          </div>
        </div>
        
        <div className="text-center mt-2">
          <span className="text-gray-400 text-xs">Mid Price: </span>
          <span className="text-yellow-400 font-mono font-bold">
            ${formatPrice(midPrice)}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Mobile Header */}
      <div className="p-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium">Order Book</h3>
          
          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <button
              onClick={() => setViewMode(viewMode === 'table' ? 'depth' : 'table')}
              className={`px-3 py-1 text-xs rounded transition ${
                viewMode === 'depth' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {viewMode === 'table' ? '📊 Chart' : '📋 Table'}
            </button>
            
            {/* Data Count */}
            <div className="text-xs text-gray-400">
              {bids.length + asks.length} levels
            </div>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="mt-2 flex items-center justify-between text-xs">
          <div className="text-green-400">
            Bids: <span className="font-mono">{bids.length}</span>
          </div>
          <div className="text-yellow-400 font-medium">
            Spread: ${formatPrice(spread)}
          </div>
          <div className="text-red-400">
            Asks: <span className="font-mono">{asks.length}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'table' ? renderTableView() : renderDepthView()}
      </div>

      {/* Mobile Footer */}
      <div className="p-2 bg-gray-800 border-t border-gray-700">
        <div className="text-center text-xs text-gray-500">
          Live order book • Touch to interact • Swipe to scroll
        </div>
      </div>
    </div>
  );
};

export default MobileOrderBook;