import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "./errors.js";
import { isLocalRequest } from "./local-access.js";
import { changeWallet, setWalletAlert } from "./wallet-tracking.js";
import { redis, storageConfigured } from "./wallet-storage.js";

const COOKIE = "spot_wallet_session";
const SESSION_SECONDS = 1800;
const RATE_KEY = "spot-ladder:wallet-manager:attempts";
const RATE_SCRIPT = `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 900) end; return n`;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function configured(): boolean {
  return (
    storageConfigured() &&
    /^\d{4,32}$/.test(process.env.WALLET_MANAGER_PIN ?? "")
  );
}

function sessionToken(request: IncomingMessage): string | null {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  const token = cookie?.slice(COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function sessionBinding(): string {
  return createHmac("sha256", process.env.UPSTASH_REDIS_REST_TOKEN!)
    .update(process.env.WALLET_MANAGER_PIN!)
    .digest("hex");
}

async function authenticated(request: IncomingMessage): Promise<boolean> {
  const token = sessionToken(request);
  if (!token || !configured()) return false;
  return (
    (await redis([
      "GET",
      `spot-ladder:wallet-manager:session:${hash(token)}`,
    ])) === sessionBinding()
  );
}

function setSessionCookie(
  response: ServerResponse,
  token: string,
  publicAccess: boolean,
  maxAge: number,
): void {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/api/wallet-manager; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${publicAccess ? "; Secure" : ""}`,
  );
}

function checkOrigin(request: IncomingMessage, publicAccess: boolean): void {
  if (
    request.headers["sec-fetch-site"] === "cross-site" ||
    !request.headers.origin
  )
    throw new ApiError("Request origin is not allowed.", 403, "INVALID_ORIGIN");
  if (!publicAccess && isLocalRequest(request)) return;
  try {
    const origin = new URL(request.headers.origin);
    if (
      origin.protocol === "https:" &&
      origin.host === request.headers.host &&
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash
    )
      return;
  } catch {
    /* Invalid origin. */
  }
  throw new ApiError("Request origin is not allowed.", 403, "INVALID_ORIGIN");
}

async function body(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")
  )
    throw new ApiError("Expected JSON.", 400, "INVALID_BODY");
  const parsedBody = (request as IncomingMessage & { body?: unknown }).body;
  let parsed: unknown;
  try {
    if (parsedBody !== undefined) {
      if (Buffer.byteLength(JSON.stringify(parsedBody)) > 4096)
        throw new Error("Too large");
      parsed = parsedBody;
    } else {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > 4096) throw new Error("Too large");
        chunks.push(bytes);
      }
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
  } catch {
    throw new ApiError("Invalid request.", 400, "INVALID_BODY");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new ApiError("Invalid request.", 400, "INVALID_BODY");
  return parsed as Record<string, unknown>;
}

export async function handleWalletManager(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  publicAccess: boolean,
): Promise<unknown> {
  if (url.pathname === "/api/wallet-manager/status" && request.method === "GET")
    return {
      configured: configured(),
      authenticated: await authenticated(request),
    };
  if (!configured())
    throw new ApiError(
      "Wallet management needs server configuration.",
      503,
      "MANAGER_NOT_CONFIGURED",
    );
  checkOrigin(request, publicAccess);
  if (
    url.pathname === "/api/wallet-manager/unlock" &&
    request.method === "POST"
  ) {
    const input = await body(request);
    if (typeof input.pin !== "string" || !/^\d{4,32}$/.test(input.pin))
      throw new ApiError(
        "Enter a PIN containing 4 to 32 digits.",
        400,
        "INVALID_PIN",
      );
    const attempts = await redis(["EVAL", RATE_SCRIPT, 1, RATE_KEY]);
    if (typeof attempts !== "number")
      throw new ApiError(
        "Wallet management is temporarily unavailable.",
        503,
        "MANAGER_UNAVAILABLE",
      );
    if (attempts > 5)
      throw new ApiError(
        "Too many attempts. Please try again in 15 minutes.",
        429,
        "PIN_RATE_LIMIT",
        900,
      );
    const expected = Buffer.from(hash(process.env.WALLET_MANAGER_PIN!), "hex");
    const actual = Buffer.from(hash(input.pin), "hex");
    if (!timingSafeEqual(actual, expected))
      throw new ApiError("Incorrect PIN.", 401, "INVALID_PIN");
    await redis(["DEL", RATE_KEY]);
    const token = randomBytes(32).toString("base64url");
    await redis([
      "SET",
      `spot-ladder:wallet-manager:session:${hash(token)}`,
      sessionBinding(),
      "EX",
      SESSION_SECONDS,
    ]);
    setSessionCookie(response, token, publicAccess, SESSION_SECONDS);
    return { authenticated: true };
  }
  if (!(await authenticated(request)))
    throw new ApiError(
      "Enter your PIN to manage wallets.",
      401,
      "MANAGER_LOCKED",
    );
  if (
    url.pathname === "/api/wallet-manager/alerts" &&
    request.method === "POST"
  ) {
    const input = await body(request);
    if (typeof input.address !== "string" || typeof input.enabled !== "boolean")
      throw new ApiError(
        "Enter a wallet and alert setting.",
        400,
        "INVALID_BODY",
      );
    return setWalletAlert(input.address.trim().toLowerCase(), input.enabled);
  }
  if (
    url.pathname === "/api/wallet-manager/lock" &&
    request.method === "POST"
  ) {
    const token = sessionToken(request);
    if (token)
      await redis(["DEL", `spot-ladder:wallet-manager:session:${hash(token)}`]);
    setSessionCookie(response, "", publicAccess, 0);
    return { authenticated: false };
  }
  if (
    url.pathname === "/api/wallet-manager/wallets" &&
    request.method === "POST"
  ) {
    const input = await body(request);
    if (typeof input.address !== "string" || typeof input.name !== "string")
      throw new ApiError(
        "Enter a wallet name and address.",
        400,
        "INVALID_BODY",
      );
    return changeWallet(
      "add",
      input.address.trim().toLowerCase(),
      input.name.trim(),
    );
  }
  if (
    url.pathname === "/api/wallet-manager/wallets" &&
    request.method === "DELETE"
  )
    return changeWallet(
      "delete",
      (url.searchParams.get("address") ?? "").trim().toLowerCase(),
    );
  throw new ApiError("Method not allowed.", 405, "METHOD_NOT_ALLOWED");
}
