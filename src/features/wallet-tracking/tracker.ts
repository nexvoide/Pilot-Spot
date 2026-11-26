export interface TrackerStatus {
  wallets: string[];
  walletNames: Record<string, string>;
  walletCapital?: Record<string, { valueUsd: number; asOf: string }>;
  walletAlerts?: Record<string, string>;
  walletTags?: Record<string, string[]>;
}

import type { WalletDetails, WalletExtras, WalletWinRates } from "./types";
import { validWalletTags } from "./tags";

export async function getWalletDetails(
  address: string,
  signal: AbortSignal,
): Promise<WalletDetails> {
  const response = await fetch(
    `/api/wallet-tracking/details?address=${encodeURIComponent(address)}`,
    { signal },
  );
  if (!response.ok)
    throw new Error("Wallet details are temporarily unavailable.");
  return response.json() as Promise<WalletDetails>;
}

export async function getWalletExtras(
  address: string,
  signal: AbortSignal,
): Promise<WalletExtras> {
  const response = await fetch(
    `/api/wallet-tracking/details/extras?address=${encodeURIComponent(address)}`,
    { signal },
  );
  if (!response.ok)
    throw new Error("Wallet history and orders are temporarily unavailable.");
  return response.json() as Promise<WalletExtras>;
}

export async function getWalletWinRates(
  address: string,
  signal: AbortSignal,
): Promise<WalletWinRates> {
  const response = await fetch(
    `/api/wallet-tracking/win-rate?address=${encodeURIComponent(address)}`,
    { signal },
  );
  if (!response.ok)
    throw new Error("Trade history is temporarily unavailable.");
  return response.json() as Promise<WalletWinRates>;
}

export async function getTrackerStatus(
  signal: AbortSignal,
): Promise<TrackerStatus> {
  const response = await fetch("/api/wallet-tracking", { signal });
  if (!response.ok)
    throw new Error("Tracker status is temporarily unavailable.");
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("wallets" in result) ||
    !Array.isArray(result.wallets) ||
    !result.wallets.every(
      (wallet: unknown) =>
        typeof wallet === "string" && /^0x[0-9a-f]{40}$/.test(wallet),
    ) ||
    !("walletNames" in result) ||
    !result.walletNames ||
    typeof result.walletNames !== "object" ||
    Array.isArray(result.walletNames) ||
    !Object.entries(result.walletNames).every(
      ([address, name]) =>
        (result.wallets as unknown[]).includes(address) &&
        typeof name === "string" &&
        name === name.trim() &&
        name.length > 0 &&
        name.length <= 100 &&
        !/\p{Cc}/u.test(name),
    ) ||
    ("walletTags" in result &&
      (!result.walletTags ||
        typeof result.walletTags !== "object" ||
        Array.isArray(result.walletTags) ||
        !Object.entries(result.walletTags).every(
          ([address, tags]) =>
            (result.wallets as unknown[]).includes(address) &&
            validWalletTags(tags),
        ))) ||
    ("walletAlerts" in result &&
      (!result.walletAlerts ||
        typeof result.walletAlerts !== "object" ||
        Array.isArray(result.walletAlerts) ||
        !Object.entries(result.walletAlerts).every(
          ([address, version]) =>
            (result.wallets as unknown[]).includes(address) &&
            typeof version === "string" &&
            /^[0-9a-f-]{36}$/.test(version),
        ))) ||
    ("walletCapital" in result &&
      (!result.walletCapital ||
        typeof result.walletCapital !== "object" ||
        Array.isArray(result.walletCapital) ||
        !Object.entries(result.walletCapital).every(
          ([address, value]) =>
            (result.wallets as unknown[]).includes(address) &&
            value !== null &&
            typeof value === "object" &&
            "valueUsd" in value &&
            typeof value.valueUsd === "number" &&
            Number.isFinite(value.valueUsd) &&
            value.valueUsd >= 0 &&
            "asOf" in value &&
            typeof value.asOf === "string" &&
            Number.isFinite(Date.parse(value.asOf)),
        )))
  )
    throw new Error("Tracker status is temporarily unavailable.");
  return result as TrackerStatus;
}
