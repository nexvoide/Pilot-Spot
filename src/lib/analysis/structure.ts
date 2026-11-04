import type { MarketCandle } from '@/lib/binance/types';
import type {
  MarketStructure,
  PriceZone,
  StructurePoint,
  TrendDirection,
} from '@/lib/analysis/types';

export function identifyMarketStructure(candles: MarketCandle[], window: number): MarketStructure {
  if (!Number.isInteger(window) || window < 1) {
    throw new Error('Structure swing window must be a positive integer.');
  }

  const swingHighs: StructurePoint[] = [];
  const swingLows: StructurePoint[] = [];

  for (let index = window; index < candles.length - window; index += 1) {
    const current = candles[index];
    const nearbyCandles = candles.slice(index - window, index + window + 1);
    const isHigh = nearbyCandles.every((candle) => current.high >= candle.high);
    const isLow = nearbyCandles.every((candle) => current.low <= candle.low);

    if (isHigh) {
      swingHighs.push({ index, price: current.high, type: 'high' });
    }

    if (isLow) {
      swingLows.push({ index, price: current.low, type: 'low' });
    }
  }

  return { direction: determineStructureDirection(swingHighs, swingLows), swingHighs, swingLows };
}

function determineStructureDirection(
  swingHighs: StructurePoint[],
  swingLows: StructurePoint[],
): TrendDirection {
  const recentHighs = swingHighs.slice(-2);
  const recentLows = swingLows.slice(-2);

  if (recentHighs.length < 2 || recentLows.length < 2) {
    return 'neutral';
  }

  const higherHigh = recentHighs[1].price > recentHighs[0].price;
  const higherLow = recentLows[1].price > recentLows[0].price;
  const lowerHigh = recentHighs[1].price < recentHighs[0].price;
  const lowerLow = recentLows[1].price < recentLows[0].price;

  if (higherHigh && higherLow) {
    return 'bullish';
  }

  if (lowerHigh && lowerLow) {
    return 'bearish';
  }

  return 'neutral';
}

export function identifyPriceZones(
  structure: MarketStructure,
  atr: number | null,
  mergeDistanceAtr: number,
): PriceZone[] {
  if (atr === null || atr <= 0 || !Number.isFinite(atr)) {
    return [];
  }

  const mergeDistance = atr * mergeDistanceAtr;
  const zones = [
    ...clusterPoints(structure.swingLows, 'support', mergeDistance),
    ...clusterPoints(structure.swingHighs, 'resistance', mergeDistance),
  ];

  return zones.sort((left, right) => left.price - right.price);
}

function clusterPoints(
  points: StructurePoint[],
  kind: PriceZone['kind'],
  mergeDistance: number,
): PriceZone[] {
  const clusters: StructurePoint[][] = [];

  for (const point of [...points].sort((left, right) => left.price - right.price)) {
    const cluster = clusters.at(-1);
    const clusterAverage =
      cluster === undefined
        ? null
        : cluster.reduce((total, item) => total + item.price, 0) / cluster.length;

    if (
      cluster &&
      clusterAverage !== null &&
      Math.abs(point.price - clusterAverage) <= mergeDistance
    ) {
      cluster.push(point);
    } else {
      clusters.push([point]);
    }
  }

  return clusters.map((cluster) => ({
    kind,
    price: cluster.reduce((total, point) => total + point.price, 0) / cluster.length,
    touches: cluster.length,
  }));
}
