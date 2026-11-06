import { classicBuyingCandidates, classicSpacing, classicTargetCandidates, type ClassicMode, type IndicatorZone } from './classic-ladder.js';
import { scanPivotZones } from '../analysis/zone-scanner.js';
import { clusterZones } from '../analysis/zone-clusters.js';
import type { MarketCandle } from '../binance/types.js';
import type { MultiTimeframeAnalysis } from '../analysis/types.js';
import Decimal from './financial-decimal.js';
import {
  quantizePrice,
  quantizeQuantity,
  validateOrder,
  type SymbolFilters,
} from './exchange-filters.js';

export interface BuyingLevel {
  allocation: number;
  allocationPercent: number;
  estimated: boolean;
  price: number;
  quantity: number;
  reasons: string[];
  riskReward: number | null;
}

export interface TakeProfitTarget {
  allocationPercent: number;
  classification: 'Extended' | 'Main intraday' | 'Near-term' | 'Stretch';
  estimated: boolean;
  estimatedNetProfit: number;
  movementPercent: number;
  outcome: 'profit' | 'recovery';
  price: number;
  quantity: number;
  reasons: string[];
  riskReward: number | null;
}

export interface TechnicalLadder {
  averageEntry: number | null;
  buyingSummary: BuyingLadderSummary | null;
  buyingLevels: BuyingLevel[];
  confidence: 'High' | 'Low' | 'Medium' | null;
  invalidationLevel: number | null;
  reason: string | null;
  takeProfitSummary: TakeProfitSummary | null;
  takeProfitTargets: TakeProfitTarget[];
}

export type LiveLadderValidity =
  'buy-level-crossed' | 'current' | 'data-unavailable' | 'target-crossed';

export interface LiveLadderValidation {
  status: LiveLadderValidity;
  valid: boolean;
}

export interface BuyingLadderSummary {
  coveragePercent: number;
  currentPrice: number;
  distancesFromCurrentPercent: number[];
  estimatedAverageEntryIncludingFees: number;
  lowestLevel: number;
  totalPlannedInvestment: number;
  totalQuantity: number;
  weightedAverageEntry: number;
}

export interface TakeProfitSummary {
  unsoldQuantity: number;
  estimatedFees: number;
  estimatedTotalNetProceeds: number;
  totalInvestedCapital: number;
  totalEstimatedNetProfit: number;
  totalEstimatedNetReturnPercent: number;
  weightedAverageEntry: number;
}

interface PriceCandidate {
  estimated: boolean;
  price: Decimal;
  reasons: string[];
  score: number;
}

type DecimalBuyingLevel = Omit<BuyingLevel, 'allocation' | 'price' | 'quantity' | 'riskReward'> & {
  allocation: Decimal;
  price: Decimal;
  quantity: Decimal;
  riskReward: Decimal | null;
};

type DecimalTakeProfitTarget = Omit<
  TakeProfitTarget,
  'estimatedNetProfit' | 'movementPercent' | 'price' | 'quantity' | 'riskReward'
> & {
  estimatedNetProfit: Decimal;
  movementPercent: Decimal;
  price: Decimal;
  quantity: Decimal;
  riskReward: Decimal | null;
};

const ESTIMATED_FEE_PERCENT = 0.1;
export type LadderMode = '15m' | '4h' | '1d';
export type LegacyMode = ClassicMode;

export function buildTechnicalLadder(
  analysis: MultiTimeframeAnalysis,
  capital: Decimal.Value,
  referencePrice: number = analysis.timeframes['15m'].latestClose ?? Number.NaN,
  filters?: SymbolFilters | null,
  mode: LadderMode | LegacyMode = 'balanced',
  dailyCandles?: MarketCandle[],
): TechnicalLadder {
  try {
    return buildTechnicalLadderInternal(analysis, capital, referencePrice, filters, mode, dailyCandles);
  } catch {
    return emptyLadder('The exchange constraints could not be applied to this hypothetical plan.');
  }
}

function buildTechnicalLadderInternal(
  analysis: MultiTimeframeAnalysis,
  capital: Decimal.Value,
  referencePrice: number = analysis.timeframes['15m'].latestClose ?? Number.NaN,
  filters?: SymbolFilters | null,
  mode: LadderMode | LegacyMode = 'balanced',
  dailyCandles?: MarketCandle[],
): TechnicalLadder {
  if (filters === null)
    return emptyLadder(
      'Binance symbol filters are unavailable. A valid hypothetical plan cannot be calculated.',
    );
  if (!new Decimal(capital).isFinite() || new Decimal(capital).lte(0)) {
    return emptyLadder('Enter a capital amount greater than zero to prepare a plan.');
  }

  const classic = mode === 'aggressive' || mode === 'balanced' || mode === 'extended';
  const classicMode: ClassicMode = classic ? mode : 'balanced';
  const spacing = classic ? classicSpacing(analysis.timeframes['15m'], referencePrice, classicMode) : null;
  if (classic && !spacing) return emptyLadder('Reliable current price and volatility data are required to prepare levels.');
  const timeframe = mode === '4h' || mode === '1d' ? mode : '15m';
  const candles = timeframe === '1d' ? dailyCandles : analysis.timeframes[timeframe].candles;
  // Analysis timeframes already contain closed candles; the scanner excludes the live candle.
  const series = timeframe === '1d' ? candles : candles ? [...candles, candles[candles.length - 1]] : undefined;
  const zones = !classic && series && filters ? scanPivotZones(series, filters.tickSize) : []; 
  const classicIndicatorZones: IndicatorZone[] = classic && filters
    ? (['15m', '1h', '4h'] as const).flatMap((interval) => {
        const closed = analysis.timeframes[interval].candles;
        if (closed.length < 32) return [];
        return scanPivotZones([...closed, closed[closed.length - 1]], filters.tickSize)
          .map((zone) => ({ ...zone, timeframe: interval }));
      })
    : [];
  const zoneCandidates = (kind: 'support' | 'resistance') => {
    // Group only eligible centers: an area on the other side of price cannot
    // turn a valid limit into an immediate order.
    if (!filters) return [];
    const eligible = zones.filter((zone) => zone.kind === kind && zone.price > 0 &&
      (kind === 'support' ? zone.price < referencePrice : zone.price > referencePrice));
    const seen = new Set<string>();
    return clusterZones(eligible).flatMap((cluster) => {
      // Use the lowest actual pivot center in each group. For buys this favors
      // a lower entry; for targets it takes the first resistance in the area.
      const center = Math.min(...cluster.zones.map((zone) => zone.price));
      const price = quantizePrice(new Decimal(center), filters.tickSize, kind === 'support' ? 'buy' : 'sell');
      const key = price.toString();
      if (seen.has(key) || (kind === 'support' ? price.gte(referencePrice) : price.lte(referencePrice))) return [];
      seen.add(key);
      const broken = cluster.zones.filter((zone) => zone.broken).length;
      const active = cluster.zones.length - broken;
      return [{ price, lower: cluster.lower, estimated: false, score: 1, reasons: [
        `${timeframe.toUpperCase()} ${kind} group: ${active} active, ${broken} broken`,
        `Combined area ${cluster.lower} – ${cluster.upper}`,
        `Included centers: ${cluster.zones.map((zone) => `${zone.price} (${zone.broken ? 'broken' : 'active'})`).join(', ')}`,
        `Lowest zone center of ${cluster.zones.length} overlapping area${cluster.zones.length === 1 ? '' : 's'}`,
      ] }];
    }).sort((a, b) => kind === 'support' ? b.price.comparedTo(a.price) : a.price.comparedTo(b.price)).slice(0, 4);
  };
  if (!classic && (!series || !Number.isFinite(referencePrice) || referencePrice <= 0 || !filters)) {
    return emptyLadder('Current price, exchange filters, and selected timeframe candles are required.');
  }
  const currentPrice = referencePrice;
  let candidates = classic && spacing ? classicBuyingCandidates(analysis, referencePrice, spacing.spacing, classicMode, classicIndicatorZones).map((candidate) => ({ ...candidate, lower: candidate.price.toNumber() })) : zoneCandidates('support');
  if (classic && filters) candidates = candidates.map((candidate) => ({ ...candidate, price: quantizePrice(candidate.price, filters.tickSize, 'buy') }));
  if (!candidates.length || (classic && candidates.length !== 4)) return emptyLadder(classic ? 'Reliable market data is insufficient to prepare four buying levels.' : `No ${timeframe} support zones are available below the current price.`);
  const deepest = candidates[candidates.length - 1];
  const assessed = analysis.assessment.invalidationLevel;
  const atr = analysis.timeframes['15m'].atr;
  const invalidation = classic && atr !== null
    ? assessed !== null && assessed > 0 && new Decimal(assessed).lt(deepest.price)
      ? new Decimal(assessed)
      : Decimal.max(deepest.price.minus(new Decimal(atr).mul('0.75')), deepest.price.mul('0.01'))
    : Decimal.max(new Decimal(filters!.tickSize), new Decimal(deepest.lower).minus(filters!.tickSize));
  const buyingLevels = allocateBuyingLevels(candidates, capital, filters);
  if (filters) {
    const invalid = buyingLevels
      .map((level) => validateOrder(level.price, level.quantity, filters))
      .find(Boolean);
    if (invalid) return emptyLadder(`Buying plan unavailable: ${invalid}`);
  }
  const averageEntry = weightedAverageEntry(buyingLevels);
  if (averageEntry === null) {
    return emptyLadder('Reliable market data is insufficient to estimate the average entry price.');
  }

  const fee = new Decimal(ESTIMATED_FEE_PERCENT).div(100);
  const breakEven = averageEntry.mul(new Decimal(1).plus(fee)).div(new Decimal(1).minus(fee));
  let targetCandidates = classic && spacing
    ? classicTargetCandidates(analysis, referencePrice, averageEntry, spacing.targetSpacing, classicMode, classicIndicatorZones)
    : zoneCandidates('resistance').filter((candidate) => candidate.price.gt(breakEven));
  if (classic && filters) targetCandidates = targetCandidates.map((candidate) => ({ ...candidate, price: quantizePrice(candidate.price, filters.tickSize, 'sell') }));
  if (!targetCandidates.length || (classic && targetCandidates.length !== 4)) return emptyLadder(classic ? 'Reliable market data is insufficient to prepare four take-profit targets.' : `No ${timeframe} resistance zones are available above the current price and fee-adjusted entry.`);
  const targetAllocations = classic ? [20, 30, 30, 20] : targetCandidates.map(() => 100 / targetCandidates.length);

  for (const level of buyingLevels) {
    const target = targetCandidates[0]?.price;
    level.riskReward =
      target !== undefined && level.price.gt(invalidation) && target.gt(level.price)
        ? calculateRiskReward(level.price, target, invalidation)
        : null;
  }

  const totalQuantity = buyingLevels.reduce(
    (total, level) => total.plus(level.quantity),
    new Decimal(0),
  );
  let remainingQuantity = totalQuantity;
  const targetQuantity = (index: number) => {
    const quantity = index === targetCandidates.length - 1
      ? remainingQuantity
      : totalQuantity.mul(targetAllocations[index]).div(100);
    const available = Decimal.min(quantity, remainingQuantity);
    const result = filters ? quantizeQuantity(available, filters.stepSize) : available;
    remainingQuantity = remainingQuantity.minus(result);
    return result;
  };
  const takeProfitTargets = targetCandidates.map((target, index) => {
    const quantity = targetQuantity(index);
    return {
      allocationPercent: targetAllocations[index],
      classification: targetClassification(index),
      estimated: target.estimated,
      estimatedNetProfit: calculateNetProfit(quantity, averageEntry, target.price),
      movementPercent: target.price.minus(averageEntry).div(averageEntry).mul(100),
      outcome: target.price.gt(averageEntry) ? ('profit' as const) : ('recovery' as const),
      price: target.price,
      quantity,
      reasons: target.reasons,
      riskReward: calculateRiskReward(averageEntry, target.price, invalidation),
    };
  });
  if (filters) {
    const invalid = takeProfitTargets
      .map((target) => validateOrder(target.price, target.quantity, filters))
      .find(Boolean);
    if (invalid) return emptyLadder(`Take-profit plan unavailable: ${invalid}`);
  }

  const ladder = {
    averageEntry,
    buyingSummary: buildBuyingSummary(currentPrice, buyingLevels, averageEntry),
    buyingLevels,
    confidence: classic ? ([...buyingLevels, ...takeProfitTargets].some((level) => level.estimated) ? (analysis.assessment.confidence === 'High' ? 'Medium' : 'Low') : analysis.assessment.confidence) : null,
    invalidationLevel: invalidation,
    reason: null,
    takeProfitSummary: buildTakeProfitSummary(
      takeProfitTargets,
      averageEntry,
      buyingLevels.reduce((sum, level) => sum.plus(level.allocation), new Decimal(0)),
      totalQuantity,
    ),
    takeProfitTargets,
  };

  return validateTechnicalLadder(ladder, currentPrice, capital, spacing?.spacing ?? 0, spacing ? spacing.targetSpacing * 0.5 : 0, filters != null);
}

export function validateLadderAgainstLivePrice(
  ladder: TechnicalLadder | null,
  livePrice: number | null,
): LiveLadderValidation {
  if (
    ladder === null ||
    ladder.reason !== null ||
    livePrice === null ||
    !Number.isFinite(livePrice) ||
    livePrice <= 0
  ) {
    return { status: 'data-unavailable', valid: false };
  }

  if (ladder.buyingLevels.some((level) => level.price >= livePrice)) {
    return { status: 'buy-level-crossed', valid: false };
  }

  if (ladder.takeProfitTargets.some((target) => target.price <= livePrice)) {
    return { status: 'target-crossed', valid: false };
  }

  return { status: 'current', valid: true };
}

function allocateBuyingLevels(
  candidates: PriceCandidate[],
  capital: Decimal.Value,
  filters?: SymbolFilters | null,
): DecimalBuyingLevel[] {
  const levels = candidates.map((candidate) => {
    const budget = new Decimal(capital).div(candidates.length)
      .div(new Decimal(1).plus(new Decimal(ESTIMATED_FEE_PERCENT).div(100)));
    const quantity = filters
      ? quantizeQuantity(budget.div(candidate.price), filters.stepSize)
      : budget.div(candidate.price);
    const allocation = filters ? quantity.mul(candidate.price) : budget;
    return {
      allocation,
      allocationPercent: 100 / candidates.length,
      estimated: candidate.estimated,
      price: candidate.price,
      quantity,
      reasons: candidate.reasons,
      riskReward: null as Decimal | null,
    };
  });
  return levels;
}

function weightedAverageEntry(levels: DecimalBuyingLevel[]): Decimal | null {
  const totalAllocation = levels.reduce(
    (total, level) => total.plus(level.allocation),
    new Decimal(0),
  );
  const totalQuantity = levels.reduce((total, level) => total.plus(level.quantity), new Decimal(0));
  return totalAllocation.gt(0) && totalQuantity.gt(0) ? totalAllocation.div(totalQuantity) : null;
}

function targetClassification(index: number): TakeProfitTarget['classification'] {
  return ['Near-term', 'Main intraday', 'Extended', 'Stretch'][
    index
  ] as TakeProfitTarget['classification'];
}

function calculateNetProfit(quantity: Decimal, entryPrice: Decimal, targetPrice: Decimal): Decimal {
  const entryCost = quantity.mul(entryPrice);
  const proceeds = quantity.mul(targetPrice);
  const fees = entryCost.plus(proceeds).mul(ESTIMATED_FEE_PERCENT).div(100);
  return proceeds.minus(entryCost).minus(fees);
}

function calculateRiskReward(
  entry: Decimal,
  target: Decimal,
  invalidation: Decimal,
): Decimal | null {
  const downside = entry.minus(invalidation);
  const upside = target.minus(entry);
  return downside.gt(0) && upside.gt(0) ? upside.div(downside) : null;
}

function emptyLadder(reason: string): TechnicalLadder {
  return {
    averageEntry: null,
    buyingSummary: null,
    buyingLevels: [],
    confidence: null,
    invalidationLevel: null,
    reason,
    takeProfitSummary: null,
    takeProfitTargets: [],
  };
}

function validateTechnicalLadder(
  ladder: {
    averageEntry: Decimal;
    buyingSummary: ReturnType<typeof buildBuyingSummary>;
    buyingLevels: DecimalBuyingLevel[];
    confidence: TechnicalLadder['confidence'];
    invalidationLevel: Decimal;
    reason: null;
    takeProfitSummary: ReturnType<typeof buildTakeProfitSummary>;
    takeProfitTargets: DecimalTakeProfitTarget[];
  },
  referencePrice: number,
  capital: Decimal.Value,
  minimumSpacing: number,
  minimumTargetSpacing: number,
  requireExactPresentation: boolean,
): TechnicalLadder {
  const allFinite = [
    new Decimal(referencePrice),
    ladder.averageEntry,
    ladder.invalidationLevel,
    ...ladder.buyingLevels.flatMap((level) => [level.allocation, level.price, level.quantity]),
    ...ladder.takeProfitTargets.flatMap((target) => [target.price, target.quantity]),
  ].every((value) => value.isFinite() && value.gt(0));
  const buysAreValid = ladder.buyingLevels.every(
    (level, index, levels) =>
      level.price.lt(referencePrice) && (index === 0 || level.price.lt(levels[index - 1].price)),
  );
  const targetsAreValid = ladder.takeProfitTargets.every(
    (target, index, targets) =>
      target.price.gt(referencePrice) &&
      target.price.gt(
        ladder.averageEntry
          .mul(new Decimal(1).plus(new Decimal(ESTIMATED_FEE_PERCENT).div(100)))
          .div(new Decimal(1).minus(new Decimal(ESTIMATED_FEE_PERCENT).div(100))),
      ) &&
      (index === 0 || target.price.gt(targets[index - 1].price)),
  );
  const buySpacingIsValid = ladder.buyingLevels.every(
    (level, index, levels) =>
      index === 0 || levels[index - 1].price.minus(level.price).gte(minimumSpacing),
  );
  const targetSpacingIsValid = ladder.takeProfitTargets.every(
    (target, index, targets) =>
      index === 0 || target.price.minus(targets[index - 1].price).gte(minimumTargetSpacing),
  );
  const allocations = ladder.buyingLevels.reduce(
    (total, level) => total.plus(level.allocation),
    new Decimal(0),
  );
  const boughtQuantity = ladder.buyingLevels.reduce(
    (total, level) => total.plus(level.quantity),
    new Decimal(0),
  );
  const targetQuantity = ladder.takeProfitTargets.reduce(
    (total, target) => total.plus(target.quantity),
    new Decimal(0),
  );
  const displayedOrdersAreExact = [...ladder.buyingLevels, ...ladder.takeProfitTargets].every(
    ({ price, quantity }) =>
      Number.isFinite(price.toNumber()) &&
      Number.isFinite(quantity.toNumber()) &&
      new Decimal(price.toNumber()).eq(price) &&
      new Decimal(quantity.toNumber()).eq(quantity),
  );

  if (
    !allFinite ||
    !buysAreValid ||
    !targetsAreValid ||
    !buySpacingIsValid ||
    !targetSpacingIsValid ||
    (requireExactPresentation && !displayedOrdersAreExact) ||
    allocations.gt(capital) ||
    targetQuantity.minus(boughtQuantity).gt(boughtQuantity.mul('1e-70'))
  ) {
    return emptyLadder(
      'The market snapshot could not produce a valid four-level hypothetical plan.',
    );
  }

  // Presentation boundary: all validation and financial calculations above use Decimal.
  const buySummary = ladder.buyingSummary;
  const tpSummary = ladder.takeProfitSummary;
  return {
    ...ladder,
    averageEntry: ladder.averageEntry.toNumber(),
    invalidationLevel: ladder.invalidationLevel.toNumber(),
    buyingLevels: ladder.buyingLevels.map((level) => ({
      ...level,
      allocation: level.allocation.toNumber(),
      price: level.price.toNumber(),
      quantity: level.quantity.toNumber(),
      riskReward: level.riskReward?.toNumber() ?? null,
    })),
    takeProfitTargets: ladder.takeProfitTargets.map((target) => ({
      ...target,
      estimatedNetProfit: target.estimatedNetProfit.toNumber(),
      movementPercent: target.movementPercent.toNumber(),
      price: target.price.toNumber(),
      quantity: target.quantity.toNumber(),
      riskReward: target.riskReward?.toNumber() ?? null,
    })),
    buyingSummary: {
      coveragePercent: buySummary.coveragePercent.toNumber(),
      currentPrice: buySummary.currentPrice.toNumber(),
      distancesFromCurrentPercent: buySummary.distancesFromCurrentPercent.map((value) =>
        value.toNumber(),
      ),
      estimatedAverageEntryIncludingFees: buySummary.estimatedAverageEntryIncludingFees.toNumber(),
      lowestLevel: buySummary.lowestLevel.toNumber(),
      totalPlannedInvestment: buySummary.totalPlannedInvestment.toNumber(),
      totalQuantity: buySummary.totalQuantity.toNumber(),
      weightedAverageEntry: buySummary.weightedAverageEntry.toNumber(),
    },
    takeProfitSummary: {
      unsoldQuantity: tpSummary.unsoldQuantity.toNumber(),
      estimatedFees: tpSummary.estimatedFees.toNumber(),
      estimatedTotalNetProceeds: tpSummary.estimatedTotalNetProceeds.toNumber(),
      totalInvestedCapital: tpSummary.totalInvestedCapital.toNumber(),
      totalEstimatedNetProfit: tpSummary.totalEstimatedNetProfit.toNumber(),
      totalEstimatedNetReturnPercent: tpSummary.totalEstimatedNetReturnPercent.toNumber(),
      weightedAverageEntry: tpSummary.weightedAverageEntry.toNumber(),
    },
  };
}

function buildBuyingSummary(
  currentPrice: number,
  levels: DecimalBuyingLevel[],
  averageEntry: Decimal,
) {
  const lowestLevel = levels.at(-1)?.price ?? new Decimal(currentPrice);
  const nearestLevel = levels[0]?.price ?? new Decimal(currentPrice);
  const investment = levels.reduce((total, level) => total.plus(level.allocation), new Decimal(0));
  const quantity = levels.reduce((total, level) => total.plus(level.quantity), new Decimal(0));
  return {
    coveragePercent: nearestLevel.minus(lowestLevel).div(currentPrice).mul(100),
    currentPrice: new Decimal(currentPrice),
    distancesFromCurrentPercent: levels.map((level) =>
      new Decimal(currentPrice).minus(level.price).div(currentPrice).mul(100),
    ),
    estimatedAverageEntryIncludingFees: quantity.gt(0)
      ? investment
          .mul(new Decimal(1).plus(new Decimal(ESTIMATED_FEE_PERCENT).div(100)))
          .div(quantity)
      : averageEntry,
    lowestLevel,
    totalPlannedInvestment: investment.mul(new Decimal(1).plus(new Decimal(ESTIMATED_FEE_PERCENT).div(100))),
    totalQuantity: quantity,
    weightedAverageEntry: averageEntry,
  };
}

function buildTakeProfitSummary(
  targets: DecimalTakeProfitTarget[],
  averageEntry: Decimal,
  capital: Decimal,
  acquiredQuantity: Decimal,
) {
  const fee = new Decimal(ESTIMATED_FEE_PERCENT).div(100);
  const grossProceeds = targets.reduce(
    (total, target) => total.plus(new Decimal(target.quantity).mul(target.price)),
    new Decimal(0),
  );
  const estimatedTotalNetProceeds = grossProceeds.mul(new Decimal(1).minus(fee));
  const totalInvestedCapital = new Decimal(capital).mul(new Decimal(1).plus(fee));
  const estimatedFees = capital.plus(grossProceeds).mul(fee);
  const totalEstimatedNetProfit = estimatedTotalNetProceeds.minus(totalInvestedCapital);

  return {
    unsoldQuantity: Decimal.max(
      0,
      acquiredQuantity.minus(
        targets.reduce((sum, target) => sum.plus(target.quantity), new Decimal(0)),
      ),
    ),
    estimatedFees,
    estimatedTotalNetProceeds,
    totalInvestedCapital,
    totalEstimatedNetProfit,
    totalEstimatedNetReturnPercent: totalEstimatedNetProfit.div(totalInvestedCapital).mul(100),
    weightedAverageEntry: averageEntry,
  };
}
