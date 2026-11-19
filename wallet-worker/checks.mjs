import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import worker, { checkWallets, opening } from "./index.mjs";

const wallet = `0x${"a".repeat(40)}`;
const webhook = "https://discord.com/api/webhooks/123/token";
const token = "a".repeat(32);
const fill = {
  coin: "ETH",
  startPosition: "0",
  sz: "1",
  px: "2000",
  time: 200,
  tid: 1,
  side: "B",
};
const originalFetch = globalThis.fetch;

function environment() {
  const values = new Map();
  return {
    ADMIN_TOKEN: token,
    TRACKER: {
      async get(key) {
        return values.has(key) ? JSON.parse(values.get(key)) : null;
      },
      async put(key, value) {
        values.set(key, value);
      },
    },
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("position tracking", () => {
  it("detects openings and flips, but ignores increases and spot fills", () => {
    assert.equal(opening(fill).direction, "Long");
    assert.equal(opening({ ...fill, side: "A" }).direction, "Short");
    assert.equal(opening({ ...fill, startPosition: "-0.5" }).direction, "Long");
    assert.equal(opening({ ...fill, startPosition: "1" }), null);
    assert.equal(opening({ ...fill, coin: "@107" }), null);
    assert.equal(opening({ ...fill, coin: "ETH/USDC" }), null);
  });

  it("authenticates and validates configuration without exposing the webhook", async () => {
    const env = environment();
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const unauthorized = await worker.fetch(
      new Request("https://worker.example/"),
      env,
    );
    assert.equal(unauthorized.status, 401);
    const save = await worker.fetch(
      new Request("https://worker.example/", {
        method: "PUT",
        headers,
        body: JSON.stringify({ wallets: [wallet], webhook, enabled: true }),
      }),
      env,
    );
    assert.equal(save.status, 200);
    const result = await save.json();
    assert.equal(result.webhookConfigured, true);
    assert.equal("webhook" in result, false);
    const invalid = await worker.fetch(
      new Request("https://worker.example/", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          wallets: [wallet],
          webhook: "https://evil.example/",
          enabled: true,
        }),
      }),
      env,
    );
    assert.equal(invalid.status, 400);
  });

  it("retries failed alerts and does not resend alerts already delivered", async () => {
    const env = environment();
    await env.TRACKER.put(
      "settings",
      JSON.stringify({
        wallets: [wallet],
        webhook,
        enabled: true,
        startedAt: { [wallet]: 100 },
      }),
    );
    let sends = 0;
    let fail = true;
    globalThis.fetch = async (url) => {
      if (url === "https://api.hyperliquid.xyz/info")
        return Response.json([fill, { ...fill, tid: 2, coin: "BTC" }]);
      sends++;
      if (sends === 2 && fail) return new Response(null, { status: 500 });
      return new Response(null, { status: 204 });
    };
    await assert.rejects(checkWallets(env, 300), /Discord request failed/);
    assert.equal(sends, 2);
    fail = false;
    await checkWallets(env, 400);
    assert.equal(sends, 3);
    const state = await env.TRACKER.get("state");
    assert.equal(state.cursors[wallet], 400);
    await checkWallets(env, 500);
    assert.equal(sends, 3);
  });
});
