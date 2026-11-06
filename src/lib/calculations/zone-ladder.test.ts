import { describe, expect, it, vi } from 'vitest';
import * as scanner from '../analysis/zone-scanner';
import { prepareZoneAnalysis } from '../analysis/zone-analysis';
import type { MarketCandle } from '../binance/types';
import { buildTechnicalLadder } from './ladders';

function series(amplitude: number): MarketCandle[] {
  return Array.from({ length: 250 }, (_, index) => {
    const center = 100 + amplitude * Math.sin(index * 2 * Math.PI / 40);
    return { openTime: index, closeTime: index + 1, open: center, close: center, high: center + 1, low: center - 1, volume: 1 };
  });
}

const filters = { tickSize: '0.01', stepSize: '0.00001', minQty: '0', maxQty: '1000000', minNotional: null, maxNotional: null };

describe('zone-based ladder', () => {
  it('uses only the selected timeframe and does not invent missing levels', () => {
    const candles = { '15m': series(10), '1h': series(20), '4h': series(30) };
    const analysis = prepareZoneAnalysis(candles);
    const short = buildTechnicalLadder(analysis, 1000, 100, filters, '15m');
    const long = buildTechnicalLadder(analysis, 1000, 100, filters, '4h');
    expect(short.reason).toBeNull();
    expect(long.reason).toBeNull();
    expect(short.buyingLevels).toHaveLength(1);
    expect(short.takeProfitTargets).toHaveLength(1);
    expect(short.buyingLevels[0].price).toBe(89);
    expect(short.takeProfitTargets[0].price).toBe(111);
    expect(long.buyingLevels[0].price).toBe(69);
    expect(long.takeProfitTargets[0].price).toBe(131);
    expect(short.buyingLevels[0].allocationPercent).toBe(100);
  });
  it('uses one lower-center buy per overlapping active and broken area', () => {
    const spy = vi.spyOn(scanner, 'scanPivotZones').mockReturnValue([
      { kind: 'support', price: 93.5, lower: 92, upper: 95, broken: true },
      { kind: 'support', price: 93, lower: 91, upper: 95, broken: false },
      { kind: 'support', price: 80, lower: 79, upper: 81, broken: true },
      { kind: 'resistance', price: 110, lower: 109, upper: 112, broken: false },
      { kind: 'resistance', price: 111, lower: 110, upper: 113, broken: true },
      { kind: 'resistance', price: 130, lower: 129, upper: 131, broken: true },
    ]);
    try {
      const candles = { '15m': series(10), '1h': series(10), '4h': series(10) };
      const plan = buildTechnicalLadder(prepareZoneAnalysis(candles), 1000, 100, filters, '15m');
      expect(plan.reason).toBeNull();
      expect(plan.buyingLevels.map((level) => level.price)).toEqual([93, 80]);
      expect(plan.takeProfitTargets.map((target) => target.price)).toEqual([110, 130]);
      expect(plan.buyingLevels[0].reasons[0]).toContain('1 active, 1 broken');
      expect(plan.buyingLevels.map((level) => level.allocationPercent)).toEqual([50, 50]);
    } finally {
      spy.mockRestore();
    }
  });

});
