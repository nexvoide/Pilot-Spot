import type { MarketCandle } from '../binance/types.js';
import Decimal from '../calculations/financial-decimal.js';

export interface PivotZone {
  kind: 'support' | 'resistance';
  price: number;
  lower: number;
  upper: number;
  broken: boolean;
}

// Derived from the user-supplied Clear Support & Resistance script,
// © LuxAlgo, licensed under CC BY-NC-SA 4.0.
export function scanPivotZones(candles: MarketCandle[], tickSize: string): PivotZone[] {
  const tick = new Decimal(tickSize);
  if (!tick.isFinite() || tick.lte(0)) throw new Error('Invalid tick size.');
  const completed = candles.slice(0, -1);
  const zones: PivotZone[] = [];
  let atr: number | null = null;
  let initialRange = 0;
  const atrValues: Array<number | null> = [];
  const roundTick = (value: number) => new Decimal(value).div(tick).round().mul(tick).toNumber();

  for (let i = 0; i < completed.length; i++) {
    const candle = completed[i];
    if (![candle.high, candle.low, candle.close, candle.open].every(Number.isFinite) ||
        candle.low <= 0 || candle.high < candle.low || candle.close < candle.low ||
        candle.close > candle.high || candle.open < candle.low || candle.open > candle.high) {
      throw new Error('Invalid candle data.');
    }
    const previous = completed[i - 1];
    const range = previous ? Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close)) : candle.high - candle.low;
    if (i < 14) {
      initialRange += range;
      if (i === 13) atr = initialRange / 14;
    } else if (atr !== null) atr = (atr * 13 + range) / 14;
    atrValues.push(atr);

    for (const zone of zones) {
      if (!zone.broken && (zone.kind === 'support' ? candle.close < zone.lower : candle.close > zone.upper)) zone.broken = true;
    }
    // The source publishes a pivot one closed bar after its 15-bar confirmation.
    const pivotIndex = i - 16;
    if (pivotIndex < 15) continue;
    const pivot = completed[pivotIndex];
    const left = completed.slice(pivotIndex - 15, pivotIndex);
    const right = completed.slice(pivotIndex + 1, pivotIndex + 16);
    const isLow = left.every((bar) => bar.low >= pivot.low) && right.every((bar) => bar.low > pivot.low);
    const isHigh = left.every((bar) => bar.high <= pivot.high) && right.every((bar) => bar.high < pivot.high);
    const halfWidth = Math.max(tick.toNumber(), (atrValues[i - 1] ?? 0) * 0.5);
    for (const [kind, price, matches] of [['support', pivot.low, isLow], ['resistance', pivot.high, isHigh]] as const) {
      if (!matches) continue;
      const lower = roundTick(price - halfWidth);
      const upper = roundTick(price + halfWidth);
      zones.push({ kind, price, lower, upper, broken: kind === 'support' ? candle.close < lower : candle.close > upper });
      if (zones.length > 400) zones.shift();
    }
  }
  return zones;
}
