import { randomUUID } from 'node:crypto';
import { ApiError, UpstreamError } from './errors.js';
import { MarketDataService } from './market-data-service.js';
import { requestContext } from './request-context.js';
import { AiIntelligenceService } from './ai-service.js';
const service = new MarketDataService();
const aiService = new AiIntelligenceService(service);
export async function handleApiRequest(request, response) {
    const requestId = request.headers['x-request-id']?.toString() || randomUUID();
    const startedAt = performance.now();
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    await requestContext.run({ endpoint: requestUrl.pathname, requestId }, async () => {
        try {
            if (request.method === 'POST' && (requestUrl.pathname === '/api/ai/smart-ladder' || requestUrl.pathname === '/api/ai/smart-ladder/cache')) {
                const origin = request.headers.origin;
                if ((origin && new URL(origin).host !== request.headers.host) || !request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
                    throw new ApiError('Invalid request origin or content type.', 403, 'INVALID_ORIGIN');
                }
                const body = await readJsonBody(request);
                let payload;
                if (requestUrl.pathname.endsWith('/cache')) {
                    payload = aiService.getCachedSmartLadder(body);
                }
                else {
                    if (typeof body !== 'object' || body === null || Array.isArray(body))
                        throw new ApiError('Invalid Smart Ladder request.', 400, 'AI_INVALID_REQUEST');
                    const { regenerate, ...settings } = body;
                    if (regenerate !== undefined && typeof regenerate !== 'boolean')
                        throw new ApiError('Invalid Smart Ladder request.', 400, 'AI_INVALID_REQUEST');
                    payload = await aiService.generateSmartLadder(settings, regenerate === true);
                }
                sendJson(response, 200, payload, requestId);
                return;
            }
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
        }
        catch (error) {
            const apiError = mapError(error);
            sendJson(response, apiError.status, { error: { code: apiError.code, message: apiError.message }, requestId }, requestId, apiError.retryAfterSeconds);
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
async function readJsonBody(request) {
    let body = '';
    for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 4096)
            throw new ApiError('Request body is too large.', 413, 'BODY_TOO_LARGE');
    }
    try {
        return JSON.parse(body);
    }
    catch {
        throw new ApiError('Invalid JSON body.', 400, 'INVALID_JSON');
    }
}
async function route(url) {
    if (url.pathname === '/api/health') {
        let probeSucceeded = false;
        try {
            await service.getTickerPrice('BTCUSDT');
            probeSucceeded = true;
        }
        catch {
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
        return service.getKlines(readSymbol(url), interval, limit);
    }
    if (url.pathname === '/api/market-snapshot') {
        const limit = parseBoundedNumber(url.searchParams.get('limit'), 200, 2, 1_000);
        return service.getMarketSnapshot(readSymbol(url), limit);
    }
    throw new ApiError('Endpoint not found.', 404, 'NOT_FOUND');
}
function readSymbol(url) {
    const symbol = url.searchParams.get('symbol');
    if (symbol === null) {
        throw new ApiError('A trading pair symbol is required.', 400, 'MISSING_SYMBOL');
    }
    return symbol;
}
function parseBoundedNumber(value, fallback, minimum, maximum) {
    if (value === null) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new ApiError('A request parameter is invalid.', 400, 'INVALID_PARAMETER');
    }
    return parsed;
}
function sendJson(response, status, payload, requestId, retryAfterSeconds) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Request-Id', requestId);
    if (retryAfterSeconds !== undefined) {
        response.setHeader('Retry-After', String(retryAfterSeconds));
    }
    response.writeHead(status);
    response.end(JSON.stringify(payload));
}
export function mapError(error) {
    if (error instanceof ApiError) {
        return error;
    }
    if (error instanceof UpstreamError) {
        if (error.status === 404 || error.status === 400) {
            return new ApiError('The requested trading pair is unavailable.', error.status, 'UPSTREAM_INVALID_SYMBOL');
        }
        if (error.status === 418 || error.status === 429) {
            return new ApiError('Market-data provider rate limit reached. Please retry shortly.', 503, 'UPSTREAM_RATE_LIMITED', error.retryAfterSeconds);
        }
        return new ApiError('Market-data provider is temporarily unavailable.', 502, 'UPSTREAM_UNAVAILABLE', error.retryAfterSeconds);
    }
    return new ApiError('Market-data service encountered an unexpected error.', 500, 'INTERNAL_ERROR');
}
function logRequest(event) {
    process.stdout.write(`${JSON.stringify({ level: event.status && Number(event.status) >= 500 ? 'error' : 'info', service: 'market-data-api', ...event })}\n`);
}
