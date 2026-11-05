import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCapitalFlows } from './capital-flows.js';
const previous = process.env.FRED_API_KEY;
afterEach(() => { if (previous === undefined)
    delete process.env.FRED_API_KEY;
else
    process.env.FRED_API_KEY = previous; vi.restoreAllMocks(); });
describe('reported capital flows', () => {
    it('requires configuration and rejects unrecognized markets', async () => {
        delete process.env.FRED_API_KEY;
        await expect(getCapitalFlows('stocks')).rejects.toMatchObject({ code: 'FRED_NOT_CONFIGURED' });
        await expect(getCapitalFlows('toString')).rejects.toMatchObject({ code: 'INVALID_FLOW_MARKET' });
    });
    it('retains negative and zero flows and returns accurate quarter and units', async () => {
        process.env.FRED_API_KEY = 'a'.repeat(32);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ observations: [{ date: '2026-04-01', value: '-12.5' }, { date: '2026-01-01', value: '0' }, { date: '2025-10-01', value: '.' }] })));
        const data = await getCapitalFlows('stocks');
        expect(data.observations).toEqual([{ date: '2026-04-01', quarter: 'Q2 2026', valueUsd: -12_500_000 }, { date: '2026-01-01', quarter: 'Q1 2026', valueUsd: 0 }]);
        expect(JSON.stringify(data)).not.toContain(process.env.FRED_API_KEY);
    });
    it('handles rate limiting without leaking response details', async () => {
        process.env.FRED_API_KEY = 'a'.repeat(32);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret', { status: 429 }));
        await expect(getCapitalFlows('bonds')).rejects.toMatchObject({ code: 'FLOW_RATE_LIMITED' });
    });
});
