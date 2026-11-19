import { afterEach, expect, it, vi } from "vitest";
import { getWalletDetails, getWalletExtras } from "./wallet-details.js";
const first = `0x${"a".repeat(40)}`;
const second = `0x${"b".repeat(40)}`;
vi.mock("./wallet-tracking.js", () => ({
    isTrackedWallet: vi.fn((address) => [first, second].includes(address)),
}));
afterEach(() => vi.unstubAllGlobals());
it("returns validated positions, order direction, and period P&L", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => {
        const { type } = JSON.parse(String(options.body));
        if (type === "clearinghouseState")
            return Promise.resolve(Response.json({
                marginSummary: {
                    accountValue: "100",
                    totalMarginUsed: "20",
                    totalNtlPos: "200",
                },
                withdrawable: "50",
                assetPositions: [
                    {
                        position: {
                            coin: "BTC",
                            szi: "-2",
                            entryPx: "100",
                            positionValue: "200",
                            unrealizedPnl: "5",
                            returnOnEquity: "0.25",
                            liquidationPx: null,
                            marginUsed: "20",
                            leverage: { type: "cross", value: 10 },
                            cumFunding: { sinceOpen: "1" },
                        },
                    },
                ],
            }));
        if (type === "frontendOpenOrders")
            return Promise.resolve(Response.json([
                {
                    oid: 12,
                    coin: "BTC",
                    side: "A",
                    sz: "1",
                    limitPx: "110",
                    orderType: "Limit",
                    reduceOnly: true,
                },
            ]));
        return Promise.resolve(Response.json([
            [
                "perpDay",
                {
                    pnlHistory: [
                        [1, "3"],
                        [2, "8"],
                    ],
                },
            ],
            [
                "perpAllTime",
                {
                    pnlHistory: [
                        [1, "0"],
                        [2, "40"],
                    ],
                },
            ],
        ]));
    }));
    const result = await getWalletDetails(first);
    expect(result.account?.positions[0]).toMatchObject({
        coin: "BTC",
        size: -2,
        unrealizedPnl: 5,
        liquidationPrice: null,
        leverage: 10,
    });
    expect(result.orders).toBeNull();
    expect(result.portfolio).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const extras = await getWalletExtras(first);
    expect(extras.orders?.[0]).toMatchObject({ side: "Sell", reduceOnly: true });
    expect(extras.portfolio).toEqual({ dayPnl: 5, allTimePnl: 40 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
});
it("preserves available positions when other data sources fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => {
        if (JSON.parse(String(options.body)).type !== "clearinghouseState")
            return Promise.reject(new Error("unavailable"));
        return Promise.resolve(Response.json({
            marginSummary: {
                accountValue: "0",
                totalMarginUsed: "0",
                totalNtlPos: "0",
            },
            withdrawable: "0",
            assetPositions: [],
        }));
    }));
    const result = await getWalletDetails(second);
    expect(result.account?.positions).toEqual([]);
    expect(result.orders).toBeNull();
    expect(result.portfolio).toBeNull();
});
it("keeps available history when the orders provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => {
        if (JSON.parse(String(options.body)).type === "frontendOpenOrders")
            return Promise.reject(new Error("unavailable"));
        return Promise.resolve(Response.json([
            [
                "perpDay",
                {
                    pnlHistory: [
                        [1, "0"],
                        [2, "5"],
                    ],
                },
            ],
        ]));
    }));
    const result = await getWalletExtras(second);
    expect(result.orders).toBeNull();
    expect(result.portfolio).toEqual({ dayPnl: 5, allTimePnl: null });
});
it("rejects addresses outside the tracked list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getWalletDetails(`0x${"c".repeat(40)}`)).rejects.toMatchObject({
        status: 404,
    });
    expect(fetchMock).not.toHaveBeenCalled();
});
