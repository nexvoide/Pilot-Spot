import { afterEach, describe, expect, it, vi } from 'vitest';
import { bubbleSize, fetchMeasurement } from './data';

afterEach(() => vi.restoreAllMocks());
describe('economy measurements', () => {
  it('measures completed Binance candle closes for each requested period', async () => {
    const now = Date.now();
    const end = now - 1000;
    const candles = Array.from({length: 550}, (_, index) => ({openTime: end - (549 - index) * 14_400_000 - 14_399_999, closeTime: end - (549 - index) * 14_400_000, close: 100 + index}));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ candles, candlesFetchedAt: now }), {status: 200}));
    const day = await fetchMeasurement('binance', 'BTCUSDT', '24H');
    const week = await fetchMeasurement('binance', 'BTCUSDT', '7D');
    expect(day?.value).toBeCloseTo((649 / 643 - 1) * 100);
    expect(week?.value).toBeCloseTo((649 / 607 - 1) * 100);
    expect(day?.source).toBe('Binance Spot');
    expect(day?.updated).toBe(now);
  });
  it('uses actual FRED observation dates and never replaces missing data with zero', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ observations: [{date: '2026-01-05', value: 90}, {date: '2026-01-02', value: 100}], fetchedAt: 42 }), {status: 200}));
    const result = await fetchMeasurement('fred', 'SP500', '24H');
    expect(result?.value).toBeCloseTo(-10);
    expect(result).toMatchObject({ start: '2026-01-02', end: '2026-01-05', updated: 42, source: 'FRED'});
    expect(await fetchMeasurement('fred', 'SP500', '90D')).toBeNull();
  });
  it('handles rate limiting and sizes bubbles by absolute value', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', {status: 429}));
    await expect(fetchMeasurement('fred', 'SP500', '7D')).rejects.toThrow('rate limited');
    expect(bubbleSize(null, 10)).toBe(112);
    expect(bubbleSize(-10, 10)).toBeGreaterThan(bubbleSize(1, 10));
    expect(bubbleSize(-10, 10)).toBe(bubbleSize(10, 10));
  });
  it('reports Finnhub previous-close change only in 24H mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({price: 110, previousClose: 100, observedAt: 1700000000000, fetchedAt: 1700000005000})));
    const quote = await fetchMeasurement('finnhub', 'AAPL', '24H');
    expect(quote?.value).toBeCloseTo(10);
    expect(quote?.periodDescription).toContain('previous close');
    expect(await fetchMeasurement('finnhub', 'AAPL', '7D')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

});
