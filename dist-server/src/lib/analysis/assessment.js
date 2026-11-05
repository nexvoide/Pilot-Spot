import { analysisConfig } from './config.js';
import { calculateAtr, calculateEma, calculateRsi, lastDefinedValue, } from './indicators.js';
import { identifyMarketStructure, identifyPriceZones } from './structure.js';
export function analyzeMarket(candlesByTimeframe, configuration = analysisConfig) {
    const timeframes = {
        '4h': analyzeTimeframe(candlesByTimeframe['4h'], configuration),
        '1h': analyzeTimeframe(candlesByTimeframe['1h'], configuration),
        '15m': analyzeTimeframe(candlesByTimeframe['15m'], configuration),
    };
    return { assessment: assessMarket(timeframes, configuration), timeframes };
}
export function analyzeTimeframe(candles, configuration = analysisConfig) {
    const completedCandles = candles.slice(0, -1);
    if (completedCandles.some((candle) => !isValidCandle(candle))) {
        throw new Error('Market candles contain invalid OHLCV values.');
    }
    const closes = completedCandles.map((candle) => candle.close);
    const ema7 = lastDefinedValue(calculateEma(closes, configuration.emaPeriods[0]));
    const ema20 = lastDefinedValue(calculateEma(closes, configuration.emaPeriods[1]));
    const ema50 = lastDefinedValue(calculateEma(closes, configuration.emaPeriods[2]));
    const rsi = lastDefinedValue(calculateRsi(closes, configuration.rsiPeriod));
    const atr = lastDefinedValue(calculateAtr(completedCandles, configuration.atrPeriod));
    const structure = identifyMarketStructure(completedCandles, configuration.structureSwingWindow);
    const volumeRatio = calculateVolumeRatio(completedCandles, configuration.volumeLookback);
    const latestClose = closes.at(-1) ?? null;
    const trend = determineTrend(latestClose, ema7, ema20, ema50, structure.direction);
    return {
        atr,
        candles: completedCandles,
        ema: { ema20, ema50, ema7 },
        latestClose,
        momentum: determineMomentum(rsi),
        rsi,
        structure,
        trend,
        volumeConfirmed: volumeRatio !== null && volumeRatio >= configuration.volumeMultiplier,
        volumeRatio,
        zones: identifyPriceZones(structure, atr, configuration.zoneMergeDistanceAtr).filter((zone) => zone.touches >= configuration.zoneTouchMinimum),
    };
}
function isValidCandle(candle) {
    return [candle.close, candle.high, candle.low, candle.open, candle.volume].every((value) => Number.isFinite(value) && value >= 0);
}
function calculateVolumeRatio(candles, lookback) {
    if (candles.length <= lookback) {
        return null;
    }
    const latestVolume = candles.at(-1)?.volume;
    const averageVolume = candles.slice(-(lookback + 1), -1).reduce((total, candle) => total + candle.volume, 0) /
        lookback;
    if (latestVolume === undefined || averageVolume <= 0) {
        return null;
    }
    return latestVolume / averageVolume;
}
function determineTrend(close, ema7, ema20, ema50, structure) {
    if (close === null || ema7 === null || ema20 === null || ema50 === null) {
        return 'neutral';
    }
    if (close > ema50 && ema7 > ema20 && ema20 > ema50 && structure !== 'bearish') {
        return 'bullish';
    }
    if (close < ema50 && ema7 < ema20 && ema20 < ema50 && structure !== 'bullish') {
        return 'bearish';
    }
    return 'neutral';
}
function determineMomentum(rsi) {
    if (rsi === null || (rsi >= 45 && rsi <= 55)) {
        return 'neutral';
    }
    return rsi > 55 ? 'bullish' : 'bearish';
}
function assessMarket(timeframes, configuration) {
    const primary = timeframes['15m'];
    const confirmation = timeframes['1h'];
    const broaderContext = timeframes['4h'];
    if (Object.values(timeframes).some((timeframe) => timeframe.candles.length < configuration.minimumCandles)) {
        return noReliableSetup('There is not enough recent price history to assess this pair safely.');
    }
    const support = nearestZone(primary.zones, primary.latestClose, 'support');
    const target = nearestZone(primary.zones, primary.latestClose, 'resistance');
    if (primary.trend === 'bearish') {
        return {
            ...buildRiskMetrics(primary, support, target),
            confidence: 'Low',
            reason: 'The 15-minute trend remains bearish and does not currently support intraday momentum.',
            status: 'UNFAVOURABLE MARKET',
            technicalSummary: 'The active intraday timeframe is weak. Levels remain hypothetical planning references.',
        };
    }
    if (primary.trend !== 'bullish') {
        return {
            ...buildRiskMetrics(primary, support, target),
            confidence: 'Low',
            reason: 'The 15-minute trend and structure are not aligned enough for an intraday setup.',
            status: 'NO RELIABLE SETUP',
            technicalSummary: 'The active intraday timeframe is mixed, so confidence is low.',
        };
    }
    if (support === null || target === null || primary.atr === null || primary.latestClose === null) {
        return noReliableSetup('Reliable 15-minute support and resistance zones are not available yet.');
    }
    const supportDistance = (primary.latestClose - support.price) / primary.atr;
    const metrics = buildRiskMetrics(primary, support, target);
    const timeframesConflict = confirmation.trend === 'bearish' || broaderContext.trend === 'bearish';
    const sufficientReward = metrics.riskReward !== null && metrics.riskReward >= configuration.minimumRiskReward;
    if (supportDistance < 0 || supportDistance > configuration.supportDistanceAtrMaximum) {
        return {
            ...metrics,
            confidence: 'Low',
            reason: 'Price is too far above confirmed 15-minute support for a balanced intraday entry.',
            status: 'WAIT FOR BETTER ENTRY',
            technicalSummary: 'The intraday trend is constructive, but waiting for a pullback improves the risk level.',
        };
    }
    if (timeframesConflict || !sufficientReward) {
        return {
            ...metrics,
            confidence: 'Low',
            reason: timeframesConflict
                ? 'The 1-hour or 4-hour context conflicts with the 15-minute intraday setup.'
                : 'The next 15-minute resistance does not offer enough potential reward for the downside risk.',
            status: 'WAIT FOR BETTER ENTRY',
            technicalSummary: 'The 15-minute view is positive, but broader confirmation or risk/reward is not strong enough yet.',
        };
    }
    const confirmationAligned = confirmation.trend === 'bullish' && confirmation.momentum !== 'bearish';
    const broaderContextAligned = broaderContext.trend !== 'bearish';
    const confidence = calculateConfidence(primary, confirmationAligned, broaderContextAligned);
    return {
        ...metrics,
        confidence,
        reason: 'The 15-minute trend, nearby support, and broader timeframe confirmation are aligned.',
        status: 'BUY SETUP DEVELOPING',
        technicalSummary: 'This is an intraday planning setup, not a guarantee. Levels remain hypothetical while the invalidation remains intact.',
    };
}
function nearestZone(zones, latestClose, kind) {
    if (latestClose === null) {
        return null;
    }
    const candidates = zones.filter((zone) => kind === 'support' ? zone.price < latestClose : zone.price > latestClose);
    if (candidates.length === 0) {
        return null;
    }
    return candidates.reduce((nearest, zone) => Math.abs(zone.price - latestClose) < Math.abs(nearest.price - latestClose) ? zone : nearest);
}
function buildRiskMetrics(primary, support, target) {
    if (primary.latestClose === null || primary.atr === null || support === null || target === null) {
        return {
            downside: null,
            invalidationLevel: null,
            riskReward: null,
            support,
            target,
            upside: null,
        };
    }
    const invalidationLevel = support.price - primary.atr * 0.75;
    const downside = primary.latestClose - invalidationLevel;
    const upside = target.price - primary.latestClose;
    return {
        downside: downside > 0 ? downside : null,
        invalidationLevel,
        riskReward: downside > 0 && upside > 0 ? upside / downside : null,
        support,
        target,
        upside: upside > 0 ? upside : null,
    };
}
function calculateConfidence(primary, confirmationAligned, timingAligned) {
    if (primary.volumeConfirmed && confirmationAligned && timingAligned) {
        return 'High';
    }
    if (confirmationAligned && timingAligned) {
        return 'Medium';
    }
    return 'Low';
}
function noReliableSetup(reason) {
    return {
        confidence: 'Low',
        downside: null,
        invalidationLevel: null,
        reason,
        riskReward: null,
        status: 'NO RELIABLE SETUP',
        support: null,
        target: null,
        technicalSummary: 'Market data is not reliable enough for a directional assessment.',
        upside: null,
    };
}
