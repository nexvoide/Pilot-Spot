import type { MultiTimeframeAnalysis, PriceZone, TimeframeAnalysis } from '../analysis/types.js';
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
const MAX_BUYING_LEVELS = 4;
const MAX_TAKE_PROFIT_TARGETS = 4;
const TAKE_PROFIT_ALLOCATION_PERCENTAGES = [20, 30, 30, 20] as const;
const EXTENDED_LEVEL_MULTIPLIERS = [0.9, 2.1, 3.5, 5.2] as const;
const RECENT_RANGE_CANDLES = 96;

export type LadderMode = 'aggressive' | 'balanced' | 'extended';

const BUY_LEVEL_MULTIPLIERS: Record<LadderMode, readonly number[]> = {
  aggressive: [0.55, 1.75, 3, 4.2],
  balanced: [0.9, 2.1, 3.4, 4.7],
  extended: EXTENDED_LEVEL_MULTIPLIERS,
};

const MODE_SPACING: Record<LadderMode, number> = {
  aggressive: 0.65,
  balanced: 1,
  extended: 1.4,
};

export function buildTechnicalLadder(
  analysis: MultiTimeframeAnalysis,
  capital: Decimal.Value,
  referencePrice: number = analysis.timeframes['15m'].latestClose ?? Number.NaN,
  filters?: SymbolFilters | null,
  mode: LadderMode = 'balanced',
): TechnicalLadder {
  try {
    return buildTechnicalLadderInternal(analysis, capital, referencePrice, filters, mode);
  } catch {
    return emptyLadder('The exchange constraints could not be applied to this hypothetical plan.');
  }
}

function buildTechnicalLadderInternal(
  analysis: MultiTimeframeAnalysis,
  capital: Decimal.Value,
  referencePrice: number = analysis.timeframes['15m'].latestClose ?? Number.NaN,
  filters?: SymbolFilters | null,
  mode: LadderMode = 'balanced',
): TechnicalLadder {
  if (filters === null)
    return emptyLadder(
      'Binance symbol filters are unavailable. A valid hypothetical plan cannot be calculated.',
    );
  if (!new Decimal(capital).isFinite() || new Decimal(capital).lte(0)) {
    return emptyLadder('Enter a capital amount greater than zero to prepare a plan.');
  }

  const primary = analysis.timeframes['15m'];
  const currentPrice = referencePrice;
  const atr = primary.atr;
  if (
    currentPrice === null ||
    atr === null ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(atr) ||
    currentPrice <= 0 ||
    atr <= 0
  ) {
    return emptyLadder(
      'Reliable current price and volatility data are required to prepare levels.',
    );
  }

  const baselineSpacing = calculateAdaptiveSpacing(primary, currentPrice, atr);
  const modeMultiplier = MODE_SPACING[mode];
  if (modeMultiplier === undefined) return emptyLadder('The selected planning mode is invalid.');
  const spacing = baselineSpacing * modeMultiplier;
  const targetSpacing = mode === 'extended'
    ? spacing
    : calculateTargetSpacing(currentPrice, baselineSpacing) * modeMultiplier;
  let candidates = selectBuyingCandidates(analysis, currentPrice, spacing, mode);
  if (filters)
    candidates = candidates.map((candidate) => ({
      ...candidate,
      price: quantizePrice(candidate.price, filters.tickSize, 'buy'),
    }));
  if (candidates.length !== MAX_BUYING_LEVELS) {
    return emptyLadder('Reliable market data is insufficient to prepare four buying levels.');
  }

  const invalidation = deriveInvalidation(
    analysis.assessment.invalidationLevel,
    candidates.at(-1)?.price ?? null,
    atr,
  );
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

  let targetCandidates = selectTargetCandidates(analysis, currentPrice, averageEntry, targetSpacing, mode);
  if (filters)
    targetCandidates = targetCandidates.map((candidate) => ({
      ...candidate,
      price: quantizePrice(candidate.price, filters.tickSize, 'sell'),
    }));
  if (targetCandidates.length !== MAX_TAKE_PROFIT_TARGETS) {
    return emptyLadder('Reliable market data is insufficient to prepare four take-profit targets.');
  }

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
    const quantity = index === MAX_TAKE_PROFIT_TARGETS - 1
      ? remainingQuantity
      : totalQuantity.mul(TAKE_PROFIT_ALLOCATION_PERCENTAGES[index]).div(100);
    const available = Decimal.min(quantity, remainingQuantity);
    const result = filters ? quantizeQuantity(available, filters.stepSize) : available;
    remainingQuantity = remainingQuantity.minus(result);
    return result;
  };
  const takeProfitTargets = targetCandidates.map((target, index) => {
    const quantity = targetQuantity(index);
    return {
      allocationPercent: TAKE_PROFIT_ALLOCATION_PERCENTAGES[index],
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
  const usesEstimatedLevels = [...buyingLevels, ...takeProfitTargets].some(
    (level) => level.estimated,
  );

  const ladder = {
    averageEntry,
    buyingSummary: buildBuyingSummary(currentPrice, buyingLevels, averageEntry),
    buyingLevels,
    confidence: usesEstimatedLevels
      ? lowerConfidence(analysis.assessment.confidence)
      : analysis.assessment.confidence,
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

  return validateTechnicalLadder(ladder, currentPrice, capital, spacing, targetSpacing * 0.5, filters != null);
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

function selectBuyingCandidates(
  analysis: MultiTimeframeAnalysis,
  currentPrice: number,
  spacing: number,
  mode: LadderMode,
): PriceCandidate[] {
  const primary = analysis.timeframes['15m'];
  const candidates: PriceCandidate[] = [];
  for (const zone of primary.zones.filter(
    (zone) => zone.kind === 'support' && zone.price > 0 && zone.price < currentPrice,
  )) {
    candidates.push(toSupportCandidate(zone, primary, spacing));
  }
  for (const [label, value] of Object.entries(primary.ema)) {
    if (value !== null && value > 0 && value < currentPrice) {
      candidates.push({
        estimated: false,
        price: new Decimal(value),
        reasons: [`${formatEmaLabel(label)} confluence`],
        score: 2,
      });
    }
  }
  for (const swingLow of primary.structure.swingLows) {
    if (swingLow.price > 0 && swingLow.price < currentPrice) {
      candidates.push({
        estimated: false,
        price: new Decimal(swingLow.price),
        reasons: ['Previous 15M swing low', 'Intraday market-structure reference'],
        score: 3,
      });
    }
  }
  addContextCandidates(candidates, analysis.timeframes['1h'], '1H', 'support', currentPrice);
  addContextCandidates(candidates, analysis.timeframes['4h'], '4H', 'support', currentPrice);
  const unit = new Decimal(spacing);
  const zones = mergeCandidateZones(candidates, spacing * 0.1);
  return BUY_LEVEL_MULTIPLIERS[mode].map((multiplier) => {
    const projected = new Decimal(currentPrice).minus(unit.mul(multiplier));
    const nearby = zones
      .filter((candidate) => candidate.price.gt(0) && candidate.price.lt(currentPrice) && candidate.price.minus(projected).abs().lte(unit.mul('0.05')))
      .sort((a, b) => a.price.minus(projected).abs().comparedTo(b.price.minus(projected).abs()));
    return nearby[0] ?? {
      estimated: true,
      price: projected,
      reasons: ['Estimated buying level based on mode and intraday volatility', 'No nearby support or moving average was available'],
      score: 0,
    };
  }).filter((candidate) => candidate.price.gt(0));
}

function selectTargetCandidates(
  analysis: MultiTimeframeAnalysis,
  currentPrice: number,
  averageEntry: Decimal,
  spacing: number,
  mode: LadderMode,
): PriceCandidate[] {
  const primary = analysis.timeframes['15m'];
  const candidates: PriceCandidate[] = [];
  const fee = new Decimal(ESTIMATED_FEE_PERCENT).div(100);
  const feeAdjustedBreakEven = averageEntry
    .mul(new Decimal(1).plus(fee))
    .div(new Decimal(1).minus(fee));
  const minimumTargetPrice = Decimal.max(currentPrice, feeAdjustedBreakEven);
  for (const zone of primary.zones.filter(
    (zone) => zone.kind === 'resistance' && new Decimal(zone.price).gt(minimumTargetPrice),
  )) {
    candidates.push({
      estimated: false,
      price: new Decimal(zone.price),
      reasons: ['Confirmed 15M resistance', 'Previous swing-high supply area'],
      score: zone.touches * 2,
    });
  }

  addContextCandidates(
    candidates,
    analysis.timeframes['1h'],
    '1H',
    'resistance',
    minimumTargetPrice,
  );
  addContextCandidates(
    candidates,
    analysis.timeframes['4h'],
    '4H',
    'resistance',
    minimumTargetPrice,
  );
  const reference = minimumTargetPrice;
  const unit = new Decimal(spacing);
  const tolerance = mode === 'extended' ? 0.05 : 0.2;
  const zones = mergeCandidateZones(candidates, spacing * (mode === 'extended' ? 0.1 : 0.2));
  return Array.from({ length: MAX_TAKE_PROFIT_TARGETS }, (_, index) => {
    const multiplier = mode === 'extended' ? EXTENDED_LEVEL_MULTIPLIERS[index] : index + 1;
    const projected = reference.plus(unit.mul(multiplier));
    const nearby = zones
      .filter((candidate) => candidate.price.gt(minimumTargetPrice) && candidate.price.minus(projected).abs().lte(unit.mul(tolerance)))
      .sort((a, b) => a.price.minus(projected).abs().comparedTo(b.price.minus(projected).abs()));
    if (nearby[0]) return nearby[0];
    return {
      estimated: true,
      price: projected,
      reasons: [mode === 'extended' ? 'Estimated target based on mode and intraday volatility' : 'Estimated target based on bounded intraday volatility', 'No nearby resistance was available'],
      score: 0,
    };
  });
}

function calculateTargetSpacing(currentPrice: number, buyingSpacing: number): number {
  return Math.max(currentPrice * 0.003, Math.min(buyingSpacing * 0.5, currentPrice * 0.01));
}

function addContextCandidates(
  candidates: PriceCandidate[],
  timeframe: TimeframeAnalysis,
  label: '1H' | '4H',
  kind: PriceZone['kind'],
  referencePrice: Decimal.Value,
): void {
  for (const zone of timeframe.zones.filter((zone) =>
    kind === 'support'
      ? new Decimal(zone.price).lt(referencePrice)
      : new Decimal(zone.price).gt(referencePrice),
  )) {
    candidates.push({
      estimated: false,
      price: new Decimal(zone.price),
      reasons: [`${label} ${kind} context`, `${label} swing structure`],
      score: Math.max(1, zone.touches),
    });
  }
}

function mergeCandidateZones(
  candidates: PriceCandidate[],
  mergeDistance: number,
): PriceCandidate[] {
  const sorted = [...candidates].sort((left, right) => left.price.comparedTo(right.price));
  const zones: PriceCandidate[] = [];

  for (const candidate of sorted) {
    const existing = zones.at(-1);
    if (existing && existing.price.minus(candidate.price).abs().lte(mergeDistance)) {
      const higherScoreCandidate = candidate.score > existing.score ? candidate : existing;
      existing.price = higherScoreCandidate.price;
      existing.score = Math.max(existing.score, candidate.score);
      existing.estimated = existing.estimated && candidate.estimated;
      existing.reasons = Array.from(new Set([...existing.reasons, ...candidate.reasons]));
      continue;
    }
    zones.push({ ...candidate, reasons: [...candidate.reasons] });
  }

  return zones;
}

function calculateAdaptiveSpacing(
  timeframe: TimeframeAnalysis,
  currentPrice: number,
  atr: number,
): number {
  const recentCandles = timeframe.candles.slice(-RECENT_RANGE_CANDLES);
  const recentHigh = Math.max(...recentCandles.map((candle) => candle.high));
  const recentLow = Math.min(...recentCandles.map((candle) => candle.low));
  const recentRange = recentHigh - recentLow;
  const rangeSpacing = Number.isFinite(recentRange) && recentRange > 0 ? recentRange * 0.12 : 0;
  const priceFloor = currentPrice * 0.0005;

  return Math.max(atr * 1.15, rangeSpacing, priceFloor);
}

function allocateBuyingLevels(
  candidates: PriceCandidate[],
  capital: Decimal.Value,
  filters?: SymbolFilters | null,
): DecimalBuyingLevel[] {
  const levels = candidates.map((candidate) => {
    const budget = new Decimal(capital).div(MAX_BUYING_LEVELS)
      .div(new Decimal(1).plus(new Decimal(ESTIMATED_FEE_PERCENT).div(100)));
    const quantity = filters
      ? quantizeQuantity(budget.div(candidate.price), filters.stepSize)
      : budget.div(candidate.price);
    const allocation = filters ? quantity.mul(candidate.price) : budget;
    return {
      allocation,
      allocationPercent: 25,
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

function deriveInvalidation(
  assessedInvalidation: number | null,
  deepestBuy: Decimal | null,
  atr: number,
): Decimal {
  if (deepestBuy === null) {
    return new Decimal(0);
  }
  if (
    assessedInvalidation !== null &&
    assessedInvalidation > 0 &&
    new Decimal(assessedInvalidation).lt(deepestBuy)
  ) {
    return new Decimal(assessedInvalidation);
  }
  return Decimal.max(deepestBuy.minus(new Decimal(atr).mul('0.75')), deepestBuy.mul('0.01'));
}

function toSupportCandidate(
  zone: PriceZone,
  primary: TimeframeAnalysis,
  spacing: number,
): PriceCandidate {
  const reasons = ['Confirmed 15M support', 'Previous swing-low cluster'];
  let score = zone.touches * 2;
  const confluenceDistance = spacing * 0.45;
  if (
    primary.ema.ema20 !== null &&
    Math.abs(zone.price - primary.ema.ema20) <= confluenceDistance
  ) {
    reasons.push('EMA 20 confluence');
    score += 2;
  }
  if (
    primary.ema.ema50 !== null &&
    Math.abs(zone.price - primary.ema.ema50) <= confluenceDistance
  ) {
    reasons.push('EMA 50 confluence');
    score += 2;
  }
  if (primary.volumeConfirmed) {
    reasons.push('Above-average 15M volume');
    score += 1;
  }
  return { estimated: false, price: new Decimal(zone.price), reasons, score };
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

function formatEmaLabel(key: string): string {
  return key.replace('ema', 'EMA ');
}

function lowerConfidence(confidence: 'High' | 'Low' | 'Medium'): 'High' | 'Low' | 'Medium' {
  return confidence === 'High' ? 'Medium' : 'Low';
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
