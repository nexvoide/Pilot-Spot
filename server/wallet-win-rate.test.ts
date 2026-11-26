import { expect, it } from "vitest";
import { calculateWinRate, type HistoryFill } from "./wallet-win-rate.js";

function fill(
  time: number,
  startPosition: string,
  size: string,
  side: "A" | "B",
  closedPnl = "0",
  coin = "BTC",
): HistoryFill {
  return { time, startPosition, size, side, closedPnl, coin };
}

it("counts complete positions with partial closes and both time windows", () => {
  const fills = [
    fill(1, "0", "2", "B"),
    fill(2, "2", "1", "A", "10"),
    fill(3, "1", "1", "A", "-2"),
    fill(4, "0", "1", "A"),
    fill(5, "-1", "1", "B", "-1"),
    fill(6, "0", "1", "B"),
    fill(7, "1", "1", "A", "0"),
  ];
  expect(calculateWinRate(fills, 1)).toEqual({
    wins: 1,
    losses: 1,
    breakeven: 1,
    winRate: 50,
  });
  expect(calculateWinRate(fills, 4)).toEqual({
    wins: 0,
    losses: 1,
    breakeven: 1,
    winRate: 0,
  });
});

it("counts reversals as a close and a fresh position", () => {
  const fills = [
    fill(1, "0", "1", "B"),
    fill(2, "1", "2", "A", "5"),
    fill(3, "-1", "1", "B", "-3"),
  ];
  expect(calculateWinRate(fills, 0)).toEqual({
    wins: 1,
    losses: 1,
    breakeven: 0,
    winRate: 50,
  });
});

it("excludes positions with missing openings, ambiguous ordering, spot and other DEX markets", () => {
  const fills = [
    fill(1, "2", "2", "A", "5"),
    fill(2, "0", "1", "B"),
    fill(2, "0", "2", "B"),
    fill(3, "0", "1", "B", "0", "@1"),
    fill(4, "1", "1", "A", "3", "@1"),
    fill(5, "0", "1", "B", "0", "xyz:BTC"),
    fill(6, "1", "1", "A", "3", "xyz:BTC"),
  ];
  expect(calculateWinRate(fills, 0)).toEqual({
    wins: 0,
    losses: 0,
    breakeven: 0,
    winRate: null,
  });
});

it("reconstructs same-time fills when start positions identify a unique order", () => {
  const fills = [
    fill(1, "0", "1", "B"),
    fill(2, "2", "2", "A", "7"),
    fill(2, "1", "1", "B"),
    fill(3, "0", "1", "A"),
    fill(4, "-1", "1", "B", "-2"),
  ];
  expect(calculateWinRate(fills, 0)).toEqual({
    wins: 1,
    losses: 1,
    breakeven: 0,
    winRate: 50,
  });
});

it("can start a new observable cycle after a gap in position history", () => {
  const fills = [
    fill(1, "0", "1", "B"),
    fill(2, "0", "1", "B"),
    fill(3, "1", "1", "A", "2"),
  ];
  expect(calculateWinRate(fills, 0)).toEqual({
    wins: 1,
    losses: 0,
    breakeven: 0,
    winRate: 100,
  });
});
