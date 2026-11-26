import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { getWalletDetails } from "./wallet-details.js";
import { getWalletTrackingStatus } from "./wallet-tracking.js";
import { redis, storageConfigured } from "./wallet-storage.js";
import type { WalletPosition } from "../src/features/wallet-tracking/types.js";

const LOCK_KEY = "spot-ladder:wallet-alerts:lock:v1";
const STATE_KEY = "spot-ladder:wallet-alerts:state:v1";
const QUEUE_KEY = "spot-ladder:wallet-alerts:queue:v1";
const WALLETS_PER_RUN = 20;
const RELEASE =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const SAVE =
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('SET', KEYS[2], ARGV[2]); for i = 3, #ARGV do redis.call('RPUSH', KEYS[3], ARGV[i]) end; return 1";
const ACK =
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end; if redis.call('LINDEX', KEYS[2], 0) ~= ARGV[2] then return 0 end; redis.call('LPOP', KEYS[2]); return 1";
const stateSchema = z.object({
  cursor: z.number().int().nonnegative(),
  wallets: z.record(
    z.string(),
    z.union([
      z.array(z.string()),
      z.object({ version: z.string(), positions: z.array(z.string()) }),
    ]),
  ),
});
type State = z.infer<typeof stateSchema>;
const queuedAlertSchema = z.object({
  address: z.string(),
  version: z.string(),
  message: z.string(),
});

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 2 : 8,
  }).format(Math.abs(value));
}

function formatDetectionTime(detectedAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(detectedAt);
}

function formatPositionAlert(
  name: string,
  position: WalletPosition,
  detectedAt: Date,
): string {
  const lines = [
    "🐋 *NEW POSITION*",
    `👤 *Wallet:* ${name}`,
    `🪙 *Market:* ${position.coin}`,
    position.size > 0 ? "🟢 *Direction:* LONG" : "🔴 *Direction:* SHORT",
  ];
  if (
    typeof position.positionValue === "number" &&
    Number.isFinite(position.positionValue)
  )
    lines.push(`💰 *Position value:* ${formatMoney(position.positionValue)}`);
  if (
    typeof position.entryPrice === "number" &&
    Number.isFinite(position.entryPrice)
  )
    lines.push(`📍 *Entry price:* ${formatMoney(position.entryPrice)}`);
  if (
    typeof position.leverage === "number" &&
    Number.isFinite(position.leverage)
  )
    lines.push(`⚡ *Leverage:* ${position.leverage}×`);
  if (
    typeof position.unrealizedPnl === "number" &&
    Number.isFinite(position.unrealizedPnl)
  ) {
    const sign =
      position.unrealizedPnl > 0 ? "+" : position.unrealizedPnl < 0 ? "-" : "";
    lines.push(
      `📊 *Unrealized P&L:* ${sign}${formatMoney(position.unrealizedPnl)} (snapshot)`,
    );
  }
  lines.push(`🕒 *Detected:* ${formatDetectionTime(detectedAt)} PKT`);
  return lines.join("\n");
}

function formatPositionClosedAlert(
  name: string,
  coin: string,
  direction: "LONG" | "SHORT",
  detectedAt: Date,
): string {
  return [
    "🐋 *POSITION CLOSED*",
    `👤 *Wallet:* ${name}`,
    `🪙 *Market:* ${coin}`,
    direction === "LONG" ? "🟢 *Direction:* LONG" : "🔴 *Direction:* SHORT",
    `🕒 *Detected:* ${formatDetectionTime(detectedAt)} PKT`,
  ].join("\n");
}

function configuration() {
  const {
    GREEN_API_URL: host,
    GREEN_API_INSTANCE_ID: instance,
    GREEN_API_TOKEN: token,
    WHATSAPP_GROUP_ID: group,
  } = process.env;
  if (!host || !instance || !token || !group || !storageConfigured())
    throw new ApiError(
      "Wallet alerts are not configured.",
      503,
      "ALERTS_NOT_CONFIGURED",
    );
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    throw new ApiError(
      "Wallet alerts are not configured.",
      503,
      "ALERTS_NOT_CONFIGURED",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(
      url.hostname === "green-api.com" ||
      url.hostname.endsWith(".green-api.com") ||
      url.hostname === "greenapi.com" ||
      url.hostname.endsWith(".greenapi.com")
    ) ||
    !/^\d{1,12}$/.test(instance) ||
    !/^[a-zA-Z0-9]{1,256}$/.test(token) ||
    !/^[\d-]+@g\.us$/.test(group)
  ) {
    throw new ApiError(
      "Wallet alerts are not configured.",
      503,
      "ALERTS_NOT_CONFIGURED",
    );
  }
  return {
    url: new URL(`/waInstance${instance}/sendMessage/${token}`, url),
    group,
  };
}

function readState(raw: unknown): State {
  if (raw === null) return { cursor: 0, wallets: {} };
  try {
    if (typeof raw !== "string") throw new Error("Invalid state");
    return stateSchema.parse(JSON.parse(raw));
  } catch {
    throw new ApiError(
      "Wallet alert state is unavailable.",
      503,
      "ALERT_STATE_INVALID",
    );
  }
}

async function sendMessage(
  config: ReturnType<typeof configuration>,
  message: string,
): Promise<void> {
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: config.group, message }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Provider rejected message");
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("idMessage" in data) ||
      typeof data.idMessage !== "string" ||
      !data.idMessage
    )
      throw new Error("Invalid provider response");
  } catch {
    throw new ApiError(
      "WhatsApp alert delivery is temporarily unavailable.",
      503,
      "ALERT_DELIVERY_UNAVAILABLE",
    );
  }
}

export async function runWalletAlerts(): Promise<{
  checked: number;
  queued: number;
  sent: number;
  failed: number;
  totalWallets: number;
}> {
  const config = configuration();
  const token = randomUUID();
  if ((await redis(["SET", LOCK_KEY, token, "NX", "EX", 120])) !== "OK")
    throw new ApiError(
      "A wallet alert check is already running.",
      503,
      "ALERT_CHECK_BUSY",
    );
  try {
    const tracked = await getWalletTrackingStatus({ fresh: true });
    const state = readState(await redis(["GET", STATE_KEY]));
    const addresses = tracked.wallets.filter(
      (address) => tracked.walletAlerts[address],
    );
    const start = addresses.length ? state.cursor % addresses.length : 0;
    const count = Math.min(addresses.length, WALLETS_PER_RUN);
    const selected = Array.from(
      { length: count },
      (_, index) => addresses[(start + index) % addresses.length],
    );
    const currentWallets = new Set(addresses);
    for (const address of Object.keys(state.wallets))
      if (!currentWallets.has(address)) delete state.wallets[address];
    const events: string[] = [];
    let failed = 0;
    for (let offset = 0; offset < selected.length; offset += 5) {
      const batch = selected.slice(offset, offset + 5);
      const results = await Promise.allSettled(
        batch.map((address) => getWalletDetails(address)),
      );
      results.forEach((result, index) => {
        const address = batch[index];
        if (result.status !== "fulfilled" || !result.value.account) {
          failed++;
          return;
        }
        const positions = result.value.account.positions;
        const previous = state.wallets[address];
        const next = positions.map(
          (position) =>
            `${position.coin}:${position.size > 0 ? "LONG" : "SHORT"}`,
        );
        const version = tracked.walletAlerts[address];
        if (
          previous &&
          !Array.isArray(previous) &&
          previous.version === version
        ) {
          const before = new Set(previous.positions);
          const after = new Set(next);
          const name = tracked.walletNames[address] ?? address;
          const detectedAt = new Date();
          for (const position of before) {
            if (after.has(position)) continue;
            const match = /^(.*):(LONG|SHORT)$/.exec(position);
            if (!match || !match[1]) continue;
            events.push(
              JSON.stringify({
                address,
                version,
                message: formatPositionClosedAlert(
                  name,
                  match[1],
                  match[2] as "LONG" | "SHORT",
                  detectedAt,
                ),
              }),
            );
          }
          positions.forEach((position, positionIndex) => {
            if (before.has(next[positionIndex])) return;
            events.push(
              JSON.stringify({
                address,
                version,
                message: formatPositionAlert(name, position, detectedAt),
              }),
            );
          });
        }
        state.wallets[address] = { version, positions: next };
      });
    }
    state.cursor = addresses.length ? (start + count) % addresses.length : 0;
    const messages = events;
    if (
      (await redis([
        "EVAL",
        SAVE,
        3,
        LOCK_KEY,
        STATE_KEY,
        QUEUE_KEY,
        token,
        JSON.stringify(state),
        ...messages,
      ])) !== 1
    )
      throw new ApiError(
        "Wallet alert check expired.",
        503,
        "ALERT_CHECK_EXPIRED",
      );
    let sent = 0;
    for (let processed = 0; processed < 5; processed++) {
      const message = await redis(["LINDEX", QUEUE_KEY, 0]);
      if (message === null) break;
      if (typeof message !== "string")
        throw new ApiError(
          "Wallet alert queue is unavailable.",
          503,
          "ALERT_QUEUE_INVALID",
        );
      let alert: z.infer<typeof queuedAlertSchema> | undefined;
      try {
        alert = queuedAlertSchema.parse(JSON.parse(message));
      } catch {
        // Discard legacy or invalid queue entries rather than sending unselected wallets.
      }
      if (alert) {
        const latest = await getWalletTrackingStatus({ fresh: true });
        if (latest.walletAlerts[alert.address] === alert.version) {
          await sendMessage(config, alert.message);
          sent++;
        }
      }
      if (
        (await redis(["EVAL", ACK, 2, LOCK_KEY, QUEUE_KEY, token, message])) !==
        1
      )
        throw new ApiError(
          "Wallet alert check expired.",
          503,
          "ALERT_CHECK_EXPIRED",
        );
    }
    if (failed)
      throw new ApiError(
        "Some wallet positions could not be checked.",
        503,
        "ALERT_CHECK_INCOMPLETE",
      );
    return {
      checked: count,
      queued: messages.length,
      sent,
      failed,
      totalWallets: addresses.length,
    };
  } finally {
    await redis(["EVAL", RELEASE, 1, LOCK_KEY, token]);
  }
}
