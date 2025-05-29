// backend/src/workers/traderWorker.ts
import { parentPort, workerData } from 'worker_threads';

interface TraderDecision {
  walletAddress: string;
  action: 'enter' | 'exit' | 'hold';
  quantity?: number;
  reason?: string;
}

interface MarketData {
  currentPrice: number;
  priceHistory: any[];
  marketConditions: any;
  currentTime: number;
}

interface TraderProfile {
  trader: {
    walletAddress: string;
    netPnl: number;
    riskProfile: string;
  };
  entryThreshold: number;
  exitProfitThreshold: number;
  exitLossThreshold: number;
  positionSizing: number;
  tradingFrequency: number;
  sentimentSensitivity: number;
}

// Worker main logic
if (parentPort) {
  parentPort.on('message', (data) => {
    const { traders, marketData, activePositions } = data;
    
    try {
      const decisions = processTraders(traders, marketData, activePositions);
      parentPort!.postMessage(decisions);
    } catch (error) {
      console.error('Worker error:', error);
      parentPort!.postMessage([]);
    }
  });
}

function processTraders(
  traders: TraderProfile[],
  marketData: MarketData,
  activePositions: any[]
): TraderDecision[] {
  const decisions: TraderDecision[] = [];
  
  traders.forEach(traderProfile => {
    // Check if trader should take action
    const shouldAct = Math.random() < traderProfile.tradingFrequency * 0.05;
    if (!shouldAct) return;
    
    // Check if trader has active position
    const activePosition = activePositions.find(
      p => p.walletAddress === traderProfile.trader.walletAddress
    );
    
    if (activePosition) {
      // Process exit decision
      const exitDecision = processExitDecision(traderProfile, activePosition, marketData);
      if (exitDecision) {
        decisions.push(exitDecision);
      }
    } else {
      // Process entry decision
      const entryDecision = processEntryDecision(traderProfile, marketData);
      if (entryDecision) {
        decisions.push(entryDecision);
      }
    }
  });
  
  return decisions;
}

function processEntryDecision(
  traderProfile: TraderProfile,
  marketData: MarketData
): TraderDecision | null {
  const { entryThreshold, positionSizing, sentimentSensitivity } = traderProfile;
  
  // Analyze recent price movement
  const recentPrices = marketData.priceHistory.slice(-5);
  if (recentPrices.length < 2) return null;
  
  const oldPrice = recentPrices[0].close;
  const currentPrice = marketData.currentPrice;
  const priceChange = (currentPrice - oldPrice) / oldPrice;
  
  // Determine market sentiment
  const marketTrend = marketData.marketConditions.trend;
  const sentimentBoost = 
    marketTrend === 'bullish' ? sentimentSensitivity * 0.01 : 
    marketTrend === 'bearish' ? -sentimentSensitivity * 0.01 : 0;
  
  // Adjust threshold based on sentiment
  const adjustedThreshold = entryThreshold * (1 - sentimentBoost) * 0.5;
  
  // Check if price movement exceeds threshold
  if (Math.abs(priceChange) > adjustedThreshold) {
    // Calculate position size
    const maxPositionValue = 50000 * positionSizing; // Base position value
    const quantity = maxPositionValue / currentPrice;
    const finalQuantity = Math.max(10, quantity);
    
    // Determine direction
    const isLong = priceChange > 0;
    
    return {
      walletAddress: traderProfile.trader.walletAddress,
      action: 'enter',
      quantity: isLong ? finalQuantity : -finalQuantity,
      reason: `Price moved ${(priceChange * 100).toFixed(2)}% - ${isLong ? 'Long' : 'Short'} entry`
    };
  }
  
  return null;
}

function processExitDecision(
  traderProfile: TraderProfile,
  position: any,
  marketData: MarketData
): TraderDecision | null {
  const { exitProfitThreshold, exitLossThreshold } = traderProfile;
  
  // Calculate current P&L
  const entryValue = position.entryPrice * Math.abs(position.quantity);
  const currentValue = marketData.currentPrice * Math.abs(position.quantity);
  
  // P&L calculation depends on position direction
  const isLong = position.quantity > 0;
  const pnl = isLong ? 
    currentValue - entryValue : 
    entryValue - currentValue;
  
  const pnlPercentage = pnl / entryValue;
  
  // Check exit conditions
  const shouldTakeProfit = pnlPercentage >= exitProfitThreshold;
  const shouldCutLoss = pnlPercentage <= -exitLossThreshold;
  
  // Random exit chance
  const forceClose = Math.random() < 0.005;
  
  if (shouldTakeProfit || shouldCutLoss || forceClose) {
    const reason = shouldTakeProfit ? 'Take profit' : 
                   shouldCutLoss ? 'Stop loss' : 
                   'Position management';
    
    return {
      walletAddress: traderProfile.trader.walletAddress,
      action: 'exit',
      reason: `${reason} - P&L: ${(pnlPercentage * 100).toFixed(2)}%`
    };
  }
  
  return null;
}

// Export for testing
export { processTraders, processEntryDecision, processExitDecision };