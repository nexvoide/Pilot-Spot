import { describe, expect, it } from 'vitest';
import { calculateAverageBuy, calculateProfit } from '@/lib/calculations/calculators';

describe('calculateAverageBuy', () => {
  it('calculates a weighted average from USDT buy amounts', () => {
    expect(
      calculateAverageBuy([
        { amount: 100, price: 10 },
        { amount: 100, price: 5 },
      ]),
    ).toEqual({ averagePrice: 20 / 3, totalAmount: 200, totalQuantity: 30 });
  });

  it('supports an existing holding represented by its quantity and average cost', () => {
    const existingQuantity = 27.545045;
    const existingAveragePrice = 113.41;
    const nextBuyAmount = 1355;
    const nextBuyPrice = 90;

    const result = calculateAverageBuy([
      { amount: existingQuantity * existingAveragePrice, price: existingAveragePrice },
      { amount: nextBuyAmount, price: nextBuyPrice },
    ]);

    expect(result.totalQuantity).toBeCloseTo(42.6006005556, 8);
    expect(result.averagePrice).toBeCloseTo(105.1366294146, 8);
  });

  it('rejects non-positive inputs', () => {
    expect(() => calculateAverageBuy([{ amount: 0, price: 10 }])).toThrow(/positive/i);
  });

  it('retains decimal inputs until the presentation result', () => {
    const result = calculateAverageBuy([
      { amount: '0.1', price: '0.2' },
      { amount: '0.2', price: '0.4' },
    ]);
    expect(result.totalAmount).toBe(0.3);
    expect(result.totalQuantity).toBe(1);
    expect(result.averagePrice).toBe(0.3);
  });

  it.each(['0', '-1', 'NaN', 'Infinity'])('rejects invalid amounts: %s', (amount) => {
    expect(() => calculateAverageBuy([{ amount, price: '1' }])).toThrow();
  });
});

describe('calculateProfit', () => {
  it('includes fees on both the buy and sell side', () => {
    expect(
      calculateProfit({ buyPrice: 10, feePercent: 1, investment: 100, sellPrice: 12 }),
    ).toEqual({
      grossProfit: 20,
      netProfit: 17.8,
      proceeds: 120,
      quantity: 10,
      totalFees: 2.2,
    });
  });

  it('rejects an invalid fee percentage', () => {
    expect(() =>
      calculateProfit({ buyPrice: 10, feePercent: 101, investment: 100, sellPrice: 12 }),
    ).toThrow(/between 0 and 100/i);
  });

  it('calculates tiny fees without binary floating-point accumulation', () => {
    const result = calculateProfit({
      buyPrice: '0.1',
      sellPrice: '0.3',
      investment: '0.2',
      feePercent: '0.1',
    });
    expect(result.grossProfit).toBe(0.4);
    expect(result.totalFees).toBe(0.0008);
    expect(result.netProfit).toBe(0.3992);
  });
});
