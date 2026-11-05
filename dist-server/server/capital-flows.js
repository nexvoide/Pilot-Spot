import { z } from 'zod';
import { AsyncTtlCache } from './cache.js';
import { ApiError } from './errors.js';
const series = { stocks: 'IEAIPIEN', bonds: 'IEAIPIDN', forex: 'IEAIOICDN' };
const observationsSchema = z.object({ observations: z.array(z.object({ date: z.string().regex(/^\d{4}-(01|04|07|10)-01$/), value: z.string() })).max(20) });
const cache = new AsyncTtlCache();
export async function getCapitalFlows(market) {
    if (!Object.hasOwn(series, market))
        throw new ApiError('Flow market unavailable.', 400, 'INVALID_FLOW_MARKET');
    const id = series[market];
    const key = process.env.FRED_API_KEY?.trim();
    if (!key || !/^[a-z0-9]{32}$/.test(key))
        throw new ApiError('FRED is not configured on the server.', 503, 'FRED_NOT_CONFIGURED');
    const result = await cache.getOrLoad(id, 12 * 60 * 60_000, async () => {
        const url = new URL('https://api.stlouisfed.org/fred/series/observations');
        url.search = new URLSearchParams({ series_id: id, api_key: key, file_type: 'json', sort_order: 'desc', limit: '8' }).toString();
        let response;
        try {
            response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
        }
        catch {
            throw new ApiError('Flow data is unavailable.', 503, 'FLOW_SOURCE_UNAVAILABLE');
        }
        if (!response.ok)
            throw new ApiError(response.status === 429 ? 'Flow provider rate limit reached.' : 'Flow data is unavailable.', 503, response.status === 429 ? 'FLOW_RATE_LIMITED' : 'FLOW_SOURCE_UNAVAILABLE');
        let parsed;
        try {
            parsed = observationsSchema.parse(await response.json());
        }
        catch {
            throw new ApiError('Flow provider returned invalid data.', 502, 'FLOW_INVALID_DATA');
        }
        const observations = parsed.observations.flatMap(({ date, value }) => {
            if (value === '.' || !/^-?\d+(?:\.\d+)?$/.test(value))
                return [];
            const amount = Number(value) * 1_000_000;
            if (!Number.isFinite(amount))
                return [];
            return [{ date, quarter: `Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1} ${date.slice(0, 4)}`, valueUsd: amount }];
        }).sort((a, b) => b.date.localeCompare(a.date));
        if (!observations.length)
            throw new ApiError('No reported flow observations are available.', 503, 'FLOW_NO_DATA');
        return { observations };
    });
    return { market, series: id, observations: result.value.observations, fetchedAt: result.fetchedAt };
}
