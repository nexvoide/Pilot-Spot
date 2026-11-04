import { describe, expect, it, vi } from 'vitest';
import { MarketDataService } from './market-data-service.js';

const candle = [1, '10', '11', '9', '10.5', '100', 2];

function createUpstream() {
  return {
    getHealth: vi.fn(() => []),
    getJson: vi.fn(async (path: string) => {
      if (path === '/api/v3/exchangeInfo') {
        return {
          data: {
            symbols: [
              {
                baseAsset: 'BTC',
                isSpotTradingAllowed: true,
                quoteAsset: 'USDT',
                status: 'TRADING',
                symbol: 'BTCUSDT',
                filters: [
                  { filterType: 'PRICE_FILTER', tickSize: '0.01' },
                  {
                    filterType: 'LOT_SIZE',
                    stepSize: '0.00001',
                    minQty: '0.00001',
                    maxQty: '9000',
                  },
                  { filterType: 'NOTIONAL', minNotional: '5', maxNotional: '1000000' },
                ],
              },
              {
                baseAsset: 'BTCUP',
                isSpotTradingAllowed: true,
                quoteAsset: 'USDT',
                status: 'TRADING',
                symbol: 'BTCUPUSDT',
              },
            ],
          },
          latencyMs: 10,
          provider: 'primary' as const,
          retryCount: 0,
        };
      }

      if (path === '/api/v3/ticker/price') {
        return {
          data: { price: '10.5', symbol: 'BTCUSDT' },
          latencyMs: 10,
          provider: 'primary' as const,
          retryCount: 0,
        };
      }

      return { data: [candle, candle], latencyMs: 10, provider: 'primary' as const, retryCount: 0 };
    }),
  };
}

describe('MarketDataService', () => {
  it('caches eligible pair metadata and excludes leveraged tokens', async () => {
    const upstream = createUpstream();
    const service = new MarketDataService(upstream as never);

    await expect(service.getEligiblePairs('btc', 20)).resolves.toMatchObject({
      pairs: [{ baseAsset: 'BTC', quoteAsset: 'USDT', symbol: 'BTCUSDT' }],
    });
    await service.getEligiblePairs('btc', 20);

    expect(upstream.getJson).toHaveBeenCalledTimes(1);
  });

  it('returns a complete multi-timeframe snapshot and identifies cached candles', async () => {
    const upstream = createUpstream();
    const service = new MarketDataService(upstream as never);

    const first = await service.getMarketSnapshot('BTCUSDT', 2);
    const second = await service.getMarketSnapshot('BTCUSDT', 2);

    expect(first.currentPrice).toBe(10.5);
    expect(first.filters).toEqual({
      tickSize: '0.01',
      stepSize: '0.00001',
      minQty: '0.00001',
      maxQty: '9000',
      minNotional: '5',
      maxNotional: '1000000',
    });
    expect(first.candles['4h']).toHaveLength(2);
    expect(second.candlesCached).toEqual({ '15m': true, '1h': true, '4h': true });
  });

  it('rejects invalid symbols before calling upstream', async () => {
    const upstream = createUpstream();
    const service = new MarketDataService(upstream as never);

    await expect(service.getMarketSnapshot('bad!', 200)).rejects.toMatchObject({
      code: 'INVALID_SYMBOL',
      status: 400,
    });
    expect(upstream.getJson).not.toHaveBeenCalled();
  });

  it('rejects incomplete upstream candle responses', async () => {
    const upstream = createUpstream();
    upstream.getJson.mockImplementation(async (path: string) => {
      if (path === '/api/v3/ticker/price') {
        return {
          data: { price: '10.5', symbol: 'BTCUSDT' },
          latencyMs: 10,
          provider: 'primary' as const,
          retryCount: 0,
        };
      }
      return { data: [candle], latencyMs: 10, provider: 'primary' as const, retryCount: 0 };
    });
    const service = new MarketDataService(upstream as never);

    await expect(service.getMarketSnapshot('BTCUSDT', 2)).rejects.toMatchObject({
      code: 'INCOMPLETE_CANDLES',
      status: 502,
    });
  });
});
