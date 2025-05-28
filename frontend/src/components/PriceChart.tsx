import React, { useEffect, useRef, useState, useMemo } from 'react';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
}

// Define market condition type
type MarketCondition = 'bullish' | 'bearish' | 'volatile' | 'calm' | 'building' | 'crash';

interface ScenarioPhase {
  name: string;
  marketCondition: MarketCondition;
}

interface ScenarioData {
  phase: ScenarioPhase;
  progress?: number;
}

interface PriceChartProps {
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  priceHistory?: ChartPricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: ScenarioData;
  candles?: Candle[];
  symbol?: string;
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  priceHistory = [],
  currentPrice = 0,
  trades = [],
  scenarioData,
  symbol = 'BTC/USDT'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const animationRef = useRef<number | null>(null);
  
  // Interactive chart state
  const [chartOffset, setChartOffset] = useState(0); // Horizontal offset for panning
  const [zoomLevel, setZoomLevel] = useState(1); // Zoom level (1 = default)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredCandle, setHoveredCandle] = useState<number | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);

  // Process candles - now we're using 15-minute candles directly from the backend
  const chartCandles = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) {
      console.log('No price history provided to chart');
      return [];
    }

    // Convert price history points to candles if needed
    return priceHistory.map(point => ({
      time: point.timestamp || point.time,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume || 0
    }));
  }, [priceHistory]);

  // Update dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height)
        });
      }
    };

    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - chartOffset, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      const newOffset = e.clientX - dragStart.x;
      setChartOffset(newOffset);
    } else {
      // Update crosshair
      setCrosshair({ x, y });
      
      // Check if hovering over a candle
      const padding = { top: 40, right: 60, bottom: 40, left: 10 };
      const chartWidth = dimensions.width - padding.left - padding.right;
      const candleWidth = (chartWidth / chartCandles.length) * zoomLevel;
      
      const adjustedX = x - padding.left + (-chartOffset * zoomLevel);
      const candleIndex = Math.floor(adjustedX / candleWidth);
      
      if (candleIndex >= 0 && candleIndex < chartCandles.length) {
        setHoveredCandle(candleIndex);
      } else {
        setHoveredCandle(null);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setCrosshair(null);
    setHoveredCandle(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    // Zoom with mouse wheel
    const zoomSpeed = 0.001;
    const delta = e.deltaY * -zoomSpeed;
    const newZoom = Math.max(0.5, Math.min(3, zoomLevel + delta));
    
    // Zoom towards mouse position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const centerX = dimensions.width / 2;
      const offsetAdjustment = (mouseX - centerX) * (newZoom - zoomLevel) * 0.5;
      setChartOffset(chartOffset - offsetAdjustment);
    }
    
    setZoomLevel(newZoom);
  };

  // Draw chart
  useEffect(() => {
    if (!canvasRef.current || chartCandles.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cancel previous animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const draw = () => {
      // Set canvas size
      const dpr = window.devicePixelRatio || 1;
      canvas.width = dimensions.width * dpr;
      canvas.height = dimensions.height * dpr;
      canvas.style.width = `${dimensions.width}px`;
      canvas.style.height = `${dimensions.height}px`;
      ctx.scale(dpr, dpr);

      // Clear canvas
      ctx.fillStyle = '#0B1426';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Layout
      const padding = {
        top: 40,
        right: 60,
        bottom: 40,
        left: 10
      };

      const chartWidth = dimensions.width - padding.left - padding.right;
      const chartHeight = dimensions.height - padding.top - padding.bottom;

      if (chartWidth <= 0 || chartHeight <= 0) return;

      // Calculate visible candles based on zoom and offset
      const candleWidth = (chartWidth / chartCandles.length) * zoomLevel;
      const visibleStartIndex = Math.max(0, Math.floor(-chartOffset / candleWidth));
      const visibleEndIndex = Math.min(chartCandles.length, Math.ceil((chartWidth - chartOffset) / candleWidth));
      const visibleCandles = chartCandles.slice(visibleStartIndex, visibleEndIndex);

      // Calculate price range for visible candles
      let minPrice = Infinity;
      let maxPrice = -Infinity;

      visibleCandles.forEach(candle => {
        minPrice = Math.min(minPrice, candle.low);
        maxPrice = Math.max(maxPrice, candle.high);
      });

      if (!isFinite(minPrice) || !isFinite(maxPrice)) {
        minPrice = 100;
        maxPrice = 150;
      }

      // Add padding to price range
      const pricePadding = (maxPrice - minPrice) * 0.1;
      minPrice -= pricePadding;
      maxPrice += pricePadding;

      // Helper functions
      const priceToY = (price: number) => {
        const ratio = (price - minPrice) / (maxPrice - minPrice);
        return padding.top + chartHeight * (1 - ratio);
      };

      const indexToX = (index: number) => {
        return padding.left + (index * candleWidth) + chartOffset;
      };

      // Set up clipping region for chart area
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, padding.top, chartWidth, chartHeight);
      ctx.clip();

      // Draw grid
      ctx.strokeStyle = '#1C2951';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([]);

      // Horizontal grid lines (price)
      const priceSteps = 5;
      for (let i = 0; i <= priceSteps; i++) {
        const price = minPrice + (i / priceSteps) * (maxPrice - minPrice);
        const y = priceToY(price);

        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(dimensions.width - padding.right, y);
        ctx.stroke();
      }

      // Vertical grid lines (time) - only for visible candles
      const timeSteps = Math.min(6, visibleCandles.length - 1);
      const stepSize = Math.max(1, Math.floor(visibleCandles.length / timeSteps));
      
      for (let i = 0; i <= timeSteps; i++) {
        const candleIndex = Math.min(i * stepSize, visibleCandles.length - 1);
        const globalIndex = visibleStartIndex + candleIndex;
        const x = indexToX(globalIndex);

        if (x >= padding.left && x <= dimensions.width - padding.right) {
          ctx.beginPath();
          ctx.moveTo(x, padding.top);
          ctx.lineTo(x, dimensions.height - padding.bottom);
          ctx.stroke();
        }
      }

      // Draw candles
      const effectiveCandleWidth = Math.max(3, Math.min(candleWidth * 0.8, 15));

      chartCandles.forEach((candle, index) => {
        const x = indexToX(index);
        
        // Skip candles outside visible area
        if (x < padding.left - effectiveCandleWidth || x > dimensions.width - padding.right + effectiveCandleWidth) {
          return;
        }

        const openY = priceToY(candle.open);
        const closeY = priceToY(candle.close);
        const highY = priceToY(candle.high);
        const lowY = priceToY(candle.low);

        const isGreen = candle.close >= candle.open;
        const color = isGreen ? '#22C55E' : '#EF4444';

        // Highlight hovered candle
        if (index === hoveredCandle) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.fillRect(x - effectiveCandleWidth / 2 - 2, padding.top, effectiveCandleWidth + 4, chartHeight);
        }

        // Draw wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        // Draw body
        const bodyHeight = Math.abs(closeY - openY);
        const bodyY = Math.min(openY, closeY);

        if (bodyHeight < 1) {
          // Draw line for doji
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - effectiveCandleWidth / 2, bodyY);
          ctx.lineTo(x + effectiveCandleWidth / 2, bodyY);
          ctx.stroke();
        } else {
          // Draw rectangle for body
          ctx.fillStyle = color;
          ctx.fillRect(x - effectiveCandleWidth / 2, bodyY, effectiveCandleWidth, bodyHeight);
        }
      });

      // Restore clipping
      ctx.restore();

      // Draw price labels
      for (let i = 0; i <= priceSteps; i++) {
        const price = minPrice + (i / priceSteps) * (maxPrice - minPrice);
        const y = priceToY(price);

        ctx.fillStyle = '#6B7280';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(price.toFixed(2), dimensions.width - 5, y + 3);
      }

      // Draw time labels
      for (let i = 0; i <= timeSteps; i++) {
        const candleIndex = Math.min(i * stepSize, visibleCandles.length - 1);
        const globalIndex = visibleStartIndex + candleIndex;
        const x = indexToX(globalIndex);

        if (x >= padding.left && x <= dimensions.width - padding.right && chartCandles[globalIndex]) {
          const date = new Date(chartCandles[globalIndex].time);
          const hours = date.getHours().toString().padStart(2, '0');
          const minutes = date.getMinutes().toString().padStart(2, '0');
          const timeLabel = `${hours}:${minutes}`;

          ctx.fillStyle = '#6B7280';
          ctx.font = '11px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(timeLabel, x, dimensions.height - padding.bottom + 20);
        }
      }

      // Draw crosshair if hovering
      if (crosshair && !isDragging) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(crosshair.x, padding.top);
        ctx.lineTo(crosshair.x, dimensions.height - padding.bottom);
        ctx.stroke();

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(padding.left, crosshair.y);
        ctx.lineTo(dimensions.width - padding.right, crosshair.y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Show price at crosshair
        const price = minPrice + ((dimensions.height - padding.bottom - crosshair.y) / chartHeight) * (maxPrice - minPrice);
        
        ctx.fillStyle = '#1F2937';
        ctx.fillRect(dimensions.width - padding.right + 5, crosshair.y - 10, 55, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`$${price.toFixed(2)}`, dimensions.width - padding.right + 8, crosshair.y + 3);
      }

      // Draw candle details if hovering
      if (hoveredCandle !== null && chartCandles[hoveredCandle]) {
        const candle = chartCandles[hoveredCandle];
        const date = new Date(candle.time);
        const dateStr = date.toLocaleString();
        
        // Draw tooltip background
        ctx.fillStyle = 'rgba(17, 24, 39, 0.95)';
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1;
        const tooltipX = 80;
        const tooltipY = 60;
        const tooltipWidth = 200;
        const tooltipHeight = 120;
        
        ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        
        // Draw tooltip content
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        
        const lineHeight = 18;
        let y = tooltipY + 20;
        
        ctx.fillText(dateStr, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Open: $${candle.open.toFixed(2)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`High: $${candle.high.toFixed(2)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Low: $${candle.low.toFixed(2)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Close: $${candle.close.toFixed(2)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Volume: ${candle.volume.toFixed(0)}`, tooltipX + 10, y);
      }

      // Draw title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${symbol} - 15M`, padding.left, 25);

      // Draw current price and change
      if (currentPrice && chartCandles.length > 0) {
        const lastCandle = chartCandles[chartCandles.length - 1];
        const firstVisibleCandle = visibleCandles[0] || chartCandles[0];
        const priceChange = ((lastCandle.close - firstVisibleCandle.open) / firstVisibleCandle.open) * 100;
        const changeColor = priceChange >= 0 ? '#22C55E' : '#EF4444';
        
        ctx.fillStyle = changeColor;
        ctx.font = '14px -apple-system, sans-serif';
        ctx.fillText(
          `$${lastCandle.close.toFixed(2)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`,
          padding.left + 120,
          25
        );
      }

      // Draw zoom level indicator
      ctx.fillStyle = '#6B7280';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Zoom: ${(zoomLevel * 100).toFixed(0)}%`, dimensions.width - padding.right - 100, 25);

      // Draw market scenario indicator if active
      if (scenarioData && scenarioData.phase) {
        const phase = scenarioData.phase;
        const progress = scenarioData.progress || 0;
        
        // Scenario indicator
        ctx.fillStyle = '#8B5CF6';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
          `📊 ${phase.name} (${Math.round(progress * 100)}%)`,
          dimensions.width - padding.right,
          25
        );
        
        // Market condition badge
        const conditionColors: Record<MarketCondition, string> = {
          bullish: '#22C55E',
          bearish: '#EF4444',
          volatile: '#F59E0B',
          calm: '#3B82F6',
          building: '#6366F1',
          crash: '#DC2626'
        };
        
        const conditionColor = conditionColors[phase.marketCondition] || '#6B7280';
        ctx.fillStyle = conditionColor;
        ctx.fillRect(dimensions.width - padding.right - 80, 35, 80, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(phase.marketCondition.toUpperCase(), dimensions.width - padding.right - 40, 48);
      }
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [chartCandles, currentPrice, dimensions, symbol, scenarioData, chartOffset, zoomLevel, hoveredCandle, crosshair, isDragging]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-[#0B1426] rounded-lg overflow-hidden relative"
      style={{ minHeight: '400px' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{ display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />
      <div className="absolute bottom-2 left-2 text-xs text-gray-500">
        <span className="mr-4">Drag to pan</span>
        <span>Scroll to zoom</span>
      </div>
    </div>
  );
};

export default PriceChart;