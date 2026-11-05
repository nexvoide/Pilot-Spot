import { z } from 'zod';
import { AsyncTtlCache } from './cache.js';
import { ApiError } from './errors.js';
const allowed = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'XOM', 'JNJ', 'SPY', 'QQQ', 'VGK', 'EWJ', 'XLK', 'XLF', 'XLE', 'XLV', 'GLD', 'SLV', 'TLT', 'BND', 'BIL', 'LQD', 'HYG', 'BWX', 'IGOV', 'CPER']);
const quoteSchema = z.object({ c: z.number().positive().finite(), pc: z.number().positive().finite(), t: z.number().int().positive() });
const cache = new AsyncTtlCache();
export async function getFinnhubQuote(symbol) {
    if (!allowed.has(symbol))
        throw new ApiError('Symbol unavailable.', 400, 'INVALID_SYMBOL');
    const key = process.env.FINNHUB_API_KEY?.trim();
    if (!key || !/^[a-zA-Z0-9]+$/.test(key))
        throw new ApiError('Finnhub is not configured on the server.', 503, 'FINNHUB_NOT_CONFIGURED');
    const result = await cache.getOrLoad(symbol, 5 * 60_000, async () => {
        const url = new URL('https://finnhub.io/api/v1/quote');
        url.searchParams.set('symbol', symbol);
        let response;
        try {
            response = await fetch(url, { headers: { 'X-Finnhub-Token': key, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
        }
        catch {
            throw new ApiError('Finnhub is unavailable. Try again later.', 503, 'FINNHUB_UNAVAILABLE');
        }
        if (!response.ok)
            throw new ApiError(response.status === 429 ? 'Finnhub rate limit reached. Try again later.' : 'Finnhub data is unavailable. Check the server configuration.', 503, response.status === 429 ? 'FINNHUB_RATE_LIMITED' : 'FINNHUB_UNAVAILABLE');
        try {
            const quote = quoteSchema.parse(await response.json());
            if (quote.t * 1000 > Date.now() + 60_000)
                throw new Error('Invalid timestamp');
            return { price: quote.c, previousClose: quote.pc, observedAt: quote.t * 1000 };
        }
        catch {
            throw new ApiError('Finnhub returned no usable quote.', 502, 'FINNHUB_INVALID_DATA');
        }
    });
    return { ...result.value, fetchedAt: result.fetchedAt, symbol };
}
