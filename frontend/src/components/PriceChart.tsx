// frontend/src/components/PriceChart.tsx - More Candles & Smoother
import React, { useRef, useEffect, useState } from 'react';
import { PricePoint, Trade } from '../types';

interface PriceChartProps {
  priceHistory: PricePoint[];
  currentPrice: number;
  trades: Trade[];
}

const PriceChart: React.FC<PriceChartProps> = ({ priceHistory, currentPrice, trades }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Initializing chart...');
  
  // Format prices for display
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  
  // Create synthetic data if we have too few candles
  const getSyntheticPriceHistory = (realPriceHistory: PricePoint[]): PricePoint[] => {
    if (realPriceHistory.length >= 30) {
      return realPriceHistory; // Use real data if we have enough
    }
    
    // Clone the existing price data
    const extendedData = [...realPriceHistory];
    
    if (realPriceHistory.length === 0) {
      return []; // Can't generate synthetic data with no seed
    }
    
    // How many candles to generate
    const targetCount = 50;
    const additionalCount = targetCount - realPriceHistory.length;
    
    if (additionalCount <= 0) {
      return extendedData;
    }
    
    // Get stats from real data to make synthetic data realistic
    const firstPoint = realPriceHistory[0];
    const lastPoint = realPriceHistory[realPriceHistory.length - 1];
    
    // Average candle time interval
    const avgInterval = realPriceHistory.length > 1 
      ? (lastPoint.timestamp - firstPoint.timestamp) / (realPriceHistory.length - 1)
      : 60000; // Default to 1 minute
    
    // Calculate volatility from real data
    let avgVolatility = 0.003; // Default ~0.3% volatility
    if (realPriceHistory.length > 1) {
      let totalChange = 0;
      for (let i = 1; i < realPriceHistory.length; i++) {
        const prevClose = realPriceHistory[i-1].close;
        const currClose = realPriceHistory[i].close;
        totalChange += Math.abs((currClose - prevClose) / prevClose);
      }
      avgVolatility = totalChange / (realPriceHistory.length - 1);
    }
    
    // Generate past candles (before our real data)
    const pastCandles: PricePoint[] = [];
    let lastTimestamp = firstPoint.timestamp;
    let lastPrice = firstPoint.close;
    
    for (let i = 0; i < additionalCount; i++) {
      lastTimestamp -= avgInterval;
      
      // Random price movement based on calculated volatility
      const changePercent = (Math.random() * 2 - 1) * avgVolatility;
      const newPrice = lastPrice * (1 + changePercent);
      
      // Create a realistic candle
      const open = lastPrice;
      const close = newPrice;
      const high = Math.max(open, close) * (1 + Math.random() * 0.002); // Small wick
      const low = Math.min(open, close) * (1 - Math.random() * 0.002);
      const volume = Math.random() * 100 + 50; // Random volume
      
      pastCandles.unshift({
        timestamp: lastTimestamp,
        open,
        high,
        low,
        close,
        volume
      });
      
      lastPrice = newPrice;
    }
    
    // Combine past synthetic candles with real data
    return [...pastCandles, ...extendedData];
  };
  
  // Draw the chart using canvas
  useEffect(() => {
    const drawChart = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Set canvas size to match container
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
      
      // Process real price history or create synthetic data if needed
      const chartData = getSyntheticPriceHistory(priceHistory);
      
      // Check if we have price data
      if (!chartData || chartData.length === 0) {
        setStatus('No price data available');
        ctx.fillStyle = '#787B86';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No price data available', canvas.width / 2, canvas.height / 2);
        return;
      }
      
      setStatus(`Drawing chart with ${chartData.length} candles...`);
      
      // Chart colors
      const backgroundColor = '#131722';
      const gridColor = '#1E2230';
      const textColor = '#D9D9D9';
      const upColor = '#089981';
      const downColor = '#F23645';
      
      // Clear canvas
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Define margins
      const margin = {
        top: 30,
        right: 60,
        bottom: 30,
        left: 40
      };
      
      // Calculate chart area
      const chartWidth = canvas.width - margin.left - margin.right;
      const chartHeight = canvas.height - margin.top - margin.bottom;
      
      // Find min and max values
      let minPrice = Math.min(...chartData.map(p => p.low || p.close));
      let maxPrice = Math.max(...chartData.map(p => p.high || p.close));
      
      // Include current price in range
      minPrice = Math.min(minPrice, currentPrice);
      maxPrice = Math.max(maxPrice, currentPrice);
      
      // Add padding to price range (more narrow range for better visualization)
      const pricePadding = (maxPrice - minPrice) * 0.05;
      minPrice -= pricePadding;
      maxPrice += pricePadding;
      
      // Price scale function
      const priceToY = (price: number) => {
        return margin.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
      };
      
      // Calculate visible data range - make it look like a typical trading chart
      // by extending the x-axis range beyond the visible data
      const extendRatio = 0.1; // Extend the visible range by 10% to add blank space for future candles
      
      // Calculate the min and max of the actual data for time
      const minTime = Math.min(...chartData.map(p => p.timestamp));
      const maxTime = Math.max(...chartData.map(p => p.timestamp));
      const timeRange = maxTime - minTime;
      
      // Add extensions for a typical chart look
      const extendedMinTime = minTime;
      const extendedMaxTime = maxTime + timeRange * extendRatio;
      
      // Time scale function with the extended range
      const timeToX = (timestamp: number) => {
        return margin.left + ((timestamp - extendedMinTime) / (extendedMaxTime - extendedMinTime)) * chartWidth;
      };
      
      // Draw grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      
      // Draw horizontal grid lines
      const priceStep = (maxPrice - minPrice) / 5;
      for (let i = 0; i <= 5; i++) {
        const price = minPrice + i * priceStep;
        const y = priceToY(price);
        
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(canvas.width - margin.right, y);
        ctx.stroke();
        
        // Draw price labels
        ctx.fillStyle = textColor;
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(formatPrice(price), canvas.width - margin.right + 5, y + 4);
      }
      
      // Draw vertical grid lines (time)
      const timeLabels: { x: number; label: string }[] = [];
      
      // Determine ideal number of time labels based on available width
      const idealTimeLabelCount = Math.floor(chartWidth / 100); // Aim for a label about every 100px
      const timeStepSize = timeRange / idealTimeLabelCount;
      
      // Generate evenly spaced time labels
      for (let t = minTime; t <= maxTime; t += timeStepSize) {
        const x = timeToX(t);
        const date = new Date(t);
        const timeLabel = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        timeLabels.push({ x, label: timeLabel });
        
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, canvas.height - margin.bottom);
        ctx.stroke();
      }
      
      // Draw time labels
      timeLabels.forEach(({ x, label }) => {
        ctx.fillStyle = textColor;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, canvas.height - margin.bottom + 15);
      });
      
      // Calculate candle width based on data density
      const candleSpacing = 2; // Space between candles
      const theoreticalMaxWidth = chartWidth / chartData.length;
      const candleWidth = Math.min(theoreticalMaxWidth - candleSpacing, 8); // Max 8px wide, with spacing
      
      // Draw candlesticks
      chartData.forEach((point) => {
        const x = timeToX(point.timestamp);
        const open = point.open || point.close;
        const close = point.close;
        const high = point.high || Math.max(open, close);
        const low = point.low || Math.min(open, close);
        
        // Determine if candle is up or down
        const isUp = close >= open;
        ctx.fillStyle = isUp ? upColor : downColor;
        ctx.strokeStyle = isUp ? upColor : downColor;
        
        // Draw wick (high to low line)
        ctx.beginPath();
        ctx.moveTo(x, priceToY(high));
        ctx.lineTo(x, priceToY(low));
        ctx.stroke();
        
        // Draw candle body
        const yOpen = priceToY(open);
        const yClose = priceToY(close);
        const candleHeight = Math.abs(yClose - yOpen);
        
        ctx.fillRect(
          x - candleWidth / 2,
          Math.min(yOpen, yClose),
          candleWidth,
          Math.max(1, candleHeight) // Ensure height is at least 1px
        );
      });
      
      // Draw current price line
      ctx.strokeStyle = currentPrice > chartData[chartData.length - 1].close ? upColor : downColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      
      const currentPriceY = priceToY(currentPrice);
      ctx.beginPath();
      ctx.moveTo(margin.left, currentPriceY);
      ctx.lineTo(canvas.width - margin.right, currentPriceY);
      ctx.stroke();
      
      // Reset line dash
      ctx.setLineDash([]);
      
      // Draw current price label
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(formatPrice(currentPrice), margin.left, currentPriceY - 5);
      
      // Draw recent trades markers
      if (trades && trades.length > 0) {
        // Only show last few significant trades
        const significantTrades = trades
          .slice(0, 10)
          .filter(trade => trade.value > 100); // Only show trades with significant value
        
        significantTrades.forEach(trade => {
          const x = timeToX(trade.timestamp);
          const y = trade.action === 'buy' 
            ? priceToY(trade.price) + 10 // Below price for buys
            : priceToY(trade.price) - 10; // Above price for sells
          
          // Draw trade marker
          ctx.fillStyle = trade.action === 'buy' ? upColor : downColor;
          
          // Draw triangle
          ctx.beginPath();
          if (trade.action === 'buy') {
            // Upward-pointing triangle
            ctx.moveTo(x, y);
            ctx.lineTo(x - 4, y + 4);
            ctx.lineTo(x + 4, y + 4);
          } else {
            // Downward-pointing triangle
            ctx.moveTo(x, y);
            ctx.lineTo(x - 4, y - 4);
            ctx.lineTo(x + 4, y - 4);
          }
          ctx.closePath();
          ctx.fill();
        });
      }
      
      setStatus(`Chart rendered with ${chartData.length} candles`);
    };
    
    // Draw chart initially and on window resize
    drawChart();
    
    const handleResize = () => {
      drawChart();
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [priceHistory, currentPrice, formatPrice, trades]);
  
  return (
    <div className="h-full relative bg-[#131722] rounded-lg shadow-lg">
      {/* Current price label in top left */}
      <div className="absolute top-2 left-2 z-10 bg-[#1E2230] rounded px-2 py-1 text-xs">
        <span className="text-[#787B86] mr-1">Price:</span>
        <span className={currentPrice > (priceHistory[0]?.close || 0) ? 'text-[#089981]' : 'text-[#F23645]'}>
          {formatPrice(currentPrice)}
        </span>
      </div>
      
      {/* Canvas for chart */}
      <div className="h-full w-full">
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
        />
      </div>
      
      {/* Status indicator */}
      {status && (
        <div className="absolute bottom-2 left-2 z-10 bg-[#1E2230] rounded px-2 py-1 text-xs text-[#D9D9D9] opacity-70">
          {status}
        </div>
      )}
    </div>
  );
};

export default PriceChart;