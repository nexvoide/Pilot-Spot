import { AsyncTtlCache } from './cache.js';
import { BinanceUpstreamClient, type ProviderHealth } from './binance-client.js';
import {
  exchangeInfoSchema,
  klinesSchema,
  ticker24HourSchema,
  tickerPriceSchema,
} from './binance-schemas.js';
import { serverConfig } from './config.js';
import { ApiError } from './errors.js';
import { Decimal } from 'decimal.js';

export type CandleInterval = '15m' | '1h' | '4h' | '1d';

export interface EligiblePair {
  baseAsset: string;
  quoteAsset: 'USDT';
  symbol: string;
  filters: SymbolFilters | null;
}

interface SymbolFilters {
  tickSize: string;
  stepSize: string;
  minQty: string;
  maxQty: string;
  minNotional: string | null;
  maxNotional: string | null;
}

interface Candle {
  close: number;
  closeTime: number;
  high: number;
  low: number;
  open: number;
  openTime: number;
  volume: number;
}

interface CachedCandles {
  candles: Candle[];
  provider: string;
  upstreamLatencyMs: number;
}

export class MarketDataService {
  private readonly candleCache = new AsyncTtlCache<CachedCandles>();
  private readonly metadataCache = new AsyncTtlCache<EligiblePair[]>();

  public constructor(private readonly upstream = new BinanceUpstreamClient()) {}

  public getProviderHealth(): ProviderHealth[] {
    return this.upstream.getHealth();
  }

  public async getEligiblePairs(
    query: string,
    limit: number,
  ): Promise<{ pairs: EligiblePair[]; refreshedAt: number }> {
    const metadata = await this.metadataCache.getOrLoad(
      'eligible-usdt-pairs',
      serverConfig.metadataCacheTtlMs,
      async () => {
        const response = await this.upstream.getJson('/api/v3/exchangeInfo', exchangeInfoSchema);

        return response.data.symbols
          .filter(
            (symbol) =>
              symbol.status === 'TRADING' &&
              symbol.isSpotTradingAllowed !== false &&
              symbol.quoteAsset === 'USDT' &&
              !symbol.symbol.endsWith('UPUSDT') &&
              !symbol.symbol.endsWith('DOWNUSDT'),
          )
          .map(({ baseAsset, symbol, filters }) => ({
            baseAsset,
            quoteAsset: 'USDT' as const,
            symbol,
            filters: extractFilters(filters),
          }))
          .sort((left, right) => left.symbol.localeCompare(right.symbol));
      },
    );

    const normalizedQuery = query
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const pairs = normalizedQuery
      ? metadata.value
          .filter(
            (pair) =>
              pair.symbol.includes(normalizedQuery) || pair.baseAsset.includes(normalizedQuery),
          )
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

  public async getTickerPrice(symbol: string) {
    const normalizedSymbol = validateSymbol(symbol);
    const response = await this.upstream.getJson('/api/v3/ticker/price', tickerPriceSchema, {
      symbol: normalizedSymbol,
    });

    return { ...response.data, provider: response.provider, receivedAt: Date.now() };
  }

  public async getTicker24Hour(symbol: string) {
    const normalizedSymbol = validateSymbol(symbol);
    const response = await this.upstream.getJson('/api/v3/ticker/24hr', ticker24HourSchema, {
      symbol: normalizedSymbol,
    });

    return { ...response.data, provider: response.provider, receivedAt: Date.now() };
  }

  public async getKlines(symbol: string, interval: CandleInterval, limit: number) {
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

  public async getMarketSnapshot(symbol: string, limit: number) {
    const normalizedSymbol = validateSymbol(symbol);
    validateLimit(limit, 4_000);
    const ticker = await this.getTickerPrice(normalizedSymbol);
    const [fifteenMinute, oneHour, fourHour, oneDay, metadata] = await Promise.all([
      this.getCachedCandles(normalizedSymbol, '15m', limit),
      this.getCachedCandles(normalizedSymbol, '1h', limit),
      this.getCachedCandles(normalizedSymbol, '4h', limit),
      this.getCachedCandles(normalizedSymbol, '1d', limit),
      this.getEligiblePairs(normalizedSymbol, 100),
    ]);
    const filters =
      metadata.pairs.find((pair) => pair.symbol === normalizedSymbol)?.filters ?? null;

    return {
      asOf: ticker.receivedAt,
      candles: {
        '15m': fifteenMinute.value.candles,
        '1h': oneHour.value.candles,
        '4h': fourHour.value.candles,
        '1d': oneDay.value.candles,
      },
      candlesCached: {
        '15m': fifteenMinute.cached,
        '1h': oneHour.cached,
        '4h': fourHour.cached,
        '1d': oneDay.cached,
      },
      candlesFetchedAt: {
        '15m': fifteenMinute.fetchedAt,
        '1h': oneHour.fetchedAt,
        '4h': fourHour.fetchedAt,
        '1d': oneDay.fetchedAt,
      },
      currentPrice: Number(ticker.price),
      filters,
      provider: ticker.provider,
      symbol: normalizedSymbol,
    };
  }

  private async getCachedCandles(symbol: string, interval: CandleInterval, limit: number) {
    const key = `${symbol}:${interval}:${limit}`;

    return this.candleCache.getOrLoad(key, serverConfig.candleCacheTtlMs, async () => {
      const pages: Candle[][] = [];
      let remaining = limit;
      let endTime: number | undefined;
      let provider: string | undefined;
      let upstreamLatencyMs = 0;
      while (remaining > 0) {
        const pageSize = Math.min(remaining, 1_000);
        const response = await this.upstream.getJson('/api/v3/klines', klinesSchema, {
          interval, limit: pageSize, symbol, endTime,
        });
        const page = response.data.map(toCandle);
        if (endTime !== undefined && page.some((candle) => candle.openTime > endTime!)) {
          throw new ApiError('Upstream returned overlapping candle history.', 502, 'INVALID_CANDLE');
        }
        if (page.some((candle, index) => index > 0 && candle.openTime <= page[index - 1].openTime) && limit > 1_000) {
          throw new ApiError('Upstream returned unordered candle history.', 502, 'INVALID_CANDLE');
        }
        provider ??= response.provider;
        upstreamLatencyMs += response.latencyMs;
        pages.unshift(page);
        remaining -= page.length;
        if (page.length < pageSize || page.length === 0) break;
        endTime = page[0].openTime - 1;
        if (endTime < 0) break;
      }
      const candles = pages.flat();

      if (candles.length < 2) {
        throw new ApiError(
          'Upstream returned insufficient candle data.',
          502,
          'INCOMPLETE_CANDLES',
        );
      }

      return { candles, provider: provider ?? 'primary', upstreamLatencyMs };
    });
  }
}

function extractFilters(
  filters: Array<{ filterType: string; [key: string]: unknown }> | undefined,
): SymbolFilters | null {
  const price = filters?.find((filter) => filter.filterType === 'PRICE_FILTER');
  const lot = filters?.find((filter) => filter.filterType === 'LOT_SIZE');
  const notional =
    filters?.find((filter) => filter.filterType === 'NOTIONAL') ??
    filters?.find((filter) => filter.filterType === 'MIN_NOTIONAL');
  const decimal = (value: unknown, allowZero: boolean): string | null => {
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null;
    const number = new Decimal(value);
    return number.isFinite() && (allowZero ? number.gte(0) : number.gt(0)) ? value : null;
  };
  const tickSize = decimal(price?.tickSize, false);
  const stepSize = decimal(lot?.stepSize, false);
  const minQty = decimal(lot?.minQty, true);
  const maxQty = decimal(lot?.maxQty, true);
  const minNotional = decimal(notional?.minNotional, true);
  const maxNotional =
    notional?.filterType === 'NOTIONAL' ? decimal(notional.maxNotional, true) : null;
  if (
    !tickSize ||
    !stepSize ||
    !minQty ||
    !maxQty ||
    (notional && !minNotional) ||
    (notional?.filterType === 'NOTIONAL' && !maxNotional)
  )
    return null;
  return { tickSize, stepSize, minQty, maxQty, minNotional, maxNotional };
}

function pairSearchRank(pair: EligiblePair, query: string): number {
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

function validateSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    throw new ApiError('The requested trading pair is invalid.', 400, 'INVALID_SYMBOL');
  }

  return symbol;
}

function validateInterval(value: string): asserts value is CandleInterval {
  if (value !== '15m' && value !== '1h' && value !== '4h' && value !== '1d') {
    throw new ApiError('The requested candle interval is not supported.', 400, 'INVALID_INTERVAL');
  }
}

function validateLimit(value: number, maximum = 1_000): void {
  if (!Number.isInteger(value) || value < 2 || value > maximum) {
    throw new ApiError('The requested candle limit is invalid.', 400, 'INVALID_LIMIT');
  }
}

function toCandle(item: Array<string | number>): Candle {
  const values = [item[0], item[1], item[2], item[3], item[4], item[5], item[6]].map(Number);

  if (values.some((value) => !Number.isFinite(value))) {
    throw new ApiError('Upstream returned invalid candle data.', 502, 'INVALID_CANDLE');
  }

  const [openTime, open, high, low, close, volume, closeTime] = values;
  return { close, closeTime, high, low, open, openTime, volume };
}

export type MarketDataServiceResult = Awaited<ReturnType<MarketDataService['getMarketSnapshot']>>;
