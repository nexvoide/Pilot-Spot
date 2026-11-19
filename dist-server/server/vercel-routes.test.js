import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./http.js', () => ({ handleApiRequest: vi.fn().mockResolvedValue(undefined) }));
import { handleApiRequest } from './http.js';
import walletTrackingHandler from '../api/wallet-tracking/[action].js';
import walletDetailsHandler from '../api/wallet-tracking/details/[action].js';
import walletManagerHandler from '../api/wallet-manager/[action].js';
import economyHandler from '../api/economy/[action].js';
describe('Vercel nested API routes', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([
        [walletTrackingHandler, 'GET', '/api/wallet-tracking/details?address=0x123'],
        [walletDetailsHandler, 'GET', '/api/wallet-tracking/details/extras?address=0x123'],
        [walletManagerHandler, 'GET', '/api/wallet-manager/status'],
        [walletManagerHandler, 'POST', '/api/wallet-manager/unlock'],
        [walletManagerHandler, 'DELETE', '/api/wallet-manager/wallets'],
        [economyHandler, 'GET', '/api/economy/crypto-sizes'],
    ])('forwards %s %s %s to the public API handler', async (handler, method, url) => {
        const request = { method, url };
        const response = {};
        await handler(request, response);
        expect(handleApiRequest).toHaveBeenCalledOnce();
        expect(handleApiRequest).toHaveBeenCalledWith(request, response, { publicAccess: true });
        expect(request.url).toBe(url);
    });
});
