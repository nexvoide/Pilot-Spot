import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCryptoEtfEstimates } from './crypto-etf-estimates.js';
afterEach(() => vi.restoreAllMocks());
describe('crypto ETF estimates', () => {
    it('uses the latest valid observation per fund and preserves partial coverage', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            if (String(input).includes('asset=eth'))
                return new Response('', { status: 503 });
            return new Response(JSON.stringify({ updatedAt: '2026-11-05T00:00:00Z', data: [{ date: '2026-11-01', ticker: 'IBIT', issuer: 'iShares', asset: 'btc', flowUsd: '12.50' }, { date: '2026-11-02', ticker: 'IBIT', issuer: 'iShares', asset: 'btc', flowUsd: '-10.50' }, { date: '2026-11-03', ticker: 'BITB', issuer: 'Bitwise', asset: 'btc', flowUsd: null }] }));
        });
        const result = await getCryptoEtfEstimates();
        expect(result.funds).toEqual([{ asset: 'btc', ticker: 'IBIT', issuer: 'iShares', date: '2026-11-02', estimatedChangeUsd: -10.5 }]);
        expect(result.unavailable).toEqual(['eth']);
    });
});
