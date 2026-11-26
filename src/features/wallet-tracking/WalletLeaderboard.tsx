import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  cachedLeaderboardResults,
  loadLeaderboardResults,
} from "./leaderboard-loader";

export function WalletLeaderboard({
  addresses,
  names,
  onClose,
}: {
  addresses: string[];
  names: Record<string, string>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [results, setResults] = useState(() =>
    cachedLeaderboardResults(queryClient, addresses),
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const addressKey = addresses.join(",");
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    const wallets = addressKey ? addressKey.split(",") : [];
    return loadLeaderboardResults(queryClient, wallets, (address, result) =>
      setResults((previous) => ({ ...previous, [address]: result })),
    );
  }, [addressKey, queryClient]);

  const rows = addresses
    .flatMap((address, index) => {
      const result = results[address];
      if (result?.status !== "ready") return [];
      const stats = result.data.periods[period];
      if (stats.winRate === null) return [];
      return [
        { address, index, data: result.data, stats, winRate: stats.winRate },
      ];
    })
    .sort((a, b) => b.winRate - a.winRate || a.index - b.index)
    .slice(0, 5);
  const completed = addresses.filter((address) => results[address]).length;
  const unavailable = addresses.filter(
    (address) => results[address]?.status === "error",
  ).length;
  return (
    <div
      className="wallet-leaderboard-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="wallet-leaderboard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-leaderboard-title"
        ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (!focusable.length) {
            event.preventDefault();
            return;
          }
          const index = focusable.indexOf(
            document.activeElement as HTMLElement,
          );
          if (event.shiftKey && index <= 0) {
            event.preventDefault();
            focusable[focusable.length - 1].focus();
          } else if (
            !event.shiftKey &&
            (index === -1 || index === focusable.length - 1)
          ) {
            event.preventDefault();
            focusable[0].focus();
          }
        }}
      >
        <header className="wallet-leaderboard-heading">
          <div className="wallet-leaderboard-title-group">
            <span className="wallet-leaderboard-emblem" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 21h8M12 17v4M7 3h10v5a5 5 0 0 1-10 0V3ZM7 5H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4" />
              </svg>
            </span>
            <div>
              <p className="wallet-leaderboard-eyebrow">WALLET TRACKING</p>
              <h2 id="wallet-leaderboard-title">Leaderboard</h2>
              <p className="wallet-leaderboard-subtitle">
                Top 5 win rates · current wallet page
              </p>
            </div>
          </div>
          <button
            className="wallet-leaderboard-close"
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close leaderboard"
          >
            ×
          </button>
        </header>
        <div className="wallet-leaderboard-body">
          <div className="wallet-leaderboard-toolbar">
            <div
              className="wallet-leaderboard-period"
              role="group"
              aria-label="Leaderboard period"
            >
              <button
                type="button"
                aria-pressed={period === "7d"}
                onClick={() => setPeriod("7d")}
              >
                7 days
              </button>
              <button
                type="button"
                aria-pressed={period === "30d"}
                onClick={() => setPeriod("30d")}
              >
                30 days
              </button>
            </div>
            <span className="wallet-leaderboard-progress" role="status">
              <span aria-hidden="true" />
              {completed}/{addresses.length} wallets checked
              {unavailable > 0 ? ` · ${unavailable} unavailable` : ""}
            </span>
          </div>
          {completed < addresses.length && (
            <p className="wallet-leaderboard-note" role="status">
              Rankings update as wallets are checked.
            </p>
          )}
          <div className="wallet-leaderboard-list-heading">
            <span>RANK &amp; WALLET</span>
            <span>WIN RATE</span>
          </div>
          {rows.length ? (
            <ol
              className="wallet-leaderboard-list"
              aria-label="Wallet rankings"
            >
              {rows.map(({ address, data, stats, winRate }, index) => {
                const position = index + 1;
                return (
                  <li className="wallet-leaderboard-row" key={address}>
                    <span
                      className={`wallet-leaderboard-rank${position <= 3 ? ` rank-${position}` : ""}`}
                      aria-label={`Rank ${position}`}
                    >
                      {String(position).padStart(2, "0")}
                    </span>
                    <span
                      className="wallet-leaderboard-avatar"
                      aria-hidden="true"
                    >
                      {(names[address] ?? "W").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="wallet-leaderboard-wallet">
                      <strong>{names[address] ?? "Wallet"}</strong>
                      <span>
                        <code title={address}>
                          {address.slice(0, 8)}…{address.slice(-4)}
                        </code>
                        {data.historyLimited && (
                          <span className="wallet-leaderboard-limit">
                            2,000-fill limit
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="wallet-leaderboard-performance">
                      <strong>{`${winRate.toFixed(1)}%`}</strong>
                      <small>
                        {`${stats.wins} ${stats.wins === 1 ? "win" : "wins"} · ${stats.losses} ${stats.losses === 1 ? "loss" : "losses"} · ${stats.breakeven} even`}
                      </small>
                      <span
                        className="wallet-leaderboard-meter"
                        aria-hidden="true"
                      >
                        <span style={{ width: `${winRate}%` }} />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="wallet-leaderboard-note">
              {addresses.length === 0
                ? "No wallets on this page."
                : completed < addresses.length
                  ? "Checking wallet history…"
                  : "No ranked wallets for this period."}
            </p>
          )}
          <details className="wallet-leaderboard-method">
            <summary>
              How win rate is calculated <span aria-hidden="true">+</span>
            </summary>
            <p>
              Wins divided by wins and losses, using gross trading P&amp;L
              before fees and funding. Break-even positions are excluded from
              the rate. Only fully observed, closed main-market positions on the
              current wallet page are counted.
            </p>
            <p>
              Up to 2,000 recent fills per wallet. Incomplete history and
              ambiguous fills can exclude positions. Requests are paced to
              reduce exchange rate-limit pressure.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
