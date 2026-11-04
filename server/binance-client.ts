import { ZodError, type z } from 'zod';
import { serverConfig } from './config.js';
import { UpstreamError } from './errors.js';
import { requestContext } from './request-context.js';

export type ProviderName = 'fallback' | 'primary';

export interface ProviderHealth {
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  provider: ProviderName;
  status: 'healthy' | 'unknown' | 'unhealthy';
}

export interface UpstreamResult<T> {
  data: T;
  latencyMs: number;
  provider: ProviderName;
  retryCount: number;
}

interface Provider {
  baseUrl: string;
  name: ProviderName;
}

const providers: Provider[] = [
  { baseUrl: serverConfig.primaryBaseUrl, name: 'primary' },
  { baseUrl: serverConfig.fallbackBaseUrl, name: 'fallback' },
];

export class BinanceUpstreamClient {
  private readonly health = new Map<ProviderName, ProviderHealth>(
    providers.map((provider) => [
      provider.name,
      { lastFailureAt: null, lastSuccessAt: null, provider: provider.name, status: 'unknown' },
    ]),
  );

  public constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly timeoutMs = serverConfig.requestTimeoutMs,
  ) {}

  public getHealth(): ProviderHealth[] {
    return providers.map((provider) => this.health.get(provider.name)!);
  }

  public async getJson<T>(
    path: string,
    schema: z.ZodType<T>,
    query: Record<string, string | number | undefined> = {},
  ): Promise<UpstreamResult<T>> {
    let lastError: UpstreamError | null = null;
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
        } catch (error) {
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

  private async fetchProvider<T>(
    provider: Provider,
    path: string,
    schema: z.ZodType<T>,
    query: Record<string, string | number | undefined>,
  ): Promise<Omit<UpstreamResult<T>, 'retryCount'>> {
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
        throw new UpstreamError(
          await readUpstreamMessage(response),
          provider.name,
          response.status,
          parseRetryAfter(response.headers.get('retry-after')),
        );
      }

      const payload: unknown = await response.json();
      const parsed = schema.safeParse(payload);

      if (!parsed.success) {
        throw new UpstreamError(
          'Upstream returned an invalid market-data response.',
          provider.name,
          502,
        );
      }

      return { data: parsed.data, latencyMs, provider: provider.name };
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw error;
      }

      if (error instanceof ZodError) {
        throw new UpstreamError(
          'Upstream returned an invalid market-data response.',
          provider.name,
          502,
        );
      }

      const timedOut = controller.signal.aborted;
      throw new UpstreamError(
        timedOut ? 'Upstream request timed out.' : 'Upstream network request failed.',
        provider.name,
        timedOut ? 504 : 502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeUpstreamError(error: unknown, provider: ProviderName): UpstreamError {
  return error instanceof UpstreamError
    ? error
    : new UpstreamError('Upstream market-data request failed.', provider, 502);
}

function isRetryable(error: UpstreamError): boolean {
  return error.status === 418 || error.status === 429 || error.status >= 500;
}

function backoffMs(attempt: number): number {
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readUpstreamMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { msg?: unknown };
    return typeof payload.msg === 'string'
      ? payload.msg
      : `Upstream request failed (${response.status}).`;
  } catch {
    return `Upstream request failed (${response.status}).`;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const seconds = Number.parseInt(value, 10);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

function logUpstream(event: Record<string, unknown>): void {
  const context = requestContext.getStore();
  process.stdout.write(
    `${JSON.stringify({
      endpoint: context?.endpoint ?? null,
      level: Number(event.status) >= 500 ? 'error' : 'info',
      requestId: context?.requestId ?? null,
      service: 'market-data-api',
      upstreamEndpoint: event.endpoint,
      ...event,
    })}\n`,
  );
}
