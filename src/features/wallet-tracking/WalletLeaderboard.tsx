import { useEffect, useState } from "react";
import { getWalletWinRates } from "./tracker";
import type { WalletWinRates } from "./types";

type Result = { status: "ready"; data: WalletWinRates } | { status: "error" };
const REQUEST_SPACING_MS = 7_000;

export function WalletLeaderboard({
  addresses,
  names,
}: {
  addresses: string[];
  names: Record<string, string>;
}) {
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [results, setResults] = useState<Record<string, Result>>({});
  const addressKey = addresses.join(",");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wallets = addressKey ? addressKey.split(",") : [];
    async function load(index: number): Promise<void> {
      if (controller.signal.aborted || index >= wallets.length) return;
      const address = wallets[index];
      try {
        const data = await getWalletWinRates(address, controller.signal);
        if (!controller.signal.aborted)
          setResults((previous) => ({
            ...previous,
            [address]: { status: "ready", data },
          }));
      } catch {
        if (!controller.signal.aborted)
          setResults((previous) => ({
            ...previous,
            [address]: { status: "error" },
          }));
      }
      if (!controller.signal.aborted && index + 1 < wallets.length)
        timer = setTimeout(() => void load(index + 1), REQUEST_SPACING_MS);
    }
    void load(0);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [addressKey]);

  const rows = addresses
    .map((address, index) => ({ address, index, result: results[address] }))
    .sort((left, right) => {
      const a =
        left.result?.status === "ready"
          ? left.result.data.periods[period].winRate
          : null;
      const b =
        right.result?.status === "ready"
          ? right.result.data.periods[period].winRate
          : null;
      return a === null
        ? b === null
          ? left.index - right.index
          : 1
        : b === null
          ? -1
          : b - a || left.index - right.index;
    });
  const completed = addresses.filter((address) => results[address]).length;
  let rank = 0;
  return (
    <section
      className="wallet-leaderboard"
      aria-label="Wallet win rate leaderboard"
    >
      <div className="wallet-leaderboard-heading">
        <div>
          <h2>Wallet leaderboard</h2>
          <p>
            Current wallet page · {completed}/{addresses.length} checked
          </p>
        </div>
        <div
          className="whale-view-switch"
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
      </div>
      <p className="wallet-leaderboard-note">
        Win rate = winning closed positions ÷ winning and losing closed
        positions. Based on gross trading P&amp;L, before fees and funding. Only
        fully observed main-market positions are counted; break-even positions
        are excluded from the rate.
      </p>
      <p className="wallet-leaderboard-note">
        Up to 2,000 recent fills per wallet. Incomplete history and ambiguous
        fills can exclude positions. Wallets load gradually to reduce exchange
        rate-limit pressure.
      </p>
      {rows.length ? (
        <div className="wallet-leaderboard-scroll">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Wallet</th>
                <th>Win rate</th>
                <th>Wins / losses</th>
                <th>Break-even</th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ address, result }) => {
                const data = result?.status === "ready" ? result.data : null;
                const stats = data?.periods[period];
                const position = stats?.winRate != null ? ++rank : null;
                return (
                  <tr key={address}>
                    <td>{position ?? "—"}</td>
                    <td>
                      <strong>{names[address] ?? "Wallet"}</strong>
                      <code title={address}>
                        {address.slice(0, 8)}…{address.slice(-4)}
                      </code>
                    </td>
                    <td>
                      {stats?.winRate == null
                        ? "—"
                        : `${stats.winRate.toFixed(1)}%`}
                    </td>
                    <td>{stats ? `${stats.wins} / ${stats.losses}` : "—"}</td>
                    <td>{stats?.breakeven ?? "—"}</td>
                    <td>
                      {data
                        ? data.historyLimited
                          ? "2,000-fill limit"
                          : "Recent fills"
                        : result?.status === "error"
                          ? "Unavailable"
                          : "Waiting…"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="wallet-leaderboard-note">No wallets on this page.</p>
      )}
    </section>
  );
}
