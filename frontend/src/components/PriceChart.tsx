// frontend/src/components/PriceChart.tsx
import React, { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react';
import { 
  ComposedChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Line,
  Rectangle
} from 'recharts';
import { format } from 'date-fns';
import { PricePoint, Trade } from '../types';

interface PriceChartProps {
  priceHistory: PricePoint[];
  currentPrice: number;
  trades: Trade[];
}

// Define chart colors for reuse
const chartColors = {
  background: '#131722',
  gridLines: '#1E2230',
  axis: '#363A45',
  text: '#D9D9D9',
  secondaryText: '#787B86',
  upColor: '#089981',   // TradingView green
  downColor: '#F23645', // TradingView red
  indicators: {
    sma: '#2962FF', // TradingView blue
    ema: '#FF9800'  // TradingView orange
  }
};

// Pure OHLC candlestick renderer with better spacing
const renderCandlestick = (props: any): React.ReactElement => {
  const { x, y, width, height, payload, index } = props;
  
  // Protect against null or undefined payload
  if (!payload || !payload.yValue) {
    return <g key={`empty-candle-${index}`}></g>;
  }
  
  const open = payload.open;
  const close = payload.close;
  const isRising = close >= open;
  
  // Calculate positions on y-axis
  const yOpen = payload.yValue?.open;
  const yClose = payload.yValue?.close;
  const yHigh = payload.yValue?.high; 
  const yLow = payload.yValue?.low;
  
  // Protect against invalid values
  if (yOpen === undefined || yClose === undefined || yHigh === undefined || yLow === undefined) {
    return <g key={`invalid-candle-${index}`}></g>;
  }
  
  const color = isRising ? chartColors.upColor : chartColors.downColor;
  
  // Calculate candle width - make it smaller to give more space between candles
  // We'll use 60% of the available width, which will leave 40% as space
  const candleWidth = width * 0.6;
  
  // Calculate body height (absolute difference between open and close)
  const bodyHeight = Math.abs(yOpen - yClose);
  
  return (
    <g key={`candle-${index}`}>
      {/* Main candle body */}
      <rect
        x={x - candleWidth / 2}
        y={Math.min(yOpen, yClose)}
        width={candleWidth}
        height={Math.max(bodyHeight, 1)} // Ensure minimum height of 1px
        fill={color}
      />
      
      {/* Upper wick */}
      <line 
        x1={x}
        y1={yHigh}
        x2={x}
        y2={Math.min(yOpen, yClose)}
        stroke={color}
        strokeWidth={1}
      />
      
      {/* Lower wick */}
      <line 
        x1={x}
        y1={Math.max(yOpen, yClose)}
        x2={x}
        y2={yLow}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

// Extended type for chart data with technical indicators
interface ChartDataPoint extends PricePoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  color: string;
  displayTime: string;
  sma?: number;
  ema?: number;
  // For rendering
  yValue?: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
}

// TradingView style tooltip
const CustomTooltip = memo(({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    // Format price function
    const formatTooltipPrice = (value: number) => {
      return `$${value.toFixed(2)}`;
    };
    
    // Format percentage change
    const calculateChange = () => {
      if (!data.open || !data.close) return { value: 0, isPositive: false };
      const change = ((data.close - data.open) / data.open) * 100;
      return { 
        value: Math.abs(change).toFixed(2), 
        isPositive: change >= 0 
      };
    };
    
    const change = calculateChange();
    const changeClass = change.isPositive ? 'text-[#089981]' : 'text-[#F23645]';
    
    // Create a TradingView-style tooltip
    return (
      <div className="bg-[#131722] p-3 border border-[#363A45] rounded shadow-lg">
        <p className="font-semibold text-[#D9D9D9] border-b border-[#363A45] pb-1 mb-2">
          {format(new Date(data.timestamp), 'MMM dd, yyyy HH:mm:ss')}
        </p>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-[#787B86]">O:</div>
          <div className="text-[#D9D9D9] font-mono">{formatTooltipPrice(data.open)}</div>
          
          <div className="text-[#787B86]">H:</div>
          <div className="text-[#D9D9D9] font-mono">{formatTooltipPrice(data.high)}</div>
          
          <div className="text-[#787B86]">L:</div>
          <div className="text-[#D9D9D9] font-mono">{formatTooltipPrice(data.low)}</div>
          
          <div className="text-[#787B86]">C:</div>
          <div className="text-[#D9D9D9] font-mono">{formatTooltipPrice(data.close)}</div>
          
          <div className="text-[#787B86]">Change:</div>
          <div className={`font-mono ${changeClass}`}>
            {change.isPositive ? '+' : '-'}{change.value}%
          </div>
          
          {data.sma && (
            <>
              <div className="text-[#787B86]">SMA(5):</div>
              <div className="text-[#2962FF] font-mono">{formatTooltipPrice(data.sma)}</div>
            </>
          )}
          
          {data.ema && (
            <>
              <div className="text-[#787B86]">EMA(5):</div>
              <div className="text-[#FF9800] font-mono">{formatTooltipPrice(data.ema)}</div>
            </>
          )}
        </div>
      </div>
    );
  }
  return null;
});

// Main PriceChart component
const PriceChart: React.FC<PriceChartProps> = memo(({ priceHistory, currentPrice, trades }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('5m');
  const [indicator, setIndicator] = useState<'none' | 'sma' | 'ema'>('none');
  const [processedData, setProcessedData] = useState<ChartDataPoint[]>([]);
  
  // Use a ref to track if we need to reprocess data
  const lastProcessedDataRef = useRef<{
    historyLength: number,
    currentPrice: number, 
    indicator: 'none' | 'sma' | 'ema',
    timeframe: string
  }>({
    historyLength: 0,
    currentPrice: 0,
    indicator: 'none',
    timeframe: '5m'
  });
  
  // Function to aggregate OHLC data based on timeframe
  const aggregateOHLCData = useCallback((data: PricePoint[], timeframeMins: number): PricePoint[] => {
    if (timeframeMins <= 1 || data.length < 2) return data;
    
    const result: PricePoint[] = [];
    const msPerTimeframe = timeframeMins * 60 * 1000;
    
    // Sort data by timestamp if not already sorted
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    
    let currentGroup: PricePoint[] = [];
    let currentTimestamp = Math.floor(sortedData[0].timestamp / msPerTimeframe) * msPerTimeframe;
    
    sortedData.forEach(point => {
      const pointTimeframe = Math.floor(point.timestamp / msPerTimeframe) * msPerTimeframe;
      
      if (pointTimeframe === currentTimestamp) {
        currentGroup.push(point);
      } else {
        if (currentGroup.length > 0) {
          // Create OHLC candle for current group
          const open = currentGroup[0].open || currentGroup[0].close;
          const close = currentGroup[currentGroup.length - 1].close;
          const high = Math.max(...currentGroup.map(p => p.high || p.close));
          const low = Math.min(...currentGroup.map(p => p.low || p.close));
          const volume = currentGroup.reduce((sum, p) => sum + (p.volume || 0), 0);
          
          result.push({
            timestamp: currentTimestamp,
            open,
            high,
            low,
            close,
            volume
          });
        }
        
        // Start new group
        currentTimestamp = pointTimeframe;
        currentGroup = [point];
      }
    });
    
    // Add the last group
    if (currentGroup.length > 0) {
      const open = currentGroup[0].open || currentGroup[0].close;
      const close = currentGroup[currentGroup.length - 1].close;
      const high = Math.max(...currentGroup.map(p => p.high || p.close));
      const low = Math.min(...currentGroup.map(p => p.low || p.close));
      const volume = currentGroup.reduce((sum, p) => sum + (p.volume || 0), 0);
      
      result.push({
        timestamp: currentTimestamp,
        open,
        high,
        low,
        close,
        volume
      });
    }
    
    return result;
  }, []);
  
  // Process price history data with additional properties
  useEffect(() => {
    if (!priceHistory || priceHistory.length === 0) return;
    
    // Check if we need to reprocess data
    const shouldReprocess = 
      lastProcessedDataRef.current.historyLength !== priceHistory.length ||
      lastProcessedDataRef.current.currentPrice !== currentPrice ||
      lastProcessedDataRef.current.indicator !== indicator ||
      lastProcessedDataRef.current.timeframe !== timeframe;
    
    if (!shouldReprocess) return;
    
    // Update the last processed data ref
    lastProcessedDataRef.current = {
      historyLength: priceHistory.length,
      currentPrice,
      indicator,
      timeframe
    };
    
    // Get timeframe in minutes
    const timeframeMinutes = getTimeframeMinutes(timeframe);
    
    // Aggregate data based on timeframe
    const aggregatedData = aggregateOHLCData(priceHistory, timeframeMinutes);
    
    // Process the aggregated data for display
    const chartData: ChartDataPoint[] = aggregatedData.map((point, index) => {
      // If this is the last point and we have a currentPrice, use that
      const close = index === aggregatedData.length - 1 ? currentPrice : point.close;
      
      // Make sure we have open, high and low values
      const open = point.open || close;
      const high = point.high || Math.max(open, close);
      const low = point.low || Math.min(open, close);
      
      return {
        ...point,
        close,
        // For candlestick rendering
        x: index,
        open,
        high,
        low,
        // Calculate color for candlestick
        color: close >= open ? chartColors.upColor : chartColors.downColor,
        // Format timestamp for display - use appropriate format based on timeframe
        displayTime: formatTimeByTimeframe(point.timestamp, timeframe),
      };
    });
    
    // Calculate SMA if indicator is selected
    if (indicator === 'sma') {
      const period = 5; // 5-period SMA
      chartData.forEach((point, index) => {
        if (index >= period - 1) {
          const sum = chartData
            .slice(index - period + 1, index + 1)
            .reduce((acc, p) => acc + p.close, 0);
          point.sma = sum / period;
        }
      });
    }
    
    // Calculate EMA if indicator is selected
    if (indicator === 'ema') {
      const period = 5; // 5-period EMA
      const multiplier = 2 / (period + 1);
      
      // First EMA is the SMA
      if (chartData.length >= period) {
        let initialSum = 0;
        for (let i = 0; i < period; i++) {
          initialSum += chartData[i].close;
        }
        chartData[period - 1].ema = initialSum / period;
        
        // Calculate EMA for the rest of the points
        for (let i = period; i < chartData.length; i++) {
          chartData[i].ema = (chartData[i].close - (chartData[i-1].ema || 0)) * multiplier + (chartData[i-1].ema || 0);
        }
      }
    }
    
    // Add dummy data point if we have only one data point
    if (chartData.length === 1) {
      const firstPoint = chartData[0];
      const dummyPoint = {
        ...firstPoint,
        timestamp: firstPoint.timestamp - 60000, // 1 minute before
        displayTime: formatTimeByTimeframe(firstPoint.timestamp - 60000, timeframe),
        x: 0,
        open: firstPoint.close * 0.995,
        high: firstPoint.close * 1.005,
        low: firstPoint.close * 0.99,
      };
      chartData.unshift(dummyPoint);
      chartData[1].x = 1;
    }
    
    setProcessedData(chartData);
  }, [priceHistory, currentPrice, indicator, timeframe, aggregateOHLCData]);
  
  // Format timestamp based on timeframe
  const formatTimeByTimeframe = (timestamp: number, tf: string): string => {
    switch (tf) {
      case '1m':
      case '5m':
      case '15m':
        return format(new Date(timestamp), 'HH:mm');
      case '1h':
      case '4h':
        return format(new Date(timestamp), 'HH:mm');
      case '1d':
        return format(new Date(timestamp), 'MMM dd');
      default:
        return format(new Date(timestamp), 'HH:mm');
    }
  };
  
  // Get timeframe in minutes
  const getTimeframeMinutes = (tf: string): number => {
    switch (tf) {
      case '1m': return 1;
      case '5m': return 5;
      case '15m': return 15;
      case '1h': return 60;
      case '4h': return 240;
      case '1d': return 1440;
      default: return 1;
    }
  };
  
  // Memoize the formatPrice function to avoid recreating it on every render
  const formatPrice = useCallback((value: number) => {
    return `$${value.toFixed(2)}`;
  }, []);
  
  // Memoize the timeframe handler
  const handleTimeframeChange = useCallback((tf: '1m' | '5m' | '15m' | '1h' | '4h' | '1d') => {
    setTimeframe(tf);
  }, []);
  
  // Memoize the marker data to avoid recalculating on every render
  const { buyMarkers, sellMarkers } = useMemo(() => {
    if (!trades || trades.length === 0) return { buyMarkers: [], sellMarkers: [] };
    
    // Generate markers for trades
    const buyMarkers = trades
      .filter(trade => trade.action === 'buy')
      .slice(0, 10) // Limit to most recent 10 for performance
      .map(trade => ({
        timestamp: trade.timestamp,
        price: trade.price,
        action: 'buy'
      }));
      
    const sellMarkers = trades
      .filter(trade => trade.action === 'sell')
      .slice(0, 10) // Limit to most recent 10 for performance
      .map(trade => ({
        timestamp: trade.timestamp,
        price: trade.price,
        action: 'sell'
      }));
    
    return { buyMarkers, sellMarkers };
  }, [trades]);
  
  // Memoize the candleData to avoid recalculating on every render
  const candleData = useMemo(() => {
    return processedData.map(point => ({
      ...point,
      yValue: {
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      }
    }));
  }, [processedData]);
  
  // Memoize the stats calculation
  const stats = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) {
      return {
        highPrice: '-',
        lowPrice: '-',
        totalVolume: '-',
        change: { value: '0.00', isPositive: true }
      };
    }
    
    const highPrice = formatPrice(Math.max(...priceHistory.map(p => p.high || p.close)));
    const lowPrice = formatPrice(Math.min(...priceHistory.map(p => p.low || p.close)));
    const totalVolume = `$${priceHistory.reduce((sum, p) => sum + (p.volume || 0), 0).toLocaleString()}`;
    
    // Calculate change from first candle to current price
    const firstPoint = priceHistory[0];
    const changePercent = ((currentPrice - firstPoint.close) / firstPoint.close) * 100;
    const change = {
      value: Math.abs(changePercent).toFixed(2),
      isPositive: changePercent >= 0
    };
    
    return { highPrice, lowPrice, totalVolume, change };
  }, [priceHistory, formatPrice, currentPrice]);
  
  if (!priceHistory || priceHistory.length === 0) {
    return (
      <div className="bg-[#131722] p-4 rounded-lg shadow-lg">
        <div className="flex items-center justify-center h-96 text-[#787B86]">
          No price data available yet
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-[#131722] p-4 rounded-lg shadow-lg" ref={chartRef}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-[#D9D9D9]">Price Chart</h2>
          <div className="flex items-baseline">
            <span className={`text-2xl font-bold ${stats.change.isPositive ? 'text-[#089981]' : 'text-[#F23645]'}`}>
              {formatPrice(currentPrice)}
            </span>
            <span className={`ml-2 ${stats.change.isPositive ? 'text-[#089981]' : 'text-[#F23645]'}`}>
              {stats.change.isPositive ? '+' : '-'}{stats.change.value}%
            </span>
            <span className="text-sm text-[#787B86] ml-2">
              {timeframe} timeframe
            </span>
          </div>
        </div>
        
        <div className="flex space-x-2">
          {/* Timeframe buttons */}
          <div className="flex bg-[#1E2230] rounded overflow-hidden">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
              <button
                key={tf}
                className={`px-3 py-1 text-sm ${
                  timeframe === tf 
                    ? 'bg-[#2962FF] text-white' 
                    : 'bg-transparent text-[#787B86] hover:bg-[#363A45]'
                }`}
                onClick={() => handleTimeframeChange(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
          
          {/* Indicator dropdown */}
          <select 
            className="bg-[#1E2230] text-[#D9D9D9] border border-[#363A45] rounded px-2 py-1 text-sm"
            value={indicator}
            onChange={(e) => setIndicator(e.target.value as any)}
          >
            <option value="none">No Indicator</option>
            <option value="sma">SMA (5)</option>
            <option value="ema">EMA (5)</option>
          </select>
        </div>
      </div>
      
      <div className="h-96">
        {processedData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={candleData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={chartColors.gridLines} 
                vertical={true}
                horizontal={true}
              />
              <XAxis 
                dataKey="displayTime" 
                tick={{ fill: chartColors.text }}
                stroke={chartColors.axis}
                interval="preserveEnd"
                tickCount={6}
              />
              <YAxis 
                yAxisId="price"
                domain={['auto', 'auto']}
                tickFormatter={formatPrice}
                orientation="right"
                tick={{ fill: chartColors.text }}
                stroke={chartColors.axis}
              />
              <Tooltip 
                content={<CustomTooltip />} 
                cursor={{ stroke: 'rgba(255, 255, 255, 0.2)' }}
              />
              
              {/* Candlestick Representation */}
              <Scatter
                name="OHLC"
                data={candleData}
                shape={renderCandlestick}
                yAxisId="price"
                isAnimationActive={false}
              />
              
              {/* Add SMA line if selected */}
              {indicator === 'sma' && (
                <Line
                  name="SMA(5)"
                  type="monotone"
                  dataKey="sma"
                  data={candleData.filter(d => d.sma !== undefined)}
                  stroke={chartColors.indicators.sma}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  yAxisId="price"
                  isAnimationActive={false}
                />
              )}
              
              {/* Add EMA line if selected */}
              {indicator === 'ema' && (
                <Line
                  name="EMA(5)"
                  type="monotone"
                  dataKey="ema"
                  data={candleData.filter(d => d.ema !== undefined)}
                  stroke={chartColors.indicators.ema}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  yAxisId="price"
                  isAnimationActive={false}
                />
              )}
              
              {/* Add markers for buy trades */}
              {buyMarkers.map((marker, index) => (
                <ReferenceLine
                  key={`buy-${index}`}
                  x={marker.timestamp}
                  stroke={chartColors.upColor}
                  strokeDasharray="3 3"
                  yAxisId="price"
                />
              ))}
              
              {/* Add markers for sell trades */}
              {sellMarkers.map((marker, index) => (
                <ReferenceLine
                  key={`sell-${index}`}
                  x={marker.timestamp}
                  stroke={chartColors.downColor}
                  strokeDasharray="3 3"
                  yAxisId="price"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-[#787B86]">
            No price data available yet
          </div>
        )}
      </div>
      
      {/* Price stats in TradingView style */}
      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="bg-[#1E2230] p-3 rounded">
          <div className="text-[#787B86] text-sm">Current</div>
          <div className={`font-semibold ${stats.change.isPositive ? 'text-[#089981]' : 'text-[#F23645]'}`}>
            {formatPrice(currentPrice)}
          </div>
        </div>
        
        <div className="bg-[#1E2230] p-3 rounded">
          <div className="text-[#787B86] text-sm">24h High</div>
          <div className="font-semibold text-[#089981]">
            {stats.highPrice}
          </div>
        </div>
        
        <div className="bg-[#1E2230] p-3 rounded">
          <div className="text-[#787B86] text-sm">24h Low</div>
          <div className="font-semibold text-[#F23645]">
            {stats.lowPrice}
          </div>
        </div>
        
        <div className="bg-[#1E2230] p-3 rounded">
          <div className="text-[#787B86] text-sm">24h Volume</div>
          <div className="font-semibold text-[#D9D9D9]">
            {stats.totalVolume}
          </div>
        </div>
      </div>
    </div>
  );
});

export default PriceChart;