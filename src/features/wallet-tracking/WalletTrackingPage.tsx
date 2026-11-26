import { useEffect, useRef, useState } from "react";
import {
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getTrackerStatus, getWalletDetails, getWalletExtras } from "./tracker";
import type { WalletDetails, WalletPosition } from "./types";
import type { CapitalSnapshot } from "./capital";
import { positionTier, type PositionTier } from "./position-tier";
import { WalletManager } from "./WalletManager";
import { WalletLeaderboard } from "./WalletLeaderboard";
import {
  getBrowserStorage,
  readJson,
  writeJson,
} from "@/lib/persistence/storage";

const REFRESH_MS = 60_000;
const PAGE_SIZE = 100;
const FAVORITES_KEY = "spot-ladder-analyzer:favorite-wallets";

function readFavorites(): Set<string> {
  const stored = readJson<unknown>(getBrowserStorage(), FAVORITES_KEY);
  return new Set(
    Array.isArray(stored)
      ? stored
          .filter(
            (value): value is string =>
              typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value),
          )
          .map((value) => value.toLowerCase())
      : [],
  );
}

function FavoriteButton({
  name,
  favorite,
  onToggle,
}: {
  name: string;
  favorite: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="whale-favorite"
      aria-label={`${favorite ? "Remove" : "Add"} ${name} ${favorite ? "from" : "to"} favorites`}
      aria-pressed={favorite}
      onClick={onToggle}
    >
      <HeartIcon filled={favorite} />
    </button>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      className="whale-heart-icon"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.3 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}
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

function PositionBadge({ value }: { value: number | null | undefined }) {
  const category = positionTier(value);
  return category && value != null ? (
    <span
      className={`whale-badge category-${category.toLowerCase()}`}
      title={`${category} · ${exactMoney(value)} in open main-market perpetual positions`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="whale-badge-icon"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {category === "Leviathan" ? (
          <>
            <path d="M12 2 14 7l5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z" />
            <path d="m9 12 2 2 4-4" />
          </>
        ) : category === "Whale" ? (
          <>
            <path d="M3 12c3 0 4-2 5-4 1 2 2 4 5 4 2 0 4-1 5-3 0 3-2 7-6 7-3 0-5-1-6-3l-3 2z" />
            <path d="M18 9c1-2 2-2 3-2m-3 2c0-2-1-3-2-4M4 19c2 1 4 1 6 0s4-1 6 0 3 1 4 0" />
          </>
        ) : category === "Shark" ? (
          <>
            <path d="M3 17c4-1 6-2 8-4l4-8c1 4 2 7 5 10l1 2z" />
            <path d="M4 20c2 1 4 1 6 0s4-1 6 0 3 1 4 0" />
          </>
        ) : (
          <>
            <path d="M4 12c4-4 9-4 13 0-4 4-9 4-13 0z" />
            <path d="m17 12 3-3v6z" />
            <circle cx="8" cy="11" r=".5" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
      {category}
    </span>
  ) : null;
}

function WalletOverview({
  queries,
  paginated,
}: {
  queries: UseQueryResult<WalletDetails, Error>[];
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
  const categories = queries.flatMap((query) => {
    const category = query.isError
      ? null
      : positionTier(query.data?.account?.positionValue);
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
        <strong>{noData ? "—" : categories.length}</strong>
        <small>
          {paginated ? "Current page · " : ""}
          {categoryCounts.join(" · ")}
          {partial || exposureValues.length < accounts.length
            ? " · partial"
            : ""}
        </small>
      </div>
    </section>
  );
}

function MarketPositionsChart({
  queries,
  paginated,
  tier,
}: {
  queries: UseQueryResult<WalletDetails, Error>[];
  paginated: boolean;
  tier: PositionTier | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const checkedAccounts = queries.flatMap((query) =>
    query.data?.account ? [query.data.account] : [],
  );
  const availableAccounts = queries.filter(
    (query) => !query.isError && query.data?.account,
  );
  const accounts = tier
    ? availableAccounts.flatMap((query) => {
        const account = query.data?.account;
        return account && positionTier(account.positionValue) === tier
          ? [account]
          : [];
      })
    : checkedAccounts;
  const stale = queries.some((query) => query.isError && query.data?.account);
  const unavailable = checkedAccounts.length !== queries.length || stale;
  const noData =
    queries.length > 0 &&
    (tier ? availableAccounts.length === 0 : checkedAccounts.length === 0);
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
            {tier ? ` · ${tier}s` : ""}
          </p>
        </div>
        <span>
          {tier &&
            `${accounts.length} ${tier.toLowerCase()} ${accounts.length === 1 ? "wallet" : "wallets"} · `}
          {unavailable
            ? `${tier ? availableAccounts.length : checkedAccounts.length}/${queries.length} wallets checked${stale ? " · refresh failed" : ""}`
            : `${checkedAccounts.length} wallets checked`}
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

function WalletTags({ tags }: { tags: string[] }) {
  return tags.length ? (
    <span className="whale-tags">
      {tags.map((tag) => (
        <span className="whale-tag" key={tag}>
          {tag}
        </span>
      ))}
    </span>
  ) : null;
}

function WalletCard({
  address,
  name,
  query,
  capital,
  favorite,
  onToggleFavorite,
  showFavoriteButton = true,
  alertsEnabled,
  onManageAlerts,
  tags,
}: {
  address: string;
  name: string;
  query: UseQueryResult<WalletDetails, Error>;
  capital?: CapitalSnapshot;
  favorite: boolean;
  onToggleFavorite: () => void;
  showFavoriteButton?: boolean;
  alertsEnabled: boolean;
  onManageAlerts: () => void;
  tags: string[];
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
              <PositionBadge
                value={query.isError ? null : details?.account?.positionValue}
              />
            </div>
            <code title={address}>{address}</code>
            <WalletTags tags={tags} />
            {capital && (
              <span className="whale-capital-snapshot">
                Capital {money(capital.valueUsd)} · snapshot{" "}
                {new Date(capital.asOf).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="whale-card-actions">
          <button
            type="button"
            className="whale-alert-button"
            onClick={onManageAlerts}
            aria-label={`Manage WhatsApp alerts for ${name}, ${alertsEnabled ? "on" : "off"}`}
          >
            Alerts {alertsEnabled ? "on" : "off"}
          </button>
          <span className="whale-card-count">
            {details?.account
              ? `${details.account.positions.length} open`
              : "Perps"}
          </span>
          {showFavoriteButton && (
            <FavoriteButton
              name={name}
              favorite={favorite}
              onToggle={onToggleFavorite}
            />
          )}
        </div>
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
  favorite,
  onToggleFavorite,
  alertsEnabled,
  onManageAlerts,
  tags,
}: {
  address: string;
  name: string;
  query: UseQueryResult<WalletDetails, Error>;
  capital?: CapitalSnapshot;
  favorite: boolean;
  onToggleFavorite: () => void;
  alertsEnabled: boolean;
  onManageAlerts: () => void;
  tags: string[];
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
              <PositionBadge
                value={query.isError ? null : account?.positionValue}
              />
            </span>
            <code title={address}>{address}</code>
            <WalletTags tags={tags} />
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
            favorite={favorite}
            onToggleFavorite={onToggleFavorite}
            showFavoriteButton={false}
            alertsEnabled={alertsEnabled}
            onManageAlerts={onManageAlerts}
            tags={tags}
          />
        </div>
      </details>
      <button
        type="button"
        className="whale-alert-button whale-list-alert"
        onClick={onManageAlerts}
        aria-label={`Manage WhatsApp alerts for ${name}, ${alertsEnabled ? "on" : "off"}`}
      >
        Alerts {alertsEnabled ? "on" : "off"}
      </button>
      <FavoriteButton
        name={name}
        favorite={favorite}
        onToggle={onToggleFavorite}
      />
    </li>
  );
}

export function WalletTrackingPage() {
  const [managerOpen, setManagerOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [alertWallet, setAlertWallet] = useState<string | undefined>();
  const [view, setView] = useState<"cards" | "list">("cards");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState(readFavorites);
  const [filter, setFilter] = useState<
    | "all"
    | "profit"
    | "loss"
    | "leviathan"
    | "whale"
    | "shark"
    | "minnow"
    | "leverage"
    | "favorites"
  >("all");
  useEffect(() => {
    writeJson(getBrowserStorage(), FAVORITES_KEY, [...favorites]);
  }, [favorites]);

  function toggleFavorite(address: string) {
    const normalized = address.toLowerCase();
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  }
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
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const allWallets = status.data?.wallets ?? [];
  const collection =
    filter === "favorites"
      ? allWallets.filter((address) => favorites.has(address.toLowerCase()))
      : allWallets;
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
        filter === "favorites" ||
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
  const selectedTier: PositionTier | null =
    filter === "minnow"
      ? "Minnow"
      : filter === "shark"
        ? "Shark"
        : filter === "whale"
          ? "Whale"
          : filter === "leviathan"
            ? "Leviathan"
            : null;
  const searchTerm = search.trim().toLowerCase();
  const filteredWallets = sortedWallets.filter(({ address, query }) => {
    const account = query.data?.account;
    const name = status.data?.walletNames[address] ?? "Wallet";
    const matchesSearch =
      !searchTerm ||
      name.toLowerCase().includes(searchTerm) ||
      address.includes(searchTerm) ||
      Boolean(
        status.data?.walletTags?.[address]?.some((tag) =>
          tag.toLowerCase().includes(searchTerm),
        ),
      ) ||
      Boolean(
        account?.positions.some((position) =>
          position.coin.toLowerCase().includes(searchTerm),
        ),
      );
    if (!matchesSearch) return false;
    const pnl = openPnl(account?.positions);
    if (filter === "profit") return pnl !== null && pnl > 0;
    if (filter === "loss") return pnl !== null && pnl < 0;
    if (selectedTier)
      return (
        !query.isError && positionTier(account?.positionValue) === selectedTier
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
        {status.data && (
          <button
            type="button"
            className="wallet-manager-trigger"
            onClick={() => {
              setAlertWallet(undefined);
              setManagerOpen(true);
            }}
          >
            Manage wallets
          </button>
        )}
      </div>
      {managerOpen && status.data && (
        <WalletManager
          status={status.data}
          alertWallet={alertWallet}
          onClose={() => setManagerOpen(false)}
        />
      )}
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
        <MarketPositionsChart
          queries={details}
          paginated={pageCount > 1}
          tier={selectedTier}
        />
      )}
      {status.data && (
        <>
          <button
            className="wallet-leaderboard-trigger"
            type="button"
            aria-expanded={leaderboardOpen}
            aria-controls="wallet-leaderboard-content"
            onClick={() => setLeaderboardOpen((open) => !open)}
          >
            {leaderboardOpen ? "Hide" : "Show"} wallet leaderboard
          </button>
          <div id="wallet-leaderboard-content" hidden={!leaderboardOpen}>
            {leaderboardOpen && (
              <WalletLeaderboard
                key={wallets.join(",")}
                addresses={wallets}
                names={status.data.walletNames}
              />
            )}
          </div>
        </>
      )}
      <div className="whale-info">
        Positions refresh about every minute while this page is open. Positions
        cover Hyperliquid’s main perpetuals market; margin value may not include
        spot balances. Tiers use each wallet’s total open position value.
        P&amp;L history is based on available portfolio snapshots.
      </div>
      {status.isRefetchError && status.data && (
        <p className="field-help" role="status">
          Wallet list could not refresh; showing the last available list.
        </p>
      )}
      {!status.data ? (
        <p className="field-help" role="status">
          {status.isError
            ? "Tracker status is temporarily unavailable."
            : "Loading tracker status…"}
        </p>
      ) : (
        <>
          <WalletOverview queries={details} paginated={pageCount > 1} />
          <div className="whale-list-heading">
            <div>
              <p className="eyebrow">WALLET WATCHLIST</p>
              <h2>
                {filter === "favorites" ? "Favorite wallets" : "Open wallets"}{" "}
                <span>
                  {filter === "favorites" ? collection.length : activeCount}
                </span>
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
                placeholder="Search wallet, address, tag or coin"
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
                  ["leverage", "High leverage (20×+)"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(value);
                    setPage(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="whale-capital-filters">
              <span>Position tier</span>
              <div
                className="whale-filters"
                role="group"
                aria-label="Filter by position tier"
              >
                {(
                  [
                    ["minnow", "Minnows"],
                    ["shark", "Sharks"],
                    ["whale", "Whales"],
                    ["leviathan", "Leviathans"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`whale-tier-button category-${value}`}
                    aria-pressed={filter === value}
                    onClick={() => {
                      setFilter(value);
                      setPage(0);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="whale-filters">
                <button
                  type="button"
                  className="whale-favorites-filter"
                  aria-pressed={filter === "favorites"}
                  onClick={() => {
                    setFilter("favorites");
                    setPage(0);
                  }}
                >
                  <HeartIcon filled={filter === "favorites"} /> Favorites
                </button>
              </div>
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
                  tags={status.data.walletTags?.[address] ?? []}
                  favorite={favorites.has(address.toLowerCase())}
                  onToggleFavorite={() => toggleFavorite(address)}
                  alertsEnabled={Boolean(status.data.walletAlerts?.[address])}
                  onManageAlerts={() => {
                    setAlertWallet(address);
                    setManagerOpen(true);
                  }}
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
                  tags={status.data.walletTags?.[address] ?? []}
                  favorite={favorites.has(address.toLowerCase())}
                  onToggleFavorite={() => toggleFavorite(address)}
                  alertsEnabled={Boolean(status.data.walletAlerts?.[address])}
                  onManageAlerts={() => {
                    setAlertWallet(address);
                    setManagerOpen(true);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="field-help">
              {filter === "favorites" && collection.length === 0
                ? "No favorite wallets yet. Select the heart on a wallet to add it here."
                : sortedWallets.length && (searchTerm || filter !== "all")
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
