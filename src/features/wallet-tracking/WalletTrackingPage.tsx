import { useEffect, useRef, useState } from "react";
import {
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getTrackerStatus, getWalletDetails, getWalletExtras } from "./tracker";
import type { WalletDetails, WalletPosition } from "./types";
import { capitalCategory, type CapitalSnapshot } from "./capital";

const REFRESH_MS = 60_000;
const PAGE_SIZE = 100;
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const preciseNumber = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 12,
});
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const exactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 15,
});
const money = (value: number | null) => {
  if (value === null) return "—";
  if (Math.abs(value) >= 1000) return compactCurrency.format(value);
  return value !== 0 && Math.abs(value) < 0.01
    ? exactCurrency.format(value)
    : currency.format(value);
};
const exactMoney = (value: number | null) =>
  value === null ? undefined : exactCurrency.format(value);
const price = (value: number | null) =>
  value === null
    ? "—"
    : Math.abs(value) >= 1000
      ? compactCurrency.format(value)
      : exactCurrency.format(value);
const number = (value: number) =>
  Math.abs(value) >= 1000
    ? compactNumber.format(value)
    : preciseNumber.format(value);
const tone = (value: number | null) =>
  value === null || value === 0 ? "" : value > 0 ? "positive" : "negative";
const signedMoney = (value: number | null) =>
  value !== null && value > 0 ? `+${money(value)}` : money(value);
function openPnl(positions: WalletPosition[] | undefined): number | null {
  return positions &&
    positions.every((position) => position.unrealizedPnl !== null)
    ? positions.reduce((sum, position) => sum + position.unrealizedPnl!, 0)
    : null;
}

function Metric({
  label,
  value,
  tone: color,
  detail,
  primary = false,
}: {
  label: string;
  value: string;
  tone?: string;
  detail?: string;
  primary?: boolean;
}) {
  return (
    <div className={`whale-metric${primary ? " whale-metric-primary" : ""}`}>
      <dt>{label}</dt>
      <dd className={color} title={detail}>
        {value}
      </dd>
    </div>
  );
}

function CapitalBadge({ snapshot }: { snapshot?: CapitalSnapshot }) {
  const category = capitalCategory(snapshot?.valueUsd);
  return category && snapshot ? (
    <span
      className={`whale-badge category-${category.toLowerCase()}`}
      title={`Reported account value ${exactMoney(snapshot.valueUsd)} on ${new Date(snapshot.asOf).toLocaleDateString()}; not a live balance`}
    >
      {category}
    </span>
  ) : null;
}

function WalletOverview({
  queries,
  wallets,
  capital,
  paginated,
}: {
  queries: UseQueryResult<WalletDetails, Error>[];
  wallets: string[];
  capital: Record<string, CapitalSnapshot>;
  paginated: boolean;
}) {
  const accounts = queries.flatMap((query) =>
    query.data?.account ? [query.data.account] : [],
  );
  const partial =
    accounts.length !== queries.length ||
    queries.some((query) => query.isError);
  const exposureValues = accounts.flatMap((account) =>
    account.positionValue === null ? [] : [account.positionValue],
  );
  const pnls = accounts.map((account) => openPnl(account.positions));
  const validPnls = pnls.filter((pnl): pnl is number => pnl !== null);
  const noData = queries.length > 0 && accounts.length === 0;
  const exposure =
    noData || (accounts.length > 0 && exposureValues.length === 0)
      ? null
      : exposureValues.reduce((sum, value) => sum + Math.abs(value), 0);
  const pnl =
    noData || (accounts.length > 0 && validPnls.length === 0)
      ? null
      : validPnls.reduce((sum, value) => sum + value, 0);
  const positions = accounts.reduce(
    (sum, account) => sum + account.positions.length,
    0,
  );
  const categories = wallets.flatMap((address) => {
    const category = capitalCategory(capital[address]?.valueUsd);
    return category ? [category] : [];
  });
  const categoryCounts = ["Leviathan", "Whale", "Shark", "Minnow"].map(
    (category) =>
      `${categories.filter((item) => item === category).length} ${category}`,
  );
  const note = partial
    ? `Partial · ${accounts.length}/${queries.length} wallets`
    : `${queries.length} wallets checked`;
  return (
    <section className="whale-overview" aria-label="Wallet overview">
      <div className="whale-overview-item">
        <span>
          {partial || exposureValues.length < accounts.length
            ? "Known position value"
            : "Total position value"}
        </span>
        <strong title={exactMoney(exposure)}>{money(exposure)}</strong>
        <small>{note}</small>
      </div>
      <div className="whale-overview-item">
        <span>
          {partial || validPnls.length < accounts.length
            ? "Known unrealized P&L"
            : "Unrealized P&L"}
        </span>
        <strong className={tone(pnl)} title={exactMoney(pnl)}>
          {signedMoney(pnl)}
        </strong>
        <small>
          {validPnls.length < accounts.length ? "Some P&L unavailable" : note}
        </small>
      </div>
      <div className="whale-overview-item">
        <span>Open positions</span>
        <strong>{noData ? "—" : positions}</strong>
        <small>{partial ? note : "Main perpetuals market"}</small>
      </div>
      <div className="whale-overview-item">
        <span>Classified wallets</span>
        <strong>{categories.length}</strong>
        <small>
          {paginated ? "Current page · " : ""}
          {categoryCounts.join(" · ")} · snapshots
        </small>
      </div>
    </section>
  );
}

function MarketPositionsChart({
  queries,
  paginated,
}: {
  queries: UseQueryResult<WalletDetails, Error>[];
  paginated: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const accounts = queries.flatMap((query) =>
    query.data?.account ? [query.data.account] : [],
  );
  const stale = queries.some((query) => query.isError && query.data?.account);
  const unavailable = accounts.length !== queries.length || stale;
  const noData = queries.length > 0 && accounts.length === 0;
  const counts = new Map<
    string,
    { coin: string; longs: number; shorts: number }
  >();
  for (const account of accounts) {
    const longCoins = new Set<string>();
    const shortCoins = new Set<string>();
    for (const position of account.positions) {
      const coin = position.coin.toUpperCase();
      if (position.size > 0) longCoins.add(coin);
      if (position.size < 0) shortCoins.add(coin);
    }
    for (const coin of new Set([...longCoins, ...shortCoins])) {
      const count = counts.get(coin) ?? { coin, longs: 0, shorts: 0 };
      if (longCoins.has(coin)) count.longs++;
      if (shortCoins.has(coin)) count.shorts++;
      counts.set(coin, count);
    }
  }
  const markets = [...counts.values()].sort(
    (a, b) =>
      b.longs + b.shorts - a.longs - a.shorts || a.coin.localeCompare(b.coin),
  );
  const bitcoin = counts.get("BTC");
  const otherMarkets = markets.filter((market) => market.coin !== "BTC");
  return (
    <section
      className="whale-market-chart"
      aria-label="Market positions across tracked wallets"
    >
      <div className="whale-market-heading">
        <div>
          <h2>Open positions by market</h2>
          <p>
            Number of tracked wallets · main perpetuals
            {paginated ? " · current page" : ""}
          </p>
        </div>
        <span>
          {unavailable
            ? `${accounts.length}/${queries.length} wallets checked${stale ? " · refresh failed" : ""}`
            : `${accounts.length} wallets checked`}
        </span>
      </div>
      <button
        className="whale-market-trigger"
        type="button"
        aria-expanded={expanded}
        aria-controls="whale-other-markets"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="whale-market-bitcoin">
          <span className="whale-btc-icon" aria-hidden="true">
            ₿
          </span>
          <span>
            <strong>BTC</strong>
            <small>Bitcoin positions</small>
          </span>
        </span>
        <MarketCountBoxes
          longs={noData ? null : (bitcoin?.longs ?? 0)}
          shorts={noData ? null : (bitcoin?.shorts ?? 0)}
        />
        <span className="whale-market-toggle">
          {expanded ? "Hide other markets" : "Show other markets"}{" "}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </span>
      </button>
      <div
        id="whale-other-markets"
        className="whale-other-markets"
        hidden={!expanded}
      >
        {noData ? (
          <p className="whale-market-message">
            {queries.some((query) => query.isPending)
              ? "Loading positions…"
              : "Position data is temporarily unavailable."}
          </p>
        ) : otherMarkets.length === 0 ? (
          <p className="whale-market-message">
            No other open markets in the checked wallets.
          </p>
        ) : (
          <ol
            className="whale-market-list"
            aria-label="Other markets ranked by open positions"
            tabIndex={0}
          >
            {otherMarkets.map(({ coin, longs, shorts }) => (
              <li className="whale-market-row" key={coin}>
                <span className="whale-market-coin" title={coin}>
                  <strong>{coin}</strong>
                  <small>{longs + shorts} total</small>
                </span>
                <MarketCountBoxes longs={longs} shorts={shorts} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function MarketCountBoxes({
  longs,
  shorts,
}: {
  longs: number | null;
  shorts: number | null;
}) {
  return (
    <span className="whale-market-counts">
      <span className="whale-count-box long">
        <strong>{longs ?? "—"}</strong>
        <span>Long</span>
      </span>
      <span className="whale-count-box short">
        <strong>{shorts ?? "—"}</strong>
        <span>Short</span>
      </span>
    </span>
  );
}

function Position({ position }: { position: WalletPosition }) {
  return (
    <div className="whale-position">
      <div className="whale-position-heading">
        <div>
          <strong>{position.coin}</strong>
          <span
            className={`whale-direction ${position.size > 0 ? "long" : "short"}`}
          >
            {position.size > 0 ? "Long" : "Short"}
          </span>
          {position.leverage !== null && (
            <span className="whale-leverage">
              {number(position.leverage)}×
              {position.marginMode ? ` ${position.marginMode}` : ""}
            </span>
          )}
        </div>
        <div className="whale-position-pnl">
          <strong
            className={tone(position.unrealizedPnl)}
            title={exactMoney(position.unrealizedPnl)}
          >
            {signedMoney(position.unrealizedPnl)}
          </strong>
          {position.returnOnEquity !== null && (
            <small className={tone(position.returnOnEquity)}>
              {new Intl.NumberFormat("en-US", {
                maximumFractionDigits: 2,
              }).format(position.returnOnEquity * 100)}
              % ROE
            </small>
          )}
        </div>
      </div>
      <dl className="whale-position-grid">
        <Metric
          label="Size"
          value={`${number(Math.abs(position.size))} ${position.coin}`}
          detail={`${preciseNumber.format(Math.abs(position.size))} ${position.coin}`}
        />
        <Metric
          label="Position value"
          value={money(position.positionValue)}
          detail={exactMoney(position.positionValue)}
        />
        <Metric
          label="Entry price"
          value={price(position.entryPrice)}
          detail={exactMoney(position.entryPrice)}
        />
        <Metric
          label="Liq. price"
          value={price(position.liquidationPrice)}
          detail={exactMoney(position.liquidationPrice)}
        />
        <Metric
          label="Margin used"
          value={money(position.marginUsed)}
          detail={exactMoney(position.marginUsed)}
        />
        <Metric
          label="Funding since open"
          value={money(position.fundingSinceOpen)}
          detail={exactMoney(position.fundingSinceOpen)}
        />
      </dl>
    </div>
  );
}

function WalletCard({
  address,
  name,
  query,
  capital,
}: {
  address: string;
  name: string;
  query: UseQueryResult<WalletDetails, Error>;
  capital?: CapitalSnapshot;
}) {
  const details = query.data;
  const cardRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const supportsObserver = typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const extras = useQuery({
    queryKey: ["wallet-extras", address],
    queryFn: ({ signal }) => getWalletExtras(address, signal),
    enabled: visible && Boolean(details?.account),
    staleTime: 300_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const portfolio = extras.data?.portfolio ?? details?.portfolio ?? null;
  const orders = extras.data?.orders ?? details?.orders ?? null;
  const positions = details?.account?.positions;
  const sortedPositions = positions
    ? [...positions].sort(
        (a, b) =>
          Math.abs(b.positionValue ?? 0) - Math.abs(a.positionValue ?? 0),
      )
    : [];
  const pnl = openPnl(positions);
  return (
    <article className="whale-card" ref={cardRef}>
      <div className="whale-card-header">
        <div className="whale-identity">
          <span className="whale-avatar" aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="whale-name-line">
              <h3>{name}</h3>
              <CapitalBadge snapshot={capital} />
            </div>
            <code title={address}>{address}</code>
            {capital && (
              <span className="whale-capital-snapshot">
                Capital {money(capital.valueUsd)} · snapshot{" "}
                {new Date(capital.asOf).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <span className="whale-card-count">
          {details?.account
            ? `${details.account.positions.length} open`
            : "Perps"}
        </span>
      </div>
      {!details ? (
        <p className="whale-card-message" role="status">
          {query.isError
            ? "Wallet details are temporarily unavailable."
            : "Loading wallet details…"}
        </p>
      ) : (
        <>
          <dl className="whale-summary-grid">
            <Metric
              label="Unrealized P&L"
              value={signedMoney(pnl)}
              tone={tone(pnl)}
              detail={exactMoney(pnl)}
              primary
            />
            <Metric
              label="Total position value"
              value={money(details.account?.positionValue ?? null)}
              detail={exactMoney(details.account?.positionValue ?? null)}
              primary
            />
            <Metric
              label="24h perp P&L"
              value={signedMoney(portfolio?.dayPnl ?? null)}
              tone={tone(portfolio?.dayPnl ?? null)}
              detail={exactMoney(portfolio?.dayPnl ?? null)}
            />
            <Metric
              label="All-time perp P&L"
              value={signedMoney(portfolio?.allTimePnl ?? null)}
              tone={tone(portfolio?.allTimePnl ?? null)}
              detail={exactMoney(portfolio?.allTimePnl ?? null)}
            />
            <Metric
              label="Perp margin value"
              value={money(details.account?.accountValue ?? null)}
              detail={exactMoney(details.account?.accountValue ?? null)}
            />
            <Metric
              label="Margin used"
              value={money(details.account?.marginUsed ?? null)}
              detail={exactMoney(details.account?.marginUsed ?? null)}
            />
          </dl>
          {!portfolio && (extras.isError || extras.isSuccess) && (
            <p className="whale-card-message">
              P&amp;L history is temporarily unavailable.
            </p>
          )}
          {!supportsObserver && !visible && !portfolio && orders === null && (
            <button
              type="button"
              className="whale-load-extras"
              onClick={() => setVisible(true)}
            >
              Load history and orders
            </button>
          )}
          <div className="whale-section-title">
            <h4>Open positions</h4>
            <span>Unrealized P&L</span>
          </div>
          {!details.account ? (
            <p className="whale-card-message">Position data unavailable.</p>
          ) : details.account.positions.length ? (
            <div className="whale-positions">
              {sortedPositions.slice(0, 1).map((position, index) => (
                <Position
                  key={`${position.coin}-${index}`}
                  position={position}
                />
              ))}
              {sortedPositions.length > 1 && (
                <details className="whale-more-positions">
                  <summary>
                    Show {sortedPositions.length - 1} more{" "}
                    {sortedPositions.length === 2 ? "position" : "positions"}
                  </summary>
                  <div className="whale-positions">
                    {sortedPositions.slice(1).map((position, index) => (
                      <Position
                        key={`${position.coin}-${index + 1}`}
                        position={position}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <p className="whale-card-message">
              No open positions on the main perpetuals market.
            </p>
          )}
          <details className="whale-orders">
            <summary>
              Open orders · main perps &amp; spot{" "}
              {orders
                ? `(${orders.length})`
                : extras.isError || extras.isSuccess
                  ? "(unavailable)"
                  : "(loading when visible)"}
            </summary>
            {orders === null ? (
              <p>
                {extras.isError || extras.isSuccess
                  ? "Order data is temporarily unavailable."
                  : "Order data will load when this wallet is visible."}
              </p>
            ) : orders.length === 0 ? (
              <p>No open orders.</p>
            ) : (
              <ul>
                {orders.map((order) => (
                  <li key={order.id}>
                    <span>
                      <strong>{order.coin}</strong> · {order.side} ·{" "}
                      {order.orderType}
                      {order.reduceOnly ? " · Reduce only" : ""}
                    </span>
                    <span
                      title={`${preciseNumber.format(order.size)} @ ${exactMoney(order.limitPrice) ?? "—"}`}
                    >
                      {number(order.size)} @ {price(order.limitPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <p className="whale-updated">
            Updated{" "}
            {new Date(details.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            {query.isError ? " · refresh failed" : ""}
          </p>
        </>
      )}
    </article>
  );
}

function WalletListRow({
  address,
  name,
  query,
  capital,
}: {
  address: string;
  name: string;
  query: UseQueryResult<WalletDetails, Error>;
  capital?: CapitalSnapshot;
}) {
  const account = query.data?.account;
  const pnl = openPnl(account?.positions);
  const positions = account?.positions;
  const longCount = positions?.filter((position) => position.size > 0).length;
  const shortCount = positions?.filter((position) => position.size < 0).length;
  return (
    <li className="whale-list-item">
      <details className="whale-list-detail">
        <summary className="whale-list-row">
          <span className="whale-list-name">
            <span className="whale-name-line">
              <strong>{name}</strong>
              <CapitalBadge snapshot={capital} />
            </span>
            <code title={address}>{address}</code>
          </span>
          <span className="whale-list-cell">
            <small>Open positions</small>
            <strong>
              {account
                ? `${positions?.length} · ${longCount} long / ${shortCount} short`
                : query.isPending
                  ? "Loading…"
                  : "Unavailable"}
            </strong>
          </span>
          <span className="whale-list-cell">
            <small>Position value</small>
            <strong title={exactMoney(account?.positionValue ?? null)}>
              {money(account?.positionValue ?? null)}
            </strong>
          </span>
          <span className="whale-list-cell">
            <small>Unrealized P&amp;L</small>
            <strong className={tone(pnl)} title={exactMoney(pnl)}>
              {signedMoney(pnl)}
            </strong>
          </span>
          <span className="whale-list-expand" aria-hidden="true">
            Details <span>⌄</span>
          </span>
        </summary>
        <div className="whale-list-expanded">
          <WalletCard
            address={address}
            name={name}
            query={query}
            capital={capital}
          />
        </div>
      </details>
    </li>
  );
}

export function WalletTrackingPage() {
  const [view, setView] = useState<"cards" | "list">("cards");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    | "all"
    | "profit"
    | "loss"
    | "leviathan"
    | "whale"
    | "shark"
    | "minnow"
    | "leverage"
  >("all");
  useEffect(() => {
    try {
      localStorage.removeItem("spot-ladder-analyzer:tracker-connection");
    } catch {
      /* Storage may be unavailable. */
    }
  }, []);
  const status = useQuery({
    queryKey: ["wallet-tracking"],
    queryFn: ({ signal }) => getTrackerStatus(signal),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const collection = status.data?.wallets ?? [];
  const pageCount = Math.max(1, Math.ceil(collection.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const wallets = collection.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const capital = status.data?.walletCapital ?? {};
  const details = useQueries({
    queries: wallets.map((address) => ({
      queryKey: ["wallet-details", address],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getWalletDetails(address, signal),
      refetchInterval: REFRESH_MS,
      staleTime: REFRESH_MS,
      retry: 1,
      refetchOnWindowFocus: false,
    })),
  });
  const sortedWallets = wallets
    .map((address, index) => ({ address, query: details[index], index }))
    .filter(
      ({ query }) =>
        !query.data?.account ||
        query.data.account.positions.length > 0 ||
        query.isError,
    )
    .sort((a, b) => {
      const left = a.query.data?.account?.positionValue;
      const right = b.query.data?.account?.positionValue;
      if (left == null) return right == null ? a.index - b.index : 1;
      if (right == null) return -1;
      return Math.abs(right) - Math.abs(left) || a.index - b.index;
    });
  const activeCount = sortedWallets.filter(
    ({ query }) => (query.data?.account?.positions.length ?? 0) > 0,
  ).length;
  const searchTerm = search.trim().toLowerCase();
  const filteredWallets = sortedWallets.filter(({ address, query }) => {
    const account = query.data?.account;
    const name = status.data?.walletNames[address] ?? "Wallet";
    const matchesSearch =
      !searchTerm ||
      name.toLowerCase().includes(searchTerm) ||
      address.includes(searchTerm) ||
      Boolean(
        account?.positions.some((position) =>
          position.coin.toLowerCase().includes(searchTerm),
        ),
      );
    if (!matchesSearch) return false;
    const pnl = openPnl(account?.positions);
    if (filter === "profit") return pnl !== null && pnl > 0;
    if (filter === "loss") return pnl !== null && pnl < 0;
    if (["leviathan", "whale", "shark", "minnow"].includes(filter))
      return (
        capitalCategory(capital[address]?.valueUsd)?.toLowerCase() === filter
      );
    if (filter === "leverage")
      return Boolean(
        account?.positions.some(
          (position) => position.leverage !== null && position.leverage >= 20,
        ),
      );
    return true;
  });
  return (
    <section
      className="calculator-page wallet-page"
      aria-labelledby="wallet-title"
    >
      <div className="whale-page-header">
        <div>
          <p className="eyebrow">HYPERLIQUID</p>
          <h1 id="wallet-title">Wallet tracking</h1>
          <p className="calculator-intro">
            Follow open perpetual positions, account performance and orders for
            the tracked wallets.
          </p>
        </div>
      </div>
      {pageCount > 1 && (
        <div className="whale-pagination" aria-label="Wallet pages">
          <p>
            Wallets {currentPage * PAGE_SIZE + 1}–
            {Math.min((currentPage + 1) * PAGE_SIZE, collection.length)} of{" "}
            {collection.length}. Overview, sorting and filters cover this page.
          </p>
          <div>
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
      {status.data && (
        <MarketPositionsChart queries={details} paginated={pageCount > 1} />
      )}
      <div className="whale-info">
        Positions refresh about every minute while this page is open. Positions
        cover Hyperliquid’s main perpetuals market; margin value may not include
        spot balances. Categories use reported capital snapshots, which may be
        outdated. P&amp;L history is based on available portfolio snapshots.
      </div>
      {!status.data ? (
        <p className="field-help" role="status">
          {status.isError
            ? "Tracker status is temporarily unavailable."
            : "Loading tracker status…"}
        </p>
      ) : (
        <>
          <WalletOverview
            queries={details}
            wallets={wallets}
            capital={capital}
            paginated={pageCount > 1}
          />
          <div className="whale-list-heading">
            <div>
              <p className="eyebrow">WALLET WATCHLIST</p>
              <h2>
                Open wallets <span>{activeCount}</span>
              </h2>
            </div>
            <div className="whale-list-tools">
              <p>Sorted by main-market open position value · 60s refresh</p>
              <div
                className="whale-view-switch"
                role="group"
                aria-label="Wallet display"
              >
                <button
                  type="button"
                  aria-pressed={view === "cards"}
                  onClick={() => setView("cards")}
                >
                  Cards
                </button>
                <button
                  type="button"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  List
                </button>
              </div>
            </div>
          </div>
          <div className="whale-toolbar">
            <label className="whale-search">
              <span className="sr-only">Search wallets or coins</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search wallet, address or coin"
              />
            </label>
            <div
              className="whale-filters"
              role="group"
              aria-label="Filter wallets"
            >
              {(
                [
                  ["all", "All"],
                  ["profit", "In profit"],
                  ["loss", "In loss"],
                  ["leviathan", "Leviathans"],
                  ["whale", "Whales"],
                  ["shark", "Sharks"],
                  ["minnow", "Minnows"],
                  ["leverage", "High leverage (20×+)"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {filteredWallets.length && view === "cards" ? (
            <div className="whale-grid">
              {filteredWallets.map(({ address, query }) => (
                <WalletCard
                  key={address}
                  address={address}
                  name={status.data.walletNames[address] ?? "Wallet"}
                  query={query}
                  capital={capital[address]}
                />
              ))}
            </div>
          ) : filteredWallets.length ? (
            <ul className="whale-compact-list" aria-label="Wallet list">
              {filteredWallets.map(({ address, query }) => (
                <WalletListRow
                  key={address}
                  address={address}
                  name={status.data.walletNames[address] ?? "Wallet"}
                  query={query}
                  capital={capital[address]}
                />
              ))}
            </ul>
          ) : (
            <p className="field-help">
              {sortedWallets.length && (searchTerm || filter !== "all")
                ? "No wallets match your search or filter."
                : wallets.length
                  ? "No tracked wallets currently have open positions on the main perpetuals market."
                  : "No wallets are being tracked yet."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
