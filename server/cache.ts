interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface CachedValue<T> {
  cached: boolean;
  fetchedAt: number;
  value: T;
}

export class AsyncTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<CachedValue<T>>>();

  public async getOrLoad(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<CachedValue<T>> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > now) {
      return { cached: true, fetchedAt: existing.expiresAt - ttlMs, value: existing.value };
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const loading = loader()
      .then((value) => {
        const fetchedAt = Date.now();
        this.entries.set(key, { expiresAt: fetchedAt + ttlMs, value });
        return { cached: false, fetchedAt, value };
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, loading);
    return loading;
  }

  public clear(): void {
    this.entries.clear();
  }
}
