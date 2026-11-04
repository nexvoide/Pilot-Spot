export class AsyncTtlCache {
    entries = new Map();
    inFlight = new Map();
    async getOrLoad(key, ttlMs, loader) {
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
    clear() {
        this.entries.clear();
    }
}
