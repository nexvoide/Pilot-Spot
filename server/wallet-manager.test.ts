import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ data: new Map<string, string>() }));
vi.mock("./wallet-storage.js", () => ({
  WALLET_KEY: "spot-ladder:tracked-wallets:v1",
  storageConfigured: () =>
    Boolean(
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
  storageMentioned: () =>
    Boolean(
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
  redis: async (command: (string | number)[]) => {
    if (command[0] === "GET") return fake.data.get(String(command[1])) ?? null;
    if (command[0] === "SET") {
      fake.data.set(String(command[1]), String(command[2]));
      return "OK";
    }
    if (command[0] === "DEL")
      return fake.data.delete(String(command[1])) ? 1 : 0;
    if (command[0] !== "EVAL") throw new Error("Unexpected command");
    const key = String(command[3]);
    if (String(command[1]).includes("INCR")) {
      const count = Number(fake.data.get(key) ?? 0) + 1;
      fake.data.set(key, String(count));
      return count;
    }
    const raw = fake.data.get(key) ?? String(command[4]);
    if (!String(command[1]).includes("local list")) {
      fake.data.set(key, raw);
      return raw;
    }
    const list = JSON.parse(raw) as Array<{ address: string }>;
    const action = command[5];
    const address = String(command[6]);
    const exists = list.some((wallet) => wallet.address === address);
    if (action === "add" && exists) return "exists";
    if (action === "delete" && !exists) return "missing";
    const result =
      action === "add"
        ? [...list, JSON.parse(String(command[7]))]
        : list.filter((wallet) => wallet.address !== address);
    fake.data.set(key, JSON.stringify(result));
    return "ok";
  },
}));

beforeEach(() => {
  fake.data.clear();
  vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-token");
  vi.stubEnv("WALLET_MANAGER_PIN", "73928364");
});
afterEach(() => vi.unstubAllEnvs());

async function call(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    origin?: string;
    cookie?: string;
  } = {},
) {
  const { handleApiRequest } = await import("./http.js");
  const request = Readable.from(
    options.body === undefined ? [] : [JSON.stringify(options.body)],
  ) as IncomingMessage;
  request.method = options.method ?? "GET";
  request.url = path;
  request.headers = {
    host: "example.test",
    origin: options.origin ?? "https://example.test",
    "content-type": "application/json",
    ...(options.cookie ? { cookie: options.cookie } : {}),
  };
  Object.defineProperty(request, "socket", {
    value: { remoteAddress: "192.0.2.1" },
  });
  let code = 0;
  let data = "";
  const headers: Record<string, string> = {};
  const response = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(value: number) {
      code = value;
    },
    end(value: string) {
      data = value;
    },
  } as unknown as ServerResponse;
  await handleApiRequest(request, response, { publicAccess: true });
  return { code, headers, data: JSON.parse(data) as Record<string, unknown> };
}

it("shows when shared storage needs to be configured", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  expect((await call("/api/wallet-manager/status")).data).toEqual({
    configured: false,
    authenticated: false,
  });
  expect(
    (
      await call("/api/wallet-manager/wallets", {
        method: "POST",
        body: { name: "Test", address: `0x${"a".repeat(40)}` },
      })
    ).code,
  ).toBe(503);
});

it("keeps wallet changes disabled when no PIN is configured", async () => {
  vi.stubEnv("WALLET_MANAGER_PIN", "");
  expect((await call("/api/wallet-manager/status")).data).toEqual({
    configured: false,
    authenticated: false,
  });
  expect(
    (
      await call("/api/wallet-manager/wallets", {
        method: "POST",
        body: { name: "Test", address: `0x${"a".repeat(40)}` },
      })
    ).code,
  ).toBe(503);
});

it("requires the PIN to add and delete shared wallets", async () => {
  const address = `0x${"a".repeat(40)}`;
  expect((await call("/api/wallet-manager/status")).data).toEqual({
    configured: true,
    authenticated: false,
  });
  expect(
    (
      await call("/api/wallet-manager/wallets", {
        method: "POST",
        body: { name: "New wallet", address },
      })
    ).code,
  ).toBe(401);
  expect(
    (
      await call("/api/wallet-manager/unlock", {
        method: "POST",
        body: { pin: "0000" },
      })
    ).code,
  ).toBe(401);
  const login = await call("/api/wallet-manager/unlock", {
    method: "POST",
    body: { pin: "73928364" },
  });
  expect(login.code).toBe(200);
  expect(login.headers["set-cookie"]).toContain("HttpOnly; SameSite=Strict");
  expect(login.headers["set-cookie"]).toContain("Secure");
  const cookie = login.headers["set-cookie"].split(";")[0];
  expect(
    (await call("/api/wallet-manager/status", { cookie })).data.authenticated,
  ).toBe(true);
  const added = await call("/api/wallet-manager/wallets", {
    method: "POST",
    cookie,
    body: { name: "New wallet", address: address.toUpperCase() },
  });
  expect(added.code).toBe(200);
  expect((added.data.walletNames as Record<string, string>)[address]).toBe(
    "New wallet",
  );
  expect((await call("/api/wallet-tracking")).data.wallets).toContain(address);
  expect(
    (
      await call("/api/wallet-manager/wallets", {
        method: "POST",
        cookie,
        body: { name: "Duplicate", address },
      })
    ).code,
  ).toBe(409);
  const deleted = await call(`/api/wallet-manager/wallets?address=${address}`, {
    method: "DELETE",
    cookie,
  });
  expect(deleted.code).toBe(200);
  expect(deleted.data.wallets).not.toContain(address);
  expect((await call("/api/wallet-tracking")).data.wallets).not.toContain(
    address,
  );
  expect(
    (await call("/api/wallet-manager/lock", { method: "POST", cookie })).code,
  ).toBe(200);
  expect(
    (
      await call("/api/wallet-manager/wallets", {
        method: "POST",
        cookie,
        body: { name: "New wallet", address },
      })
    ).code,
  ).toBe(401);
});

it("validates addresses and rejects cross-site requests", async () => {
  const login = await call("/api/wallet-manager/unlock", {
    method: "POST",
    body: { pin: "73928364" },
  });
  const cookie = login.headers["set-cookie"].split(";")[0];
  expect(
    (
      await call("/api/wallet-manager/wallets", {
        method: "POST",
        cookie,
        body: { name: "Bad", address: "bad" },
      })
    ).code,
  ).toBe(400);
  expect(
    (
      await call("/api/wallet-manager/wallets", {
        method: "POST",
        cookie,
        origin: "https://other.test",
        body: { name: "Bad", address: `0x${"a".repeat(40)}` },
      })
    ).code,
  ).toBe(403);
});

it("limits PIN attempts and invalidates sessions when the PIN changes", async () => {
  const login = await call("/api/wallet-manager/unlock", {
    method: "POST",
    body: { pin: "73928364" },
  });
  const cookie = login.headers["set-cookie"].split(";")[0];
  vi.stubEnv("WALLET_MANAGER_PIN", "91827364");
  expect(
    (await call("/api/wallet-manager/status", { cookie })).data.authenticated,
  ).toBe(false);
  for (let index = 0; index < 5; index++)
    expect(
      (
        await call("/api/wallet-manager/unlock", {
          method: "POST",
          body: { pin: "0000" },
        })
      ).code,
    ).toBe(401);
  expect(
    (
      await call("/api/wallet-manager/unlock", {
        method: "POST",
        body: { pin: "91827364" },
      })
    ).code,
  ).toBe(429);
});

it("allows the local development frontend to unlock through its proxy", async () => {
  const { handleApiRequest } = await import("./http.js");
  const request = Readable.from([
    JSON.stringify({ pin: "73928364" }),
  ]) as IncomingMessage;
  request.method = "POST";
  request.url = "/api/wallet-manager/unlock";
  request.headers = {
    host: "127.0.0.1:8787",
    origin: "http://127.0.0.1:5173",
    "content-type": "application/json",
  };
  Object.defineProperty(request, "socket", {
    value: { remoteAddress: "127.0.0.1" },
  });
  let code = 0;
  const response = {
    setHeader() {},
    writeHead(value: number) {
      code = value;
    },
    end() {},
  } as unknown as ServerResponse;
  await handleApiRequest(request, response);
  expect(code).toBe(200);
});
