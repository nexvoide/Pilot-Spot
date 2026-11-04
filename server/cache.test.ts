import { describe, expect, it, vi } from 'vitest';
import { AsyncTtlCache } from './cache.js';

describe('AsyncTtlCache', () => {
  it('reloads an entry after its TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T00:00:00.000Z'));
    const cache = new AsyncTtlCache<number>();
    const loader = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await expect(cache.getOrLoad('BTCUSDT', 1_000, loader)).resolves.toMatchObject({
      cached: false,
      value: 1,
    });
    await expect(cache.getOrLoad('BTCUSDT', 1_000, loader)).resolves.toMatchObject({
      cached: true,
      value: 1,
    });

    vi.setSystemTime(new Date('2026-11-03T00:00:01.001Z'));
    await expect(cache.getOrLoad('BTCUSDT', 1_000, loader)).resolves.toMatchObject({
      cached: false,
      value: 2,
    });
    expect(loader).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
