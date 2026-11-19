const ADDRESS = /^0x[0-9a-f]{40}$/;
const WEBHOOK = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;
const MAX_WALLETS = 10;
const MAX_ALERTS = 25;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function authorized(request, secret) {
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get("Authorization") || "";
  const input = header.startsWith("Bearer ") ? header.slice(7) : "";
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const a = new Uint8Array(actual);
  const b = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function getSettings(env) {
  return (
    (await env.TRACKER.get("settings", "json")) || {
      wallets: [],
      webhook: "",
      enabled: false,
    }
  );
}

export function opening(fill) {
  if (
    !fill ||
    typeof fill !== "object" ||
    typeof fill.coin !== "string" ||
    !/^[A-Za-z0-9:._-]{1,32}$/.test(fill.coin) ||
    typeof fill.startPosition !== "string" ||
    typeof fill.sz !== "string" ||
    typeof fill.px !== "string" ||
    !Number.isSafeInteger(fill.time) ||
    !Number.isSafeInteger(fill.tid) ||
    !["B", "A"].includes(fill.side)
  )
    return null;
  const start = Number(fill.startPosition);
  const size = Number(fill.sz);
  const price = Number(fill.px);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(size) ||
    !Number.isFinite(price) ||
    size <= 0 ||
    price <= 0
  )
    return null;
  const end = start + (fill.side === "B" ? size : -size);
  const direction =
    start <= 0 && end > 0 ? "Long" : start >= 0 && end < 0 ? "Short" : null;
  if (!direction) return null;
  return {
    coin: fill.coin,
    direction,
    price: fill.px,
    size: Math.abs(end).toString(),
    time: fill.time,
    id: `${fill.coin}:${fill.time}:${fill.tid}`,
  };
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (!(await authorized(request, env.ADMIN_TOKEN)))
    return json({ error: "Unauthorized." }, 401);
  if (request.method === "GET") {
    const settings = await getSettings(env);
    const state = await env.TRACKER.get("state", "json");
    return json({
      wallets: settings.wallets,
      enabled: settings.enabled,
      webhookConfigured: Boolean(settings.webhook),
      lastChecked: state?.lastChecked || null,
      lastError: state?.lastError || null,
    });
  }
  if (request.method === "POST" && new URL(request.url).pathname === "/test") {
    const settings = await getSettings(env);
    if (!settings.webhook)
      return json({ error: "Save a Discord webhook first." }, 400);
    const result = await fetch(settings.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Spot Ladder wallet tracking is connected to Discord.",
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!result.ok)
      return json({ error: `Discord request failed (${result.status}).` }, 502);
    return json({ sent: true });
  }
  if (request.method !== "PUT")
    return json({ error: "Method not allowed." }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (
    !body ||
    !Array.isArray(body.wallets) ||
    body.wallets.length > MAX_WALLETS ||
    body.wallets.some(
      (wallet) => typeof wallet !== "string" || !ADDRESS.test(wallet),
    ) ||
    new Set(body.wallets).size !== body.wallets.length ||
    typeof body.enabled !== "boolean" ||
    (body.webhook !== undefined &&
      (typeof body.webhook !== "string" || !WEBHOOK.test(body.webhook)))
  )
    return json({ error: "Invalid settings." }, 400);
  const previous = await getSettings(env);
  const startedAt = Object.fromEntries(
    body.wallets.map((wallet) => [
      wallet,
      previous.enabled && previous.wallets.includes(wallet)
        ? previous.startedAt?.[wallet] || Date.now()
        : Date.now(),
    ]),
  );
  const next = {
    wallets: body.wallets,
    webhook: body.webhook || previous.webhook,
    enabled: body.enabled,
    startedAt,
  };
  if (next.enabled && (!next.wallets.length || !next.webhook))
    return json(
      { error: "Add a wallet and Discord webhook before starting." },
      400,
    );
  await env.TRACKER.put("settings", JSON.stringify(next));
  return json({
    wallets: next.wallets,
    enabled: next.enabled,
    webhookConfigured: Boolean(next.webhook),
  });
}

export async function checkWallets(env, now = Date.now()) {
  const settings = await getSettings(env);
  if (!settings.enabled || !settings.webhook || !settings.wallets.length)
    return;
  const state = (await env.TRACKER.get("state", "json")) || {
    cursors: {},
    sent: [],
  };
  state.cursors ||= {};
  state.sent ||= [];
  const sent = new Set(state.sent);
  let alertCount = 0;
  const errors = [];
  for (const wallet of settings.wallets) {
    state.cursors[wallet] = Math.max(
      state.cursors[wallet] || 0,
      settings.startedAt?.[wallet] || now,
    );
    try {
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "userFillsByTime",
          user: wallet,
          startTime: state.cursors[wallet],
          endTime: now,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Hyperliquid request failed");
      const fills = await response.json();
      if (!Array.isArray(fills))
        throw new Error("Invalid Hyperliquid response");
      fills.sort((a, b) => a.time - b.time || a.tid - b.tid);
      for (const fill of fills) {
        const event = opening(fill);
        if (!event || event.time < state.cursors[wallet]) continue;
        const id = `${wallet}:${event.id}`;
        if (sent.has(id)) continue;
        if (alertCount >= MAX_ALERTS)
          throw new Error(
            "Alert limit reached; remaining alerts will be retried",
          );
        const content = `🐋 Hyperliquid position opened\nWallet: ${wallet}\nMarket: ${event.coin}\nDirection: ${event.direction}\nOpening size: ${event.size} ${event.coin}\nFill price: ${event.price} USD\nTime: ${new Date(event.time).toISOString()}`;
        const discord = await fetch(settings.webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
          signal: AbortSignal.timeout(15000),
        });
        if (!discord.ok)
          throw new Error(`Discord request failed (${discord.status})`);
        sent.add(id);
        alertCount++;
      }
      // Hyperliquid caps responses at 2,000; keep the cursor if the result may be truncated.
      if (fills.length >= 2000)
        throw new Error("Too many fills; history may be incomplete");
      state.cursors[wallet] = now;
    } catch (error) {
      errors.push(
        `${wallet}: ${error instanceof Error ? error.message : "Check failed"}`,
      );
    }
  }
  state.cursors = Object.fromEntries(
    Object.entries(state.cursors).filter(([wallet]) =>
      settings.wallets.includes(wallet),
    ),
  );
  state.sent = [...sent].slice(-5000);
  state.lastChecked = now;
  state.lastError = errors.length ? errors.join("; ") : null;
  await env.TRACKER.put("state", JSON.stringify(state));
  if (errors.length) throw new Error(errors.join("; "));
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch {
      return json({ error: "Could not access tracker storage." }, 500);
    }
  },
  async scheduled(_event, env, context) {
    context.waitUntil(checkWallets(env));
  },
};
