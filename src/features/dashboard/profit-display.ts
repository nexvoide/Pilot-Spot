import Decimal from '@/lib/calculations/financial-decimal';
import type { TakeProfitTarget, TakeProfitSummary } from '@/lib/calculations/ladders';

export function displayProfit(summary: Pick<TakeProfitSummary, 'estimatedTotalNetProceeds' | 'totalInvestedCapital'>): number {
  return new Decimal(summary.estimatedTotalNetProceeds).toDecimalPlaces(2)
    .minus(new Decimal(summary.totalInvestedCapital).toDecimalPlaces(2)).toNumber();
}

/** Allocate display rounding across targets without changing the underlying profit calculations. */
export function displayTargetProfits(targets: TakeProfitTarget[], summary: TakeProfitSummary | null): number[] {
  let cumulative = new Decimal(0);
  let displayed = new Decimal(0);
  const profits = targets.map((target) => {
    cumulative = cumulative.plus(target.estimatedNetProfit);
    const rounded = cumulative.toDecimalPlaces(2);
    const portion = rounded.minus(displayed);
    displayed = rounded;
    return portion;
  });
  if (summary && summary.unsoldQuantity === 0 && profits.length > 0) {
    const adjustment = new Decimal(displayProfit(summary)).minus(displayed);
    // Only reconcile presentation rounding, never an unaccounted position or a calculation mismatch.
    if (adjustment.abs().lte('0.02')) profits[profits.length - 1] = profits[profits.length - 1].plus(adjustment);
  }
  return profits.map((profit) => profit.toNumber());
}
