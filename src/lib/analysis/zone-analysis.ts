import type { MarketCandle } from '../binance/types.js';
import type { MultiTimeframeAnalysis, TimeframeAnalysis } from './types.js';

export function prepareZoneAnalysis(candles: Record<'15m' | '1h' | '4h', MarketCandle[]>): MultiTimeframeAnalysis {
  const prepare = (series: MarketCandle[]): TimeframeAnalysis => {
    const completed = series.slice(0, -1);
    return {
      atr: null, candles: completed, ema: { ema7: null, ema20: null, ema50: null },
      latestClose: completed.at(-1)?.close ?? null, momentum: 'neutral', rsi: null,
      structure: { direction: 'neutral', swingHighs: [], swingLows: [] },
      trend: 'neutral', volumeConfirmed: false, volumeRatio: null, zones: [],
    };
  };
  return {
    timeframes: { '15m': prepare(candles['15m']), '1h': prepare(candles['1h']), '4h': prepare(candles['4h']) },
    assessment: { confidence: 'Low', downside: null, invalidationLevel: null, reason: '', riskReward: null, status: 'NO RELIABLE SETUP', support: null, target: null, technicalSummary: '', upside: null },
  };
}
