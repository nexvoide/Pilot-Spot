import { afterEach, expect, it, vi } from "vitest";
import { redis } from "./wallet-storage.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("sends Redis commands securely to the configured REST endpoint", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ result: "OK" }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await redis(["SET", "key", "value"])).toBe("OK");
  const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
  expect(url.toString()).toBe("https://redis.example/");
  expect(options.headers).toMatchObject({ Authorization: "Bearer test-token" });
  expect(JSON.parse(String(options.body))).toEqual(["SET", "key", "value"]);
  expect(options.redirect).toBe("error");
});

it("fails closed on insecure configuration or provider errors", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "http://redis.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  const fetchMock = vi
    .fn()
    .mockRejectedValue(new Error("private provider error"));
  vi.stubGlobal("fetch", fetchMock);
  await expect(redis(["GET", "key"])).rejects.toMatchObject({
    status: 503,
    code: "WALLET_STORAGE_UNAVAILABLE",
  });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
  await expect(redis(["GET", "key"])).rejects.toMatchObject({
    message: "Wallet storage is temporarily unavailable.",
  });
});
