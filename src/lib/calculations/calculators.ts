import Decimal from './financial-decimal';

export interface AverageBuyInput {
  amount: number | string;
  price: number | string;
}

export interface AverageBuyResult {
  averagePrice: number;
  totalAmount: number;
  totalQuantity: number;
}

export interface ProfitCalculationInput {
  buyPrice: number | string;
  feePercent: number | string;
  investment: number | string;
  sellPrice: number | string;
}

export interface ProfitCalculationResult {
  grossProfit: number;
  netProfit: number;
  proceeds: number;
  quantity: number;
  totalFees: number;
}

function assertPositiveFinite(value: number | string, name: string): void {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.lte(0)) {
    throw new Error(`${name} must be a positive number.`);
  }
}

export function calculateAverageBuy(inputs: AverageBuyInput[]): AverageBuyResult {
  if (inputs.length === 0) {
    throw new Error('Add at least one buy to calculate an average price.');
  }

  let totalAmount = new Decimal(0);
  let totalQuantity = new Decimal(0);

  for (const input of inputs) {
    assertPositiveFinite(input.amount, 'Buy amount');
    assertPositiveFinite(input.price, 'Buy price');
    totalAmount = totalAmount.plus(input.amount);
    totalQuantity = totalQuantity.plus(new Decimal(input.amount).div(input.price));
  }

  return {
    averagePrice: totalAmount.div(totalQuantity).toNumber(),
    totalAmount: totalAmount.toNumber(),
    totalQuantity: totalQuantity.toNumber(),
  };
}

export function calculateProfit(input: ProfitCalculationInput): ProfitCalculationResult {
  assertPositiveFinite(input.buyPrice, 'Buy price');
  assertPositiveFinite(input.sellPrice, 'Sell price');
  assertPositiveFinite(input.investment, 'Investment');

  const feePercent = new Decimal(input.feePercent);
  if (!feePercent.isFinite() || feePercent.lt(0) || feePercent.gt(100)) {
    throw new Error('Fee percentage must be between 0 and 100.');
  }

  const quantity = new Decimal(input.investment).div(input.buyPrice);
  const proceeds = quantity.mul(input.sellPrice);
  const grossProfit = proceeds.minus(input.investment);
  const totalFees = proceeds.plus(input.investment).mul(input.feePercent).div(100);

  return {
    grossProfit: grossProfit.toNumber(),
    netProfit: grossProfit.minus(totalFees).toNumber(),
    proceeds: proceeds.toNumber(),
    quantity: quantity.toNumber(),
    totalFees: totalFees.toNumber(),
  };
}
