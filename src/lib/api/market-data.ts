import { z } from 'zod';
import type { BinanceSymbol, MarketCandle, MarketSnapshot } from '@/lib/binance/types';
import type { SymbolFilters } from '@/lib/calculations/exchange-filters';
import Decimal from 'decimal.js';

const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/);
const positiveDecimalString = decimalString.refine((value) => new Decimal(value).gt(0));

const candleSchema = z.object({
  close: z.number().finite(),
  closeTime: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  open: z.number().finite(),
  openTime: z.number().finite(),
  volume: z.number().finite(),
});

const pairsResponseSchema = z.object({
  pairs: z.array(
    z.object({
      baseAsset: z.string().min(1),
      quoteAsset: z.literal('USDT'),
      symbol: z.string().min(1),
    }),
  ),
});

const snapshotResponseSchema = z.object({
  asOf: z.number().finite(),
  candles: z.object({
    '15m': z.array(candleSchema),
    '1h': z.array(candleSchema),
    '4h': z.array(candleSchema),
  }),
  candlesCached: z.object({ '15m': z.boolean(), '1h': z.boolean(), '4h': z.boolean() }),
  candlesFetchedAt: z.object({
    '15m': z.number().finite(),
    '1h': z.number().finite(),
    '4h': z.number().finite(),
  }),
  currentPrice: z.number().positive().finite(),
  filters: z
    .object({
      tickSize: positiveDecimalString,
      stepSize: positiveDecimalString,
      minQty: decimalString,
      maxQty: decimalString,
      minNotional: decimalString.nullable(),
      maxNotional: decimalString.nullable(),
    })
    .nullable(),
  provider: z.enum(['primary', 'fallback']),
  symbol: z.string().min(1),
});

const ticker24HourResponseSchema = z.object({
  highPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
  lastPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
  lowPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
  priceChangePercent: z.string(),
  symbol: z.string().min(1),
});

export interface MarketTicker {
  highPrice: number;
  lowPrice: number;
  price: number;
  priceChangePercent: number;
  symbol: string;
}

export interface InternalApiError {
  code: string;
  message: string;
  requestId: string | null;
  status: number;
}

export interface MarketSnapshotResponse extends MarketSnapshot {
  filters: SymbolFilters | null;
  asOf: number;
  candlesCached: Record<'15m' | '1h' | '4h', boolean>;
  candlesFetchedAt: Record<'15m' | '1h' | '4h', number>;
  provider: 'fallback' | 'primary';
}

export async function fetchEligibleSpotPairs(
  query = '',
  signal?: AbortSignal,
): Promise<BinanceSymbol[]> {
  const response = await requestJson('/api/pairs', { limit: 100, query }, signal);
  const parsed = pairsResponseSchema.safeParse(response);

  if (!parsed.success) {
    throw new Error('Market-data service returned an invalid pair response.');
  }

  return parsed.data.pairs.map((pair) => ({ ...pair, status: 'TRADING' }));
}

export async function fetchMarketSnapshot(
  symbol: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<MarketSnapshotResponse> {
  const response = await requestJson(
    '/api/market-snapshot',
    { limit: options.limit ?? 200, symbol: symbol.trim().toUpperCase() },
    options.signal,
  );
  const parsed = snapshotResponseSchema.safeParse(response);

  if (!parsed.success) {
    throw new Error('Market-data service returned an invalid snapshot response.');
  }

  if (parsed.data.symbol !== symbol.trim().toUpperCase()) {
    throw new Error('Market-data service returned a different trading pair.');
  }

  return parsed.data as MarketSnapshotResponse;
}

export async function fetchMarketTicker(symbol: string): Promise<MarketTicker> {
  const response = await requestJson('/api/ticker-24hr', { symbol: symbol.trim().toUpperCase() });
  const parsed = ticker24HourResponseSchema.safeParse(response);

  if (!parsed.success) {
    throw new Error('Market-data service returned an invalid ticker response.');
  }

  const price = Number(parsed.data.lastPrice);
  const priceChangePercent = Number(parsed.data.priceChangePercent);
  const highPrice = Number(parsed.data.highPrice);
  const lowPrice = Number(parsed.data.lowPrice);
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(priceChangePercent) ||
    !Number.isFinite(highPrice) ||
    highPrice <= 0 ||
    !Number.isFinite(lowPrice) ||
    lowPrice <= 0
  ) {
    throw new Error('Market-data service returned invalid ticker values.');
  }

  return { highPrice, lowPrice, price, priceChangePercent, symbol: parsed.data.symbol };
}

async function requestJson(
  path: string,
  query: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch {
    throw new Error('Unable to reach the market-data service.');
  }

  const payload = await safelyReadJson(response);

  if (!response.ok) {
    const error = payload as {
      error?: { code?: unknown; message?: unknown };
      requestId?: unknown;
    } | null;
    const message =
      typeof error?.error?.message === 'string'
        ? error.error.message
        : 'Market-data service request failed.';
    const requestId = typeof error?.requestId === 'string' ? error.requestId : null;
    throw new MarketDataApiError(message, response.status, requestId);
  }

  return payload;
}

async function safelyReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

class MarketDataApiError extends Error implements InternalApiError {
  public readonly code = 'MARKET_DATA_API_ERROR';

  public constructor(
    message: string,
    public readonly status: number,
    public readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'MarketDataApiError';
  }
}

export type { MarketCandle };
