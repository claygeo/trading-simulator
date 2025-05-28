import React, { useEffect, useRef, useState } from 'react';

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
  price: number;
  volume?: number;
}

interface Trade {
  id: string;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

interface PriceChartProps {
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  priceHistory?: ChartPricePoint[];
  currentPrice?: number;
  trades?: Trade[];
  scenarioData?: any;
  candles?: Candle[];
  symbol?: string;
}

const PriceChart: React.FC<PriceChartProps> = ({ 
  interval = '15m',
  priceHistory = [],
  currentPrice = 0,
  trades = [],
  scenarioData,
  candles = [], 
  symbol = 'BTC/USDT'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Convert priceHistory to candles if no candles provided
  const convertPriceHistoryToCandles = (history: ChartPricePoint[]): Candle[] => {
    if (history.length === 0) return [];
    
    const candles: Candle[] = [];
    const candleInterval = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    // Group price points into candles
    let currentCandle: Candle | null = null;
    let candleStartTime = Math.floor(history[0].time / candleInterval) * candleInterval;
    
    history.forEach(point => {
      const pointCandleTime = Math.floor(point.time / candleInterval) * candleInterval;
      
      if (pointCandleTime !== candleStartTime || !currentCandle) {
        // Save previous candle if exists
        if (currentCandle) {
          candles.push(currentCandle);
        }
        
        // Start new candle
        currentCandle = {
          time: pointCandleTime,
          open: point.price,
          high: point.price,
          low: point.price,
          close: point.price,
          volume: point.volume || 0
        };
        candleStartTime = pointCandleTime;
      } else {
        // Update current candle
        currentCandle.high = Math.max(currentCandle.high, point.price);
        currentCandle.low = Math.min(currentCandle.low, point.price);
        currentCandle.close = point.price;
        currentCandle.volume += point.volume || 0;
      }
    });
    
    // Don't forget the last candle
    if (currentCandle) {
      candles.push(currentCandle);
    }
    
    return candles;
  };

  // Generate sample data for 1 day (96 candles for 15-minute intervals)
  const generateDayCandles = (): Candle[] => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const candleData: Candle[] = [];
    const basePrice = 45000;
    
    for (let i = 0; i < 96; i++) {
      const time = startOfDay.getTime() + (i * 15 * 60 * 1000); // 15-minute intervals
      const volatility = 0.002;
      const trend = Math.sin(i / 20) * 500; // Daily trend
      const randomWalk = (Math.random() - 0.5) * basePrice * volatility;
      
      const open = i === 0 ? basePrice : candleData[i - 1].close;
      const close = open + randomWalk + trend / 50;
      const high = Math.max(open, close) + Math.random() * 50;
      const low = Math.min(open, close) - Math.random() * 50;
      const volume = Math.random() * 1000000 + 500000;
      
      candleData.push({
        time,
        open,
        high,
        low,
        close,
        volume
      });
    }
    
    return candleData;
  };

  const [chartCandles] = useState<Candle[]>(() => {
    // Priority: candles prop > converted priceHistory > generated sample data
    if (candles.length > 0) {
      return candles;
    } else if (priceHistory.length > 0) {
      return convertPriceHistoryToCandles(priceHistory);
    } else {
      return generateDayCandles();
    }
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        const parent = canvasRef.current.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || chartCandles.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Clear canvas
    ctx.fillStyle = '#0B1929';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate chart dimensions
    const padding = { top: 20, right: 80, bottom: 40, left: 10 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    // Find price range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    
    chartCandles.forEach(candle => {
      minPrice = Math.min(minPrice, candle.low);
      maxPrice = Math.max(maxPrice, candle.high);
    });

    // Add padding to price range
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;
    minPrice -= pricePadding;
    maxPrice += pricePadding;

    // Calculate scales
    const priceScale = (price: number) => {
      return padding.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
    };

    const timeScale = (index: number) => {
      return padding.left + (index / (chartCandles.length - 1)) * chartWidth;
    };

    // Draw grid lines and time labels
    ctx.strokeStyle = '#1E2A3A';
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#64748B';

    // Time grid lines and labels
    const hoursToShow = [0, 3, 6, 9, 12, 15, 18, 21]; // Every 3 hours
    
    hoursToShow.forEach(hour => {
      const candleIndex = hour * 4; // 4 candles per hour (15-min intervals)
      if (candleIndex < chartCandles.length) {
        const x = timeScale(candleIndex);
        
        // Draw vertical grid line
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.stroke();
        
        // Draw time label
        const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
        ctx.textAlign = 'center';
        ctx.fillText(timeLabel, x, canvas.height - padding.bottom + 20);
      }
    });

    // Price grid lines
    const priceSteps = 5;
    const priceStepSize = (maxPrice - minPrice) / priceSteps;
    
    ctx.textAlign = 'right';
    for (let i = 0; i <= priceSteps; i++) {
      const price = minPrice + (i * priceStepSize);
      const y = priceScale(price);
      
      // Draw horizontal grid line
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();
      
      // Draw price label
      ctx.fillText(price.toFixed(2), canvas.width - 10, y + 4);
    }

    // Draw candles
    const candleWidth = Math.max(1, (chartWidth / chartCandles.length) * 0.8);
    const candleSpacing = chartWidth / chartCandles.length;

    chartCandles.forEach((candle, index) => {
      const x = timeScale(index);
      const openY = priceScale(candle.open);
      const closeY = priceScale(candle.close);
      const highY = priceScale(candle.high);
      const lowY = priceScale(candle.low);

      const isGreen = candle.close >= candle.open;
      ctx.strokeStyle = isGreen ? '#00E676' : '#FF5252';
      ctx.fillStyle = isGreen ? '#00E676' : '#FF5252';

      // Draw wick
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Draw body
      const bodyHeight = Math.abs(closeY - openY);
      const bodyY = Math.min(openY, closeY);
      
      if (bodyHeight > 1) {
        ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
      } else {
        // Draw a line for very small bodies
        ctx.beginPath();
        ctx.moveTo(x - candleWidth / 2, bodyY);
        ctx.lineTo(x + candleWidth / 2, bodyY);
        ctx.stroke();
      }
    });

    // Draw current price line if provided
    if (currentPrice > 0 && currentPrice >= minPrice && currentPrice <= maxPrice) {
      const priceY = priceScale(currentPrice);
      
      ctx.strokeStyle = '#FFC107';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(padding.left, priceY);
      ctx.lineTo(canvas.width - padding.right, priceY);
      ctx.stroke();
      
      ctx.setLineDash([]);
      
      // Price label
      ctx.fillStyle = '#FFC107';
      ctx.fillRect(canvas.width - padding.right + 5, priceY - 10, 70, 20);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(currentPrice.toFixed(2), canvas.width - padding.right + 8, priceY + 4);
    }

    // Draw title
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} - 1D Chart`, padding.left, 15);

  }, [chartCandles, currentPrice, dimensions, symbol]);

  return (
    <div className="w-full h-full bg-gray-900 rounded-lg p-2">
      <canvas 
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
    </div>
  );
};

export default PriceChart;