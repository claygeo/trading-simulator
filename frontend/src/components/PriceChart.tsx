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

// Dynamic timeframe type
type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

interface TimeframeConfig {
  label: string;
  minutes: number;
  candlesPerView: number;
  gridLines: number;
  dateFormat: (date: Date) => string;
}

interface PriceChartProps {
  interval?: Timeframe;
  priceHistory?: ChartPricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: ScenarioData;
  candles?: Candle[];
  symbol?: string;
  dynamicView?: boolean; // Enable dynamic view selection
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  priceHistory = [],
  currentPrice = 0,
  trades = [],
  scenarioData,
  symbol = 'BTC/USDT',
  dynamicView = true // Default to dynamic view
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const animationRef = useRef<number | null>(null);
  
  // Interactive chart state
  const [chartOffset, setChartOffset] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredCandle, setHoveredCandle] = useState<number | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  
  // Dynamic timeframe state - simplified, always auto
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');

  // Timeframe configurations
  const timeframeConfigs: Record<Timeframe, TimeframeConfig> = {
    '1m': {
      label: '1 Minute',
      minutes: 1,
      candlesPerView: 60,
      gridLines: 10,
      dateFormat: (date: Date) => {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        const s = date.getSeconds().toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
      }
    },
    '5m': {
      label: '5 Minutes',
      minutes: 5,
      candlesPerView: 48,
      gridLines: 8,
      dateFormat: (date: Date) => {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
      }
    },
    '15m': {
      label: '15 Minutes',
      minutes: 15,
      candlesPerView: 48,
      gridLines: 8,
      dateFormat: (date: Date) => {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
      }
    },
    '30m': {
      label: '30 Minutes',
      minutes: 30,
      candlesPerView: 48,
      gridLines: 8,
      dateFormat: (date: Date) => {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
      }
    },
    '1h': {
      label: '1 Hour',
      minutes: 60,
      candlesPerView: 24,
      gridLines: 6,
      dateFormat: (date: Date) => {
        const h = date.getHours().toString().padStart(2, '0');
        return `${h}:00`;
      }
    },
    '4h': {
      label: '4 Hours',
      minutes: 240,
      candlesPerView: 24,
      gridLines: 6,
      dateFormat: (date: Date) => {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const h = date.getHours().toString().padStart(2, '0');
        return `${month}/${day} ${h}:00`;
      }
    },
    '1d': {
      label: '1 Day',
      minutes: 1440,
      candlesPerView: 30,
      gridLines: 5,
      dateFormat: (date: Date) => {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${month}/${day}`;
      }
    }
  };

  // Dynamic timeframe selection based on price and volatility
  const determineOptimalTimeframe = useMemo(() => {
    if (!dynamicView) return selectedTimeframe;
    
    if (!priceHistory || priceHistory.length < 2) return '15m';
    
    // Get price statistics
    const prices = priceHistory.map(p => p.close);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const volatility = (priceRange / avgPrice) * 100;
    
    // Calculate price movement frequency
    let significantMoves = 0;
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i-1]) / prices[i-1]) * 100;
      if (change > 0.5) significantMoves++;
    }
    const moveFrequency = significantMoves / prices.length;
    
    // Decision matrix for timeframe selection
    if (avgPrice < 1) {
      // Micro-cap tokens (penny stocks)
      if (volatility > 20) return '1m';
      if (volatility > 10) return '5m';
      return '15m';
    } else if (avgPrice < 10) {
      // Small-cap tokens
      if (volatility > 15) return '5m';
      if (volatility > 8) return '15m';
      return '30m';
    } else if (avgPrice < 100) {
      // Mid-cap tokens
      if (volatility > 10) return '15m';
      if (volatility > 5) return '30m';
      return '1h';
    } else if (avgPrice < 1000) {
      // Large-cap tokens
      if (volatility > 8) return '30m';
      if (volatility > 4) return '1h';
      return '4h';
    } else {
      // Mega-cap tokens (BTC, ETH)
      if (volatility > 5) return '1h';
      if (volatility > 2) return '4h';
      return '1d';
    }
  }, [priceHistory, dynamicView, selectedTimeframe]);

  // Calculate optimal price scale
  const calculatePriceScale = (minPrice: number, maxPrice: number) => {
    const range = maxPrice - minPrice;
    const avgPrice = (minPrice + maxPrice) / 2;
    
    // Determine decimal places based on price magnitude
    let decimals = 2;
    if (avgPrice < 0.01) decimals = 6;
    else if (avgPrice < 0.1) decimals = 5;
    else if (avgPrice < 1) decimals = 4;
    else if (avgPrice < 10) decimals = 3;
    else if (avgPrice < 100) decimals = 2;
    else if (avgPrice < 1000) decimals = 1;
    else decimals = 0;
    
    // Calculate grid step size
    let stepSize = 1;
    const targetSteps = 5;
    const rawStep = range / targetSteps;
    
    // Round to nice numbers
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    
    if (normalized <= 1) stepSize = magnitude;
    else if (normalized <= 2) stepSize = 2 * magnitude;
    else if (normalized <= 5) stepSize = 5 * magnitude;
    else stepSize = 10 * magnitude;
    
    return { decimals, stepSize };
  };

  // Process candles based on selected timeframe
  const chartCandles = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) {
      return [];
    }

    const timeframe = determineOptimalTimeframe;
    const config = timeframeConfigs[timeframe];
    
    // Group price history into candles based on timeframe
    const candleMap = new Map<number, Candle>();
    const intervalMs = config.minutes * 60 * 1000;
    
    priceHistory.forEach(point => {
      const timestamp = point.timestamp || point.time;
      const candleTime = Math.floor(timestamp / intervalMs) * intervalMs;
      
      if (!candleMap.has(candleTime)) {
        candleMap.set(candleTime, {
          time: candleTime,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          volume: point.volume || 0
        });
      } else {
        const candle = candleMap.get(candleTime)!;
        candle.high = Math.max(candle.high, point.high);
        candle.low = Math.min(candle.low, point.low);
        candle.close = point.close;
        candle.volume += point.volume || 0;
      }
    });
    
    return Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
  }, [priceHistory, determineOptimalTimeframe]);

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
      setCrosshair({ x, y });
      
      const padding = { top: 60, right: 80, bottom: 40, left: 10 };
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
    
    const zoomSpeed = 0.001;
    const delta = e.deltaY * -zoomSpeed;
    const newZoom = Math.max(0.5, Math.min(3, zoomLevel + delta));
    
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

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = dimensions.width * dpr;
      canvas.height = dimensions.height * dpr;
      canvas.style.width = `${dimensions.width}px`;
      canvas.style.height = `${dimensions.height}px`;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0B1426';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      const padding = {
        top: 60,
        right: 80,
        bottom: 40,
        left: 10
      };

      const chartWidth = dimensions.width - padding.left - padding.right;
      const chartHeight = dimensions.height - padding.top - padding.bottom;

      if (chartWidth <= 0 || chartHeight <= 0) return;

      const candleWidth = (chartWidth / chartCandles.length) * zoomLevel;
      const visibleStartIndex = Math.max(0, Math.floor(-chartOffset / candleWidth));
      const visibleEndIndex = Math.min(chartCandles.length, Math.ceil((chartWidth - chartOffset) / candleWidth));
      const visibleCandles = chartCandles.slice(visibleStartIndex, visibleEndIndex);

      let minPrice = Infinity;
      let maxPrice = -Infinity;

      visibleCandles.forEach(candle => {
        minPrice = Math.min(minPrice, candle.low);
        maxPrice = Math.max(maxPrice, candle.high);
      });

      if (!isFinite(minPrice) || !isFinite(maxPrice)) {
        minPrice = currentPrice * 0.95 || 100;
        maxPrice = currentPrice * 1.05 || 150;
      }

      const pricePadding = (maxPrice - minPrice) * 0.1;
      minPrice -= pricePadding;
      maxPrice += pricePadding;

      // Get price scale configuration
      const { decimals, stepSize } = calculatePriceScale(minPrice, maxPrice);

      const priceToY = (price: number) => {
        const ratio = (price - minPrice) / (maxPrice - minPrice);
        return padding.top + chartHeight * (1 - ratio);
      };

      const indexToX = (index: number) => {
        return padding.left + (index * candleWidth) + chartOffset;
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, padding.top, chartWidth, chartHeight);
      ctx.clip();

      // Draw grid
      ctx.strokeStyle = '#1C2951';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([]);

      // Dynamic horizontal grid lines
      const gridStart = Math.ceil(minPrice / stepSize) * stepSize;
      for (let price = gridStart; price <= maxPrice; price += stepSize) {
        const y = priceToY(price);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(dimensions.width - padding.right, y);
        ctx.stroke();
      }

      // Vertical grid lines
      const timeframe = determineOptimalTimeframe;
      const config = timeframeConfigs[timeframe];
      const timeSteps = Math.min(config.gridLines, visibleCandles.length - 1);
      const stepSizeTime = Math.max(1, Math.floor(visibleCandles.length / timeSteps));
      
      for (let i = 0; i <= timeSteps; i++) {
        const candleIndex = Math.min(i * stepSizeTime, visibleCandles.length - 1);
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
        
        if (x < padding.left - effectiveCandleWidth || x > dimensions.width - padding.right + effectiveCandleWidth) {
          return;
        }

        const openY = priceToY(candle.open);
        const closeY = priceToY(candle.close);
        const highY = priceToY(candle.high);
        const lowY = priceToY(candle.low);

        const isGreen = candle.close >= candle.open;
        const color = isGreen ? '#22C55E' : '#EF4444';

        if (index === hoveredCandle) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.fillRect(x - effectiveCandleWidth / 2 - 2, padding.top, effectiveCandleWidth + 4, chartHeight);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        const bodyHeight = Math.abs(closeY - openY);
        const bodyY = Math.min(openY, closeY);

        if (bodyHeight < 1) {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - effectiveCandleWidth / 2, bodyY);
          ctx.lineTo(x + effectiveCandleWidth / 2, bodyY);
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(x - effectiveCandleWidth / 2, bodyY, effectiveCandleWidth, bodyHeight);
        }
      });

      ctx.restore();

      // Draw dynamic price labels
      const formatPrice = (price: number) => {
        if (decimals === 0) return price.toFixed(0);
        return price.toFixed(decimals);
      };

      for (let price = gridStart; price <= maxPrice; price += stepSize) {
        const y = priceToY(price);
        ctx.fillStyle = '#6B7280';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatPrice(price), dimensions.width - 5, y + 3);
      }

      // Draw time labels
      for (let i = 0; i <= timeSteps; i++) {
        const candleIndex = Math.min(i * stepSizeTime, visibleCandles.length - 1);
        const globalIndex = visibleStartIndex + candleIndex;
        const x = indexToX(globalIndex);

        if (x >= padding.left && x <= dimensions.width - padding.right && chartCandles[globalIndex]) {
          const date = new Date(chartCandles[globalIndex].time);
          const timeLabel = config.dateFormat(date);

          ctx.fillStyle = '#6B7280';
          ctx.font = '11px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(timeLabel, x, dimensions.height - padding.bottom + 20);
        }
      }

      // Draw crosshair
      if (crosshair && !isDragging) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(crosshair.x, padding.top);
        ctx.lineTo(crosshair.x, dimensions.height - padding.bottom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(padding.left, crosshair.y);
        ctx.lineTo(dimensions.width - padding.right, crosshair.y);
        ctx.stroke();

        ctx.setLineDash([]);

        const price = minPrice + ((dimensions.height - padding.bottom - crosshair.y) / chartHeight) * (maxPrice - minPrice);
        
        ctx.fillStyle = '#1F2937';
        ctx.fillRect(dimensions.width - padding.right + 5, crosshair.y - 10, 75, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(formatPrice(price), dimensions.width - padding.right + 8, crosshair.y + 3);
      }

      // Draw candle tooltip
      if (hoveredCandle !== null && chartCandles[hoveredCandle]) {
        const candle = chartCandles[hoveredCandle];
        const date = new Date(candle.time);
        const dateStr = date.toLocaleString();
        
        ctx.fillStyle = 'rgba(17, 24, 39, 0.95)';
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1;
        const tooltipX = 80;
        const tooltipY = 80;
        const tooltipWidth = 220;
        const tooltipHeight = 140;
        
        ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        
        const lineHeight = 18;
        let y = tooltipY + 20;
        
        ctx.fillText(dateStr, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Open: ${formatPrice(candle.open)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`High: ${formatPrice(candle.high)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Low: ${formatPrice(candle.low)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Close: ${formatPrice(candle.close)}`, tooltipX + 10, y);
        y += lineHeight;
        
        ctx.fillText(`Volume: ${candle.volume.toFixed(0)}`, tooltipX + 10, y);
        y += lineHeight;
        
        // Show percentage change
        if (hoveredCandle > 0) {
          const prevCandle = chartCandles[hoveredCandle - 1];
          const change = ((candle.close - prevCandle.close) / prevCandle.close) * 100;
          const changeColor = change >= 0 ? '#22C55E' : '#EF4444';
          ctx.fillStyle = changeColor;
          ctx.fillText(`Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, tooltipX + 10, y);
        }
      }

      // Draw header
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${symbol} - ${config.label}`, padding.left, 25);

      // Draw current price
      if (currentPrice && chartCandles.length > 0) {
        const lastCandle = chartCandles[chartCandles.length - 1];
        const firstVisibleCandle = visibleCandles[0] || chartCandles[0];
        const priceChange = ((lastCandle.close - firstVisibleCandle.open) / firstVisibleCandle.open) * 100;
        const changeColor = priceChange >= 0 ? '#22C55E' : '#EF4444';
        
        ctx.fillStyle = changeColor;
        ctx.font = '14px -apple-system, sans-serif';
        ctx.fillText(
          `${formatPrice(lastCandle.close)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`,
          padding.left + 180,
          25
        );
      }

      // Draw subtle timeframe indicator in corner if dynamic view is enabled
      if (dynamicView) {
        const currentTf = determineOptimalTimeframe;
        const tfLabel = timeframeConfigs[currentTf].label;
        
        // Draw in bottom right corner
        ctx.fillStyle = 'rgba(107, 114, 128, 0.3)';
        ctx.fillRect(dimensions.width - 100, dimensions.height - 30, 95, 25);
        
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tfLabel, dimensions.width - 52.5, dimensions.height - 12);
      }

      // Draw zoom indicator
      ctx.fillStyle = '#6B7280';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Zoom: ${(zoomLevel * 100).toFixed(0)}%`, dimensions.width - padding.right - 100, 25);

      // Draw scenario indicator
      if (scenarioData && scenarioData.phase) {
        const phase = scenarioData.phase;
        const progress = scenarioData.progress || 0;
        
        ctx.fillStyle = '#8B5CF6';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
          `📊 ${phase.name} (${Math.round(progress * 100)}%)`,
          dimensions.width - padding.right,
          45
        );
        
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
        ctx.fillRect(dimensions.width - padding.right - 80, 55, 80, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(phase.marketCondition.toUpperCase(), dimensions.width - padding.right - 40, 68);
      }
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [chartCandles, currentPrice, dimensions, symbol, scenarioData, chartOffset, zoomLevel, hoveredCandle, crosshair, isDragging, determineOptimalTimeframe, dynamicView]);

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