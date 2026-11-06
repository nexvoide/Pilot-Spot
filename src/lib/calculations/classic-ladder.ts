import type { MultiTimeframeAnalysis, TimeframeAnalysis } from '../analysis/types.js';
import Decimal from './financial-decimal.js';
import type { PivotZone } from '../analysis/zone-scanner.js';

export type ClassicMode = 'aggressive' | 'balanced' | 'extended';
export interface IndicatorZone extends PivotZone { timeframe: '15m' | '1h' | '4h' }
export interface ClassicCandidate { estimated: boolean; price: Decimal; reasons: string[]; score: number }

const multipliers: Record<ClassicMode, readonly number[]> = {
  aggressive: [0.55, 1.75, 3, 4.2],
  balanced: [0.9, 2.1, 3.4, 4.7],
  extended: [0.9, 2.1, 3.5, 5.2],
};
const spacingFactors: Record<ClassicMode, number> = { aggressive: 0.65, balanced: 1, extended: 1.4 };

export function classicSpacing(primary: TimeframeAnalysis, price: number, mode: ClassicMode) {
  if (primary.atr === null || !Number.isFinite(primary.atr) || primary.atr <= 0 || !Number.isFinite(price) || price <= 0) return null;
  const recent = primary.candles.slice(-96);
  const high = Math.max(...recent.map((c) => c.high));
  const low = Math.min(...recent.map((c) => c.low));
  const rangeSpacing = Number.isFinite(high - low) && high > low ? (high - low) * 0.12 : 0;
  const baseline = Math.max(primary.atr * 1.15, rangeSpacing, price * 0.0005);
  const spacing = baseline * spacingFactors[mode];
  const targetSpacing = mode === 'extended' ? spacing : Math.max(price * 0.003, Math.min(baseline * 0.5, price * 0.01)) * spacingFactors[mode];
  return { spacing, targetSpacing };
}

function merge(candidates: ClassicCandidate[], distance: number): ClassicCandidate[] {
  const groups: ClassicCandidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.price.comparedTo(b.price))) {
    const existing = groups.at(-1);
    if (existing && existing.price.minus(candidate.price).abs().lte(distance)) {
      if (candidate.score > existing.score) existing.price = candidate.price;
      existing.score = Math.max(existing.score, candidate.score);
      existing.estimated = existing.estimated && candidate.estimated;
      existing.reasons = [...new Set([...existing.reasons, ...candidate.reasons])];
    } else groups.push({ ...candidate, reasons: [...candidate.reasons] });
  }
  return groups;
}

export function classicBuyingCandidates(analysis: MultiTimeframeAnalysis, price: number, spacing: number, mode: ClassicMode, indicatorZones: IndicatorZone[] = []): ClassicCandidate[] {
  const primary = analysis.timeframes['15m'];
  const candidates: ClassicCandidate[] = [];
  for (const zone of primary.zones.filter((z) => z.kind === 'support' && z.price > 0 && z.price < price)) {
    const reasons = ['Confirmed 15M support', 'Previous swing-low cluster'];
    let score = zone.touches * 2;
    if (primary.ema.ema20 !== null && Math.abs(zone.price - primary.ema.ema20) <= spacing * 0.45) { reasons.push('EMA 20 confluence'); score += 2; }
    if (primary.ema.ema50 !== null && Math.abs(zone.price - primary.ema.ema50) <= spacing * 0.45) { reasons.push('EMA 50 confluence'); score += 2; }
    if (primary.volumeConfirmed) { reasons.push('Above-average 15M volume'); score += 1; }
    candidates.push({ estimated: false, price: new Decimal(zone.price), reasons, score });
  }
  for (const [label, value] of Object.entries(primary.ema)) if (value !== null && value > 0 && value < price) candidates.push({ estimated: false, price: new Decimal(value), reasons: [`${label.replace('ema', 'EMA ')} confluence`], score: 2 });
  for (const swing of primary.structure.swingLows) if (swing.price > 0 && swing.price < price) candidates.push({ estimated: false, price: new Decimal(swing.price), reasons: ['Previous 15M swing low', 'Intraday market-structure reference'], score: 3 });
  for (const [label, timeframe] of [['1H', analysis.timeframes['1h']], ['4H', analysis.timeframes['4h']]] as const) {
    for (const zone of timeframe.zones) if (zone.kind === 'support' && zone.price < price && zone.price > 0) candidates.push({ estimated: false, price: new Decimal(zone.price), reasons: [`${label} support context`, `${label} swing structure`], score: Math.max(1, zone.touches) });
  }
  candidates.push(...indicatorCandidates(indicatorZones, 'support', new Decimal(price)));
  const groups = merge(candidates, spacing * 0.1);
  const unit = new Decimal(spacing);
  return multipliers[mode].map((multiplier) => {
    const projected = new Decimal(price).minus(unit.mul(multiplier));
    const nearby = groups.filter((candidate) => candidate.price.gt(0) && candidate.price.lt(price) && candidate.price.minus(projected).abs().lte(unit.mul('0.05'))).sort((a, b) => a.price.minus(projected).abs().comparedTo(b.price.minus(projected).abs()));
    return nearby[0] ?? { estimated: true, price: projected, reasons: ['Estimated buying level based on mode and intraday volatility', ...zoneConfluence(indicatorZones, 'support', projected)], score: 0 };
  }).filter((candidate) => candidate.price.gt(0));
}

export function classicTargetCandidates(analysis: MultiTimeframeAnalysis, price: number, average: Decimal, spacing: number, mode: ClassicMode, indicatorZones: IndicatorZone[] = []): ClassicCandidate[] {
  const fee = new Decimal('0.001');
  const minimum = Decimal.max(price, average.mul(new Decimal(1).plus(fee)).div(new Decimal(1).minus(fee)));
  const candidates: ClassicCandidate[] = [];
  for (const [label, timeframe] of [['15M', analysis.timeframes['15m']], ['1H', analysis.timeframes['1h']], ['4H', analysis.timeframes['4h']]] as const) {
    for (const zone of timeframe.zones) if (zone.kind === 'resistance' && new Decimal(zone.price).gt(minimum)) candidates.push({ estimated: false, price: new Decimal(zone.price), reasons: label === '15M' ? ['Confirmed 15M resistance', 'Previous swing-high supply area'] : [`${label} resistance context`, `${label} swing structure`], score: label === '15M' ? zone.touches * 2 : Math.max(1, zone.touches) });
  }
  candidates.push(...indicatorCandidates(indicatorZones, 'resistance', minimum));
  const groups = merge(candidates, spacing * (mode === 'extended' ? 0.1 : 0.2));
  const unit = new Decimal(spacing);
  return Array.from({ length: 4 }, (_, index) => {
    const projected = minimum.plus(unit.mul(mode === 'extended' ? multipliers.extended[index] : index + 1));
    const nearby = groups.filter((candidate) => candidate.price.gt(minimum) && candidate.price.minus(projected).abs().lte(unit.mul(mode === 'extended' ? 0.05 : 0.2))).sort((a, b) => a.price.minus(projected).abs().comparedTo(b.price.minus(projected).abs()));
    return nearby[0] ?? { estimated: true, price: projected, reasons: [mode === 'extended' ? 'Estimated target based on mode and intraday volatility' : 'Estimated target based on bounded intraday volatility', ...zoneConfluence(indicatorZones, 'resistance', projected)], score: 0 };
  });
}

function indicatorCandidates(zones: IndicatorZone[], kind: PivotZone['kind'], reference: Decimal): ClassicCandidate[] {
  return zones.filter((zone) => zone.kind === kind && Number.isFinite(zone.price) && zone.price > 0 &&
    (kind === 'support' ? new Decimal(zone.price).lt(reference) : new Decimal(zone.price).gt(reference)))
    .map((zone) => ({
      estimated: false,
      price: new Decimal(zone.price),
      reasons: [`${zone.timeframe.toUpperCase()} indicator ${zone.broken ? 'broken historical' : 'active'} ${kind} center ${zone.price}`, `Indicator area ${zone.lower} – ${zone.upper}`],
      score: 2,
    }));
}

function zoneConfluence(zones: IndicatorZone[], kind: PivotZone['kind'], projected: Decimal): string[] {
  const matching = zones.filter((zone) => zone.kind === kind && projected.gte(zone.lower) && projected.lte(zone.upper));
  if (!matching.length) return [kind === 'support' ? 'No nearby support or moving average was available' : 'No nearby resistance was available'];
  return matching.map((zone) => `Inside ${zone.timeframe.toUpperCase()} indicator ${zone.broken ? 'broken historical' : 'active'} ${kind} area ${zone.lower} – ${zone.upper} (center ${zone.price})`);
}
