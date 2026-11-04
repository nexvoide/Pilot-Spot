import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { quantizePrice, quantizeQuantity, validateOrder } from './exchange-filters';

describe('Binance increment and order validation', () => {
  it.each([
    ['BTC', '90000.129', '0.01', '90000.12', '90000.13'],
    ['ETH', '3000.129', '0.01', '3000.12', '3000.13'],
    ['SOL', '91.23456', '0.001', '91.234', '91.235'],
    ['SUI', '0.99999', '0.0001', '0.9999', '1'],
    ['ZEC', '1234.555', '0.01', '1234.55', '1234.56'],
    ['low price', '0.0000000199', '0.00000001', '0.00000001', '0.00000002'],
  ])('%s rounds buy down and sell up', (_asset, price, tick, down, up) => {
    expect(quantizePrice(price, tick, 'buy').eq(down)).toBe(true);
    expect(quantizePrice(price, tick, 'sell').eq(up)).toBe(true);
  });

  it('rounds quantities down and validates quantity and notional limits', () => {
    const filters = {
      tickSize: '0.01',
      stepSize: '0.001',
      minQty: '0.01',
      maxQty: '10',
      minNotional: '5',
      maxNotional: '1000',
    };
    expect(quantizeQuantity('1.000999', filters.stepSize).toString()).toBe('1');
    expect(validateOrder(new Decimal('100'), new Decimal('0.009'), filters)).toMatch(/minimum/);
    expect(validateOrder(new Decimal('100'), new Decimal('0.01'), filters)).toMatch(/minimum/);
    expect(validateOrder(new Decimal('101'), new Decimal('10'), filters)).toMatch(/maximum/);
    expect(validateOrder(new Decimal('100'), new Decimal('11'), filters)).toMatch(/maximum/);
    expect(validateOrder(new Decimal('100'), new Decimal('1'), filters)).toBeNull();
  });

  it('rejects invalid and non-positive values', () => {
    for (const value of ['0', '-1', 'NaN', 'Infinity']) {
      expect(() => quantizePrice(value, '0.01', 'buy')).toThrow();
    }
  });

  it('preserves long increments immediately above, below, and on a boundary', () => {
    const step = '0.00000000000000000000000001';
    expect(quantizeQuantity('0.000000000000000000000000019', step).eq(step)).toBe(true);
    expect(quantizeQuantity(step, step).eq(step)).toBe(true);
    expect(quantizeQuantity('0.000000000000000000000000009', step).isZero()).toBe(true);
    expect(
      quantizePrice('12345678901234567890.000000000000000000000000019', step, 'sell').eq(
        '12345678901234567890.00000000000000000000000002',
      ),
    ).toBe(true);
  });

  it('detects a minimum notional failure caused by rounding down', () => {
    const filters = {
      tickSize: '0.01',
      stepSize: '0.1',
      minQty: '0.1',
      maxQty: '100',
      minNotional: '10',
      maxNotional: null,
    };
    const quantity = quantizeQuantity('0.99999', filters.stepSize);
    expect(validateOrder(new Decimal('10'), quantity, filters)).toMatch(/minimum/);
  });
});
