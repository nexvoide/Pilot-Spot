import type { MarketCandle } from '@/lib/binance/types';

export type AnalysisTimeframe = '15m' | '1h' | '4h';
export type Confidence = 'High' | 'Low' | 'Medium';
export type MarketAssessmentStatus =
  'BUY SETUP DEVELOPING' | 'NO RELIABLE SETUP' | 'UNFAVOURABLE MARKET' | 'WAIT FOR BETTER ENTRY';
export type TrendDirection = 'bearish' | 'bullish' | 'neutral';

export interface PriceZone {
  kind: 'resistance' | 'support';
  price: number;
  touches: number;
}

export interface StructurePoint {
  index: number;
  price: number;
  type: 'high' | 'low';
}

export interface MarketStructure {
  direction: TrendDirection;
  swingHighs: StructurePoint[];
  swingLows: StructurePoint[];
}

export interface TimeframeAnalysis {
  atr: number | null;
  candles: MarketCandle[];
  ema: { ema20: number | null; ema50: number | null; ema7: number | null };
  latestClose: number | null;
  momentum: TrendDirection;
  rsi: number | null;
  structure: MarketStructure;
  trend: TrendDirection;
  volumeConfirmed: boolean;
  volumeRatio: number | null;
  zones: PriceZone[];
}

export interface MarketAssessment {
  confidence: Confidence;
  invalidationLevel: number | null;
  reason: string;
  riskReward: number | null;
  status: MarketAssessmentStatus;
  support: PriceZone | null;
  target: PriceZone | null;
  technicalSummary: string;
  downside: number | null;
  upside: number | null;
}

export interface MultiTimeframeAnalysis {
  assessment: MarketAssessment;
  timeframes: Record<AnalysisTimeframe, TimeframeAnalysis>;
}
