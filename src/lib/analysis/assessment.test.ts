import { describe, expect, it } from 'vitest';
import { analyzeMarket, analyzeTimeframe } from '@/lib/analysis/assessment';
import { calculateAtr, calculateEma, calculateRsi } from '@/lib/analysis/indicators';
import type { MarketCandle } from '@/lib/binance/types';

function makeCandles(direction: 'down' | 'up', count: number): MarketCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const drift = direction === 'up' ? index : -index;
    const close = 200 + drift;

    return {
      close,
      closeTime: (index + 1) * 60_000,
      high: close + 2,
      low: close - 2,
      open: close - (direction === 'up' ? 0.5 : -0.5),
      openTime: index * 60_000,
      volume: 100 + (index === count - 1 ? 20 : 0),
    };
  });
}

describe('technical indicators', () => {
  it('calculates EMA only after its initial period', () => {
    expect(calculateEma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('calculates RSI and ATR using Wilder smoothing', () => {
    const candles = makeCandles('up', 20);
    const rsi = calculateRsi(
      candles.map((candle) => candle.close),
      14,
    );
    const atr = calculateAtr(candles, 14);

    expect(rsi.at(-1)).toBe(100);
    expect(atr.at(-1)).toBeCloseTo(4, 8);
  });
});

describe('market assessment', () => {
  it('withholds a setup when any required timeframe has insufficient history', () => {
    const insufficientCandles = makeCandles('up', 50);
    const result = analyzeMarket({
      '15m': insufficientCandles,
      '1h': insufficientCandles,
      '4h': insufficientCandles,
    });

    expect(result.assessment.status).toBe('NO RELIABLE SETUP');
    expect(result.assessment.invalidationLevel).toBeNull();
  });

  it('treats a bearish 4-hour trend as context instead of overriding the 15-minute view', () => {
    const result = analyzeMarket({
      '15m': makeCandles('up', 100),
      '1h': makeCandles('up', 100),
      '4h': makeCandles('down', 100),
    });

    expect(result.timeframes['4h'].trend).toBe('bearish');
    expect(result.timeframes['1h'].trend).toBe('bullish');
    expect(result.assessment.status).not.toBe('UNFAVOURABLE MARKET');
    expect(result.assessment.confidence).toBe('Low');
  });

  it('does not create a setup from an uptrend without reliable zones', () => {
    const analysis = analyzeTimeframe(makeCandles('up', 100));

    expect(analysis.trend).toBe('bullish');
    expect(analysis.zones).toEqual([]);
  });
});
