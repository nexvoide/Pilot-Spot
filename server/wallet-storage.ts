import { ApiError } from "./errors.js";

export const WALLET_KEY = "spot-ladder:tracked-wallets:v1";

export function storageConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

export function storageMentioned(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

export async function redis(command: (string | number)[]): Promise<unknown> {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    if (!endpoint || !token) throw new Error("Missing configuration");
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid URL");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Storage unavailable");
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("result" in data) ||
      "error" in data
    )
      throw new Error("Storage unavailable");
    return data.result;
  } catch {
    throw new ApiError(
      "Wallet storage is temporarily unavailable.",
      503,
      "WALLET_STORAGE_UNAVAILABLE",
    );
  }
}
