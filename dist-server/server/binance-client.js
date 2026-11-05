import { ZodError } from 'zod';
import { serverConfig } from './config.js';
import { UpstreamError } from './errors.js';
import { requestContext } from './request-context.js';
const providers = [
    { baseUrl: serverConfig.primaryBaseUrl, name: 'primary' },
    { baseUrl: serverConfig.fallbackBaseUrl, name: 'fallback' },
];
export class BinanceUpstreamClient {
    fetchImplementation;
    timeoutMs;
    health = new Map(providers.map((provider) => [
        provider.name,
        { lastFailureAt: null, lastSuccessAt: null, provider: provider.name, status: 'unknown' },
    ]));
    constructor(fetchImplementation = fetch, timeoutMs = serverConfig.requestTimeoutMs) {
        this.fetchImplementation = fetchImplementation;
        this.timeoutMs = timeoutMs;
    }
    getHealth() {
        return providers.map((provider) => this.health.get(provider.name));
    }
    async getJson(path, schema, query = {}) {
        let lastError = null;
        let retryCount = 0;
        for (const provider of providers) {
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const result = await this.fetchProvider(provider, path, schema, query);
                    this.health.set(provider.name, {
                        lastFailureAt: this.health.get(provider.name)?.lastFailureAt ?? null,
                        lastSuccessAt: Date.now(),
                        provider: provider.name,
                        status: 'healthy',
                    });
                    logUpstream({
                        endpoint: path,
                        latencyMs: result.latencyMs,
                        provider: provider.name,
                        retryCount,
                        status: 200,
                    });
                    return { ...result, retryCount };
                }
                catch (error) {
                    const upstreamError = normalizeUpstreamError(error, provider.name);
                    lastError = upstreamError;
                    this.health.set(provider.name, {
                        lastFailureAt: Date.now(),
                        lastSuccessAt: this.health.get(provider.name)?.lastSuccessAt ?? null,
                        provider: provider.name,
                        status: 'unhealthy',
                    });
                    logUpstream({
                        endpoint: path,
                        failureReason: upstreamError.message,
                        provider: provider.name,
                        retryCount,
                        status: upstreamError.status,
                    });
                    if (!isRetryable(upstreamError) || attempt === 1) {
                        break;
                    }
                    retryCount += 1;
                    await delay(backoffMs(attempt));
                }
            }
        }
        throw lastError ?? new UpstreamError('Market-data providers are unavailable.', 'primary', 503);
    }
    async fetchProvider(provider, path, schema, query) {
        const url = new URL(path, `${provider.baseUrl}/`);
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const startedAt = performance.now();
        try {
            const response = await this.fetchImplementation(url, {
                headers: { Accept: 'application/json' },
                method: 'GET',
                signal: controller.signal,
            });
            const latencyMs = Math.round(performance.now() - startedAt);
            if (!response.ok) {
                throw new UpstreamError(await readUpstreamMessage(response), provider.name, response.status, parseRetryAfter(response.headers.get('retry-after')));
            }
            const payload = await response.json();
            const parsed = schema.safeParse(payload);
            if (!parsed.success) {
                throw new UpstreamError('Upstream returned an invalid market-data response.', provider.name, 502);
            }
            return { data: parsed.data, latencyMs, provider: provider.name };
        }
        catch (error) {
            if (error instanceof UpstreamError) {
                throw error;
            }
            if (error instanceof ZodError) {
                throw new UpstreamError('Upstream returned an invalid market-data response.', provider.name, 502);
            }
            const timedOut = controller.signal.aborted;
            throw new UpstreamError(timedOut ? 'Upstream request timed out.' : 'Upstream network request failed.', provider.name, timedOut ? 504 : 502);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
function normalizeUpstreamError(error, provider) {
    return error instanceof UpstreamError
        ? error
        : new UpstreamError('Upstream market-data request failed.', provider, 502);
}
function isRetryable(error) {
    return error.status === 418 || error.status === 429 || error.status >= 500;
}
function backoffMs(attempt) {
    return 250 * 2 ** attempt;
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function readUpstreamMessage(response) {
    try {
        const payload = (await response.json());
        return typeof payload.msg === 'string'
            ? payload.msg
            : `Upstream request failed (${response.status}).`;
    }
    catch {
        return `Upstream request failed (${response.status}).`;
    }
}
function parseRetryAfter(value) {
    if (value === null) {
        return undefined;
    }
    const seconds = Number.parseInt(value, 10);
    return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}
function logUpstream(event) {
    const context = requestContext.getStore();
    process.stdout.write(`${JSON.stringify({
        endpoint: context?.endpoint ?? null,
        level: Number(event.status) >= 500 ? 'error' : 'info',
        requestId: context?.requestId ?? null,
        service: 'market-data-api',
        upstreamEndpoint: event.endpoint,
        ...event,
    })}\n`);
}
