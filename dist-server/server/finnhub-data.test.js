import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFinnhubQuote } from './finnhub-data.js';
const previous = process.env.FINNHUB_API_KEY;
afterEach(() => { if (previous === undefined)
    delete process.env.FINNHUB_API_KEY;
else
    process.env.FINNHUB_API_KEY = previous; vi.restoreAllMocks(); });
describe('Finnhub quotes', () => {
    it('requires a key and only accepts supported symbols', async () => {
        delete process.env.FINNHUB_API_KEY;
        await expect(getFinnhubQuote('AAPL')).rejects.toMatchObject({ code: 'FINNHUB_NOT_CONFIGURED' });
        await expect(getFinnhubQuote('OTHER')).rejects.toMatchObject({ code: 'INVALID_SYMBOL' });
    });
    it('uses server-side authentication and does not return the key', async () => {
        process.env.FINNHUB_API_KEY = 'testSecretKey';
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ c: 110, pc: 100, t: Math.floor(Date.now() / 1000) })));
        const result = await getFinnhubQuote('AAPL');
        expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({ 'X-Finnhub-Token': 'testSecretKey' });
        expect(JSON.stringify(result)).not.toContain('testSecretKey');
        expect(result).toMatchObject({ price: 110, previousClose: 100 });
    });
    it('handles upstream rate limits without leaking upstream response text', async () => {
        process.env.FINNHUB_API_KEY = 'testSecretKey';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('sensitive detail', { status: 429 }));
        await expect(getFinnhubQuote('MSFT')).rejects.toMatchObject({ code: 'FINNHUB_RATE_LIMITED', message: 'Finnhub rate limit reached. Try again later.' });
    });
});
