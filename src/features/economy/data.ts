import { z } from 'zod';

export type Period = '24H' | '7D' | '30D' | '90D';
export interface Measurement { value: number; start: string; end: string; updated: number; source: string; unit: string; classification: string; periodDescription?: string }
const days: Record<Period, number> = { '24H': 1, '7D': 7, '30D': 30, '90D': 90 };
const candleResponse = z.object({ candles: z.array(z.object({ close: z.number().positive(), closeTime: z.number(), openTime: z.number() })), candlesFetchedAt: z.number() });
const quoteResponse = z.object({ price: z.number().positive().finite(), previousClose: z.number().positive().finite(), observedAt: z.number().positive().finite(), fetchedAt: z.number().finite() });
const fredResponse = z.object({ observations: z.array(z.object({ date: z.string(), value: z.number().positive() })), fetchedAt: z.number() });

export async function fetchMeasurement(kind: 'binance' | 'fred' | 'finnhub', id: string, period: Period, signal?: AbortSignal): Promise<Measurement | null> {
  if (kind === 'finnhub' && period !== '24H') return null;
  const url = kind === 'binance' ? `/api/klines?symbol=${encodeURIComponent(id)}&interval=4h&limit=550` : kind === 'finnhub' ? `/api/economy/quote?symbol=${encodeURIComponent(id)}` : `/api/economy/series?series=${encodeURIComponent(id)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(response.status === 429 || response.status === 503 ? 'Source unavailable or rate limited. Try again later.' : 'Source unavailable. Try again later.');
  const json: unknown = await response.json();
  if (kind === 'binance') {
    const data = candleResponse.parse(json);
    const completed = data.candles.filter((candle) => candle.closeTime <= Date.now()).sort((a, b) => a.closeTime - b.closeTime);
    const last = completed.at(-1);
    const first = completed.at(-(days[period] * 6 + 1));
    if (!last || !first || last.closeTime - first.closeTime !== days[period] * 86_400_000) return null;
    return { value: (last.close / first.close - 1) * 100, start: new Date(first.closeTime).toISOString(), end: new Date(last.closeTime).toISOString(), updated: data.candlesFetchedAt, source: 'Binance Spot', unit: 'USDT', classification: 'Price performance proxy' };
  }
  if (kind === 'finnhub') {
    const quote = quoteResponse.parse(json);
    return { value: (quote.price / quote.previousClose - 1) * 100, start: '', end: new Date(quote.observedAt).toISOString(), updated: quote.fetchedAt, source: 'Finnhub', unit: 'USD', classification: 'Price performance proxy', periodDescription: 'Since previous close, not a rolling 24 hours' };
  }
  const data = fredResponse.parse(json);
  const observations = [...data.observations].sort((a, b) => b.date.localeCompare(a.date));
  const last = observations[0];
  if (!last) return null;
  const cutoff = Date.parse(`${last.date}T00:00:00Z`) - days[period] * 86_400_000;
  const first = observations.find((item) => Date.parse(`${item.date}T00:00:00Z`) <= cutoff);
  if (!first) return null;
  return { value: (last.value / first.value - 1) * 100, start: first.date, end: last.date, updated: data.fetchedAt, source: 'FRED', unit: 'daily reference', classification: 'Price / exchange-rate proxy' };
}

export function bubbleSize(value: number | null, max: number): number {
  if (value === null || !Number.isFinite(value) || max <= 0) return 112;
  return 112 + Math.sqrt(Math.abs(value) / max) * 65;
}
