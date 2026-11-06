import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEligibleSpotPairs, fetchMarketSnapshot } from '@/lib/api/market-data';

describe('internal market-data API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retrieves only the compact eligible-pair response from the internal API', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          pairs: [{ baseAsset: 'BTC', quoteAsset: 'USDT', symbol: 'BTCUSDT' }],
          refreshedAt: 1,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchImplementation);

    await expect(fetchEligibleSpotPairs('btc')).resolves.toEqual([
      { baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', symbol: 'BTCUSDT' },
    ]);
    expect(fetchImplementation.mock.calls[0][0].toString()).toContain(
      '/api/pairs?limit=100&query=btc',
    );
  });

  it('normalizes a multi-timeframe snapshot received from the internal API', async () => {
    const candle = {
      close: 100.25,
      closeTime: 3000,
      high: 102,
      low: 99,
      open: 100,
      openTime: 2000,
      volume: 234,
    };
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          asOf: 4000,
          candles: { '15m': [candle, candle], '1h': [candle, candle], '4h': [candle, candle], '1d': [candle, candle] },
          candlesCached: { '15m': false, '1h': false, '4h': false, '1d': false },
          candlesFetchedAt: { '15m': 4000, '1h': 4000, '4h': 4000, '1d': 4000 },
          currentPrice: 100.25,
          filters: null,
          provider: 'primary',
          symbol: 'BTCUSDT',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchImplementation);

    await expect(fetchMarketSnapshot('btcusdt', { limit: 2 })).resolves.toMatchObject({
      currentPrice: 100.25,
      provider: 'primary',
      symbol: 'BTCUSDT',
    });
    expect(fetchImplementation.mock.calls[0][0].toString()).toContain(
      '/api/market-snapshot?limit=2&symbol=BTCUSDT',
    );
  });

  it('exposes the internal request ID on API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Provider unavailable.' },
            requestId: 'req-123',
          }),
          { status: 502 },
        ),
      ),
    );

    await expect(fetchMarketSnapshot('BTCUSDT')).rejects.toMatchObject({
      requestId: 'req-123',
      status: 502,
    });
  });
});
