import { afterEach, expect, it, vi } from "vitest";
import { getWalletWinRates } from "./wallet-details.js";

const wallet = `0x${"c".repeat(40)}`;
const otherWallet = `0x${"e".repeat(40)}`;
vi.mock("./wallet-tracking.js", () => ({
  isTrackedWallet: vi.fn(
    async (address: string) => address === wallet || address === otherWallet,
  ),
}));
afterEach(() => vi.unstubAllGlobals());

it("fetches validated recent fills for tracked wallets and computes both periods", async () => {
  const now = Date.now();
  const day = 86_400_000;
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json([
      {
        coin: "BTC",
        side: "A",
        sz: "1",
        startPosition: "1",
        closedPnl: "5",
        time: now - day,
      },
      {
        coin: "BTC",
        side: "B",
        sz: "1",
        startPosition: "0",
        closedPnl: "0",
        time: now - 2 * day,
      },
      {
        coin: "ETH",
        side: "B",
        sz: "1",
        startPosition: "-1",
        closedPnl: "-5",
        time: now - 10 * day,
      },
      {
        coin: "ETH",
        side: "A",
        sz: "1",
        startPosition: "0",
        closedPnl: "0",
        time: now - 11 * day,
      },
    ]),
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await getWalletWinRates(wallet);
  expect(result.periods["7d"]).toEqual({
    wins: 1,
    losses: 0,
    breakeven: 0,
    winRate: 100,
  });
  expect(result.periods["30d"]).toEqual({
    wins: 1,
    losses: 1,
    breakeven: 0,
    winRate: 50,
  });
  expect(result.historyLimited).toBe(false);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
    type: "userFills",
    user: wallet,
  });
  await expect(getWalletWinRates(`0x${"d".repeat(40)}`)).rejects.toMatchObject({
    status: 404,
  });
});

it("reports unavailable when fill history is malformed", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json([
          {
            coin: "BTC",
            side: "B",
            sz: "invalid",
            startPosition: "0",
            closedPnl: "0",
            time: Date.now(),
          },
        ]),
      ),
  );
  await expect(getWalletWinRates(otherWallet)).rejects.toMatchObject({
    status: 503,
    code: "WALLET_HISTORY_UNAVAILABLE",
  });
});
