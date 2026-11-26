# Spot Ladder Analyzer

## Local use

Spot Ladder runs locally without an account. The local production server and Vite development server bind to `127.0.0.1`; the local API rejects non-loopback clients, forwarded requests, non-local hostnames and cross-site requests. `HOST` cannot override the production bind address.

Use Node.js 22.13 or later and npm 10 or later:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. Both `npm run dev` and `npm start` load `.env.local` if present. Host environment variables take precedence.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `BINANCE_PRIMARY_BASE_URL`, `BINANCE_FALLBACK_BASE_URL` | Public Binance REST endpoints. |
| `MARKET_DATA_REQUEST_TIMEOUT_MS`, `MARKET_DATA_METADATA_CACHE_TTL_MS`, `MARKET_DATA_CANDLE_CACHE_TTL_MS` | Market-data timeout and cache durations. |
| `PORT` | Node server port, default 8787. |
| `VITE_BINANCE_WEBSOCKET_BASE_URL` | Public client-side Binance WebSocket URL. |
| `FRED_API_KEY` | Server-side FRED API key for daily economy series. |
| `FINNHUB_API_KEY` | Server-side Finnhub API key for stock and ETF quotes and company values. |
| `WALLET_MANAGER_PIN` | Server-only wallet-manager PIN, 4–32 digits; a long, unique PIN is recommended. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Server-only Upstash Redis REST credentials for the shared wallet list. |

## Vercel deployment

The Vercel API exposes public market data and PIN-protected wallet-management operations. Configure `FRED_API_KEY` and `FINNHUB_API_KEY` in the Vercel project environment for the deployment environment, then redeploy. Without these keys, the corresponding economy data is unavailable; Binance and public market-size data do not require them. Provider availability and geographic restrictions can still affect data.

## Market-data API architecture

The browser calls only the internal endpoints below. The Node server validates upstream responses, applies a ten-second timeout, retries retryable failures once per provider, falls back from Binance primary to the public data endpoint, and returns a request ID with every response.

Live ticker updates connect directly from the browser to Binance's public WebSocket. Binance REST endpoints also responded to a direct browser check during development, but the local REST layer remains in place because browser REST access has previously failed and the app relies on its validated symbol filters, cached pair discovery, and provider fallback.

- `GET /api/health`
- `GET /api/pairs?query=BTC&limit=20`
- `GET /api/exchange-info?query=BTC&limit=20`
- `GET /api/ticker/price?symbol=BTCUSDT`
- `GET /api/ticker-24hr?symbol=BTCUSDT`
- `GET /api/klines?symbol=BTCUSDT&interval=4h&limit=200`
- `GET /api/market-snapshot?symbol=BTCUSDT&limit=200`

Eligible pair metadata is cached in memory for 15 minutes. Candles are cached in memory for 15 seconds and include cache and fetch timestamps; they are never used as a live-price substitute. Ticker prices are never cached. The server emits structured JSON logs with request IDs, endpoint, status, duration, and failure reason.

## Local production build

Run `npm run build` followed by `npm start`, then open `http://127.0.0.1:8787`. The Node server supports local access only; use the Vercel entry point for deployment.

## Quality checks

```bash
npm run lint
npm test
npm run test:e2e
npm run build
npm run format:check
```

`npm run test:e2e` builds the application, starts the production Node server, and runs Playwright against it. On macOS it uses the installed Google Chrome application. On other platforms, set `PLAYWRIGHT_CHROME_EXECUTABLE` to a Chromium-compatible browser executable.

## Product safeguards

- The analysis uses completed 15-minute candles, with 1H and 4H context.
- Buying and take-profit levels are hypothetical; estimated projections are identified, and plans are unavailable when data or exchange constraints are insufficient.
- Capital settings are stored locally in the active browser only.
- The PWA caches the application shell; market data remains online-only and displays connection state.

Strategy thresholds and calculation rules are documented in [STRATEGY.md](./STRATEGY.md).

## Wallet tracking

The dashboard initially uses the 12 wallets in [`src/features/wallet-tracking/wallets.ts`](./src/features/wallet-tracking/wallets.ts), including Abraxas Solo and Abraxas Duo. Once configured, **Manage wallets** requires a PIN before adding or deleting wallets. Add up to three suggested or custom tags when adding a wallet, or use **Edit tags** for an existing wallet. Tags appear in card and list views and can be searched. Changes are stored in shared Redis and become visible to other visitors, without editing code. The public tracking list refreshes about every 30 seconds; wallet positions refresh about every minute.

To enable shared wallet management:

1. Create or connect an Upstash Redis database in the [Vercel Marketplace](https://vercel.com/docs/redis), and add its `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the Vercel project's server environment. Do not put either value in client-side variables or source code.
2. Set `WALLET_MANAGER_PIN` to a private 4–32 digit PIN in the Vercel server environment. Use a longer, unique PIN and do not use an example that has been shared publicly.
3. Redeploy the application for the environment variables to take effect. To use the same shared list locally, add the same three variables to the ignored `.env.local` file and restart the local server.

The first shared-storage access initializes the list with the 12 wallets already in the code; later restarts and deployments do not overwrite changes. Use separate databases for environments that should not share a list. Without database configuration, the original read-only list remains available. If a configured database is unavailable, the tracker reports an error instead of replacing the shared list with the original wallets. Without a configured PIN, wallet changes are disabled. PIN attempts are limited, and sessions use an HTTP-only cookie and expire after 30 minutes.

The dashboard retrieves main-market perpetual positions and margin from Hyperliquid's public API. Positions refresh about once a minute while the page is open. Order and P&L history loads when a card becomes visible and is cached for five minutes. Account margin values may not represent unified or spot balances, and other perpetual DEX markets are not included. The market summary counts wallets with open long and short positions. Background alerts are optional and require the setup below.

The on-demand wallet leaderboard compares the wallets on the current page over 7 or 30 days. It counts fully observed main-market perpetual position cycles that closed in the selected period; partial closes are combined and a reversal starts a new cycle. Win rate is wins divided by wins plus losses, based on gross closed trading P&L before fees and funding. Break-even positions are shown separately. Hyperliquid returns at most 2,000 recent fills, so older or incomplete cycles are excluded; multiple fills on the same market and timestamp are skipped when their order cannot be established. The result is a sample, not a complete trading history. Wallets are loaded gradually to reduce exchange rate-limit pressure.

### Optional WhatsApp group alerts

The alert worker uses the shared Redis wallet list and a scheduled QStash request to check selected wallets for new and closed main-market long or short positions. A direction reversal produces a close alert followed by a new position alert. Partial reductions are not reported as closes. Alerts are off by default for every wallet. Select **Alerts off** on a wallet, unlock with the wallet-manager PIN, and turn on its WhatsApp alerts; the switch in **Manage wallets** can also change this setting. The first successful check after enabling establishes a baseline and does not send existing positions. Disabling alerts discards unsent queued alerts for that wallet. These settings are shared by everyone using this deployment and require the worker setup below. It uses [GREEN-API](https://green-api.com/en/docs/about-tariffs/) to enqueue messages for a WhatsApp group. Its free Developer plan supports up to three chats and is intended for testing. GREEN-API is a third-party linked-device service, not Meta's official Business Platform; connecting it gives the provider access to the linked WhatsApp account. Use a separate account if appropriate and keep its access token private.

1. Create a GREEN-API Developer instance and link a WhatsApp account using its QR code. Add that account to the desired WhatsApp group. Obtain the instance API URL, instance ID, token and group chat ID from GREEN-API. The group ID ends in `@g.us`; see its [chat ID documentation](https://green-api.com/en/docs/api/chat-id/).
2. In Vercel's **Production** environment, set `GREEN_API_URL`, `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`, `WHATSAPP_GROUP_ID` and `WALLET_ALERTS_CRON_SECRET`. The cron secret must be a unique random value of at least 32 characters. The existing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are also required. Redeploy after changing environment variables.
3. Create an [Upstash QStash](https://upstash.com/docs/qstash/features/schedules) account on its free plan. In the local `.env.local`, set `QSTASH_TOKEN`, `ALERTS_SITE_URL` to the HTTPS origin of the deployed site, and `WALLET_ALERTS_CRON_SECRET` to the same secret set in Vercel. Set `QSTASH_URL` to the URL for your QStash region; if omitted, the EU region is used. Never commit `.env.local` or share these tokens.
4. From the project directory, run `node --env-file=.env.local scripts/setup-wallet-alerts.mjs`. This creates or updates a five-minute QStash schedule. Manage or delete the schedule in the Upstash dashboard to pause alerts. QStash's free allowance and the Redis free allowance are shared with other usage.

The first successful check establishes a baseline and does not announce positions that are already open. Each check processes up to 20 wallets in rotation; larger lists take more than five minutes to cover. A position opened and closed between checks can be missed. Failed checks and rejected sends are retried; a network failure after a provider accepts a message can cause a duplicate. Provider acceptance only queues a message and does not guarantee delivery.




Wallet tiers use each wallet’s current total open position value on Hyperliquid’s main perpetuals market: Minnow $100K–under $1M, Shark $1M–under $10M, Whale $10M–under $100M, and Leviathan $100M–$1B inclusive. Values outside those ranges and unavailable position data are unclassified. Tiers and filters update with the wallet data; any separately shown capital snapshot remains historical and does not determine the tier.

The shared collection supports up to 10,000 wallets. To limit provider requests and keep the interface responsive as it grows, the dashboard displays at most 100 wallets per page. Totals, market counts, search, filters, and sorting describe the current page. Hyperliquid rate limits and outages may delay or prevent data from loading.
