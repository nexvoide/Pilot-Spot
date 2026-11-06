import { describe, expect, it, vi } from 'vitest';
import { classicBuyingCandidates, classicTargetCandidates } from './classic-ladder';
import type { IndicatorZone } from './classic-ladder';
import { prepareZoneAnalysis } from '../analysis/zone-analysis';
import * as scanner from '../analysis/zone-scanner';
import { buildTechnicalLadder } from './ladders';
import Decimal from './financial-decimal';
import type { MarketCandle } from '../binance/types';

const candles: MarketCandle[] = Array.from({ length: 50 }, (_, index) => ({
  openTime: index, closeTime: index + 1, open: 100, high: 101, low: 99, close: 100, volume: 1,
}));
const analysis = () => prepareZoneAnalysis({ '15m': candles, '1h': candles, '4h': candles });
const zone = (overrides: Partial<IndicatorZone>): IndicatorZone => ({
  kind: 'support', timeframe: '4h', price: 99.1, lower: 98.8, upper: 99.3, broken: true, ...overrides,
});

describe('classic indicator confluence', () => {
  it('selects nearby broken support and active resistance centers', () => {
    const zones = [zone({}), zone({ kind: 'resistance', timeframe: '1h', price: 100.5, lower: 100.3, upper: 100.7, broken: false })];
    const buy = classicBuyingCandidates(analysis(), 100, 1, 'balanced', zones)[0];
    const sell = classicTargetCandidates(analysis(), 100, new Decimal(95), 0.5, 'balanced', zones)[0];
    expect(buy.price.toNumber()).toBe(99.1);
    expect(buy.estimated).toBe(false);
    expect(buy.reasons.join(' ')).toContain('4H indicator broken historical support');
    expect(sell.price.toNumber()).toBe(100.5);
    expect(sell.estimated).toBe(false);
    expect(sell.reasons.join(' ')).toContain('1H indicator active resistance');
  });

  it('keeps the projected price estimated when it is inside an area but far from its center', () => {
    const buy = classicBuyingCandidates(analysis(), 100, 1, 'balanced', [zone({ price: 98.8, lower: 98.6, upper: 99.2 })])[0];
    expect(buy.price.toNumber()).toBe(99.1);
    expect(buy.estimated).toBe(true);
    expect(buy.reasons.join(' ')).toContain('Inside 4H indicator broken historical support area');
  });

  it('scans completed candles on all three classic timeframes', () => {
    const spy = vi.spyOn(scanner, 'scanPivotZones').mockReturnValue([]);
    try {
      const data = analysis();
      data.timeframes['15m'].atr = 1;
      const filters = { tickSize: '0.01', stepSize: '0.001', minQty: '0', maxQty: '100000', minNotional: null, maxNotional: null };
      const plan = buildTechnicalLadder(data, 1000, 100, filters, 'balanced');
      expect(plan.reason).toBeNull();
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy.mock.calls.every(([series]) => series.length === candles.length)).toBe(true);
    } finally { spy.mockRestore(); }
  });
});
