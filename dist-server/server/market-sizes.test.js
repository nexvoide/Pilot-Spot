import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCompanySize, getCryptoGlobalSize, getCryptoSizes, getListedEquitySize } from './market-sizes.js';
const previous = process.env.FINNHUB_API_KEY;
afterEach(() => { if (previous === undefined)
    delete process.env.FINNHUB_API_KEY;
else
    process.env.FINNHUB_API_KEY = previous; vi.restoreAllMocks(); });
describe('market-size sources', () => {
    it('returns sorted crypto capitalizations with observation timestamps', async () => {
        const coin = (id, value) => ({ id, name: id, symbol: id, last_updated: '2026-01-01T00:00:00Z', quotes: { USD: { market_cap: value } } });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([coin('b', 50), coin('a', 100)])));
        expect((await getCryptoSizes()).coins.map((item) => item.id)).toEqual(['a', 'b']);
    });
    it('reports provider failures and rejects unknown company symbols', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
        await expect(getCryptoGlobalSize()).rejects.toMatchObject({ code: 'SIZE_RATE_LIMITED' });
        await expect(getCompanySize('OTHER')).rejects.toMatchObject({ code: 'INVALID_SYMBOL' });
    });
    it('uses Finnhub market capitalization in millions without exposing the key', async () => {
        process.env.FINNHUB_API_KEY = 'privateKey';
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ currency: 'USD', marketCapitalization: 123 })));
        const data = await getCompanySize('NVDA');
        expect(data.value).toBe(123_000_000);
        expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({ 'X-Finnhub-Token': 'privateKey' });
        expect(JSON.stringify(data)).not.toContain('privateKey');
    });
    it('uses the latest available World Bank value and retains its reporting year', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ lastupdated: '2026-10-08' }, [{ date: '2026', value: null }, { date: '2024', value: 100 }, { date: '2025', value: 120 }]])));
        const result = await getListedEquitySize('WLD');
        expect(result).toMatchObject({ value: 120, year: 2025, sourceUpdated: '2026-10-08', region: 'WLD' });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect((await getListedEquitySize('WLD')).value).toBe(120);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        await expect(getListedEquitySize('INVALID')).rejects.toMatchObject({ code: 'INVALID_REGION' });
    });
    it('leaves equity values unavailable when World Bank has no observations', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ lastupdated: '2026-10-08' }, [{ date: '2025', value: null }]])));
        await expect(getListedEquitySize('USA')).rejects.toMatchObject({ code: 'SIZE_SOURCE_UNAVAILABLE' });
    });
});
