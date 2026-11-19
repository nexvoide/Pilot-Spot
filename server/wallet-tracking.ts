import {
  trackedWallets,
  type TrackedWallet,
} from "../src/features/wallet-tracking/wallets.js";
import { ApiError } from "./errors.js";
import { redis, storageMentioned, WALLET_KEY } from "./wallet-storage.js";

const INITIAL = JSON.stringify(trackedWallets);
const MAX_WALLETS = 10_000;
const READ = `local value = redis.call('GET', KEYS[1]); if not value then redis.call('SET', KEYS[1], ARGV[1]); return ARGV[1] end; return value`;
let cached: { value: TrackedWallet[]; expiresAt: number } | undefined;
let pending: Promise<TrackedWallet[]> | undefined;

function validateWallets(value: unknown): TrackedWallet[] {
  if (!Array.isArray(value) || value.length > MAX_WALLETS)
    throw new Error("Invalid wallet collection");
  const addresses = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.address !== "string" ||
      !/^0x[0-9a-f]{40}$/.test(item.address) ||
      addresses.has(item.address) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name !== item.name.trim() ||
      item.name.length > 100 ||
      /\p{Cc}/u.test(item.name) ||
      (item.capitalSnapshot &&
        (!Number.isFinite(item.capitalSnapshot.valueUsd) ||
          item.capitalSnapshot.valueUsd < 0 ||
          typeof item.capitalSnapshot.asOf !== "string" ||
          !Number.isFinite(Date.parse(item.capitalSnapshot.asOf))))
    )
      throw new Error("Invalid wallet collection");
    addresses.add(item.address);
  }
  return value as TrackedWallet[];
}

async function collection(): Promise<TrackedWallet[]> {
  if (!storageMentioned()) return validateWallets(trackedWallets);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const raw = await redis(["EVAL", READ, 1, WALLET_KEY, INITIAL]);
    try {
      if (typeof raw !== "string") throw new Error("Missing wallet collection");
      const value = validateWallets(JSON.parse(raw));
      cached = { value, expiresAt: Date.now() + 2_000 };
      return value;
    } catch {
      throw new ApiError(
        "Wallet storage contains invalid data.",
        503,
        "WALLET_STORAGE_INVALID",
      );
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}

export async function isTrackedWallet(address: string): Promise<boolean> {
  return (await collection()).some((wallet) => wallet.address === address);
}

export async function getWalletTrackingStatus() {
  const wallets = await collection();
  return {
    wallets: wallets.map(({ address }) => address),
    walletNames: Object.fromEntries(
      wallets.map(({ address, name }) => [address, name]),
    ),
    walletCapital: Object.fromEntries(
      wallets.flatMap(({ address, capitalSnapshot }) =>
        capitalSnapshot ? [[address, capitalSnapshot]] : [],
      ),
    ),
  };
}

const MUTATE = `
local raw = redis.call('GET', KEYS[1]) or ARGV[1]
local list = cjson.decode(raw)
local address = ARGV[3]
local result = {}
local found = false
for _, wallet in ipairs(list) do
  if wallet.address == address then found = true end
  if ARGV[2] ~= 'delete' or wallet.address ~= address then table.insert(result, wallet) end
end
if ARGV[2] == 'add' then
  if found then return 'exists' end
  if #list >= tonumber(ARGV[5]) then return 'limit' end
  table.insert(result, cjson.decode(ARGV[4]))
elseif not found then return 'missing' end
local encoded = #result == 0 and '[]' or cjson.encode(result)
redis.call('SET', KEYS[1], encoded)
return 'ok'
`;

export async function changeWallet(
  action: "add" | "delete",
  address: string,
  name?: string,
) {
  if (!/^0x[0-9a-f]{40}$/.test(address))
    throw new ApiError("Enter a valid wallet address.", 400, "INVALID_WALLET");
  if (
    action === "add" &&
    (!name || name !== name.trim() || name.length > 100 || /\p{Cc}/u.test(name))
  )
    throw new ApiError(
      "Enter a valid wallet name.",
      400,
      "INVALID_WALLET_NAME",
    );
  const outcome = await redis([
    "EVAL",
    MUTATE,
    1,
    WALLET_KEY,
    INITIAL,
    action,
    address,
    JSON.stringify({ address, name }),
    MAX_WALLETS,
  ]);
  if (outcome === "exists")
    throw new ApiError("This wallet is already tracked.", 409, "WALLET_EXISTS");
  if (outcome === "missing")
    throw new ApiError(
      "This wallet is no longer tracked.",
      404,
      "WALLET_NOT_FOUND",
    );
  if (outcome === "limit")
    throw new ApiError(
      "The wallet limit has been reached.",
      409,
      "WALLET_LIMIT",
    );
  if (outcome !== "ok")
    throw new ApiError(
      "Wallet storage is temporarily unavailable.",
      503,
      "WALLET_STORAGE_UNAVAILABLE",
    );
  cached = undefined;
  if (pending) await pending.catch(() => undefined);
  cached = undefined;
  return getWalletTrackingStatus();
}
