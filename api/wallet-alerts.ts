import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { runWalletAlerts } from "../server/wallet-alerts.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  const secret = process.env.WALLET_ALERTS_CRON_SECRET;
  const authorization = request.headers.authorization ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (
    !secret ||
    secret.length < 32 ||
    !timingSafeEqual(hash(authorization), hash(expected))
  ) {
    response.statusCode = 401;
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("Allow", "POST");
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  try {
    const result = await runWalletAlerts();
    response.statusCode = 200;
    response.end(JSON.stringify(result));
  } catch {
    response.statusCode = 503;
    response.end(JSON.stringify({ error: "Wallet alert check failed" }));
  }
}
