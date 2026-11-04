import { describe, expect, it } from 'vitest';
import type { MultiTimeframeAnalysis, TimeframeAnalysis } from '@/lib/analysis/types';
import type { MarketCandle } from '@/lib/binance/types';
import { buildTechnicalLadder, validateLadderAgainstLivePrice } from '@/lib/calculations/ladders';

const zones = [
  { kind: 'support' as const, price: 97, touches: 3 },
  { kind: 'support' as const, price: 96, touches: 2 },
  { kind: 'resistance' as const, price: 110, touches: 2 },
  { kind: 'resistance' as const, price: 120, touches: 2 },
];

function timeframe(overrides: Partial<TimeframeAnalysis> = {}): TimeframeAnalysis {
  return {
    atr: 2,
    candles: [],
    ema: { ema20: 97, ema50: 96, ema7: 99 },
    latestClose: 100,
    momentum: 'bullish',
    rsi: 60,
    structure: { direction: 'bullish', swingHighs: [], swingLows: [] },
    trend: 'bullish',
    volumeConfirmed: true,
    volumeRatio: 1.2,
    zones,
    ...overrides,
  };
}

function candlesWithRange(low: number, high: number): MarketCandle[] {
  return Array.from({ length: 96 }, (_, index) => ({
    close: 100,
    closeTime: index + 1,
    high,
    low,
    open: 100,
    openTime: index,
    volume: 100,
  }));
}

function makeAnalysis(
  status: MultiTimeframeAnalysis['assessment']['status'],
  overrides: Partial<MultiTimeframeAnalysis> = {},
): MultiTimeframeAnalysis {
  const primary = timeframe();
  return {
    assessment: {
      confidence: 'Medium',
      downside: 5,
      invalidationLevel: 95,
      reason: 'Test setup',
      riskReward: 2,
      status,
      support: zones[0],
      target: zones[2],
      technicalSummary: 'Test setup',
      upside: 10,
    },
    timeframes: {
      '15m': primary,
      '1h': primary,
      '4h': primary,
    },
    ...overrides,
  };
}

function expectCompletePlan(ladder: ReturnType<typeof buildTechnicalLadder>) {
  expect(ladder.reason).toBeNull();
  expect(ladder.buyingLevels).toHaveLength(4);
  expect(ladder.takeProfitTargets).toHaveLength(4);
  expect(ladder.averageEntry).not.toBeNull();
  expect(ladder.invalidationLevel).not.toBeNull();
  expect(ladder.buyingLevels.reduce((total, level) => total + level.allocation, 0)).toBe(1_000);
  expect(ladder.buyingLevels.every((level) => level.allocationPercent === 25)).toBe(true);
  expect(ladder.buyingLevels.every((level) => level.allocation === 250)).toBe(true);
  expect(ladder.takeProfitTargets.map((target) => target.allocationPercent)).toEqual([
    20, 30, 30, 20,
  ]);
  expect(ladder.buyingLevels.map((level) => level.price)).toEqual(
    [...ladder.buyingLevels.map((level) => level.price)].sort((left, right) => right - left),
  );
  expect(ladder.takeProfitTargets.map((target) => target.price)).toEqual(
    [...ladder.takeProfitTargets.map((target) => target.price)].sort((left, right) => left - right),
  );
  expect(
    ladder.takeProfitTargets.every((target) => target.price > (ladder.averageEntry ?? 0)),
  ).toBe(true);
  expect(ladder.takeProfitTargets.every((target) => target.outcome === 'profit')).toBe(true);
  const totalPurchasedQuantity = ladder.buyingLevels.reduce(
    (total, level) => total + level.quantity,
    0,
  );
  const totalTargetQuantity = ladder.takeProfitTargets.reduce(
    (total, target) => total + target.quantity,
    0,
  );
  expect(totalTargetQuantity).toBeCloseTo(totalPurchasedQuantity, 10);
  expect(ladder.buyingSummary?.weightedAverageEntry).toBeCloseTo(ladder.averageEntry ?? 0, 10);
  expect(ladder.takeProfitSummary?.totalEstimatedNetProfit).toBeCloseTo(
    ladder.takeProfitTargets.reduce((total, target) => total + target.estimatedNetProfit, 0),
    10,
  );
}

describe('buildTechnicalLadder', () => {
  it('changes both buy and sell prices across modes when technical zones are present', () => {
    const analysis = makeAnalysis('BUY SETUP DEVELOPING');
    const modes = (['aggressive', 'balanced', 'extended'] as const).map((mode) =>
      buildTechnicalLadder(analysis, 1000, 100, undefined, mode),
    );
    for (const ladder of modes) expectCompletePlan(ladder);
    expect(new Set(modes.map((ladder) => ladder.buyingLevels.map((level) => level.price).join(','))).size).toBe(3);
    expect(new Set(modes.map((ladder) => ladder.takeProfitTargets.map((level) => level.price).join(','))).size).toBe(3);
    expect(modes[0].buyingLevels[3].price).toBeGreaterThan(modes[1].buyingLevels[3].price);
    expect(modes[1].buyingLevels[3].price).toBeGreaterThan(modes[2].buyingLevels[3].price);
  });
  it('adjusts estimated buy and target spacing across the three planning modes', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(94, 106),
      zones: [],
      ema: { ema7: null, ema20: null, ema50: null },
    });
    const analysis = makeAnalysis('NO RELIABLE SETUP', {
      timeframes: { '15m': primary, '1h': primary, '4h': primary },
    });
    const aggressive = buildTechnicalLadder(analysis, 1000, 100, undefined, 'aggressive');
    const balanced = buildTechnicalLadder(analysis, 1000, 100, undefined, 'balanced');
    const extended = buildTechnicalLadder(analysis, 1000, 100, undefined, 'extended');
    for (const ladder of [aggressive, balanced, extended]) expectCompletePlan(ladder);
    expect(aggressive.buyingLevels[0].price).toBeCloseTo(100 - 1.44 * 0.65 * 0.55, 8);
    expect(aggressive.buyingLevels[3].price).toBeCloseTo(100 - 1.44 * 0.65 * 4.2, 8);
    expect(balanced.buyingLevels[3].price).toBeCloseTo(100 - 1.44 * 4.7, 8);
    expect(extended.buyingLevels[3].price).toBeCloseTo(100 - 1.44 * 1.4 * 5.2, 8);
    expect(aggressive.buyingLevels[3].price).toBeGreaterThan(balanced.buyingLevels[3].price);
    expect(balanced.buyingLevels[3].price).toBeGreaterThan(extended.buyingLevels[3].price);
    expect(aggressive.takeProfitTargets[3].price).toBeLessThan(balanced.takeProfitTargets[3].price);
    expect(balanced.takeProfitTargets[3].price).toBeLessThan(extended.takeProfitTargets[3].price);
    expect(aggressive.takeProfitTargets[0].price).toBeCloseTo(100.468, 8);
    expect(balanced.takeProfitTargets[0].price).toBeCloseTo(100.72, 8);
    extended.buyingLevels.forEach((level, index) => {
      expect(100 - level.price).toBeCloseTo(extended.takeProfitTargets[index].price - 100, 8);
    });
  });
  it('keeps targets in a closer volatility-scaled range instead of choosing distant resistance', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(94, 106),
      zones: [
        { kind: 'support', price: 98, touches: 3 },
        { kind: 'resistance', price: 100.01, touches: 3 },
        { kind: 'resistance', price: 130, touches: 4 },
      ],
    });
    const analysis = makeAnalysis('NO RELIABLE SETUP', {
      timeframes: { '15m': primary, '1h': primary, '4h': primary },
    });
    const ladder = buildTechnicalLadder(analysis, 1000, 100);
    expectCompletePlan(ladder);
    expect(ladder.takeProfitTargets[0].price).toBeGreaterThanOrEqual(100.3);
    expect(ladder.takeProfitTargets[3].price).toBeLessThanOrEqual(104.2);
    expect(ladder.takeProfitTargets.every((target) => target.estimated)).toBe(true);
  });

  it('uses resistance close to the projected targets when it is available', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(94, 106),
      zones: [
        { kind: 'support', price: 98, touches: 3 },
        { kind: 'resistance', price: 100.74, touches: 3 },
      ],
    });
    const analysis = makeAnalysis('NO RELIABLE SETUP', {
      timeframes: { '15m': primary, '1h': primary, '4h': primary },
    });
    const ladder = buildTechnicalLadder(analysis, 1000, 100);
    expect(ladder.reason).toBeNull();
    expect(ladder.takeProfitTargets[0]).toMatchObject({ price: 100.74, estimated: false });
  });
  it('fails safely when a very large order cannot be represented accurately for display', () => {
    const filters = {
      tickSize: '0.0001',
      stepSize: '0.00001',
      minQty: '0.00001',
      maxQty: '999999999999999999999999999999',
      minNotional: '1',
      maxNotional: null,
    };
    expect(
      buildTechnicalLadder(
        makeAnalysis('BUY SETUP DEVELOPING'),
        '9007199254740993.25',
        100,
        filters,
      ).reason,
    ).not.toBeNull();
  });
  it('quantizes orders and accounts for quantity left after the four exits', () => {
    const filters = {
      tickSize: '0.0001',
      stepSize: '0.001',
      minQty: '0.001',
      maxQty: '10000',
      minNotional: '1',
      maxNotional: null,
    };
    const ladder = buildTechnicalLadder(makeAnalysis('BUY SETUP DEVELOPING'), 1000, 100, filters);
    expect(ladder.reason).toBeNull();
    const acquired = ladder.buyingLevels.reduce((sum, level) => sum + level.quantity, 0);
    const sold = ladder.takeProfitTargets.reduce((sum, target) => sum + target.quantity, 0);
    expect(sold).toBeLessThanOrEqual(acquired + 1e-12);
    expect(ladder.takeProfitSummary?.unsoldQuantity).toBeCloseTo(acquired - sold, 9);
    expect(ladder.takeProfitTargets.map((target) => target.allocationPercent)).toEqual([
      20, 30, 30, 20,
    ]);
    expect(ladder.buyingLevels.every((level) => level.riskReward !== null)).toBe(true);
  });

  it('fails closed when the required minimum notional cannot be met', () => {
    const filters = {
      tickSize: '0.0001',
      stepSize: '0.001',
      minQty: '0.001',
      maxQty: '10000',
      minNotional: '10000',
      maxNotional: null,
    };
    expect(
      buildTechnicalLadder(makeAnalysis('BUY SETUP DEVELOPING'), 1000, 100, filters).reason,
    ).toMatch(/minimum/);
    expect(
      buildTechnicalLadder(makeAnalysis('BUY SETUP DEVELOPING'), 1000, 100, null).reason,
    ).toMatch(/filters/);
  });
  it.each([
    'BUY SETUP DEVELOPING',
    'WAIT FOR BETTER ENTRY',
    'UNFAVOURABLE MARKET',
    'NO RELIABLE SETUP',
  ] as const)('generates four equal buys and four targets independently of %s status', (status) => {
    expectCompletePlan(buildTechnicalLadder(makeAnalysis(status), 1_000));
  });

  it('keeps estimated levels visible when confirmed zones are unavailable and confidence is low', () => {
    const primary = timeframe({
      structure: { direction: 'neutral', swingHighs: [], swingLows: [] },
      trend: 'neutral',
      volumeConfirmed: false,
    });
    const analysis = makeAnalysis('NO RELIABLE SETUP', {
      assessment: {
        ...makeAnalysis('NO RELIABLE SETUP').assessment,
        confidence: 'Low',
        invalidationLevel: null,
      },
      timeframes: { '15m': primary, '1h': primary, '4h': primary },
    });
    const ladder = buildTechnicalLadder(analysis, 1_000);

    expectCompletePlan(ladder);
    expect(ladder.confidence).toBe('Low');
    expect(ladder.buyingLevels.some((level) => level.estimated)).toBe(true);
    expect(ladder.takeProfitTargets.some((target) => target.estimated)).toBe(true);
  });

  it('classifies intraday targets and calculates fee-adjusted net profit', () => {
    const ladder = buildTechnicalLadder(makeAnalysis('BUY SETUP DEVELOPING'), 1_000);

    expect(ladder.takeProfitTargets.map((target) => target.classification)).toEqual([
      'Near-term',
      'Main intraday',
      'Extended',
      'Stretch',
    ]);
    expect(ladder.takeProfitTargets[0].movementPercent).toBeGreaterThan(0);
    expect(ladder.takeProfitTargets[0].estimatedNetProfit).toBeGreaterThan(0);
  });

  it('does not fabricate levels when volatility data is invalid or unavailable', () => {
    const primary = timeframe({ atr: null });
    const analysis = makeAnalysis('NO RELIABLE SETUP', {
      timeframes: { '15m': primary, '1h': primary, '4h': primary },
    });
    const ladder = buildTechnicalLadder(analysis, 1_000);

    expect(ladder.buyingLevels).toEqual([]);
    expect(ladder.takeProfitTargets).toEqual([]);
    expect(ladder.reason).toMatch(/volatility data/i);
  });

  it('rejects an invalid capital value', () => {
    const ladder = buildTechnicalLadder(makeAnalysis('BUY SETUP DEVELOPING'), 0);

    expect(ladder.buyingLevels).toEqual([]);
    expect(ladder.reason).toMatch(/greater than zero/i);
  });

  it('merges clustered support readings and keeps every buy separated by adaptive spacing', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(94, 106),
      zones: [
        { kind: 'support', price: 99.8, touches: 2 },
        { kind: 'support', price: 99.5, touches: 4 },
        { kind: 'support', price: 99.2, touches: 2 },
        { kind: 'support', price: 95, touches: 3 },
        { kind: 'resistance', price: 104, touches: 2 },
      ],
    });
    const ladder = buildTechnicalLadder(
      makeAnalysis('NO RELIABLE SETUP', {
        timeframes: { '15m': primary, '1h': primary, '4h': primary },
      }),
      1_000,
    );
    const minimumSpacing = Math.max(1 * 1.15, (106 - 94) * 0.12);
    const gaps = ladder.buyingLevels
      .slice(1)
      .map((level, index) => ladder.buyingLevels[index].price - level.price);

    expect(ladder.buyingLevels).toHaveLength(4);
    expect(gaps.every((gap) => gap >= minimumSpacing - 1e-8)).toBe(true);
    expect(ladder.buyingLevels.filter((level) => level.price > 98).length).toBeLessThanOrEqual(1);
  });

  it('widens estimated levels in a higher-volatility recent range without using range endpoints', () => {
    const lowVolatility = timeframe({ atr: 0.5, candles: candlesWithRange(99, 101), zones: [] });
    const highVolatility = timeframe({ atr: 0.5, candles: candlesWithRange(90, 110), zones: [] });
    const lowVolatilityLadder = buildTechnicalLadder(
      makeAnalysis('NO RELIABLE SETUP', {
        timeframes: { '15m': lowVolatility, '1h': lowVolatility, '4h': lowVolatility },
      }),
      1_000,
    );
    const highVolatilityLadder = buildTechnicalLadder(
      makeAnalysis('NO RELIABLE SETUP', {
        timeframes: { '15m': highVolatility, '1h': highVolatility, '4h': highVolatility },
      }),
      1_000,
    );

    expect(highVolatilityLadder.buyingSummary?.coveragePercent).toBeGreaterThan(
      lowVolatilityLadder.buyingSummary?.coveragePercent ?? 0,
    );
    expect(highVolatilityLadder.buyingLevels.some((level) => level.price === 90)).toBe(false);
    expect(highVolatilityLadder.takeProfitTargets.some((target) => target.price === 110)).toBe(
      false,
    );
  });

  it('fills target slots after excluding resistance below fee-adjusted break-even', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(96, 104),
      zones: [
        { kind: 'support', price: 97, touches: 2 },
        { kind: 'resistance', price: 100.01, touches: 2 },
        { kind: 'resistance', price: 100.03, touches: 2 },
        { kind: 'resistance', price: 100.05, touches: 2 },
        { kind: 'resistance', price: 100.07, touches: 2 },
      ],
    });
    const ladder = buildTechnicalLadder(
      makeAnalysis('NO RELIABLE SETUP', {
        assessment: { ...makeAnalysis('NO RELIABLE SETUP').assessment, invalidationLevel: 95 },
        timeframes: { '15m': primary, '1h': primary, '4h': primary },
      }),
      1_000,
    );

    expect(ladder.takeProfitTargets).toHaveLength(4);
    expect(
      ladder.takeProfitTargets.every((target) => target.price > (ladder.averageEntry ?? 0) * 1.002),
    ).toBe(true);
  });

  it('uses the supplied analysis reference price instead of an older completed-candle close', () => {
    const primary = timeframe({
      latestClose: 100,
      zones: [
        { kind: 'support', price: 99, touches: 3 },
        { kind: 'support', price: 97, touches: 2 },
        { kind: 'resistance', price: 104, touches: 2 },
      ],
    });
    const ladder = buildTechnicalLadder(
      makeAnalysis('NO RELIABLE SETUP', {
        timeframes: { '15m': primary, '1h': primary, '4h': primary },
      }),
      1_000,
      95,
    );

    expect(ladder.buyingLevels).toHaveLength(4);
    expect(ladder.buyingLevels.every((level) => level.price < 95)).toBe(true);
    expect(ladder.buyingSummary?.currentPrice).toBe(95);
  });

  it('never retains take-profit targets below the validated current price', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(96, 104),
      zones: [
        { kind: 'support', price: 99, touches: 3 },
        { kind: 'support', price: 97, touches: 2 },
        { kind: 'resistance', price: 98, touches: 5 },
        { kind: 'resistance', price: 99.5, touches: 4 },
        { kind: 'resistance', price: 101.5, touches: 3 },
      ],
    });
    const ladder = buildTechnicalLadder(
      makeAnalysis('NO RELIABLE SETUP', {
        timeframes: { '15m': primary, '1h': primary, '4h': primary },
      }),
      1_000,
      100,
    );

    expectCompletePlan(ladder);
    expect(ladder.takeProfitTargets.every((target) => target.price > 100)).toBe(true);
    expect(ladder.takeProfitTargets.some((target) => target.price === 98)).toBe(false);
    expect(ladder.takeProfitTargets.some((target) => target.price === 99.5)).toBe(false);
  });

  it('uses intraday volatility spacing rather than invalidation distance for estimated targets', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(96, 104),
      zones: [
        { kind: 'support', price: 99, touches: 3 },
        { kind: 'support', price: 97, touches: 2 },
        { kind: 'resistance', price: 101.5, touches: 3 },
      ],
    });
    const ladder = buildTechnicalLadder(
      makeAnalysis('NO RELIABLE SETUP', {
        assessment: { ...makeAnalysis('NO RELIABLE SETUP').assessment, invalidationLevel: 10 },
        timeframes: { '15m': primary, '1h': primary, '4h': primary },
      }),
      1_000,
      100,
    );

    expectCompletePlan(ladder);
    expect(ladder.takeProfitTargets.at(-1)?.price).toBeLessThan(110);
  });

  it('revalidates all plan prices when the live market price changes', () => {
    const primary = timeframe({
      atr: 1,
      candles: candlesWithRange(94, 106),
      zones: [
        { kind: 'support', price: 99, touches: 3 },
        { kind: 'support', price: 97, touches: 2 },
        { kind: 'resistance', price: 104, touches: 3 },
      ],
    });
    const analysis = makeAnalysis('NO RELIABLE SETUP', {
      timeframes: { '15m': primary, '1h': primary, '4h': primary },
    });
    const initialPlan = buildTechnicalLadder(analysis, 1_000, 100);
    const revalidatedPlan = buildTechnicalLadder(analysis, 1_000, 95);

    expectCompletePlan(initialPlan);
    expect(revalidatedPlan.buyingLevels.every((level) => level.price < 95)).toBe(true);
    expect(revalidatedPlan.takeProfitTargets.every((target) => target.price > 95)).toBe(true);
    expect(revalidatedPlan.buyingSummary?.currentPrice).toBe(95);
  });

  it('marks a plan invalid immediately when a live price crosses a buy or target', () => {
    const ladder = buildTechnicalLadder(makeAnalysis('NO RELIABLE SETUP'), 1_000, 100);

    expect(validateLadderAgainstLivePrice(ladder, 100)).toEqual({ status: 'current', valid: true });
    expect(validateLadderAgainstLivePrice(ladder, ladder.buyingLevels[0].price)).toEqual({
      status: 'buy-level-crossed',
      valid: false,
    });
    expect(validateLadderAgainstLivePrice(ladder, ladder.takeProfitTargets[0].price)).toEqual({
      status: 'target-crossed',
      valid: false,
    });
  });

  it.each([78_000, 2_300, 93, 0.89, 1_200])(
    'applies the same valid price ordering at %d USDT',
    (price) => {
      const primary = timeframe({
        atr: price * 0.01,
        candles: candlesWithRange(price * 0.94, price * 1.06),
        ema: { ema7: price * 0.995, ema20: price * 0.98, ema50: price * 0.96 },
        latestClose: price,
        zones: [
          { kind: 'support', price: price * 0.98, touches: 3 },
          { kind: 'support', price: price * 0.94, touches: 2 },
          { kind: 'resistance', price: price * 1.03, touches: 3 },
        ],
      });
      const ladder = buildTechnicalLadder(
        makeAnalysis('NO RELIABLE SETUP', {
          timeframes: { '15m': primary, '1h': primary, '4h': primary },
        }),
        1_000,
        price,
      );

      expect(ladder.reason).toBeNull();
      expect(ladder.buyingLevels.every((level) => level.price < price)).toBe(true);
      expect(ladder.takeProfitTargets.every((target) => target.price > price)).toBe(true);
      expect(
        ladder.takeProfitTargets.every(
          (target) => target.price > (ladder.averageEntry ?? 0) * 1.002,
        ),
      ).toBe(true);
    },
  );
});
