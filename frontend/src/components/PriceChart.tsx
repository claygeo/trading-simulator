// frontend/src/components/PriceChart.tsx
import React, { useRef, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { PricePoint, Trade } from '../types';

interface PriceChartProps {
  priceHistory: PricePoint[];
  currentPrice: number;
  trades: Trade[];
}

const PriceChart: React.FC<PriceChartProps> = ({ priceHistory, currentPrice, trades }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  
  // Format the timestamp for display
  const formatXAxis = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Format the price for tooltip
  const formatPrice = (value: number) => {
    return `$${value.toFixed(2)}`;
  };
  
  // Prepare chart data - ensure we have the close price populated in case of missing data
  const chartData = priceHistory.map((point, index) => {
    // If this is the last point and we have a currentPrice, use that
    const close = index === priceHistory.length - 1 ? currentPrice : point.close;
    
    return {
      ...point,
      close
    };
  });
  
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
  
  // Custom tooltip to show more detailed information
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-md rounded">
          <p className="font-semibold">{formatXAxis(data.timestamp)}</p>
          <p className="text-gray-700">Open: {formatPrice(data.open)}</p>
          <p className="text-gray-700">High: {formatPrice(data.high)}</p>
          <p className="text-gray-700">Low: {formatPrice(data.low)}</p>
          <p className="text-gray-700">Close: {formatPrice(data.close)}</p>
          <p className="text-gray-700">Volume: ${data.volume.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="bg-white p-4 rounded-lg shadow" ref={chartRef}>
      <h2 className="text-xl font-semibold mb-4">Price Chart</h2>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxis} 
              type="number"
              domain={['dataMin', 'dataMax']}
            />
            <YAxis 
              domain={[(dataMin: number) => dataMin * 0.98, (dataMax: number) => dataMax * 1.02]} 
              tickFormatter={formatPrice}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="close" 
              stroke="#8884d8" 
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            
            {/* Add markers for buy trades */}
            {buyMarkers.map((marker, index) => (
              <ReferenceLine
                key={`buy-${index}`}
                x={marker.timestamp}
                stroke="green"
                strokeDasharray="3 3"
              />
            ))}
            
            {/* Add markers for sell trades */}
            {sellMarkers.map((marker, index) => (
              <ReferenceLine
                key={`sell-${index}`}
                x={marker.timestamp}
                stroke="red"
                strokeDasharray="3 3"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="bg-gray-100 p-3 rounded">
          <div className="text-gray-600 text-sm">Current</div>
          <div className="font-semibold">{formatPrice(currentPrice)}</div>
        </div>
        
        <div className="bg-gray-100 p-3 rounded">
          <div className="text-gray-600 text-sm">24h High</div>
          <div className="font-semibold">
            {formatPrice(Math.max(...priceHistory.map(p => p.high)))}
          </div>
        </div>
        
        <div className="bg-gray-100 p-3 rounded">
          <div className="text-gray-600 text-sm">24h Low</div>
          <div className="font-semibold">
            {formatPrice(Math.min(...priceHistory.map(p => p.low)))}
          </div>
        </div>
        
        <div className="bg-gray-100 p-3 rounded">
          <div className="text-gray-600 text-sm">24h Volume</div>
          <div className="font-semibold">
            ${priceHistory.reduce((sum, p) => sum + p.volume, 0).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceChart;