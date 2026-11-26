import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { WalletLeaderboard } from "./WalletLeaderboard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderBoard(
  addresses: string[],
  names: Record<string, string>,
  onClose = () => {},
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  }),
) {
  return render(
    <QueryClientProvider client={client}>
      <WalletLeaderboard
        addresses={addresses}
        names={names}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
}

it("loads a wallet and switches between 7-day and 30-day win rates", async () => {
  const address = `0x${"a".repeat(40)}`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        updatedAt: Date.now(),
        historyLimited: true,
        periods: {
          "7d": { wins: 3, losses: 1, breakeven: 0, winRate: 75 },
          "30d": { wins: 5, losses: 5, breakeven: 1, winRate: 50 },
        },
      }),
    ),
  );
  renderBoard([address], { [address]: "Aguila" });
  expect(await screen.findByText("75.0%")).toBeVisible();
  const board = screen.getByRole("dialog", {
    name: "Leaderboard",
  });
  expect(within(board).getByText("Aguila")).toBeVisible();
  expect(within(board).getByText("3 wins · 1 loss · 0 even")).toBeVisible();
  expect(within(board).getByText("2,000-fill limit")).toBeVisible();
  fireEvent.click(within(board).getByRole("button", { name: "30 days" }));
  expect(within(board).getByText("50.0%")).toBeVisible();
  expect(within(board).getByText("5 wins · 5 losses · 1 even")).toBeVisible();
});

it("supports keyboard dismissal and restores focus to the trigger", () => {
  const onClose = vi.fn();
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  const { unmount } = renderBoard([], {}, onClose);
  const dialog = screen.getByRole("dialog", { name: "Leaderboard" });
  expect(
    within(dialog).getByRole("button", { name: "Close leaderboard" }),
  ).toHaveFocus();
  fireEvent.keyDown(
    within(dialog).getByRole("button", { name: "Close leaderboard" }),
    { key: "Tab", shiftKey: true },
  );
  expect(within(dialog).getByText("How win rate is calculated")).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it("ranks the five best available wallets after checking the entire page", async () => {
  const addresses = Array.from(
    { length: 8 },
    (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
  );
  const names = Object.fromEntries(
    addresses.map((address, index) => [address, `Wallet ${index}`]),
  );
  const rates = [10, 30, 50, 70, 90, 100, null, null];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      const index = addresses.indexOf(
        new URL(url, "http://localhost").searchParams.get("address")!,
      );
      if (index === 7)
        return Promise.resolve(new Response(null, { status: 503 }));
      const rate = rates[index];
      const stats = {
        wins: rate === null ? 0 : rate,
        losses: rate === null ? 0 : 100 - rate,
        breakeven: 0,
        winRate: rate,
      };
      return Promise.resolve(
        Response.json({
          updatedAt: Date.now(),
          historyLimited: false,
          requestWeight: 20,
          periods: { "7d": stats, "30d": stats },
        }),
      );
    }),
  );
  renderBoard(addresses, names);
  expect(
    await screen.findByText("8/8 wallets checked · 1 unavailable"),
  ).toBeVisible();
  const list = screen.getByRole("list", { name: "Wallet rankings" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(5);
  expect(
    rows.map((row) => within(row).getByText(/^Wallet \d$/).textContent),
  ).toEqual(["Wallet 5", "Wallet 4", "Wallet 3", "Wallet 2", "Wallet 1"]);
  expect(screen.getByText("8/8 wallets checked · 1 unavailable")).toBeVisible();
  expect(
    screen.queryByText("Rankings update as wallets are checked."),
  ).not.toBeInTheDocument();
});

it("loads multiple wallets concurrently and reuses results after reopening", async () => {
  const addresses = Array.from(
    { length: 4 },
    (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
  );
  const names = Object.fromEntries(
    addresses.map((address, index) => [address, `Trader ${index}`]),
  );
  const pending: Array<(response: Response) => void> = [];
  const fetchMock = vi
    .fn()
    .mockImplementation(
      () => new Promise<Response>((resolve) => pending.push(resolve)),
    );
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const first = renderBoard(addresses, names, () => {}, client);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await act(async () => {
    for (const resolve of pending)
      resolve(
        Response.json({
          updatedAt: Date.now(),
          historyLimited: false,
          requestWeight: 20,
          periods: {
            "7d": { wins: 2, losses: 1, breakeven: 0, winRate: 66.67 },
            "30d": { wins: 2, losses: 1, breakeven: 0, winRate: 66.67 },
          },
        }),
      );
  });
  expect(screen.getByText("4/4 wallets checked")).toBeVisible();
  first.unmount();
  renderBoard(addresses, names, () => {}, client);
  expect(screen.getByText("4/4 wallets checked")).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("paces large histories within the request budget", async () => {
  vi.useFakeTimers();
  const addresses = Array.from(
    { length: 10 },
    (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
  );
  const stats = { wins: 2, losses: 1, breakeven: 0, winRate: 66.67 };
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      Response.json({
        updatedAt: Date.now(),
        historyLimited: true,
        requestWeight: 120,
        periods: { "7d": stats, "30d": stats },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  renderBoard(addresses, {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fetchMock).toHaveBeenCalledTimes(8);
  expect(screen.getByText("8/10 wallets checked")).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(10);
  expect(screen.getByText("10/10 wallets checked")).toBeVisible();
});

it("reuses in-flight requests when the modal is reopened", async () => {
  const addresses = Array.from(
    { length: 8 },
    (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
  );
  const pending: Array<(response: Response) => void> = [];
  const stats = { wins: 1, losses: 1, breakeven: 0, winRate: 50 };
  const fetchMock = vi.fn().mockImplementation(() => {
    if (fetchMock.mock.calls.length <= 4)
      return new Promise<Response>((resolve) => pending.push(resolve));
    return Promise.resolve(
      Response.json({
        updatedAt: Date.now(),
        historyLimited: true,
        requestWeight: 120,
        periods: { "7d": stats, "30d": stats },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const first = renderBoard(addresses, {}, () => {}, client);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  first.unmount();
  renderBoard(addresses, {}, () => {}, client);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await act(async () => {
    for (const resolve of pending)
      resolve(
        Response.json({
          updatedAt: Date.now(),
          historyLimited: true,
          requestWeight: 120,
          periods: { "7d": stats, "30d": stats },
        }),
      );
  });
  expect(await screen.findByText("8/8 wallets checked")).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(8);
});

it("retries a temporary rate limit after the requested delay", async () => {
  vi.useFakeTimers();
  const address = `0x${"a".repeat(40)}`;
  const stats = { wins: 1, losses: 0, breakeven: 0, winRate: 100 };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
    )
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({
          updatedAt: Date.now(),
          historyLimited: false,
          requestWeight: 20,
          periods: { "7d": stats, "30d": stats },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  renderBoard([address], { [address]: "Trader" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText("0/1 wallets checked")).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.getByText("100.0%")).toBeVisible();
});
