import { z } from "zod";
import { AsyncTtlCache } from "./cache.js";
import { ApiError } from "./errors.js";
import { isTrackedWallet } from "./wallet-tracking.js";
import type {
  WalletDetails,
  WalletExtras,
  WalletWinRates,
} from "../src/features/wallet-tracking/types.js";
import { calculateWinRate } from "./wallet-win-rate.js";

const detailsCache = new AsyncTtlCache<WalletDetails>();
const extrasCache = new AsyncTtlCache<WalletExtras>();
const winRatesCache = new AsyncTtlCache<WalletWinRates>();
let activeRequests = 0;
const waiting: Array<() => void> = [];
const decimal = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => {
    if (value == null || (typeof value === "string" && !value.trim()))
      return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  });
const positionSchema = z.object({
  coin: z.string().min(1).max(50),
  szi: decimal,
  entryPx: decimal,
  positionValue: decimal,
  unrealizedPnl: decimal,
  returnOnEquity: decimal,
  liquidationPx: decimal,
  marginUsed: decimal,
  leverage: z
    .object({ value: decimal, type: z.string().max(30).optional() })
    .nullish(),
  cumFunding: z.object({ sinceOpen: decimal }).nullish(),
});
const accountSchema = z.object({
  marginSummary: z.object({
    accountValue: decimal,
    totalMarginUsed: decimal,
    totalNtlPos: decimal,
  }),
  withdrawable: decimal,
  assetPositions: z.array(z.object({ position: positionSchema })).max(500),
});
const orderSchema = z
  .array(
    z.object({
      oid: z.number().int().safe(),
      coin: z.string().min(1).max(50),
      side: z.enum(["B", "A"]),
      sz: decimal,
      limitPx: decimal,
      orderType: z.string().max(50).optional(),
      reduceOnly: z.boolean().optional(),
    }),
  )
  .max(2000);
const portfolioSchema = z
  .array(
    z.tuple([
      z.string(),
      z.object({
        pnlHistory: z.array(z.tuple([z.number(), decimal])).max(10000),
      }),
    ]),
  )
  .max(30);
const numericString = z
  .string()
  .max(100)
  .regex(/^-?\d+(?:\.\d+)?$/);
const fillsSchema = z
  .array(
    z.object({
      coin: z.string().min(1).max(50),
      side: z.enum(["A", "B"]),
      sz: numericString.refine(
        (value) => Number(value) > 0 && Number.isFinite(Number(value)),
      ),
      startPosition: numericString,
      closedPnl: numericString,
      time: z.number().int().nonnegative().safe(),
    }),
  )
  .max(2000);

async function info(type: string, user: string): Promise<unknown> {
  if (activeRequests >= 5)
    await new Promise<void>((resolve) => waiting.push(resolve));
  else activeRequests++;
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, user }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Provider unavailable");
    return await response.json();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeRequests--;
  }
}

function parseAccount(value: unknown): WalletDetails["account"] {
  const parsed = accountSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.assetPositions.some(({ position }) => position.szi === null)
  )
    return null;
  const { marginSummary, withdrawable, assetPositions } = parsed.data;
  return {
    accountValue: marginSummary.accountValue,
    marginUsed: marginSummary.totalMarginUsed,
    positionValue: marginSummary.totalNtlPos,
    withdrawable,
    positions: assetPositions
      .filter(({ position }) => position.szi !== 0)
      .map(({ position }) => ({
        coin: position.coin,
        size: position.szi!,
        entryPrice: position.entryPx,
        positionValue: position.positionValue,
        unrealizedPnl: position.unrealizedPnl,
        returnOnEquity: position.returnOnEquity,
        liquidationPrice: position.liquidationPx,
        marginUsed: position.marginUsed,
        leverage: position.leverage?.value ?? null,
        marginMode: position.leverage?.type ?? null,
        fundingSinceOpen: position.cumFunding?.sinceOpen ?? null,
      })),
  };
}

function parseOrders(value: unknown): WalletDetails["orders"] {
  const parsed = orderSchema.safeParse(value);
  if (!parsed.success || parsed.data.some((order) => order.sz === null))
    return null;
  return parsed.data.map((order) => ({
    id: order.oid,
    coin: order.coin,
    side: order.side === "B" ? "Buy" : "Sell",
    size: order.sz!,
    limitPrice: order.limitPx,
    orderType: order.orderType || "Order",
    reduceOnly: order.reduceOnly ?? false,
  }));
}

function parsePortfolio(value: unknown): WalletDetails["portfolio"] {
  const parsed = portfolioSchema.safeParse(value);
  if (!parsed.success) return null;
  const pnl = (period: string) => {
    const history = parsed.data.find(([name]) => name === period)?.[1]
      .pnlHistory;
    if (!history?.length) return null;
    const first = history[0][1];
    const last = history[history.length - 1][1];
    return first === null || last === null ? null : last - first;
  };
  return { dayPnl: pnl("perpDay"), allTimePnl: pnl("perpAllTime") };
}

async function validateTrackedWallet(address: string): Promise<void> {
  if (!/^0x[0-9a-f]{40}$/.test(address))
    throw new ApiError("Invalid wallet address.", 400, "INVALID_WALLET");
  if (!(await isTrackedWallet(address)))
    throw new ApiError("Wallet not found.", 404, "WALLET_NOT_FOUND");
}

export async function getWalletDetails(
  address: string,
): Promise<WalletDetails> {
  await validateTrackedWallet(address);
  const result = await detailsCache.getOrLoad(address, 60_000, async () => {
    let account: WalletDetails["account"] = null;
    try {
      account = parseAccount(await info("clearinghouseState", address));
    } catch {
      /* Provider failures are reported below. */
    }
    if (!account)
      throw new ApiError(
        "Wallet details are temporarily unavailable.",
        503,
        "WALLET_DETAILS_UNAVAILABLE",
      );
    const details: WalletDetails = {
      updatedAt: Date.now(),
      account,
      orders: null,
      portfolio: null,
    };
    return details;
  });
  return result.value;
}

export async function getWalletExtras(address: string): Promise<WalletExtras> {
  await validateTrackedWallet(address);
  const result = await extrasCache.getOrLoad(address, 300_000, async () => {
    const [orders, portfolio] = await Promise.allSettled([
      info("frontendOpenOrders", address),
      info("portfolio", address),
    ]);
    const details: WalletExtras = {
      updatedAt: Date.now(),
      orders: orders.status === "fulfilled" ? parseOrders(orders.value) : null,
      portfolio:
        portfolio.status === "fulfilled"
          ? parsePortfolio(portfolio.value)
          : null,
    };
    if (!details.orders && !details.portfolio)
      throw new ApiError(
        "Wallet details are temporarily unavailable.",
        503,
        "WALLET_DETAILS_UNAVAILABLE",
      );
    return details;
  });
  return result.value;
}

export async function getWalletWinRates(
  address: string,
): Promise<WalletWinRates> {
  await validateTrackedWallet(address);
  const result = await winRatesCache.getOrLoad(address, 300_000, async () => {
    let fills: z.infer<typeof fillsSchema>;
    try {
      fills = fillsSchema.parse(await info("userFills", address));
    } catch {
      throw new ApiError(
        "Wallet trade history is temporarily unavailable.",
        503,
        "WALLET_HISTORY_UNAVAILABLE",
      );
    }
    const updatedAt = Date.now();
    const history = fills.map(({ sz, ...fill }) => ({ ...fill, size: sz }));
    return {
      updatedAt,
      historyLimited: fills.length >= 2000,
      periods: {
        "7d": calculateWinRate(history, updatedAt - 7 * 86_400_000),
        "30d": calculateWinRate(history, updatedAt - 30 * 86_400_000),
      },
    };
  });
  return result.value;
}
