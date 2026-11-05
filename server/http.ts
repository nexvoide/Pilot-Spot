import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, UpstreamError } from './errors.js';
import { MarketDataService } from './market-data-service.js';
import { requestContext } from './request-context.js';
import { isLocalRequest } from './local-access.js';
import { getEconomySeries } from './economy-data.js';
import { getFinnhubQuote } from './finnhub-data.js';
import { getCryptoSizes, getCryptoGlobalSize, getCompanySize, getListedEquitySize } from './market-sizes.js';

const service = new MarketDataService();

export async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: { publicAccess?: boolean } = {},
): Promise<void> {
  const requestId = request.headers['x-request-id']?.toString() || randomUUID();
  const startedAt = performance.now();
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  await requestContext.run({ endpoint: requestUrl.pathname, requestId }, async () => {
    try {
      if (!options.publicAccess && !isLocalRequest(request)) throw new ApiError('Local access only.', 403, 'LOCAL_ACCESS_ONLY');
      if (request.method !== 'GET') {
        throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
      }

      const payload = await route(requestUrl);
      sendJson(response, 200, payload, requestId);
      logRequest({
        endpoint: requestUrl.pathname,
        requestId,
        status: 200,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      const apiError = mapError(error);
      sendJson(
        response,
        apiError.status,
        { error: { code: apiError.code, message: apiError.message }, requestId },
        requestId,
        apiError.retryAfterSeconds,
      );
      logRequest({
        durationMs: performance.now() - startedAt,
        endpoint: requestUrl.pathname,
        failureReason: apiError.code,
        requestId,
        status: apiError.status,
      });
    }
  });
}

async function route(url: URL): Promise<unknown> {
  if (url.pathname === '/api/economy/equity-size') return getListedEquitySize(url.searchParams.get('region') ?? '');
  if (url.pathname === '/api/economy/crypto-sizes') return getCryptoSizes();
  if (url.pathname === '/api/economy/crypto-global-size') return getCryptoGlobalSize();
  if (url.pathname === '/api/economy/company-size') return getCompanySize(url.searchParams.get('symbol') ?? '');
  if (url.pathname === '/api/economy-quote' || url.pathname === '/api/economy/quote') return getFinnhubQuote(url.searchParams.get('symbol') ?? '');
  if (url.pathname === '/api/economy-series' || url.pathname === '/api/economy/series') return getEconomySeries(url.searchParams.get('series') ?? '');

  if (url.pathname === '/api/health') {
    let probeSucceeded = false;
    try {
      await service.getTickerPrice('BTCUSDT');
      probeSucceeded = true;
    } catch {
      // Provider details are already recorded by the upstream client.
    }
    const providers = service.getProviderHealth();
    return {
      providers,
      status: probeSucceeded ? 'healthy' : 'degraded',
      timestamp: Date.now(),
    };
  }

  if (url.pathname === '/api/pairs' || url.pathname === '/api/exchange-info') {
    const query = url.searchParams.get('query') ?? '';
    const limit = parseBoundedNumber(url.searchParams.get('limit'), 20, 1, 100);
    return service.getEligiblePairs(query, limit);
  }

  if (url.pathname === '/api/ticker/price') {
    return service.getTickerPrice(readSymbol(url));
  }

  if (url.pathname === '/api/ticker-24hr') {
    return service.getTicker24Hour(readSymbol(url));
  }

  if (url.pathname === '/api/klines') {
    const interval = url.searchParams.get('interval') ?? '';
    const limit = parseBoundedNumber(url.searchParams.get('limit'), 200, 2, 1_000);
    return service.getKlines(readSymbol(url), interval as '15m' | '1h' | '4h', limit);
  }

  if (url.pathname === '/api/market-snapshot') {
    const limit = parseBoundedNumber(url.searchParams.get('limit'), 200, 2, 1_000);
    return service.getMarketSnapshot(readSymbol(url), limit);
  }

  throw new ApiError('Endpoint not found.', 404, 'NOT_FOUND');
}

function readSymbol(url: URL): string {
  const symbol = url.searchParams.get('symbol');
  if (symbol === null) {
    throw new ApiError('A trading pair symbol is required.', 400, 'MISSING_SYMBOL');
  }
  return symbol;
}

function parseBoundedNumber(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError('A request parameter is invalid.', 400, 'INVALID_PARAMETER');
  }

  return parsed;
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  requestId: string,
  retryAfterSeconds?: number,
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Request-Id', requestId);
  if (retryAfterSeconds !== undefined) {
    response.setHeader('Retry-After', String(retryAfterSeconds));
  }
  response.writeHead(status);
  response.end(JSON.stringify(payload));
}

export function mapError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof UpstreamError) {
    if (error.status === 404 || error.status === 400) {
      return new ApiError(
        'The requested trading pair is unavailable.',
        error.status,
        'UPSTREAM_INVALID_SYMBOL',
      );
    }
    if (error.status === 418 || error.status === 429) {
      return new ApiError(
        'Market-data provider rate limit reached. Please retry shortly.',
        503,
        'UPSTREAM_RATE_LIMITED',
        error.retryAfterSeconds,
      );
    }
    return new ApiError(
      'Market-data provider is temporarily unavailable.',
      502,
      'UPSTREAM_UNAVAILABLE',
      error.retryAfterSeconds,
    );
  }

  return new ApiError(
    'Market-data service encountered an unexpected error.',
    500,
    'INTERNAL_ERROR',
  );
}

function logRequest(event: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({ level: event.status && Number(event.status) >= 500 ? 'error' : 'info', service: 'market-data-api', ...event })}\n`,
  );
}
