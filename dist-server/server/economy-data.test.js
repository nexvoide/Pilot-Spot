import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEconomySeries } from './economy-data.js';
const previous = process.env.FRED_API_KEY;
afterEach(() => { if (previous === undefined)
    delete process.env.FRED_API_KEY;
else
    process.env.FRED_API_KEY = previous; vi.restoreAllMocks(); });
describe('FRED economy data', () => {
    it('requires server configuration and rejects unsupported series', async () => {
        delete process.env.FRED_API_KEY;
        await expect(getEconomySeries('SP500')).rejects.toMatchObject({ code: 'FRED_NOT_CONFIGURED' });
        await expect(getEconomySeries('SECRET')).rejects.toMatchObject({ code: 'INVALID_SERIES' });
    });
    it('filters missing observations and never returns the server key', async () => {
        process.env.FRED_API_KEY = 'a'.repeat(32);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ observations: [{ date: '2026-01-05', value: '100' }, { date: '2026-01-04', value: '.' }] }), { status: 200 }));
        const result = await getEconomySeries('DCOILWTICO');
        expect(result.observations).toEqual([{ date: '2026-01-05', value: 100 }]);
        expect(JSON.stringify(result)).not.toContain(process.env.FRED_API_KEY);
    });
    it('returns a safe error on a rate limit without provider details', async () => {
        process.env.FRED_API_KEY = 'b'.repeat(32);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private upstream detail', { status: 429 }));
        await expect(getEconomySeries('DEXUSEU')).rejects.toMatchObject({ code: 'FRED_RATE_LIMITED', message: 'FRED rate limit reached. Try again later.' });
    });
});
