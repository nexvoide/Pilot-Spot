import { describe, expect, it } from 'vitest';
import { scanPivotZones } from './zone-scanner';
import type { MarketCandle } from '../binance/types';

function candle(index: number, low: number, high: number, close: number): MarketCandle {
  return { openTime: index, closeTime: index + 1, open: close, high, low, close, volume: 1 };
}

describe('pivot zone scanner', () => {
  it('publishes a pivot one closed bar after confirmation and retains it when broken', () => {
    const bars = Array.from({ length: 31 }, (_, i) => candle(i, i === 15 ? 90 : 99, 101, 100));
    expect(scanPivotZones([...bars, candle(31, 99, 101, 100)], '0.01')).toEqual([]);
    bars.push(candle(31, 99, 101, 100));
    const active = scanPivotZones([...bars, candle(32, 99, 101, 100)], '0.01');
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ kind: 'support', price: 90, broken: false });
    bars.push(candle(32, 80, 101, 85));
    const broken = scanPivotZones([...bars, candle(33, 99, 101, 100)], '0.01');
    expect(broken[0]).toEqual({ ...active[0], broken: true });
  });

  it('ignores a break on the unfinished candle', () => {
    const bars = Array.from({ length: 32 }, (_, i) => candle(i, i === 15 ? 90 : 99, 101, 100));
    expect(scanPivotZones([...bars, candle(32, 80, 101, 85)], '0.01')[0].broken).toBe(false);
  });
});
