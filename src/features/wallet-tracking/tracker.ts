export const MAX_WALLETS = 10;
export const addressPattern = /^0x[0-9a-f]{40}$/;

export function isDiscordWebhook(value: string): boolean {
  return /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(
    value,
  );
}

export function isWorkerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".workers.dev") &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export interface TrackerSettings {
  wallets: string[];
  enabled: boolean;
  webhookConfigured: boolean;
  lastChecked?: number | null;
  lastError?: string | null;
}

export async function trackerRequest(
  url: string,
  token: string,
  settings?: { wallets: string[]; enabled: boolean; webhook?: string },
): Promise<TrackerSettings> {
  if (!isWorkerUrl(url) || token.length < 32)
    throw new Error("Enter your Worker URL and admin token.");
  const response = await fetch(url, {
    method: settings ? "PUT" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(settings ? { "Content-Type": "application/json" } : {}),
    },
    ...(settings ? { body: JSON.stringify(settings) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : `Request failed (${response.status}).`;
    throw new Error(error);
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("wallets" in result) ||
    !Array.isArray(result.wallets) ||
    !result.wallets.every(
      (wallet: unknown) =>
        typeof wallet === "string" && addressPattern.test(wallet),
    ) ||
    !("enabled" in result) ||
    typeof result.enabled !== "boolean" ||
    !("webhookConfigured" in result) ||
    typeof result.webhookConfigured !== "boolean"
  )
    throw new Error("Unexpected tracker response.");
  return result as TrackerSettings;
}

export async function testWebhook(url: string, token: string): Promise<void> {
  if (!isWorkerUrl(url) || token.length < 32)
    throw new Error("Enter your Worker URL and admin token.");
  const endpoint = new URL("/test", url);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const result: unknown = await response.json();
    throw new Error(
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : `Request failed (${response.status}).`,
    );
  }
}
