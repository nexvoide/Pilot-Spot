import { z } from 'zod';
import { AsyncTtlCache } from './cache.js';
import { ApiError } from './errors.js';

const cryptoSchema = z.array(z.object({ id: z.string(), name: z.string(), symbol: z.string(), last_updated: z.string().datetime({ offset: true }), quotes: z.object({ USD: z.object({ market_cap: z.number().finite().nonnegative() }) }) })).max(2500);
const globalSchema = z.object({ market_cap_usd: z.number().positive().finite(), last_updated: z.number().int().positive() });
const companySchema = z.object({ marketCapitalization: z.number().positive().finite(), currency: z.literal('USD') });
const symbols = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'XOM', 'JNJ']);
const cryptoCache = new AsyncTtlCache<{ coins: { id: string; name: string; symbol: string; value: number; asOf: string }[] }>();
const globalCache = new AsyncTtlCache<{ value: number; asOf: string }>();
const companyCache = new AsyncTtlCache<{ value: number }>();

async function publicJson(url: URL, headers: Record<string, string> = {}) {
  let response: Response;
  try { response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }); }
  catch { throw new ApiError('Market-size provider is unavailable.', 503, 'SIZE_SOURCE_UNAVAILABLE'); }
  if (!response.ok) throw new ApiError(response.status === 429 ? 'Market-size provider rate limit reached.' : 'Market-size data is unavailable.', 503, response.status === 429 ? 'SIZE_RATE_LIMITED' : 'SIZE_SOURCE_UNAVAILABLE');
  try { return await response.json() as unknown; } catch { throw new ApiError('Market-size provider returned invalid data.', 502, 'SIZE_INVALID_DATA'); }
}
export async function getCryptoSizes() {
  const result = await cryptoCache.getOrLoad('crypto', 10 * 60_000, async () => {
    const parsed = cryptoSchema.safeParse(await publicJson(new URL('https://api.coinpaprika.com/v1/tickers')));
    if (!parsed.success) throw new ApiError('Market-size provider returned invalid data.', 502, 'SIZE_INVALID_DATA');
    return { coins: parsed.data.filter((coin) => coin.quotes.USD.market_cap > 0).map((coin) => ({ id: coin.id, name: coin.name, symbol: coin.symbol, value: coin.quotes.USD.market_cap, asOf: coin.last_updated })).sort((a, b) => b.value - a.value) };
  });
  return { ...result.value, fetchedAt: result.fetchedAt };
}
export async function getCryptoGlobalSize() {
  const result = await globalCache.getOrLoad('global', 10 * 60_000, async () => {
    const parsed = globalSchema.safeParse(await publicJson(new URL('https://api.coinpaprika.com/v1/global')));
    if (!parsed.success) throw new ApiError('Market-size provider returned invalid data.', 502, 'SIZE_INVALID_DATA');
    return { value: parsed.data.market_cap_usd, asOf: new Date(parsed.data.last_updated * 1000).toISOString() };
  });
  return { ...result.value, fetchedAt: result.fetchedAt };
}
export async function getCompanySize(symbol: string) {
  if (!symbols.has(symbol)) throw new ApiError('Symbol unavailable.', 400, 'INVALID_SYMBOL');
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key || !/^[a-zA-Z0-9]+$/.test(key)) throw new ApiError('Finnhub is not configured on the server.', 503, 'FINNHUB_NOT_CONFIGURED');
  const result = await companyCache.getOrLoad(symbol, 60 * 60_000, async () => {
    const url = new URL('https://finnhub.io/api/v1/stock/profile2'); url.searchParams.set('symbol', symbol);
    const parsed = companySchema.safeParse(await publicJson(url, { 'X-Finnhub-Token': key }));
    if (!parsed.success) throw new ApiError('Company market value is unavailable.', 503, 'SIZE_SOURCE_UNAVAILABLE');
    return { value: parsed.data.marketCapitalization * 1_000_000 };
  });
  return { ...result.value, symbol, fetchedAt: result.fetchedAt };
}

const worldBankRegions = new Set(['WLD', 'USA', 'EAS', 'EUU']);
const worldBankCache = new AsyncTtlCache<{ value: number; year: number; sourceUpdated: string | null }>();
const worldBankSchema = z.tuple([
  z.object({ lastupdated: z.string().nullable().optional() }),
  z.array(z.object({ date: z.string().regex(/^\d{4}$/), value: z.number().positive().finite().nullable() })).nullable(),
]);

export async function getListedEquitySize(region: string) {
  if (!worldBankRegions.has(region)) throw new ApiError('Region unavailable.', 400, 'INVALID_REGION');
  const result = await worldBankCache.getOrLoad(region, 24 * 60 * 60_000, async () => {
    const url = new URL(`https://api.worldbank.org/v2/country/${region}/indicator/CM.MKT.LCAP.CD`);
    url.search = new URLSearchParams({ format: 'json', per_page: '15' }).toString();
    const parsed = worldBankSchema.safeParse(await publicJson(url));
    if (!parsed.success) throw new ApiError('Equity market data is unavailable.', 503, 'SIZE_SOURCE_UNAVAILABLE');
    const observation = parsed.data[1]?.filter((entry) => entry.value !== null && Number(entry.date) <= new Date().getUTCFullYear()).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!observation?.value) throw new ApiError('Equity market data is unavailable.', 503, 'SIZE_SOURCE_UNAVAILABLE');
    return { value: observation.value, year: Number(observation.date), sourceUpdated: parsed.data[0].lastupdated ?? null };
  });
  return { ...result.value, region, fetchedAt: result.fetchedAt };
}
