import { describe, expect, it } from 'vitest';
import type { TakeProfitSummary, TakeProfitTarget } from '@/lib/calculations/ladders';
import { displayProfit, displayTargetProfits } from './profit-display';

const targets = (profits: number[]) => profits.map((estimatedNetProfit) => ({estimatedNetProfit}) as TakeProfitTarget);
const summary = (proceeds: number, invested: number, unsoldQuantity = 0) => ({estimatedTotalNetProceeds:proceeds,totalInvestedCapital:invested,unsoldQuantity}) as TakeProfitSummary;

describe('displayed target profits', () => {
  it('allocates rounding so target amounts reconcile with displayed proceeds minus investment', () => {
    const values = targets([1.006, 2.006, 3.006, 4.006]);
    const totals = summary(110.024, 100);
    const result = displayTargetProfits(values, totals);
    expect(result).toEqual([1.01, 2, 3.01, 4]);
    expect(Math.round(result.reduce((sum, amount) => sum + amount, 0) * 100)).toBe(Math.round(displayProfit(totals) * 100));
    expect(values.map((value) => value.estimatedNetProfit)).toEqual([1.006, 2.006, 3.006, 4.006]);
  });
  it('does not absorb unsold position costs or material calculation differences into a target', () => {
    const values = targets([1.01, 2.01]);
    expect(displayTargetProfits(values, summary(100, 110, 1))).toEqual([1.01, 2.01]);
    expect(displayTargetProfits(values, summary(100, 110))).toEqual([1.01, 2.01]);
  });
});
