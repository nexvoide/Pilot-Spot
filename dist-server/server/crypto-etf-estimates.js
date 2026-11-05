import { z } from 'zod';
import { AsyncTtlCache } from './cache.js';
import { ApiError } from './errors.js';
const responseSchema = z.object({ updatedAt: z.string().datetime({ offset: true }), data: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ticker: z.string().regex(/^[A-Z0-9.]{1,12}$/), issuer: z.string().min(1).max(100), asset: z.enum(['btc', 'eth']), flowUsd: z.string().nullable() })).max(1000) });
const cache = new AsyncTtlCache();
async function fetchAsset(asset) {
    const url = new URL('https://xoomar.com/api/markets/etf-flows');
    url.search = new URLSearchParams({ asset, days: '10' }).toString();
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok)
        throw new Error('Provider unavailable');
    const parsed = responseSchema.parse(await response.json());
    const latest = new Map();
    for (const row of parsed.data) {
        if (row.asset !== asset || row.flowUsd === null || !/^-?\d+(?:\.\d+)?$/.test(row.flowUsd))
            continue;
        const estimatedChangeUsd = Number(row.flowUsd);
        if (!Number.isFinite(estimatedChangeUsd))
            continue;
        const existing = latest.get(row.ticker);
        if (!existing || row.date > existing.date)
            latest.set(row.ticker, { asset, ticker: row.ticker, issuer: row.issuer, date: row.date, estimatedChangeUsd });
    }
    return { funds: [...latest.values()], updatedAt: parsed.updatedAt };
}
export async function getCryptoEtfEstimates() {
    const result = await cache.getOrLoad('crypto-etf-estimates', 30 * 60_000, async () => {
        const assets = ['btc', 'eth'];
        const responses = await Promise.allSettled(assets.map(fetchAsset));
        const funds = [], unavailable = [], sourceUpdated = [];
        responses.forEach((response, index) => {
            if (response.status === 'fulfilled' && response.value.funds.length) {
                funds.push(...response.value.funds);
                sourceUpdated.push(response.value.updatedAt);
            }
            else
                unavailable.push(assets[index]);
        });
        if (!funds.length)
            throw new ApiError('ETF estimates are unavailable.', 503, 'ETF_ESTIMATES_UNAVAILABLE');
        return { funds: funds.sort((a, b) => a.asset.localeCompare(b.asset) || a.ticker.localeCompare(b.ticker)), unavailable, sourceUpdated };
    });
    return { ...result.value, fetchedAt: result.fetchedAt };
}
