import { describe, expect, it, vi } from 'vitest';
import { BinanceUpstreamClient } from './binance-client.js';
import { tickerPriceSchema } from './binance-schemas.js';
const ticker = { price: '100.25', symbol: 'BTCUSDT' };
describe('BinanceUpstreamClient', () => {
    it('uses the primary provider when it returns a valid response', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify(ticker)));
        const client = new BinanceUpstreamClient(fetchImplementation, 100);
        await expect(client.getJson('/api/v3/ticker/price', tickerPriceSchema, { symbol: 'BTCUSDT' })).resolves.toMatchObject({
            data: ticker,
            provider: 'primary',
        });
    });
    it('retries the primary provider then falls back after retryable failures', async () => {
        const fetchImplementation = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ msg: 'Temporary failure' }), { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ msg: 'Temporary failure' }), { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(ticker)));
        const client = new BinanceUpstreamClient(fetchImplementation, 100);
        const result = await client.getJson('/api/v3/ticker/price', tickerPriceSchema, {
            symbol: 'BTCUSDT',
        });
        expect(result.provider).toBe('fallback');
        expect(result.retryCount).toBe(1);
        expect(fetchImplementation.mock.calls[2][0].toString()).toContain('data-api.binance.vision');
    });
    it('reports rate-limit responses after both providers are exhausted', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({ msg: 'Too many requests' }), {
            headers: { 'Retry-After': '5' },
            status: 429,
        }));
        const client = new BinanceUpstreamClient(fetchImplementation, 100);
        await expect(client.getJson('/api/v3/ticker/price', tickerPriceSchema, { symbol: 'BTCUSDT' })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 5 });
    });
    it.each([418, 429])('preserves upstream rate-limit status %i', async (status) => {
        const fetchImplementation = vi
            .fn()
            .mockResolvedValue(new Response(JSON.stringify({ msg: 'Rate limited' }), { status }));
        const client = new BinanceUpstreamClient(fetchImplementation, 100);
        await expect(client.getJson('/api/v3/ticker/price', tickerPriceSchema, { symbol: 'BTCUSDT' })).rejects.toMatchObject({ status });
    });
    it('treats timed-out upstream requests as retryable failures', async () => {
        const fetchImplementation = vi.fn((_url, options) => new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        const client = new BinanceUpstreamClient(fetchImplementation, 1);
        await expect(client.getJson('/api/v3/ticker/price', tickerPriceSchema, { symbol: 'BTCUSDT' })).rejects.toMatchObject({ status: 504 });
    });
});
