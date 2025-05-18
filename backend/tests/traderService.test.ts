import traderService from '../src/services/traderService';

describe('Trader Service', () => {
  test('transformRawTraders should convert raw data to trader objects', () => {
    const rawTraders = [
      {
        position: 1,
        wallet: '<a href="https://neo.bullx.io/portfolio/abc123">abc123</a>',
        net_pnl: 1000,
        total_volume: 10000,
        buy_volume: 5000,
        sell_volume: 5000,
        bullx_portfolio: '<a href="https://neo.bullx.io/portfolio/abc123">Portfolio</a>',
        trade_count: 50,
        fees_usd: 100
      }
    ];
    
    const result = traderService.transformRawTraders(rawTraders);
    
    expect(result.length).toBe(1);
    expect(result[0].walletAddress).toBe('abc123');
    expect(result[0].netPnl).toBe(1000);
    expect(result[0].riskProfile).toBeDefined();
  });
  
  // Add more tests as needed
});