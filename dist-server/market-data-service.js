import { AsyncTtlCache } from './cache.js';
import { BinanceUpstreamClient } from './binance-client.js';
import { exchangeInfoSchema, klinesSchema, ticker24HourSchema, tickerPriceSchema, } from './binance-schemas.js';
import { serverConfig } from './config.js';
import { ApiError } from './errors.js';
import { Decimal } from 'decimal.js';
export class MarketDataService {
    upstream;
    candleCache = new AsyncTtlCache();
    metadataCache = new AsyncTtlCache();
    constructor(upstream = new BinanceUpstreamClient()) {
        this.upstream = upstream;
    }
    getProviderHealth() {
        return this.upstream.getHealth();
    }
    async getEligiblePairs(query, limit) {
        const metadata = await this.metadataCache.getOrLoad('eligible-usdt-pairs', serverConfig.metadataCacheTtlMs, async () => {
            const response = await this.upstream.getJson('/api/v3/exchangeInfo', exchangeInfoSchema);
            return response.data.symbols
                .filter((symbol) => symbol.status === 'TRADING' &&
                symbol.isSpotTradingAllowed !== false &&
                symbol.quoteAsset === 'USDT' &&
                !symbol.symbol.endsWith('UPUSDT') &&
                !symbol.symbol.endsWith('DOWNUSDT'))
                .map(({ baseAsset, symbol, filters }) => ({
                baseAsset,
                quoteAsset: 'USDT',
                symbol,
                filters: extractFilters(filters),
            }))
                .sort((left, right) => left.symbol.localeCompare(right.symbol));
        });
        const normalizedQuery = query
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
        const pairs = normalizedQuery
            ? metadata.value
                .filter((pair) => pair.symbol.includes(normalizedQuery) || pair.baseAsset.includes(normalizedQuery))
                .sort((left, right) => {
                const leftRank = pairSearchRank(left, normalizedQuery);
                const rightRank = pairSearchRank(right, normalizedQuery);
                return leftRank === rightRank
                    ? left.symbol.localeCompare(right.symbol)
                    : leftRank - rightRank;
            })
            : metadata.value;
        return { pairs: pairs.slice(0, limit), refreshedAt: metadata.fetchedAt };
    }
    async getTickerPrice(symbol) {
        const normalizedSymbol = validateSymbol(symbol);
        const response = await this.upstream.getJson('/api/v3/ticker/price', tickerPriceSchema, {
            symbol: normalizedSymbol,
        });
        return { ...response.data, provider: response.provider, receivedAt: Date.now() };
    }
    async getTicker24Hour(symbol) {
        const normalizedSymbol = validateSymbol(symbol);
        const response = await this.upstream.getJson('/api/v3/ticker/24hr', ticker24HourSchema, {
            symbol: normalizedSymbol,
        });
        return { ...response.data, provider: response.provider, receivedAt: Date.now() };
    }
    async getKlines(symbol, interval, limit) {
        const normalizedSymbol = validateSymbol(symbol);
        validateInterval(interval);
        validateLimit(limit);
        const cached = await this.getCachedCandles(normalizedSymbol, interval, limit);
        return {
            candles: cached.value.candles,
            candlesCached: cached.cached,
            candlesFetchedAt: cached.fetchedAt,
            interval,
            provider: cached.value.provider,
            symbol: normalizedSymbol,
        };
    }
    async getMarketSnapshot(symbol, limit) {
        const normalizedSymbol = validateSymbol(symbol);
        validateLimit(limit);
        const ticker = await this.getTickerPrice(normalizedSymbol);
        const fifteenMinute = await this.getCachedCandles(normalizedSymbol, '15m', limit);
        const oneHour = await this.getCachedCandles(normalizedSymbol, '1h', limit);
        const fourHour = await this.getCachedCandles(normalizedSymbol, '4h', limit);
        const metadata = await this.getEligiblePairs(normalizedSymbol, 100);
        const filters = metadata.pairs.find((pair) => pair.symbol === normalizedSymbol)?.filters ?? null;
        return {
            asOf: ticker.receivedAt,
            candles: {
                '15m': fifteenMinute.value.candles,
                '1h': oneHour.value.candles,
                '4h': fourHour.value.candles,
            },
            candlesCached: {
                '15m': fifteenMinute.cached,
                '1h': oneHour.cached,
                '4h': fourHour.cached,
            },
            candlesFetchedAt: {
                '15m': fifteenMinute.fetchedAt,
                '1h': oneHour.fetchedAt,
                '4h': fourHour.fetchedAt,
            },
            currentPrice: Number(ticker.price),
            filters,
            provider: ticker.provider,
            symbol: normalizedSymbol,
        };
    }
    async getCachedCandles(symbol, interval, limit) {
        const key = `${symbol}:${interval}:${limit}`;
        return this.candleCache.getOrLoad(key, serverConfig.candleCacheTtlMs, async () => {
            const response = await this.upstream.getJson('/api/v3/klines', klinesSchema, {
                interval,
                limit,
                symbol,
            });
            const candles = response.data.map(toCandle);
            if (candles.length < 2) {
                throw new ApiError('Upstream returned insufficient candle data.', 502, 'INCOMPLETE_CANDLES');
            }
            return { candles, provider: response.provider, upstreamLatencyMs: response.latencyMs };
        });
    }
}
function extractFilters(filters) {
    const price = filters?.find((filter) => filter.filterType === 'PRICE_FILTER');
    const lot = filters?.find((filter) => filter.filterType === 'LOT_SIZE');
    const notional = filters?.find((filter) => filter.filterType === 'NOTIONAL') ??
        filters?.find((filter) => filter.filterType === 'MIN_NOTIONAL');
    const decimal = (value, allowZero) => {
        if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))
            return null;
        const number = new Decimal(value);
        return number.isFinite() && (allowZero ? number.gte(0) : number.gt(0)) ? value : null;
    };
    const tickSize = decimal(price?.tickSize, false);
    const stepSize = decimal(lot?.stepSize, false);
    const minQty = decimal(lot?.minQty, true);
    const maxQty = decimal(lot?.maxQty, true);
    const minNotional = decimal(notional?.minNotional, true);
    const maxNotional = notional?.filterType === 'NOTIONAL' ? decimal(notional.maxNotional, true) : null;
    if (!tickSize ||
        !stepSize ||
        !minQty ||
        !maxQty ||
        (notional && !minNotional) ||
        (notional?.filterType === 'NOTIONAL' && !maxNotional))
        return null;
    return { tickSize, stepSize, minQty, maxQty, minNotional, maxNotional };
}
function pairSearchRank(pair, query) {
    if (pair.baseAsset === query || pair.symbol === query) {
        return 0;
    }
    if (pair.baseAsset.startsWith(query)) {
        return 1;
    }
    if (pair.symbol.startsWith(query)) {
        return 2;
    }
    return 3;
}
function validateSymbol(value) {
    const symbol = value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
        throw new ApiError('The requested trading pair is invalid.', 400, 'INVALID_SYMBOL');
    }
    return symbol;
}
function validateInterval(value) {
    if (value !== '15m' && value !== '1h' && value !== '4h') {
        throw new ApiError('The requested candle interval is not supported.', 400, 'INVALID_INTERVAL');
    }
}
function validateLimit(value) {
    if (!Number.isInteger(value) || value < 2 || value > 1_000) {
        throw new ApiError('The requested candle limit is invalid.', 400, 'INVALID_LIMIT');
    }
}
function toCandle(item) {
    const values = [item[0], item[1], item[2], item[3], item[4], item[5], item[6]].map(Number);
    if (values.some((value) => !Number.isFinite(value))) {
        throw new ApiError('Upstream returned invalid candle data.', 502, 'INVALID_CANDLE');
    }
    const [openTime, open, high, low, close, volume, closeTime] = values;
    return { close, closeTime, high, low, open, openTime, volume };
}
