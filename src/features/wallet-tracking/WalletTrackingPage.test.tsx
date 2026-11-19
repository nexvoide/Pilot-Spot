import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  act,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WalletTrackingPage } from "./WalletTrackingPage";
import { capitalCategory } from "./capital";

const address = `0x${"a".repeat(40)}`;
const position = (coin: string, positionValue: number) => ({
  coin,
  size: 1,
  entryPrice: 1,
  positionValue,
  unrealizedPnl: 1,
  returnOnEquity: 0,
  liquidationPrice: null,
  marginUsed: 1,
  leverage: 1,
  marginMode: "cross",
  fundingSinceOpen: 0,
});
const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <WalletTrackingPage />
    </QueryClientProvider>,
  );
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("marks each card position by direction independently of its P&L", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith("/api/wallet-tracking/details")
            ? {
                updatedAt: 100,
                account: {
                  accountValue: 1,
                  marginUsed: 1,
                  positionValue: 300,
                  withdrawable: 0,
                  positions: [
                    { ...position("BTC", 200), unrealizedPnl: -20 },
                    { ...position("ETH", 100), size: -1, unrealizedPnl: 10 },
                  ],
                },
                portfolio: null,
                orders: null,
              }
            : { wallets: [address], walletNames: { [address]: "Trader" } },
        ),
      ),
    ),
  );
  renderPage();
  const card = await screen.findByRole("article");
  await waitFor(() =>
    expect(card.querySelectorAll(".whale-position")).toHaveLength(2),
  );
  const long = card.querySelector(".whale-direction.long")?.closest(".whale-position");
  const short = card.querySelector(".whale-direction.short")?.closest(".whale-position");
  expect(long).toHaveTextContent("Long");
  expect(
    long?.querySelector(".whale-position-pnl .negative"),
  ).toHaveTextContent("-$20");
  expect(short).toHaveTextContent("Short");
  expect(
    short?.querySelector(".whale-position-pnl .positive"),
  ).toHaveTextContent("+$10");
  expect(screen.queryByText("POSITION MONITOR")).not.toBeInTheDocument();
});

it("shows named positions and removes credentials saved by the old page", async () => {
  localStorage.setItem(
    "spot-ladder-analyzer:tracker-connection",
    JSON.stringify({ token: "old-secret" }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith("/api/wallet-tracking/details")
            ? {
                updatedAt: 100,
                account: {
                  accountValue: 1000,
                  marginUsed: 50,
                  positionValue: 500,
                  withdrawable: 0,
                  positions: [
                    {
                      coin: "BTC",
                      size: -0.5,
                      entryPrice: 100,
                      positionValue: 500,
                      unrealizedPnl: 25,
                      returnOnEquity: 0.5,
                      liquidationPrice: 120,
                      marginUsed: 50,
                      leverage: 10,
                      marginMode: "cross",
                      fundingSinceOpen: 1,
                    },
                  ],
                },
                portfolio: { dayPnl: 10, allTimePnl: 100 },
                orders: [],
              }
            : {
                wallets: [address],
                walletNames: { [address]: "Sub18" },
                enabled: true,
                lastChecked: null,
              },
        ),
      ),
    ),
  );
  renderPage();
  expect(await screen.findByText("Sub18")).toBeInTheDocument();
  expect(
    await within(screen.getByRole("article")).findByText("Short"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("article")).getByText("BTC"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("article")).getAllByText("+$25.00"),
  ).toHaveLength(2);
  expect(screen.getByText(address)).toBeInTheDocument();
  expect(
    screen.getByRole("searchbox", { name: "Search wallets or coins" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /add wallet/i }),
  ).not.toBeInTheDocument();
  expect(
    localStorage.getItem("spot-ladder-analyzer:tracker-connection"),
  ).toBeNull();
});

it("shows an unavailable state when the tracker cannot be reached", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  renderPage();
  expect(
    await screen.findByText("Tracker status is temporarily unavailable."),
  ).toBeInTheDocument();
});

it("loads order and P&L history on demand when visibility observation is unavailable", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith("/api/wallet-tracking/details/extras"))
      return Promise.resolve(
        Response.json({
          updatedAt: 100,
          portfolio: { dayPnl: 20, allTimePnl: 30 },
          orders: [],
        }),
      );
    if (url.startsWith("/api/wallet-tracking/details"))
      return Promise.resolve(
        Response.json({
          updatedAt: 100,
          account: {
            accountValue: 1,
            marginUsed: 1,
            positionValue: 1,
            withdrawable: 0,
            positions: [position("BTC", 1)],
          },
          portfolio: null,
          orders: null,
        }),
      );
    return Promise.resolve(
      Response.json({
        wallets: [address],
        walletNames: { [address]: "Sub18" },
        enabled: true,
        lastChecked: null,
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  renderPage();
  const load = await screen.findByRole("button", {
    name: "Load history and orders",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.click(load);
  expect(await screen.findByText("+$20.00")).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("requests history only when a card enters the viewport", async () => {
  const callbacks: Array<(entries: IntersectionObserverEntry[]) => void> = [];
  class Observer {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push((entries) =>
        callback(entries, {} as IntersectionObserver),
      );
    }
    observe() {
      /* Visibility is controlled by the test. */
    }
    disconnect() {
      /* No external observer to clean up. */
    }
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith("/api/wallet-tracking/details/extras"))
      return Promise.resolve(
        Response.json({
          updatedAt: 100,
          portfolio: { dayPnl: 20, allTimePnl: 30 },
          orders: [],
        }),
      );
    if (url.startsWith("/api/wallet-tracking/details"))
      return Promise.resolve(
        Response.json({
          updatedAt: 100,
          account: {
            accountValue: 1,
            marginUsed: 1,
            positionValue: 1,
            withdrawable: 0,
            positions: [position("BTC", 1)],
          },
          portfolio: null,
          orders: null,
        }),
      );
    return Promise.resolve(
      Response.json({
        wallets: [address],
        walletNames: { [address]: "Sub18" },
        enabled: true,
        lastChecked: null,
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  renderPage();
  await screen.findByRole("heading", { name: "Sub18" });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(callbacks).toHaveLength(1);
  act(() =>
    callbacks[0]([{ isIntersecting: true } as IntersectionObserverEntry]),
  );
  expect(await screen.findByText("+$20.00")).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("ranks markets by wallet counts and updates when a position closes", async () => {
  const shortWallet = `0x${"b".repeat(40)}`;
  const otherCoinWallet = `0x${"c".repeat(40)}`;
  const unavailable = `0x${"d".repeat(40)}`;
  let closed = false;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (!url.startsWith("/api/wallet-tracking/details"))
        return Promise.resolve(
          Response.json({
            wallets: [address, shortWallet, otherCoinWallet, unavailable],
            walletNames: {
              [address]: "Long wallet",
              [shortWallet]: "Short wallet",
              [otherCoinWallet]: "ETH wallet",
              [unavailable]: "Unknown",
            },
            enabled: true,
            lastChecked: null,
          }),
        );
      const wallet = new URL(url, "http://localhost").searchParams.get(
        "address",
      );
      const positions =
        wallet === address
          ? [
              ...(closed ? [] : [position("BTC", 100), position("BTC", 50)]),
              { ...position("ETH", 50), size: -1 },
              position("ZEC", 20),
            ]
          : wallet === shortWallet
            ? [
                { ...position("BTC", 100), size: -1 },
                { ...position("ZEC", 20), size: -1 },
              ]
            : [position("ETH", 50), { ...position("ZEC", 20), size: -1 }];
      return Promise.resolve(
        Response.json({
          updatedAt: Date.now(),
          account:
            wallet === unavailable
              ? null
              : {
                  accountValue: 1,
                  marginUsed: 1,
                  positionValue: 1,
                  withdrawable: 0,
                  positions,
                },
          portfolio: null,
          orders: null,
        }),
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <WalletTrackingPage />
    </QueryClientProvider>,
  );
  const counts = await screen.findByRole("region", {
    name: "Market positions across tracked wallets",
  });
  await waitFor(() => {
    expect(
      counts.querySelector(
        ".whale-market-trigger .whale-count-box.long strong",
      ),
    ).toHaveTextContent("1");
    expect(
      counts.querySelector(
        ".whale-market-trigger .whale-count-box.short strong",
      ),
    ).toHaveTextContent("1");
    expect(within(counts).getByText("3/4 wallets checked")).toBeVisible();
  });
  const toggle = within(counts).getByRole("button", {
    name: /show other markets/i,
  });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(within(counts).queryByRole("list")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const rows = within(counts).getAllByRole("listitem");
  expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual([
    "ZEC",
    "ETH",
  ]);
  expect(
    rows[0].querySelector(".whale-count-box.long strong"),
  ).toHaveTextContent("1");
  expect(
    rows[0].querySelector(".whale-count-box.short strong"),
  ).toHaveTextContent("2");
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search wallets or coins" }),
    { target: { value: "ETH wallet" } },
  );
  expect(within(counts).getAllByRole("listitem")).toHaveLength(2);
  closed = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["wallet-details", address] });
  });
  await waitFor(() => {
    const rows = within(counts).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual(
      ["ZEC", "ETH"],
    );
    expect(
      counts.querySelector(
        ".whale-market-trigger .whale-count-box.long strong",
      ),
    ).toHaveTextContent("0");
    expect(
      counts.querySelector(
        ".whale-market-trigger .whale-count-box.short strong",
      ),
    ).toHaveTextContent("1");
  });
  fireEvent.click(
    within(counts).getByRole("button", { name: /hide other markets/i }),
  );
  expect(within(counts).queryByRole("list")).not.toBeInTheDocument();
});

it("shows unavailable BTC counts when position data could not be loaded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith("/api/wallet-tracking/details")
            ? { updatedAt: 100, account: null, portfolio: null, orders: [] }
            : {
                wallets: [address],
                walletNames: { [address]: "Unknown" },
                enabled: true,
                lastChecked: null,
              },
        ),
      ),
    ),
  );
  renderPage();
  const counts = await screen.findByRole("region", {
    name: "Market positions across tracked wallets",
  });
  await screen.findByText("Position data unavailable.");
  expect(
    counts.querySelector(".whale-market-trigger .whale-count-box.long strong"),
  ).toHaveTextContent("—");
  expect(
    counts.querySelector(".whale-market-trigger .whale-count-box.short strong"),
  ).toHaveTextContent("—");
  fireEvent.click(
    within(counts).getByRole("button", { name: /show other markets/i }),
  );
  expect(
    within(counts).getByText("Position data is temporarily unavailable."),
  ).toBeVisible();
});

it("shows zero BTC counts and allows viewing other markets when there is no BTC position", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith("/api/wallet-tracking/details")
            ? {
                updatedAt: 100,
                account: {
                  accountValue: 1,
                  marginUsed: 1,
                  positionValue: 1,
                  withdrawable: 0,
                  positions: [position("ETH", 1)],
                },
                portfolio: null,
                orders: [],
              }
            : {
                wallets: [address],
                walletNames: { [address]: "Wallet" },
                enabled: true,
                lastChecked: null,
              },
        ),
      ),
    ),
  );
  renderPage();
  const counts = await screen.findByRole("region", {
    name: "Market positions across tracked wallets",
  });
  await waitFor(() =>
    expect(
      counts.querySelector(
        ".whale-market-trigger .whale-count-box.long strong",
      ),
    ).toHaveTextContent("0"),
  );
  expect(
    counts.querySelector(".whale-market-trigger .whale-count-box.short strong"),
  ).toHaveTextContent("0");
  fireEvent.click(
    within(counts).getByRole("button", { name: /show other markets/i }),
  );
  expect(within(counts).getByText("ETH")).toBeVisible();
});

it("sorts wallets by total position value and abbreviates large amounts", async () => {
  const other = `0x${"b".repeat(40)}`;
  const unavailable = `0x${"c".repeat(40)}`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (!url.startsWith("/api/wallet-tracking/details"))
        return Promise.resolve(
          Response.json({
            wallets: [address, other, unavailable],
            walletNames: {
              [address]: "First",
              [other]: "Second",
              [unavailable]: "Unavailable",
            },
            walletCapital: {
              [address]: { valueUsd: 50_000_000, asOf: "2026-11-19T08:56:58Z" },
              [other]: { valueUsd: 20_000_000, asOf: "2026-11-19T08:56:58Z" },
            },
            enabled: true,
            lastChecked: null,
          }),
        );
      const wallet = new URL(url, "http://localhost").searchParams.get(
        "address",
      );
      const value = wallet === address ? 100_000_000 : 110_000_000;
      return Promise.resolve(
        Response.json({
          updatedAt: 100,
          account:
            wallet === unavailable
              ? null
              : {
                  accountValue: 1_234_567,
                  marginUsed: 1200,
                  positionValue: value,
                  withdrawable: 0,
                  positions: [position("BTC", value)],
                },
          portfolio: { dayPnl: -11_560, allTimePnl: 0 },
          orders: [],
        }),
      );
    }),
  );
  renderPage();
  await waitFor(() => {
    const cards = screen.getAllByRole("article");
    expect(
      cards.map(
        (card) => within(card).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual(["Second", "First", "Unavailable"]);
    expect(within(cards[0]).getAllByText("$110M")[0]).toHaveAttribute(
      "title",
      "$110,000,000",
    );
    expect(within(cards[0]).getByText("-$11.56K")).toBeInTheDocument();
    expect(within(cards[0]).getByText("$1.23M")).toBeInTheDocument();
  });
  const overview = screen.getByRole("region", { name: "Wallet overview" });
  expect(
    within(overview).getAllByText("Partial · 2/3 wallets").length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText("Whale")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Whales" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search wallets or coins" }),
    { target: { value: "first" } },
  );
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "First" })).toBeVisible();
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search wallets or coins" }),
    { target: { value: "" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "High leverage (20×+)" }));
  expect(
    screen.getByText("No wallets match your search or filter."),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const rows = within(
    screen.getByRole("list", { name: "Wallet list" }),
  ).getAllByRole("listitem");
  expect(
    rows.map(
      (row) => row.querySelector(".whale-list-name strong")?.textContent,
    ),
  ).toEqual(["Second", "First", "Unavailable"]);
  expect(within(rows[0]).getAllByText("$110M")[0]).toBeVisible();
  fireEvent.click(within(rows[0]).getByText("Details"));
  expect(within(rows[0]).getByText("BTC")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cards" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
});

it("labels wallets by capital snapshot rather than position value", async () => {
  const other = `0x${"b".repeat(40)}`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (!url.startsWith("/api/wallet-tracking/details"))
        return Promise.resolve(
          Response.json({
            wallets: [address, other],
            walletNames: {
              [address]: "At threshold",
              [other]: "Above threshold",
            },
            walletCapital: {
              [address]: { valueUsd: 99_999_999, asOf: "2026-11-19T08:56:58Z" },
              [other]: { valueUsd: 100_000_000, asOf: "2026-11-19T08:56:58Z" },
            },
            enabled: true,
            lastChecked: null,
          }),
        );
      const wallet = new URL(url, "http://localhost").searchParams.get(
        "address",
      );
      const value = wallet === address ? 50_000_000 : 50_000_001;
      return Promise.resolve(
        Response.json({
          updatedAt: 100,
          account: {
            accountValue: 1,
            marginUsed: 1,
            positionValue: value,
            withdrawable: 0,
            positions: [position("BTC", value)],
          },
          portfolio: null,
          orders: [],
        }),
      );
    }),
  );
  renderPage();
  const above = await screen.findByRole("heading", { name: "Above threshold" });
  await waitFor(() =>
    expect(
      within(above.closest("article")!).getByText("Leviathan"),
    ).toBeVisible(),
  );
  const at = screen.getByRole("heading", { name: "At threshold" });
  expect(within(at.closest("article")!).getByText("Whale")).toBeVisible();
});

it.each([
  [99_999, null],
  [100_000, "Minnow"],
  [1_000_000, "Shark"],
  [10_000_000, "Whale"],
  [100_000_000, "Leviathan"],
  [1_000_000_000, "Leviathan"],
  [1_000_000_001, null],
  [null, null],
])("classifies reported capital %s as %s", (value, expected) => {
  expect(capitalCategory(value)).toBe(expected);
});

it("loads a large collection in pages and clearly scopes the overview", async () => {
  const addresses = Array.from(
    { length: 101 },
    (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`,
  );
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (!url.startsWith("/api/wallet-tracking/details"))
      return Promise.resolve(
        Response.json({
          wallets: addresses,
          walletNames: Object.fromEntries(
            addresses.map((wallet, index) => [wallet, `Wallet ${index + 1}`]),
          ),
          walletCapital: {},
        }),
      );
    const wallet = new URL(url, "http://localhost").searchParams.get("address");
    return Promise.resolve(
      Response.json({
        updatedAt: 100,
        account: {
          accountValue: 1,
          marginUsed: 1,
          positionValue: 1,
          withdrawable: 0,
          positions: wallet === addresses[100] ? [position("BTC", 1)] : [],
        },
        portfolio: null,
        orders: [],
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  renderPage();
  expect(await screen.findByText(/Wallets 1–100 of 101/)).toBeVisible();
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).includes(addresses[100])),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    await screen.findByRole("heading", { name: "Wallet 101" }),
  ).toBeVisible();
  expect(screen.getByText(/Wallets 101–101 of 101/)).toBeVisible();
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).includes(addresses[100])),
  ).toBe(true);
});

it("hides wallets with no open positions but keeps unavailable wallets visible", async () => {
  const inactive = `0x${"b".repeat(40)}`;
  const unknown = `0x${"c".repeat(40)}`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (!url.startsWith("/api/wallet-tracking/details"))
        return Promise.resolve(
          Response.json({
            wallets: [address, inactive, unknown],
            walletNames: {
              [address]: "Active",
              [inactive]: "Inactive",
              [unknown]: "Unknown",
            },
            enabled: true,
            lastChecked: null,
          }),
        );
      const wallet = new URL(url, "http://localhost").searchParams.get(
        "address",
      );
      return Promise.resolve(
        Response.json({
          updatedAt: 100,
          account:
            wallet === unknown
              ? null
              : {
                  accountValue: 1,
                  marginUsed: 1,
                  positionValue: 1,
                  withdrawable: 0,
                  positions: wallet === inactive ? [] : [position("BTC", 1)],
                },
          portfolio: null,
          orders: null,
        }),
      );
    }),
  );
  renderPage();
  await screen.findByText("Position data unavailable.");
  await waitFor(() =>
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(screen.getByText("Unknown")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  expect(screen.getAllByText("Active")[0]).toBeVisible();
  expect(screen.getAllByText("Unknown")[0]).toBeVisible();
});

it("keeps larger positions visible and allows expanding the rest", async () => {
  const makePosition = (coin: string, positionValue: number) => ({
    coin,
    size: 1,
    entryPrice: 1,
    positionValue,
    unrealizedPnl: 1,
    returnOnEquity: 0,
    liquidationPrice: null,
    marginUsed: 1,
    leverage: 1,
    marginMode: "cross",
    fundingSinceOpen: 0,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith("/api/wallet-tracking/details")
            ? {
                updatedAt: 100,
                account: {
                  accountValue: 1000,
                  marginUsed: 3,
                  positionValue: 600,
                  withdrawable: 0,
                  positions: [
                    makePosition("SOL", 100),
                    makePosition("BTC", 300),
                    makePosition("ETH", 200),
                  ],
                },
                portfolio: null,
                orders: [],
              }
            : {
                wallets: [address],
                walletNames: { [address]: "Sub18" },
                enabled: true,
                lastChecked: null,
              },
        ),
      ),
    ),
  );
  renderPage();
  const expand = await screen.findByText("Show 2 more positions");
  const hidden = expand.closest("details");
  expect(hidden).not.toHaveAttribute("open");
  const card = screen.getByRole("article");
  expect(
    within(card).getByText("BTC").closest(".whale-more-positions"),
  ).toBeNull();
  expect(within(hidden as HTMLElement).getByText("ETH")).not.toBeVisible();
  fireEvent.click(expand);
  expect(hidden).toHaveAttribute("open");
  expect(within(hidden as HTMLElement).getByText("ETH")).toBeVisible();
  expect(within(hidden as HTMLElement).getByText("SOL")).toBeVisible();
});
