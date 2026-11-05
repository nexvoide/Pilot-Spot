import type { MarketCandle } from '../binance/types.js';

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function toFiniteNumbers(values: number[]): number[] {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Indicator input contains a non-finite number.');
  }

  return values;
}

export function calculateEma(values: number[], period: number): Array<number | null> {
  assertPositiveInteger(period, 'EMA period');
  toFiniteNumbers(values);

  const result: Array<number | null> = Array.from({ length: values.length }, () => null);

  if (values.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  result[period - 1] = ema;

  for (let index = period; index < values.length; index += 1) {
    ema = (values[index] - ema) * multiplier + ema;
    result[index] = ema;
  }

  return result;
}

export function calculateRsi(values: number[], period: number): Array<number | null> {
  assertPositiveInteger(period, 'RSI period');
  toFiniteNumbers(values);

  const result: Array<number | null> = Array.from({ length: values.length }, () => null);

  if (values.length <= period) {
    return result;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const difference = values[index] - values[index - 1];
    gains += Math.max(difference, 0);
    losses += Math.max(-difference, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = calculateRsiValue(averageGain, averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const difference = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(difference, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-difference, 0)) / period;
    result[index] = calculateRsiValue(averageGain, averageLoss);
  }

  return result;
}

function calculateRsiValue(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function calculateAtr(candles: MarketCandle[], period: number): Array<number | null> {
  assertPositiveInteger(period, 'ATR period');
  const result: Array<number | null> = Array.from({ length: candles.length }, () => null);

  if (candles.length <= period) {
    return result;
  }

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  let atr = trueRanges.slice(1, period + 1).reduce((total, range) => total + range, 0) / period;
  result[period] = atr;

  for (let index = period + 1; index < trueRanges.length; index += 1) {
    atr = (atr * (period - 1) + trueRanges[index]) / period;
    result[index] = atr;
  }

  return result;
}

export function lastDefinedValue(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) {
      return values[index];
    }
  }

  return null;
}
