import { z } from 'zod';
import { AsyncTtlCache } from './cache.js';
import { ApiError } from './errors.js';
const allowed = new Set(['SP500', 'DCOILWTICO', 'DHHNGSP', 'DEXUSEU', 'DEXUSUK', 'DEXJPUS', 'DEXSZUS', 'IDSAMRIAO3P']);
const schema = z.object({ observations: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), value: z.string() })).max(250) });
const cache = new AsyncTtlCache();
export async function getEconomySeries(series) {
    if (!allowed.has(series))
        throw new ApiError('Series unavailable.', 400, 'INVALID_SERIES');
    const key = process.env.FRED_API_KEY?.trim();
    if (!key || !/^[a-z0-9]{32}$/.test(key))
        throw new ApiError('FRED is not configured. Add a free FRED_API_KEY on the server.', 503, 'FRED_NOT_CONFIGURED');
    const result = await cache.getOrLoad(series, 30 * 60_000, async () => {
        const url = new URL('https://api.stlouisfed.org/fred/series/observations');
        url.search = new URLSearchParams({ series_id: series, api_key: key, file_type: 'json', sort_order: 'desc', limit: '130' }).toString();
        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
        }
        catch {
            throw new ApiError('FRED is unavailable. Try again later.', 503, 'FRED_UNAVAILABLE');
        }
        if (!response.ok)
            throw new ApiError(response.status === 429 ? 'FRED rate limit reached. Try again later.' : 'FRED data is unavailable. Check the server configuration.', 503, response.status === 429 ? 'FRED_RATE_LIMITED' : 'FRED_UNAVAILABLE');
        let data;
        try {
            data = schema.parse(await response.json());
        }
        catch {
            throw new ApiError('FRED returned invalid data.', 502, 'FRED_INVALID_DATA');
        }
        return { observations: data.observations.filter((item) => item.value !== '.').map((item) => ({ date: item.date, value: Number(item.value) })).filter((item) => Number.isFinite(item.value) && item.value > 0) };
    });
    return { ...result.value, fetchedAt: result.fetchedAt, series };
}
