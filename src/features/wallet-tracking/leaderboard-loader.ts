import type { QueryClient } from "@tanstack/react-query";
import { getWalletWinRates, WalletHistoryRateLimitError } from "./tracker";
import type { WalletWinRates } from "./types";

export type LeaderboardResult =
  { status: "ready"; data: WalletWinRates } | { status: "error" };
const CACHE_MS = 300_000;
const WINDOW_MS = 60_000;
const MAX_WEIGHT = 960;
const RESERVED_WEIGHT = 120;
const MAX_CONCURRENT = 4;
const MAX_RATE_LIMIT_RETRIES = 2;
type Reservation = { at: number; weight: number };
type Budget = { entries: Reservation[]; cooldownUntil: number };
const budgets = new WeakMap<QueryClient, Budget>();

function queryKey(address: string) {
  return ["wallet-win-rates", address] as const;
}

function freshResult(
  client: QueryClient,
  address: string,
): WalletWinRates | undefined {
  const state = client.getQueryState<WalletWinRates>(queryKey(address));
  return state?.data &&
    !state.isInvalidated &&
    Date.now() - state.dataUpdatedAt < CACHE_MS
    ? state.data
    : undefined;
}

export function cachedLeaderboardResults(
  client: QueryClient,
  addresses: string[],
): Record<string, LeaderboardResult> {
  return Object.fromEntries(
    addresses.flatMap((address) => {
      const data = freshResult(client, address);
      return data ? [[address, { status: "ready" as const, data }]] : [];
    }),
  );
}

export function loadLeaderboardResults(
  client: QueryClient,
  addresses: string[],
  onResult: (address: string, result: LeaderboardResult) => void,
): () => void {
  let budget = budgets.get(client);
  if (!budget) {
    budget = { entries: [], cooldownUntil: 0 };
    budgets.set(client, budget);
  }
  const sharedBudget = budget;
  const queue = addresses
    .filter((address) => !freshResult(client, address))
    .map((address) => ({ address, attempts: 0 }));
  let active = true;
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function pump() {
    if (!active) return;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const now = Date.now();
    sharedBudget.entries = sharedBudget.entries.filter(
      (entry) => now - entry.at < WINDOW_MS,
    );
    if (sharedBudget.cooldownUntil > now) {
      timer = setTimeout(pump, sharedBudget.cooldownUntil - now);
      return;
    }
    while (active && queue.length && inFlight < MAX_CONCURRENT) {
      const job = queue[0];
      const cached = freshResult(client, job.address);
      if (cached) {
        queue.shift();
        onResult(job.address, { status: "ready", data: cached });
        continue;
      }
      const alreadyFetching =
        client.getQueryState(queryKey(job.address))?.fetchStatus === "fetching";
      const used = sharedBudget.entries.reduce(
        (sum, entry) => sum + entry.weight,
        0,
      );
      if (!alreadyFetching && used + RESERVED_WEIGHT > MAX_WEIGHT) {
        const oldest = sharedBudget.entries[0];
        timer = setTimeout(
          pump,
          Math.max(1, oldest.at + WINDOW_MS - Date.now()),
        );
        return;
      }
      queue.shift();
      const reservation = alreadyFetching
        ? undefined
        : { at: Date.now(), weight: RESERVED_WEIGHT };
      if (reservation) sharedBudget.entries.push(reservation);
      inFlight++;
      void client
        .fetchQuery({
          queryKey: queryKey(job.address),
          queryFn: ({ signal }) => getWalletWinRates(job.address, signal),
          staleTime: CACHE_MS,
          gcTime: CACHE_MS * 2,
          retry: false,
        })
        .then((data) => {
          if (
            reservation &&
            typeof data.requestWeight === "number" &&
            Number.isFinite(data.requestWeight)
          )
            reservation.weight = Math.min(
              RESERVED_WEIGHT,
              Math.max(0, Math.ceil(data.requestWeight)),
            );
          if (active) onResult(job.address, { status: "ready", data });
        })
        .catch((error: unknown) => {
          if (
            active &&
            error instanceof WalletHistoryRateLimitError &&
            job.attempts < MAX_RATE_LIMIT_RETRIES
          ) {
            sharedBudget.cooldownUntil = Math.max(
              sharedBudget.cooldownUntil,
              Date.now() + error.retryAfterMs,
            );
            queue.unshift({ ...job, attempts: job.attempts + 1 });
          } else if (active) onResult(job.address, { status: "error" });
        })
        .finally(() => {
          inFlight--;
          pump();
        });
    }
  }
  pump();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}
