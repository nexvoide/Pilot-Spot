import Decimal from "../src/lib/calculations/financial-decimal.js";

export interface HistoryFill {
  coin: string;
  side: "A" | "B";
  size: string;
  startPosition: string;
  closedPnl: string;
  time: number;
}

interface PositionRun {
  size: Decimal;
  pnl: Decimal;
}

export interface WinRateSummary {
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
}

// Count only position cycles whose opening and full close are both present.
// Gross closed P&L excludes funding and fees; reversals close one cycle and open another.
export function calculateWinRate(
  fills: HistoryFill[],
  since: number,
): WinRateSummary {
  const ordered = [...fills].sort((a, b) => a.time - b.time);
  const positions = new Map<string, PositionRun>();
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let index = 0;
  while (index < ordered.length) {
    const time = ordered[index].time;
    const group = new Map<string, HistoryFill[]>();
    while (index < ordered.length && ordered[index].time === time) {
      const fill = ordered[index++];
      if (
        fill.coin.includes(":") ||
        fill.coin.includes("/") ||
        fill.coin.startsWith("@")
      )
        continue;
      const same = group.get(fill.coin) ?? [];
      same.push(fill);
      group.set(fill.coin, same);
    }
    for (const [coin, same] of group) {
      const byStart = new Map<string, HistoryFill[]>();
      for (const fill of same) {
        const startKey = new Decimal(fill.startPosition).toString();
        const matching = byStart.get(startKey) ?? [];
        matching.push(fill);
        byStart.set(startKey, matching);
      }
      let run = positions.get(coin);
      let nextStart = run?.size ?? new Decimal(0);
      let remaining = same.length;
      while (remaining > 0) {
        const key = nextStart.toString();
        const matching = byStart.get(key);
        if (
          !matching &&
          run &&
          !nextStart.isZero() &&
          byStart.get("0")?.length === 1
        ) {
          // An unobserved change broke the old cycle, but a fill starting at
          // zero establishes a new cycle that can be counted independently.
          run = undefined;
          nextStart = new Decimal(0);
          continue;
        }
        // A unique start position proves the next fill's order; multiple
        // candidates cannot be distinguished safely from this history.
        if (!matching || matching.length !== 1) {
          run = undefined;
          break;
        }
        const fill = matching[0];
        byStart.delete(key);
        remaining--;
        const start = new Decimal(fill.startPosition);
        const amount = new Decimal(fill.size);
        const change = fill.side === "B" ? amount : amount.negated();
        const end = start.plus(change);
        if (!run && start.isZero()) run = { size: start, pnl: new Decimal(0) };
        if (run) {
          run.pnl = run.pnl.plus(fill.closedPnl);
          if (
            !start.isZero() &&
            (end.isZero() || end.isPositive() !== start.isPositive())
          ) {
            if (fill.time >= since) {
              if (run.pnl.gt(0)) wins++;
              else if (run.pnl.lt(0)) losses++;
              else breakeven++;
            }
            run = end.isZero() ? undefined : { size: end, pnl: new Decimal(0) };
          } else {
            run.size = end;
          }
        }
        nextStart = end;
      }
      if (run) positions.set(coin, run);
      else positions.delete(coin);
    }
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    breakeven,
    winRate: decided ? (wins / decided) * 100 : null,
  };
}
