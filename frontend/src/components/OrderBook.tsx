import React, { useEffect, useRef, useState, useMemo } from 'react';

interface OrderBookLevel {
  price: number;
  quantity: number;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateTime: number;
}

interface OrderBookProps {
  orderBook: OrderBook;
}

interface DepthLevel extends OrderBookLevel {
  depth: number;
  percentage: number;
}

const OrderBook: React.FC<OrderBookProps> = ({ orderBook }) => {
  const { bids, asks } = orderBook;
  const [maxDepth, setMaxDepth] = useState<number>(0);
  const [flashingPrices, setFlashingPrices] = useState<Map<string, 'up' | 'down'>>(new Map());
  const [viewMode, setViewMode] = useState<'table' | 'depth'>('depth');
  const [priceScale, setPriceScale] = useState<'linear' | 'log'>('linear');
  const previousOrderBookRef = useRef<OrderBook | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // FIXED: Enhanced price formatting with 6 decimal precision for micro-cap tokens
  const formatPrice = (price: number): string => {
    if (price === 0 || isNaN(price)) return '0.000000';
    
    // For very small prices (micro-cap tokens), always show 6 decimal places
    if (price < 0.01) {
      return price.toFixed(6);
    }
    // For small prices, show 4 decimal places  
    else if (price < 1) {
      return price.toFixed(4);
    }
    // For medium prices, show 3 decimal places
    else if (price < 100) {
      return price.toFixed(3);
    }
    // For large prices, show 2 decimal places
    else {
      return price.toFixed(2);
    }
  };

  // FIXED: Enhanced quantity formatting to complement price precision
  const formatQuantity = (quantity: number): string => {
    if (quantity === 0 || isNaN(quantity)) return '0.00';
    
    // For very large quantities, use abbreviated format
    if (quantity >= 1000000) {
      return `${(quantity / 1000000).toFixed(2)}M`;
    }
    else if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    // For smaller quantities, show appropriate decimal places
    else if (quantity < 1) {
      return quantity.toFixed(3);
    }
    else {
      return quantity.toFixed(2);
    }
  };

  // FIXED: Enhanced total formatting for better readability
  const formatTotal = (total: number): string => {
    if (total === 0 || isNaN(total)) return '0';
    
    if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M`;
    if (total >= 1000) return `${(total / 1000).toFixed(1)}K`;
    if (total < 1) return total.toFixed(2);
    return total.toFixed(0);
  };

  // FIXED: Enhanced USD formatting that preserves micro-cap precision
  const formatPriceUSD = (price: number): string => {
    if (price === 0 || isNaN(price)) return '$0.000000';
    
    // Determine appropriate decimal places based on price magnitude
    let decimals = 2; // Default for larger prices
    
    if (price < 0.001) {
      decimals = 6; // Maximum precision for very small prices
    } else if (price < 0.01) {
      decimals = 5; // High precision for micro-cap
    } else if (price < 0.1) {
      decimals = 4; // Medium precision
    } else if (price < 1) {
      decimals = 3; // Lower precision
    }
    
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(price);
    
    return formatted;
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
    
    // Calculate percentages based on max depth
    const maxDepthValue = Math.max(...depthLevels.map(l => l.depth));
    
    return depthLevels.map(level => ({
      ...level,
      percentage: maxDepthValue > 0 ? (level.depth / maxDepthValue) * 100 : 0
    }));
  };
  
  // Prepare data for visualization
  const bidsDepth = useMemo(() => calculateDepthLevels(bids.slice(0, 20)), [bids]);
  const asksDepth = useMemo(() => calculateDepthLevels(asks.slice(0, 20), true), [asks]);
  
  // Update max depth
  useEffect(() => {
    const allDepths = [...bidsDepth, ...asksDepth].map(l => l.depth);
    const newMaxDepth = Math.max(...allDepths, 0);
    setMaxDepth(newMaxDepth);
  }, [bidsDepth, asksDepth]);
  
  // FIXED: Enhanced spread calculation with proper precision
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
  
  // Draw depth chart
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
    
    // Draw grid
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    
    // Vertical grid lines (price levels)
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal grid lines (depth levels)
    for (let i = 0; i <= 5; i++) {
      const y = (i / 5) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw bid area (green)
    if (bidsDepth.length > 0) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
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
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
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
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
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
        canvas.height = 200;
        drawDepthChart();
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);
  
  const renderTableView = () => (
    <div className="flex flex-col h-full">
      {/* FIXED: Enhanced header with precision indicator */}
      <div className="grid grid-cols-3 text-xs text-gray-400 py-2 border-b border-gray-700">
        <div className="text-left">Price (6dp)</div>
        <div className="text-right">Size</div>
        <div className="text-right">Total</div>
      </div>
      
      {/* Order book data */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Asks (sell orders) */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col-reverse">
            {asksDepth.slice(0, 15).map((ask, index) => {
              const flashKey = `ask-${ask.price}`;
              const isFlashing = flashingPrices.get(flashKey);
              
              return (
                <div 
                  key={`ask-${index}`} 
                  className="relative group hover:bg-gray-800 transition-colors duration-200"
                >
                  {/* Depth bar */}
                  <div 
                    className="absolute inset-0 bg-red-500 opacity-10 transition-all duration-300"
                    style={{ width: `${ask.percentage}%` }}
                  />
                  
                  {/* Flash overlay */}
                  {isFlashing && (
                    <div 
                      className={`absolute inset-0 ${
                        isFlashing === 'up' ? 'bg-green-400' : 'bg-red-400'
                      } opacity-20 animate-pulse`}
                    />
                  )}
                  
                  <div className="grid grid-cols-3 text-xs py-1 relative z-10">
                    {/* FIXED: Price with 6 decimal precision */}
                    <div className="text-left text-red-400 font-mono" title={formatPriceUSD(ask.price)}>
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
        
        {/* FIXED: Enhanced spread indicator with proper precision */}
        <div className="flex items-center justify-between py-2 px-2 border-y border-gray-700 bg-gray-800">
          <div className="text-xs text-gray-400">
            <span>Spread: </span>
            <span className="font-medium text-white">
              {formatPrice(spread)} ({spreadPercentage.toFixed(3)}%)
            </span>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-yellow-400">
              {formatPriceUSD(midPrice)}
            </div>
            <div className="text-[10px] text-gray-400">
              {formatPrice(midPrice)}
            </div>
          </div>
        </div>
        
        {/* Bids (buy orders) */}
        <div className="flex-1 overflow-y-auto">
          {bidsDepth.slice(0, 15).map((bid, index) => {
            const flashKey = `bid-${bid.price}`;
            const isFlashing = flashingPrices.get(flashKey);
            
            return (
              <div 
                key={`bid-${index}`} 
                className="relative group hover:bg-gray-800 transition-colors duration-200"
              >
                {/* Depth bar */}
                <div 
                  className="absolute inset-0 bg-green-500 opacity-10 transition-all duration-300"
                  style={{ width: `${bid.percentage}%` }}
                />
                
                {/* Flash overlay */}
                {isFlashing && (
                  <div 
                    className={`absolute inset-0 ${
                      isFlashing === 'up' ? 'bg-green-400' : 'bg-red-400'
                    } opacity-20 animate-pulse`}
                  />
                )}
                
                <div className="grid grid-cols-3 text-xs py-1 relative z-10">
                  {/* FIXED: Price with 6 decimal precision */}
                  <div className="text-left text-green-400 font-mono" title={formatPriceUSD(bid.price)}>
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
    </div>
  );
  
  const renderDepthView = () => (
    <div className="flex flex-col h-full">
      {/* Depth chart */}
      <div className="flex-1 min-h-[200px] bg-gray-900 rounded-lg p-2">
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
          style={{ maxHeight: '200px' }}
        />
      </div>
      
      {/* Summary stats */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Total Bids</div>
          <div className="text-green-400 font-mono">
            {formatTotal(bidsDepth.reduce((sum, b) => sum + b.quantity, 0))}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Total Asks</div>
          <div className="text-red-400 font-mono">
            {formatTotal(asksDepth.reduce((sum, a) => sum + a.quantity, 0))}
          </div>
        </div>
      </div>
      
      {/* FIXED: Enhanced best bid/ask with precision */}
      <div className="mt-2 bg-gray-800 p-2 rounded">
        <div className="flex justify-between text-xs">
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
        <div className="text-center mt-1">
          <div className="text-yellow-400 font-mono font-bold">
            {formatPriceUSD(midPrice)}
          </div>
          <div className="text-gray-400 text-[10px] font-mono">
            {formatPrice(midPrice)}
          </div>
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="bg-gray-900 p-3 rounded-lg shadow-lg h-full flex flex-col">
      {/* FIXED: Enhanced header with precision indicator */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <h3 className="text-white font-semibold text-sm mr-2">Order Book</h3>
          <span className="text-green-400 text-[10px] bg-green-900 px-1 rounded" title="6 decimal precision for micro-cap tokens">
            6dp
          </span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode(viewMode === 'table' ? 'depth' : 'table')}
            className={`px-2 py-1 text-xs rounded transition ${
              viewMode === 'depth' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {viewMode === 'table' ? '📊' : '📋'}
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'table' ? renderTableView() : renderDepthView()}
      </div>
      
      {/* FIXED: Enhanced footer with precision info */}
      <div className="mt-2 text-[10px] text-gray-500 text-center">
        ✅ Micro-cap precision: 6 decimals • Hover prices for USD format
      </div>
    </div>
  );
};

export default OrderBook;