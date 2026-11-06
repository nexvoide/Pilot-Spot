import {
  type FormEvent,
  type SyntheticEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { analyzeMarket } from '@/lib/analysis/assessment';
import { prepareZoneAnalysis } from '@/lib/analysis/zone-analysis';
import { buildTechnicalLadder, validateLadderAgainstLivePrice } from '@/lib/calculations/ladders';
import { analysisConfig } from '@/lib/analysis/config';
import Decimal from '@/lib/calculations/financial-decimal';
import { useCapitalSettings } from '@/features/capital-settings/context';
import {
  marketDataQueryKeys,
  useDefaultMarketTickers,
  useEligibleSpotPairs,
  useMarketTickers,
  useMarketSnapshot,
} from '@/features/market-data/hooks';
import { useLiveTicker } from '@/features/market-data/useLiveTicker';
import { useLiveTickers } from '@/features/market-data/useLiveTickers';
import { useOnlineStatus } from '@/features/market-data/useOnlineStatus';
import type { LiveTicker } from '@/lib/binance/websocket';
import { defaultCoins } from '@/features/dashboard/default-coins';
import { displayProfit, displayTargetProfits } from '@/features/dashboard/profit-display';
import type { MarketTicker } from '@/lib/api/market-data';

const pendingLevels = [1, 2, 3, 4];
const pendingTargets = [1, 2, 3, 4];
const symbolAliases: Record<string, string> = {
  BITCOIN: 'BTC',
  ETHEREUM: 'ETH',
  SOLANA: 'SOL',
};

export function DashboardPage() {
  const { symbol } = useParams<{ symbol?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isAnalysisPage = location.pathname.startsWith('/analysis');
  const [pairQuery, setPairQuery] = useState('');
  const [submittedPair, setSubmittedPair] = useState<string | null>(symbol?.toUpperCase() ?? null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [technicalReferencePrice, setTechnicalReferencePrice] = useState<number | null>(null);
  const [ladderRecalculationPending, setLadderRecalculationPending] = useState(false);
  const lastLadderRecalculationAt = useRef(0);
  const ladderRecalculationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const { online, reconnectedAt } = useOnlineStatus();
  const defaultTickerQueries = useDefaultMarketTickers();
  const marketSnapshotQuery = useMarketSnapshot(submittedPair);
  const snapshotAsOf = marketSnapshotQuery.data?.asOf;
  const snapshotCurrentPrice = marketSnapshotQuery.data?.currentPrice;
  const { globalCapital, ladderMode, method, classicMode } = useCapitalSettings();
  const updateSelectedMarketPrice = useCallback(({ price }: { price: number }) => {
    setLivePrice(price);
  }, []);
  const liveTicker = useLiveTicker(submittedPair, updateSelectedMarketPrice);
  const updateDefaultMarketPrice = useCallback(
    ({ price, symbol, highPrice, lowPrice, priceChangePercent }: LiveTicker) => {
      queryClient.setQueryData<MarketTicker>(marketDataQueryKeys.ticker(symbol), (current) =>
        current === undefined
          ? current
          : {
              ...current,
              price,
              highPrice: highPrice ?? current.highPrice,
              lowPrice: lowPrice ?? current.lowPrice,
              priceChangePercent: priceChangePercent ?? current.priceChangePercent,
            },
      );
    },
    [queryClient],
  );
  useLiveTickers(
    defaultCoins.map((coin) => `${coin.symbol}USDT`),
    updateDefaultMarketPrice,
  );

  useEffect(() => {
    if (online && reconnectedAt > 0) {
      void queryClient.invalidateQueries({ queryKey: ['binance'] });
    }
  }, [online, queryClient, reconnectedAt]);

  useEffect(() => {
    setSubmittedPair(symbol?.toUpperCase() ?? null);
    setLivePrice(null);
    setTechnicalReferencePrice(null);
    setLadderRecalculationPending(false);
    lastLadderRecalculationAt.current = 0;
    if (ladderRecalculationTimer.current !== null) {
      clearTimeout(ladderRecalculationTimer.current);
      ladderRecalculationTimer.current = null;
    }
  }, [symbol]);

  useEffect(() => {
    if (snapshotCurrentPrice === undefined) {
      return;
    }

    setLivePrice((current) => current ?? snapshotCurrentPrice);
    setTechnicalReferencePrice(snapshotCurrentPrice);
  }, [snapshotAsOf, snapshotCurrentPrice]);

  useEffect(
    () => () => {
      if (ladderRecalculationTimer.current !== null) {
        clearTimeout(ladderRecalculationTimer.current);
      }
    },
    [],
  );

  const normalizedPair = useMemo(
    () =>
      pairQuery
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9/]/g, ''),
    [pairQuery],
  );
  const deferredPairQuery = useDeferredValue(normalizedPair);
  const eligiblePairsQuery = useEligibleSpotPairs(deferredPairQuery);

  const capitalValue = globalCapital;
  const technicalAnalysis = useMemo(() => {
    if (!online || !marketSnapshotQuery.data || marketSnapshotQuery.dataUpdatedAt < reconnectedAt) {
      return null;
    }

    return method === 'classic' ? analyzeMarket(marketSnapshotQuery.data.candles) : prepareZoneAnalysis(marketSnapshotQuery.data.candles);
  }, [marketSnapshotQuery.data, marketSnapshotQuery.dataUpdatedAt, online, reconnectedAt, method]);
  const technicalLadder = useMemo(() => {
    if (!technicalAnalysis || capitalValue === null) {
      return null;
    }

    const validatedCurrentPrice = technicalReferencePrice ?? marketSnapshotQuery.data?.currentPrice;

    return buildTechnicalLadder(
      technicalAnalysis,
      capitalValue,
      validatedCurrentPrice,
      marketSnapshotQuery.data?.filters ?? null,
      method === 'classic' ? classicMode : ladderMode,
      marketSnapshotQuery.data?.candles['1d'],
    );
  }, [
    capitalValue,
    marketSnapshotQuery.data?.currentPrice,
    marketSnapshotQuery.data?.filters,
    marketSnapshotQuery.data?.candles,
    technicalAnalysis,
    technicalReferencePrice,
    ladderMode,
    classicMode,
    method,
  ]);
  const liveLadderValidation = useMemo(
    () => validateLadderAgainstLivePrice(technicalLadder, livePrice),
    [livePrice, technicalLadder],
  );
  const livePriceIsCurrent =
    online &&
    liveTicker.status === 'live' &&
    liveTicker.lastUpdatedAt !== null &&
    livePrice !== null;

  useEffect(() => {
    if (
      livePrice === null ||
      technicalReferencePrice === null ||
      technicalAnalysis === null ||
      technicalLadder === null
    ) {
      return;
    }

    const movementThreshold = technicalReferencePrice * 0.0005;
    const hasMaterialMove = Math.abs(livePrice - technicalReferencePrice) >= movementThreshold;
    const shouldRecalculate = hasMaterialMove || !liveLadderValidation.valid;

    if (!shouldRecalculate || ladderRecalculationTimer.current !== null) {
      return;
    }

    setLadderRecalculationPending(true);
    const waitMs = Math.max(
      0,
      analysisConfig.ladderRecalculationMinimumIntervalMs -
        (Date.now() - lastLadderRecalculationAt.current),
    );
    ladderRecalculationTimer.current = setTimeout(() => {
      lastLadderRecalculationAt.current = Date.now();
      ladderRecalculationTimer.current = null;
      setTechnicalReferencePrice(livePrice);
      setLadderRecalculationPending(false);
    }, waitMs);
  }, [
    liveLadderValidation.valid,
    livePrice,
    technicalAnalysis,
    technicalLadder,
    technicalReferencePrice,
  ]);
  const displayTechnicalLadder =
    livePriceIsCurrent && !ladderRecalculationPending && liveLadderValidation.valid
      ? technicalLadder
      : null;
  const targetDisplayProfits = displayTechnicalLadder ? displayTargetProfits(displayTechnicalLadder.takeProfitTargets, displayTechnicalLadder.takeProfitSummary) : [];
  const ladderIsLoading = capitalValue !== null && !marketSnapshotQuery.isError &&
    !technicalLadder?.reason && (marketSnapshotQuery.isLoading || ladderRecalculationPending);
  const ladderBadge = capitalValue === null
    ? 'Capital needed'
    : marketSnapshotQuery.isError || technicalLadder?.reason
      ? 'Data unavailable'
      : displayTechnicalLadder
        ? method === 'classic' ? 'Classic plan' : 'Zones found'
        : ladderIsLoading ? 'Updating' : 'Waiting for live price';
  const pairMatches = useMemo(() => {
    if (!normalizedPair || !eligiblePairsQuery.data) {
      return [];
    }

    const normalizedSearch = normalizedPair.replace('/', '');

    return eligiblePairsQuery.data
      .filter(
        (pair) =>
          pair.symbol.includes(normalizedSearch) || pair.baseAsset.includes(normalizedSearch),
      )
      .slice(0, 6);
  }, [eligiblePairsQuery.data, normalizedPair]);
  const searchTickerQueries = useMarketTickers(pairMatches.map((pair) => pair.symbol));

  function handlePairSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizedPair.length > 0) {
      const normalizedSymbol = normalizedPair.replace('/', '');
      const selectedPair = eligiblePairsQuery.data?.find(
        (pair) => pair.symbol === normalizedSymbol,
      );

      if (selectedPair) {
        setPairError(null);
        setPairQuery(`${selectedPair.baseAsset}/${selectedPair.quoteAsset}`);
        openAnalysis(selectedPair.symbol);
        return;
      }

      const directSymbol = resolveDirectUsdtSymbol(normalizedPair);

      if (directSymbol !== null) {
        const baseAsset = directSymbol.slice(0, -4);
        setPairError(null);
        setPairQuery(`${baseAsset}/USDT`);
        openAnalysis(directSymbol);
        return;
      }

      if (!selectedPair) {
        setPairError('Select an eligible Binance Spot pair from the results.');
        return;
      }
    }
  }

  function selectPair(symbol: string, baseAsset: string, quoteAsset: string) {
    setPairError(null);
    setPairQuery(`${baseAsset}/${quoteAsset}`);
    openAnalysis(symbol);
  }

  function openAnalysis(symbol: string) {
    setSubmittedPair(symbol);
    navigate(`/analysis/${symbol}`);
  }


  return (
    <div className={isAnalysisPage ? 'coin-analysis-page' : 'dashboard'}>
      {!isAnalysisPage && (
        <>
          <section className="dashboard-intro" aria-labelledby="dashboard-title">
            <p className="eyebrow">Live spot market workspace</p>
            <h1 id="dashboard-title">Explore spot markets with a clear plan.</h1>
            <p>
              Live Binance public data, market context, and hypothetical levels—kept separate from
              execution.
            </p>
            {capitalValue === null && (
              <div className="setup-callout">
                <div><strong>Start with your planning capital</strong><span>Set an amount to calculate buying and take-profit levels.</span></div>
                <Link to="/setup-capital">Set capital <span aria-hidden="true">→</span></Link>
              </div>
            )}
          </section>

          <section className="default-market-section" aria-labelledby="market-list-title">
            <div className="default-market-heading">
              <div>
                <p className="eyebrow">Market overview</p>
                <h2 id="market-list-title">Spot market watchlist</h2>
              </div>
              <div className="market-list-search">
                <form onSubmit={handlePairSubmit}>
                  <label className="market-list-search-label" htmlFor="pair-search">
                    Pair symbol or name
                  </label>
                  <div className="pair-search-row">
                    <input
                      id="pair-search"
                      autoComplete="off"
                      aria-invalid={pairError !== null}
                      aria-describedby={pairError ? 'pair-search-error' : undefined}
                      onChange={(event) => {
                        setPairError(null);
                        setPairQuery(event.target.value);
                      }}
                      placeholder="Search BTC, SOL, or BTC/USDT"
                      type="search"
                      value={pairQuery}
                    />
                    <button
                      className="primary-button"
                      disabled={normalizedPair.length === 0}
                      type="submit"
                    >
                      Analyze
                    </button>
                  </div>
                </form>
                {normalizedPair.length > 0 && normalizedPair.length < 2 && (
                  <p className="market-search-feedback">Enter at least two characters to search.</p>
                )}
                {eligiblePairsQuery.isFetching && (
                  <p className="market-search-feedback">Searching eligible Spot pairs…</p>
                )}
                {eligiblePairsQuery.isError && (
                  <div className="query-error market-search-feedback" role="alert">
                    <span>Pair suggestions are unavailable. You can still analyze BTC or SOL.</span>
                    <button onClick={() => void eligiblePairsQuery.refetch()} type="button">
                      Retry
                    </button>
                  </div>
                )}
                {!eligiblePairsQuery.isLoading && pairMatches.length > 0 && (
                  <ul className="pair-results" aria-label="Eligible Spot pair results">
                    {pairMatches.map((pair, index) => {
                      const query = searchTickerQueries[index];
                      const ticker =
                        online && (query?.dataUpdatedAt ?? 0) >= reconnectedAt
                          ? query?.data
                          : undefined;
                      const logoUrl = getCoinLogoUrl(pair.baseAsset);

                      return (
                        <li key={pair.symbol}>
                          <button
                            onClick={() => selectPair(pair.symbol, pair.baseAsset, pair.quoteAsset)}
                            type="button"
                          >
                            <CoinLogo logoUrl={logoUrl} symbol={pair.baseAsset} />
                            <span className="pair-result-identity">
                              <strong>
                                {pair.baseAsset}/{pair.quoteAsset}
                              </strong>
                              <small>{pair.symbol} · Binance Spot</small>
                            </span>
                            <span className="pair-result-market-data">
                              <b>
                                {ticker
                                  ? `${formatPrice(ticker.price)} USDT`
                                  : online
                                    ? query?.isError ? 'Price unavailable' : 'Loading price…'
                                    : 'Offline'}
                              </b>
                              <small
                                className={
                                  ticker && ticker.priceChangePercent < 0
                                    ? 'negative-value'
                                    : 'positive-value'
                                }
                              >
                                {ticker
                                  ? `${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}% 24h`
                                  : online
                                    ? 'Market data unavailable'
                                    : 'Offline'}
                              </small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {pairError && (
                  <p id="pair-search-error" className="field-error market-search-feedback" role="alert">
                    {pairError}
                  </p>
                )}
                {normalizedPair.length >= 2 &&
                  !eligiblePairsQuery.isFetching &&
                  !eligiblePairsQuery.isError &&
                  pairMatches.length === 0 && (
                    <p className="market-search-feedback">
                      No active USDT Spot pair found for this search.
                    </p>
                  )}
              </div>
              <span>{online ? 'Public market data' : 'Offline · market data unavailable'}</span>
            </div>
            <div className="default-market-columns" aria-hidden="true">
              <span>Market</span>
              <span>Price</span>
              <span>24h</span>
              <span>24h range</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            <ul className="default-coin-list">
              {defaultCoins.map((coin, index) => {
                const query = defaultTickerQueries[index];
                const ticker =
                  online && (query?.dataUpdatedAt ?? 0) >= reconnectedAt ? query?.data : undefined;
                const status = marketStatusFromChange(ticker?.priceChangePercent ?? null);
                return (
                  <li key={coin.symbol}>
                    <button
                      aria-label={`Open ${coin.symbol} analysis`}
                      className="default-coin-row"
                      onClick={() => selectPair(`${coin.symbol}USDT`, coin.symbol, 'USDT')}
                      type="button"
                    >
                      <span className="default-coin-identity">
                        <CoinLogo logoUrl={coin.logoUrl} symbol={coin.symbol} />
                        <span>
                          <strong>{coin.symbol}</strong>
                          <small>{coin.name} · USDT</small>
                        </span>
                      </span>
                      <span className="default-coin-price">
                        {ticker
                          ? `${formatPrice(ticker.price)} USDT`
                          : online
                            ? query?.isError ? 'Unavailable' : 'Loading…'
                            : 'Offline'}
                      </span>
                      <span
                        className={
                          ticker && ticker.priceChangePercent < 0
                            ? 'default-coin-change negative-value'
                            : 'default-coin-change positive-value'
                        }
                      >
                        {ticker
                          ? `${ticker.priceChangePercent >= 0 ? '+' : ''}${ticker.priceChangePercent.toFixed(2)}%`
                          : '—'}
                      </span>
                      <span className="default-coin-range">
                        {ticker
                          ? `${formatPrice(ticker.lowPrice)} – ${formatPrice(ticker.highPrice)}`
                          : '—'}
                      </span>
                      <span className={`default-coin-status default-coin-status-${status.tone}`}>
                        {ticker ? status.label : '—'}
                      </span>
                      <span className="default-coin-action" aria-hidden="true">
                        Analyze <b>→</b>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {isAnalysisPage && (
        <>
          <div className="analysis-toolbar">
            <Link to="/coins" className="analysis-back">← All markets</Link>
            <Link to="/setup-capital" className="analysis-settings">{capitalValue === null ? 'Set capital & timeframe' : `Capital & method · ${method === 'classic' ? classicMode : ladderMode}`} <span aria-hidden="true">↗</span></Link>
          </div>
          <section className="analysis-status" aria-live="polite" aria-labelledby="analysis-title">
            <div className="status-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 19V5m0 14h16" />
                <path d="m7 15 4-4 3 2 5-6" />
              </svg>
            </div>
            <div>
              <p className="step-label">Market analysis</p>
              <h2 id="analysis-title">
                {technicalAnalysis
                  ? `${submittedPair ?? 'Selected pair'} market condition`
                  : submittedPair
                    ? `${submittedPair} is ready for analysis.`
                    : 'Choose a pair to begin.'}
              </h2>
              <p>
                {!online
                  ? 'You are offline. Live market data and analysis are unavailable.'
                  : marketSnapshotQuery.dataUpdatedAt < reconnectedAt
                    ? 'Reconnecting and refreshing market data…'
                    : marketSnapshotQuery.isLoading
                      ? 'Retrieving the latest price and market candles…'
                      : marketSnapshotQuery.isError
                        ? formatMarketDataError(marketSnapshotQuery.error)
                        : technicalAnalysis && marketSnapshotQuery.data
                          ? `${livePriceIsCurrent ? 'Latest price' : 'Last retrieved price'}: ${formatPrice(livePriceIsCurrent ? livePrice! : marketSnapshotQuery.data.currentPrice)} USDT. ${method === 'classic' ? `Classic ${classicMode} indicator-based plan.` : `${ladderMode.toUpperCase()} support and resistance zones are used for this plan.`}`
                          : submittedPair
                            ? 'Live market data will appear here when available.'
                            : 'Market status and hypothetical planning levels are shown separately.'}
              </p>
              {technicalAnalysis && marketSnapshotQuery.data && (
                <p className="analysis-price-reference">
                  Analysis reference: {formatPrice(marketSnapshotQuery.data.currentPrice)} USDT ·{' '}
                  {marketSnapshotQuery.data.provider} snapshot at{' '}
                  {formatAnalysisTime(marketSnapshotQuery.data.asOf)}.
                  {livePrice !== null &&
                    Math.abs(livePrice - marketSnapshotQuery.data.currentPrice) >
                      marketSnapshotQuery.data.currentPrice * 0.00001 && (
                      <> Live price: {formatPrice(livePrice)} USDT.</>
                    )}
                </p>
              )}
              {technicalAnalysis && marketSnapshotQuery.data && (
                <p className="analysis-updated">
                  Last analysis update: {formatAnalysisTime(marketSnapshotQuery.data.asOf)} · Uses
                  completed {method === 'classic' ? '15m' : ladderMode} candles. Last completed candle:{' '}
                  {formatAnalysisTime(
                    (method === 'classic' ? technicalAnalysis.timeframes['15m'].candles.at(-1) : ladderMode === '1d' ? marketSnapshotQuery.data.candles['1d']?.at(-2) : technicalAnalysis.timeframes[ladderMode].candles.at(-1))?.closeTime ??
                      marketSnapshotQuery.data.asOf,
                  )}
                  .
                </p>
              )}
              {technicalAnalysis && marketSnapshotQuery.data && (
                <p
                  className={`live-status live-status-${displayTechnicalLadder ? 'live' : 'stale'}`}
                >
                  {formatLadderSyncStatus(
                    ladderRecalculationPending,
                    liveLadderValidation.status,
                    liveTicker.status,
                    liveTicker.lastUpdatedAt !== null,
                  )}
                </p>
              )}
              {submittedPair &&
                (liveTicker.status === 'stale' || liveTicker.status === 'disconnected') && (
                  <p className={`live-status live-status-${liveTicker.status}`}>
                    {formatLiveStatus(liveTicker.status)}
                  </p>
                )}
              {marketSnapshotQuery.isError && (
                <button
                  className="retry-analysis-button"
                  onClick={() => void marketSnapshotQuery.refetch()}
                  type="button"
                >
                  Retry market data
                </button>
              )}
            </div>
          </section>

          <section className="plans-grid" aria-label="Suggested trading plan">
            <article className="plan-card">
              <div className="card-title-row">
                <div>
                  <p className="step-label">Potential entries</p>
                  <h2>Buying ladder</h2>
                </div>
                <span className="pending-badge">
                  {ladderBadge}
                </span>
              </div>
              <p className="card-description">
                {technicalLadder?.reason ??
                  (!displayTechnicalLadder
                    ? capitalValue === null
                      ? 'Set your planning capital to calculate buying levels.'
                      : marketSnapshotQuery.isError
                        ? 'Market data could not be loaded. Retry using the button above.'
                      : !livePriceIsCurrent
                        ? 'Waiting for a current live price to show your buying levels.'
                        : 'Revalidating your plan against the latest price…'
                    : method === 'classic' ? 'Buying limits use volatility, technical levels, and active and broken indicator zones with the selected spacing.' : 'Overlapping active and broken support areas with centers within 1% are grouped. Each buy uses the lowest center in a group.')}
              </p>
              {capitalValue === null && <Link className="ladder-setup-link" to="/setup-capital">Set planning capital <span aria-hidden="true">→</span></Link>}
              {(displayTechnicalLadder || ladderIsLoading) && <ol className="level-list" aria-label="Buying levels" aria-busy={ladderIsLoading}>
                {displayTechnicalLadder && displayTechnicalLadder.buyingLevels.length > 0
                  ? displayTechnicalLadder.buyingLevels.map((level, index) => (
                      <li className="order-row buy-order" key={level.price} data-quantity={level.quantity}>
                        <span className="order-index"><span>BUY</span><strong>BL{index + 1}</strong></span>
                        <span className="order-value order-price"><span>Limit price</span><strong>{formatOrderPrice(level.price, marketSnapshotQuery.data?.filters?.tickSize)} <small>USDT</small></strong>{level.estimated && <em>Estimated level</em>}</span>
                        <span className="order-value"><span>Amount · before fees</span><strong>{formatCurrency(level.allocation)}</strong></span>
                        <span className="order-value"><span>Quantity</span><strong>{level.quantity}</strong></span>
                        <span className="order-share"><strong>{level.allocationPercent}%</strong><span>of budget</span></span>
                      </li>
                    ))
                  : pendingLevels.map((level) => (
                      <li key={level}>
                        <span className="level-number">{level}</span>
                        <span className="level-placeholder" />
                        <span className="level-placeholder level-placeholder-short" />
                      </li>
                    ))}
              </ol>}
              {displayTechnicalLadder?.buyingSummary && (
                <section className="plan-overview buy-overview" aria-label="Buying summary">
                  <div className="overview-heading"><div><span className="overview-eyebrow">POSITION OVERVIEW</span><h3>If all buys fill</h3></div><span className="overview-tag">Estimated</span></div>
                  <div className="profit-highlight average-buy-highlight">
                    <div><span>Average buy price · incl. buy fees</span><strong>{formatPrice(displayTechnicalLadder.buyingSummary.estimatedAverageEntryIncludingFees)} <small>USDT</small></strong></div>
                  </div>
                  <dl className="overview-metrics">
                    <div><dt>Total invested <span>incl. buy fees</span></dt><dd>{formatCurrency(displayTechnicalLadder.buyingSummary.totalPlannedInvestment)}</dd></div>
                    <div><dt>Total quantity</dt><dd>{displayTechnicalLadder.buyingSummary.totalQuantity.toString()}</dd></div>
                  </dl>
                  <details className="overview-details">
                    <summary><span>View buying details</span><span aria-hidden="true">+</span></summary>
                    <dl className="overview-breakdown">
                      <div><dt>Validated current price</dt><dd>{formatPrice(displayTechnicalLadder.buyingSummary.currentPrice)} USDT</dd></div>
                      <div><dt>Buying coverage</dt><dd>{formatPercent(displayTechnicalLadder.buyingSummary.coveragePercent)}</dd></div>
                      <div><dt>Distances from price</dt><dd>{displayTechnicalLadder.buyingSummary.distancesFromCurrentPercent.map((distance, index) => `BL${index + 1} ${formatPercent(distance)}`).join(' · ')}</dd></div>
                      <div><dt>Lowest buy</dt><dd>{formatPrice(displayTechnicalLadder.buyingSummary.lowestLevel)} USDT</dd></div>
                      <div><dt>Weighted average before fees</dt><dd>{formatPrice(displayTechnicalLadder.buyingSummary.weightedAverageEntry)} USDT</dd></div>
                    </dl>
                  </details>
                </section>
              )}
            </article>

            <article className="plan-card">
              <div className="card-title-row">
                <div>
                  <p className="step-label">Potential exits</p>
                  <h2>Take-profit ladder</h2>
                </div>
                <span className="pending-badge">
                  {ladderBadge}
                </span>
              </div>
              <p className="card-description">
                {technicalLadder?.reason ??
                  (!displayTechnicalLadder
                    ? capitalValue === null
                      ? 'Set your planning capital to calculate take-profit targets.'
                      : marketSnapshotQuery.isError
                        ? 'Market data could not be loaded. Retry using the button above.'
                      : !livePriceIsCurrent
                        ? 'Waiting for a current live price to show your take-profit targets.'
                        : 'Revalidating your plan against the latest price…'
                    : method === 'classic' ? 'Targets use volatility, technical resistance, and active and broken indicator zones with the selected spacing.' : 'Overlapping active and broken resistance areas with centers within 1% are grouped. Each target uses the lowest center in a group.')}
              </p>
              {capitalValue === null && <Link className="ladder-setup-link" to="/setup-capital">Set planning capital <span aria-hidden="true">→</span></Link>}
              {(displayTechnicalLadder || ladderIsLoading) && <ol className="level-list" aria-label="Take-profit targets" aria-busy={ladderIsLoading}>
                {displayTechnicalLadder && displayTechnicalLadder.takeProfitTargets.length > 0
                  ? displayTechnicalLadder.takeProfitTargets.map((target, index) => (
                      <li className="order-row sell-order" key={target.price} data-quantity={target.quantity}>
                        <span className="order-index"><span>SELL</span><strong>TP{index + 1}</strong></span>
                        <span className="order-value order-price"><span>Target price</span><strong>{formatOrderPrice(target.price, marketSnapshotQuery.data?.filters?.tickSize)} <small>USDT</small></strong>{target.estimated && <em>Estimated level</em>}</span>
                        <span className="order-value"><span>Quantity to sell</span><strong>{target.quantity}</strong></span>
                        <span className="order-value"><span>Est. net profit</span><strong>{formatCurrency(targetDisplayProfits[index])}</strong></span>
                        <span className="order-share"><strong>{target.allocationPercent}%</strong><span>planned</span></span>
                      </li>
                    ))
                  : pendingTargets.map((target) => (
                      <li key={target}>
                        <span className="level-number target-number">TP{target}</span>
                        <span className="level-placeholder" />
                        <span className="level-placeholder level-placeholder-short" />
                      </li>
                    ))}
              </ol>}
              {displayTechnicalLadder?.takeProfitSummary && (
                <section className="plan-overview sell-overview" aria-label="Take-profit summary">
                  <div className="overview-heading"><div><span className="overview-eyebrow">PROJECTED OUTCOME</span><h3>If all targets fill</h3></div><span className="overview-tag">After fees</span></div>
                  <div className="profit-highlight">
                    <div><span>Estimated net profit</span><strong>{formatCurrency(displayProfit(displayTechnicalLadder.takeProfitSummary))}</strong></div>
                    <div className="profit-return"><span>Net return</span><strong>{formatPercent(displayTechnicalLadder.takeProfitSummary.totalEstimatedNetReturnPercent)}</strong></div>
                  </div>
                  <dl className="outcome-metrics">
                    <div><dt>Total invested</dt><dd>{formatCurrency(displayTechnicalLadder.takeProfitSummary.totalInvestedCapital)}</dd></div>
                    <div><dt>Net proceeds</dt><dd>{formatCurrency(displayTechnicalLadder.takeProfitSummary.estimatedTotalNetProceeds)}</dd></div>
                    <div><dt>Estimated fees</dt><dd>{formatCurrency(displayTechnicalLadder.takeProfitSummary.estimatedFees)}</dd></div>
                  </dl>
                  <p className="overview-assumption">Estimates assume full fills and a 0.1% fee on each side.</p>
                  <details className="overview-details">
                    <summary><span>View outcome details</span><span aria-hidden="true">+</span></summary>
                    <dl className="overview-breakdown">
                      <div><dt>Average entry before fees</dt><dd>{formatPrice(displayTechnicalLadder.takeProfitSummary.weightedAverageEntry)} USDT</dd></div>
                      {displayTechnicalLadder.takeProfitSummary.unsoldQuantity > 0 && <div><dt>Unallocated quantity after rounding</dt><dd>{displayTechnicalLadder.takeProfitSummary.unsoldQuantity.toString()}</dd></div>}
                    </dl>
                    <p>Assumes all four buys and sells fill at the shown prices, with a 0.1% fee on each side paid in USDT. The final sell includes quantity left by rounding. Partial fills require recalculation from actual fills and fees.</p>
                  </details>
                </section>
              )}
            </article>
          </section>

          {displayTechnicalLadder?.reason === null && (
            <p className="ladder-summary-note">
              Hypothetical planning estimates only. They are not filled orders, guaranteed targets,
              or financial advice.
            </p>
          )}

          {displayTechnicalLadder && displayTechnicalLadder.reason === null && (
            <details className="level-rationale">
              <summary>Why these levels?</summary>
              <p>
                Hypothetical average entry: {formatPrice(displayTechnicalLadder.averageEntry ?? 0)}{' '}
                USDT. Invalidation reference:{' '}
                {formatPrice(displayTechnicalLadder.invalidationLevel ?? 0)} USDT. These are
                planning estimates, not executed orders or a recommendation to buy now.
              </p>
              <ul>
                {displayTechnicalLadder.buyingLevels.map((level, index) => (
                  <li key={`buy-reason-${level.price}`}>
                    Buy {index + 1}: {level.reasons.join(' · ')}
                  </li>
                ))}
                {displayTechnicalLadder.takeProfitTargets.map((target, index) => (
                  <li key={`target-reason-${target.price}`}>
                    TP{index + 1}: {target.reasons.join(' · ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
  }).format(value);
}

function formatOrderPrice(value: number, tickSize?: string): string {
  const decimals = Math.max(4, tickSize?.split('.')[1]?.replace(/0+$/, '').length ?? 0);
  const [whole, fraction] = new Decimal(value).toFixed(decimals).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatLiveStatus(status: string): string {
  if (status === 'live') {
    return 'Live price connection active.';
  }

  if (status === 'connecting' || status === 'reconnecting') {
    return 'Connecting to live public market data…';
  }

  if (status === 'stale') {
    return 'Live price data is stale. Reconnecting…';
  }

  return 'Live price connection is unavailable.';
}

function formatLadderSyncStatus(
  pending: boolean,
  status: 'buy-level-crossed' | 'current' | 'data-unavailable' | 'target-crossed',
  liveStatus: string,
  hasLiveTick: boolean,
): string {
  if (liveStatus !== 'live' || !hasLiveTick) {
    return 'Live price is unavailable or stale. The technical ladder is not shown as current.';
  }

  if (pending) {
    return 'Technical ladder is being recalculated from the latest validated market price.';
  }

  if (status === 'buy-level-crossed') {
    return 'Price crossed a planned buy level. The previous ladder is no longer shown as current.';
  }

  if (status === 'target-crossed') {
    return 'Price crossed a planned take-profit level. The previous ladder is no longer shown as current.';
  }

  if (status === 'current') {
    return 'Technical ladder is current against the latest live price.';
  }

  return 'Technical ladder is awaiting valid live market data.';
}

function formatAnalysisTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}

function marketStatusFromChange(change: number | null): {
  label: 'BEARISH' | 'BULLISH' | 'CAUTION' | 'NEUTRAL';
  tone: 'bearish' | 'bullish' | 'caution' | 'neutral';
} {
  if (change === null) {
    return { label: 'NEUTRAL', tone: 'neutral' };
  }
  if (change >= 2) {
    return { label: 'BULLISH', tone: 'bullish' };
  }
  if (change <= -2) {
    return { label: 'BEARISH', tone: 'bearish' };
  }
  if (Math.abs(change) >= 1) {
    return { label: 'CAUTION', tone: 'caution' };
  }
  return { label: 'NEUTRAL', tone: 'neutral' };
}

function CoinLogo({ logoUrl, symbol }: { logoUrl?: string; symbol: string }) {
  return (
    <span className={`coin-logo coin-logo-${symbol.toLowerCase()}`} aria-hidden="true">
      <CoinMark symbol={symbol} />
      {logoUrl && <img alt="" className="coin-logo-image" onError={hideBrokenLogo} src={logoUrl} />}
    </span>
  );
}

function getCoinLogoUrl(symbol: string): string {
  const bundledLogo = defaultCoins.find((coin) => coin.symbol === symbol)?.logoUrl;

  if (bundledLogo) {
    return bundledLogo;
  }

  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${encodeURIComponent(
    symbol.toLowerCase(),
  )}.svg`;
}

function hideBrokenLogo(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

function CoinMark({ symbol }: { symbol: string }) {
  if (symbol === 'SOL') {
    return (
      <svg className="coin-logo-svg" viewBox="0 0 32 32">
        <defs>
          <linearGradient id="sol-gradient" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#14f195" />
            <stop offset="1" stopColor="#9945ff" />
          </linearGradient>
        </defs>
        <path d="M8 7h17l-4 4H4zM8 14h17l-4 4H4zM8 21h17l-4 4H4z" fill="url(#sol-gradient)" />
      </svg>
    );
  }

  if (symbol === 'ETH') {
    return (
      <svg className="coin-logo-svg" viewBox="0 0 32 32">
        <path d="m16 3 8 13-8 4.5L8 16z" fill="#dbe5ff" />
        <path d="m16 3v17.5L8 16z" fill="#8faeff" />
        <path d="m16 29 8-11-8 4.5L8 18z" fill="#b9caff" />
      </svg>
    );
  }

  if (symbol === 'BNB') {
    return (
      <svg className="coin-logo-svg" viewBox="0 0 32 32">
        <path
          d="m16 5 4 4-4 4-4-4zm-7 7 4 4-4 4-4-4zm14 0 4 4-4 4-4-4zm-7 7 4 4-4 4-4-4z"
          fill="currentColor"
        />
        <path d="m16 12 4 4-4 4-4-4z" fill="currentColor" />
      </svg>
    );
  }

  if (symbol === 'LINK') {
    return (
      <svg className="coin-logo-svg" viewBox="0 0 32 32">
        <path d="m16 4 10 6v12l-10 6-10-6V10z" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    );
  }

  if (symbol === 'SUI') {
    return (
      <svg className="coin-logo-svg" viewBox="0 0 32 32">
        <path
          d="M16 4c5 6.7 8 10.7 8 15a8 8 0 1 1-16 0c0-4.3 3-8.3 8-15Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <path
          d="M11 21c2.2 1.2 6.8 1.2 10 0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (symbol === 'XRP') {
    return (
      <svg className="coin-logo-svg" viewBox="0 0 32 32">
        <path
          d="M7 8c3 0 4 7 9 7s6-7 9-7M7 24c3 0 4-7 9-7s6 7 9 7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.8"
        />
      </svg>
    );
  }

  return <span>{coinMarks[symbol] ?? symbol.slice(0, 2)}</span>;
}

const coinMarks: Record<string, string> = {
  AAVE: 'A',
  BTC: '₿',
  HYPE: 'H',
  INJ: 'I',
  NEAR: 'N',
  UNI: 'U',
  ZEC: 'Z',
};

function resolveDirectUsdtSymbol(query: string): string | null {
  const compactQuery = query.replace('/', '');
  const asset = symbolAliases[compactQuery] ?? compactQuery.replace(/USDT$/, '');

  if (!/^[A-Z0-9]{2,16}$/.test(asset)) {
    return null;
  }

  return `${asset}USDT`;
}

function formatMarketDataError(error: unknown): string {
  if (error instanceof Error) {
    return `Current market data could not be retrieved: ${error.message}`;
  }

  return 'Current market data could not be retrieved. Please try again shortly.';
}
