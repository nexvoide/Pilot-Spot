import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WalletLeaderboard } from "./WalletLeaderboard";

afterEach(() => vi.unstubAllGlobals());

it("loads a wallet and switches between 7-day and 30-day win rates", async () => {
  const address = `0x${"a".repeat(40)}`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        updatedAt: Date.now(),
        historyLimited: true,
        periods: {
          "7d": { wins: 3, losses: 1, breakeven: 0, winRate: 75 },
          "30d": { wins: 5, losses: 5, breakeven: 1, winRate: 50 },
        },
      }),
    ),
  );
  render(
    <WalletLeaderboard addresses={[address]} names={{ [address]: "Aguila" }} />,
  );
  expect(await screen.findByText("75.0%")).toBeVisible();
  const board = screen.getByRole("region", {
    name: "Wallet win rate leaderboard",
  });
  expect(within(board).getByText("Aguila")).toBeVisible();
  expect(within(board).getByText("3 / 1")).toBeVisible();
  expect(within(board).getByText("2,000-fill limit")).toBeVisible();
  fireEvent.click(within(board).getByRole("button", { name: "30 days" }));
  expect(within(board).getByText("50.0%")).toBeVisible();
  expect(within(board).getByText("5 / 5")).toBeVisible();
});
