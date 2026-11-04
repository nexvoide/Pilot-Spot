export const analysisConfig = Object.freeze({
  atrPeriod: 14,
  emaPeriods: [7, 20, 50] as const,
  minimumCandles: 80,
  minimumRiskReward: 1.5,
  ladderRecalculationAtrMultiplier: 0.5,
  ladderRecalculationMinimumIntervalMs: 5_000,
  rsiPeriod: 14,
  structureSwingWindow: 3,
  supportDistanceAtrMaximum: 2.5,
  volumeLookback: 20,
  volumeMultiplier: 1.1,
  zoneMergeDistanceAtr: 0.35,
  zoneTouchMinimum: 2,
});

export type AnalysisConfig = typeof analysisConfig;
