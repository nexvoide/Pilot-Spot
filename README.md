# Spot Ladder Analyzer

## Local use

Spot Ladder runs locally without an account or session. The local production server and Vite development server bind to `127.0.0.1`; the local API rejects non-loopback clients, forwarded requests, non-local hostnames and cross-site requests. `HOST` cannot override the production bind address.

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

## Vercel deployment

The Vercel API is public and read-only. Configure `FRED_API_KEY` and `FINNHUB_API_KEY` in the Vercel project environment for the deployment environment, then redeploy. Without these keys, the corresponding economy data is unavailable; Binance and public market-size data do not require them. Provider availability and geographic restrictions can still affect data.

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

## Whale wallet tracking

The wallet tracker monitors Hyperliquid perpetuals and sends Discord messages when a tracked wallet opens a position from flat or flips to the opposite direction. It does not send alerts for position increases or spot trades. Hyperliquid's public API is free. Checks run every five minutes even when Spot Ladder is closed; alerts are not instant. First fills can represent only part of an order. Provider outages can delay alerts, and exceptionally active wallets with 2,000 or more fills between successful checks may need manual attention. Delivery is best effort and rare duplicate alerts are possible after a storage failure.

This feature runs separately from the existing Vercel deployment, using Cloudflare Workers and Workers KV. Cloudflare's free plan currently includes sufficient requests, scheduled triggers and KV writes for this tracker; account-wide limits still apply. No private keys, trading permissions or paid API are required. The service supports up to 10 wallet addresses.

### One-time setup

1. Create a free Cloudflare account and enable Workers & Pages. Create a Worker with a `workers.dev` address.
2. Replace the Worker's code with the complete contents of [`wallet-worker/index.mjs`](./wallet-worker/index.mjs) and deploy it.
3. In Workers & Pages, create a KV namespace. In the Worker's settings, add a KV namespace binding named `TRACKER` pointing to that namespace.
4. In the Worker's settings, add a secret named `ADMIN_TOKEN` containing a unique random value of at least 32 characters. Keep it private; anyone with this token can change the tracker and its Discord destination. For example, generate one locally with `openssl rand -hex 32`.
5. Add a Cron Trigger with the expression `*/5 * * * *`, then deploy the Worker again if prompted to apply its bindings and trigger.
6. Open **Wallet tracking** in Spot Ladder. Enter the Worker's `https://…workers.dev` URL and the admin token and select **Connect**. Enter and save the Discord channel webhook, add wallet addresses, and select **Start tracking**. Settings are saved in the Worker; the Worker URL and admin token are stored in the browser used to configure it.

The tracker checks fills after a wallet is added while tracking is enabled, or after tracking is started. It does not replay older positions. Use **Send test message** to check the Discord connection. Inspect the Worker logs for errors if alerts do not arrive. Cloudflare KV changes can take time to propagate. Stopping tracking pauses alerts; restarting begins from that time rather than replaying fills while paused. Rotate a compromised admin token in Cloudflare and reconnect the app. Rotate a compromised Discord webhook in Discord and save its replacement in the app.
