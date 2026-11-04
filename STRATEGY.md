# Balanced 15-Minute Intraday Spot Strategy

## Scope and safeguards

This is an educational intraday planning tool. It uses public Spot-market data only; it does not place orders, connect wallets, track positions, or guarantee a target outcome. Market condition and hypothetical ladders are independent outputs.

The application excludes the still-forming candle from every indicator, structure, zone, and ladder calculation. Completed candles provide the technical structure; the latest valid live ticker is used to validate the currently displayed plan, so no buy remains at or above the current price and no target remains at or below it.

Live ticks update the displayed price immediately, but they do not rebuild support and resistance on every move. The ladder is revalidated on every tick. A technical ladder rebuild is scheduled only when a 15M candle refreshes, a buy/target is crossed, or price moves at least `max(0.5 × 15M ATR, 0.05% of the prior technical reference)`. Rebuilds are rate-limited to one every five seconds. While a ladder is crossed, stale, or awaiting a rebuild, it is not displayed as current.

## Timeframe hierarchy

- **15M — primary:** entries, exits, EMA 7/20/50, RSI 14, ATR 14, volume, swings, local structure, and intraday support/resistance.
- **1H — confirmation:** nearby context zones and trend/momentum agreement.
- **4H — risk context:** broader structure and larger support/resistance; it can lower confidence or create caution, but it never hides a calculable 15M plan.

Each timeframe receives 200 candles. A minimum of 80 completed candles on every timeframe is required for a directional assessment.

## Indicator and structure rules

| Rule                     |                                                              Value |
| ------------------------ | -----------------------------------------------------------------: |
| EMA periods              |                                                          7, 20, 50 |
| RSI period               |                                                                 14 |
| ATR period               |                                                                 14 |
| Swing window             |                                             3 candles on each side |
| Volume average           |                                         prior 20 completed candles |
| Volume confirmation      |                                     latest volume ≥ 1.10 × average |
| Zone merge distance      |                                                         0.35 × ATR |
| Confirmed zone threshold |                                                  at least 2 swings |
| Adaptive minimum spacing | max(1.15 × ATR, 12% of recent 24h range, 0.05% of reference price) |
| Assumed fee              |                                                     0.10% per side |

15M bullish requires close above EMA 50, EMA 7 > EMA 20 > EMA 50, and non-bearish structure. Bearish requires the inverse. RSI is momentum context only, never an independent buy/sell signal.

## Market-condition badge

The interface maps the assessment to a small independent badge:

- **BULLISH:** developing 15M trend and confirmation align.
- **BEARISH:** 15M trend is bearish.
- **NOT AN IDEAL ENTRY:** a bullish 15M trend is too extended or risk/reward is weak.
- **CAUTION:** 1H or 4H conflicts with the 15M direction.
- **NEUTRAL:** no directional advantage.

The badge does not control ladder visibility. Confidence is High, Medium, or Low and is never a probability.

## Four-buy intraday ladder

The ladder uses completed 15M data first:

1. Confirmed 15M support zones below current price.
2. EMA 7/20/50 below price.
3. Recent 15M swing lows.
4. 1H and 4H support context below price.
5. ATR estimates when confirmed candidates do not provide four distinct levels.

Nearby readings are first merged into one support zone when they sit within 45% of the adaptive minimum spacing. The remaining selected zones must be separated by at least the adaptive minimum spacing. This prevents EMA, swing, and support signals in the same small area from becoming separate orders.

When fewer than four distinct technical zones remain, the engine adds clearly marked **Estimated** 15M volatility projections. Their distance uses progressive adaptive spacing units of **0.9, 2.1, 3.5, 5.2, 7.2, and 9.5**. The adaptive unit responds to both 15M ATR and the high-low range of the latest 96 completed 15M candles (about 24 hours); it does not divide that range into equal orders. Buys are strictly ordered nearest-to-farthest below current price and are not equal-percentage orders.

Confirmed-support score is `2 × zone touches`, plus 2 for EMA 20/50 confluence and 1 for 15M volume confirmation. Swing, EMA, context, and estimated candidates receive scores of 3, 2, at least 1, and 1 respectively. Four selected levels receive an equal 25% capital allocation; currency rounding residue goes to BL1 so allocations equal global capital.

Invalidation uses the assessment invalidation if it remains below the deepest buy; otherwise it is 0.75 ATR below the deepest buy. Missing, non-finite, or non-positive current price/ATR produces a data-unavailable state instead of prices.

## Four balanced intraday targets

Targets use weighted average entry from the buy ladder:

1. **Near-term:** nearest meaningful 15M resistance/local supply.
2. **Main intraday:** next resistance or structure objective.
3. **Extended:** stronger resistance or ATR/risk-context projection.
4. **Stretch:** the next justified extension; it is labelled as such rather than represented as likely.

Nearby resistance readings are merged into one zone and targets must meet the same adaptive minimum spacing as buys. A target must be strictly above both the validated current price and fee-adjusted break-even (`average entry × 1.002`). If confirmed resistance is insufficient, estimated 15M volatility projections use the progressive adaptive units **0.9, 2.1, 3.5, 5.2, 7.2, and 9.5** from the higher of those two thresholds. Invalidation distance does not expand target spacing: it is a risk boundary, not an intraday upside projection. Targets are ordered upward and are marked **Estimated** when not zone-derived.

The hypothetical purchased quantity is distributed as TP1 **20%**, TP2 **30%**, TP3 **30%**, and TP4 **20%**. Total target quantity equals, and never exceeds, hypothetical bought quantity. For every target the tool calculates movement percentage, risk/reward, classification, and estimated net profit after a 0.10% fee on both entry and exit. Risk/reward validates the displayed result; it never pushes a target farther away just to meet a fixed R multiple.

## Coverage summaries

The analysis screen shows the validated current market price, BL1-to-BL4 coverage, each buy's distance from current price, total planned investment, estimated quantity, weighted average entry, and fee-inclusive average entry if all buys fill. It also shows fee-inclusive estimated net profit, net return, total net proceeds, and total fees if all take-profit tranches execute. All values are hypothetical planning estimates, not fills or guarantees.

## Calibration and limitations

The current rules are deterministic and testable, but no profitability or target-hit-rate claim is made. Live planning uses the latest 200 candles per timeframe, which is not a substitute for multi-period out-of-sample backtesting. Historical calibration must measure target hits, invalidations, holding times, and fee-adjusted outcomes across BTC, SOL, SUI, and bullish, bearish, and sideways periods before any performance claim is made.
