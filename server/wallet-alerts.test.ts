import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: vi.fn(),
  details: vi.fn(),
  tracked: vi.fn(),
}));
vi.mock("./wallet-storage.js", () => ({
  redis: mocks.redis,
  storageConfigured: () => true,
}));
vi.mock("./wallet-details.js", () => ({ getWalletDetails: mocks.details }));
vi.mock("./wallet-tracking.js", () => ({
  getWalletTrackingStatus: mocks.tracked,
}));

import { runWalletAlerts } from "./wallet-alerts.js";
import handler from "../api/wallet-alerts.js";

const address = "0x3ff54fd26855db3758d0b5ae7aed47440c47f705";
let state: string | null;
let queue: string[];
let lock: string | null;

beforeEach(() => {
  vi.stubEnv("GREEN_API_URL", "https://api.green-api.com");
  vi.stubEnv("GREEN_API_INSTANCE_ID", "123456");
  vi.stubEnv("GREEN_API_TOKEN", "exampletoken");
  vi.stubEnv("WHATSAPP_GROUP_ID", "123456@g.us");
  vi.stubEnv("WALLET_ALERTS_CRON_SECRET", "a".repeat(32));
  state = null;
  queue = [];
  lock = null;
  mocks.tracked.mockResolvedValue({
    wallets: [address],
    walletNames: { [address]: "Sub18" },
    walletCapital: {},
  });
  mocks.details.mockResolvedValue({ account: { positions: [] } });
  mocks.redis.mockImplementation(async (command: (string | number)[]) => {
    const [action, key] = command;
    if (action === "SET") {
      if (lock) return null;
      lock = String(command[2]);
      return "OK";
    }
    if (action === "GET") return state;
    if (action === "LINDEX") return queue[0] ?? null;
    if (
      action === "EVAL" &&
      typeof key === "string" &&
      key.includes("redis.call('SET', KEYS[2]")
    ) {
      if (lock !== command[6]) return 0;
      state = String(command[7]);
      queue.push(...command.slice(8).map(String));
      return 1;
    }
    if (
      action === "EVAL" &&
      typeof key === "string" &&
      key.includes("redis.call('LPOP'")
    ) {
      if (lock !== command[5] || queue[0] !== command[6]) return 0;
      queue.shift();
      return 1;
    }
    if (
      action === "EVAL" &&
      typeof key === "string" &&
      key.includes("redis.call('DEL'")
    ) {
      lock = null;
      return 1;
    }
    throw new Error("Unexpected Redis command");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ idMessage: "message-id" }), {
        status: 200,
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("wallet alerts", () => {
  it("accepts the GREEN-API instance host shown in the console", async () => {
    vi.stubEnv("GREEN_API_URL", "https://7107.api.greenapi.com");
    await expect(runWalletAlerts()).resolves.toMatchObject({ checked: 1 });
  });

  it("rejects an unrelated API host before using the credentials", async () => {
    vi.stubEnv("GREEN_API_URL", "https://greenapi.com.example.com");
    await expect(runWalletAlerts()).rejects.toThrow("not configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the first check as a baseline and sends a new position only once", async () => {
    await runWalletAlerts();
    expect(fetch).not.toHaveBeenCalled();
    mocks.details.mockResolvedValue({
      account: {
        positions: [
          {
            coin: "BTC",
            size: -1,
            positionValue: 2_000_000,
            entryPrice: 64_090,
            leverage: 13,
            unrealizedPnl: 324_360,
          },
        ],
      },
    });
    await runWalletAlerts();
    expect(fetch).toHaveBeenCalledOnce();
    const options = vi.mocked(fetch).mock.calls[0][1];
    const payload = JSON.parse(String(options?.body));
    expect(payload.chatId).toBe("123456@g.us");
    expect(payload.message).toContain("🐋 *NEW POSITION*");
    expect(payload.message).toContain("👤 *Wallet:* Sub18");
    expect(payload.message).toContain("🪙 *Market:* BTC");
    expect(payload.message).toContain("🔴 *Direction:* SHORT");
    expect(payload.message).toContain("💰 *Position value:* $2.00M");
    expect(payload.message).toContain("📍 *Entry price:* $64.09K");
    expect(payload.message).toContain("⚡ *Leverage:* 13×");
    expect(payload.message).toContain(
      "📊 *Unrealized P&L:* +$324.36K (snapshot)",
    );
    expect(payload.message).toMatch(/🕒 \*Detected:\* .+ PKT/);
    await runWalletAlerts();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("retains an alert for retry if WhatsApp rejects it", async () => {
    await runWalletAlerts();
    mocks.details.mockResolvedValue({
      account: { positions: [{ coin: "ETH", size: 2, positionValue: 1000 }] },
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(runWalletAlerts()).rejects.toThrow("WhatsApp alert delivery");
    expect(queue).toHaveLength(1);
    await runWalletAlerts();
    expect(queue).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("formats a long with a loss and keeps small entry prices readable", async () => {
    await runWalletAlerts();
    mocks.details.mockResolvedValue({
      account: {
        positions: [
          {
            coin: "XRP",
            size: 10,
            positionValue: 12.5,
            entryPrice: 0.00001234,
            leverage: 5,
            unrealizedPnl: -2.75,
          },
        ],
      },
    });
    await runWalletAlerts();
    const options = vi.mocked(fetch).mock.calls[0][1];
    const message = JSON.parse(String(options?.body)).message;
    expect(message).toContain("🟢 *Direction:* LONG");
    expect(message).toContain("📍 *Entry price:* $0.00001234");
    expect(message).toContain("📊 *Unrealized P&L:* -$2.75 (snapshot)");
  });

  it("preserves a wallet baseline when its provider request fails", async () => {
    await runWalletAlerts();
    mocks.details.mockRejectedValueOnce(new Error("offline"));
    await expect(runWalletAlerts()).rejects.toThrow("Some wallet positions");
    mocks.details.mockResolvedValue({
      account: { positions: [{ coin: "BTC", size: 1, positionValue: 50_000 }] },
    });
    await runWalletAlerts();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("alerts when an existing position reverses direction", async () => {
    mocks.details.mockResolvedValue({
      account: { positions: [{ coin: "BTC", size: 1, positionValue: 50_000 }] },
    });
    await runWalletAlerts();
    mocks.details.mockResolvedValue({
      account: {
        positions: [{ coin: "BTC", size: -1, positionValue: 50_000 }],
      },
    });
    await runWalletAlerts();
    const options = vi.mocked(fetch).mock.calls[0][1];
    const message = JSON.parse(String(options?.body)).message;
    expect(message).toContain("🪙 *Market:* BTC");
    expect(message).toContain("🔴 *Direction:* SHORT");
    expect(message).not.toContain("undefined");
  });

  it("continues checking larger wallet lists across scheduled runs", async () => {
    const wallets = Array.from(
      { length: 21 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
    );
    mocks.tracked.mockResolvedValue({
      wallets,
      walletNames: {},
      walletCapital: {},
    });
    expect((await runWalletAlerts()).checked).toBe(20);
    expect(mocks.details).not.toHaveBeenCalledWith(wallets[20]);
    await runWalletAlerts();
    expect(mocks.details).toHaveBeenCalledWith(wallets[20]);
  });

  it("does not expose the scheduled endpoint without its secret", async () => {
    const request = { method: "POST", headers: {} } as IncomingMessage;
    const response = {
      setHeader: vi.fn(),
      end: vi.fn(),
      statusCode: 0,
    } as unknown as ServerResponse;
    await handler(request, response);
    expect(response.statusCode).toBe(401);
    expect(mocks.tracked).not.toHaveBeenCalled();
  });
});
