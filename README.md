# Spot Ladder Analyzer

Beginner-friendly Binance Spot market analysis. The app uses public Binance data to assess market conditions and may present technically justified buying and take-profit levels. It does not connect wallets, place orders, access private account data, track portfolios, or provide financial advice.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Environment variables

| Variable                            | Purpose                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `BINANCE_PRIMARY_BASE_URL`          | Server-only primary Binance REST endpoint. Defaults to `https://api.binance.com`.                |
| `BINANCE_FALLBACK_BASE_URL`         | Server-only fallback public market-data endpoint. Defaults to `https://data-api.binance.vision`. |
| `MARKET_DATA_REQUEST_TIMEOUT_MS`    | Upstream request timeout. Defaults to `10000`.                                                   |
| `MARKET_DATA_METADATA_CACHE_TTL_MS` | Eligible-pair metadata cache duration. Defaults to `900000`.                                     |
| `MARKET_DATA_CANDLE_CACHE_TTL_MS`   | Candle cache duration. Defaults to `15000`.                                                      |
| `PORT`                              | Production API and static-server port. Defaults to `8787`.                                       |
| `VITE_BINANCE_WEBSOCKET_BASE_URL`   | Public Binance WebSocket base URL.                                                               |

Never add API keys, secrets, wallet credentials, or private Binance endpoints. The product uses public market data only. Server-only variables must never use the `VITE_` prefix.

## Market-data API architecture

The browser calls only the internal endpoints below. The Node server validates upstream responses, applies a ten-second timeout, retries retryable failures once per provider, falls back from Binance primary to the public data endpoint, and returns a request ID with every response.

Live ticker updates connect directly from the browser to Binance's public WebSocket. Binance REST endpoints also responded to a direct browser check during development, but the serverless REST layer remains in place because browser REST access has previously failed and the app relies on its validated symbol filters, cached pair discovery, and provider fallback. No persistent server or database is required on Vercel.

- `GET /api/health`
- `GET /api/pairs?query=BTC&limit=20`
- `GET /api/exchange-info?query=BTC&limit=20`
- `GET /api/ticker/price?symbol=BTCUSDT`
- `GET /api/ticker-24hr?symbol=BTCUSDT`
- `GET /api/klines?symbol=BTCUSDT&interval=4h&limit=200`
- `GET /api/market-snapshot?symbol=BTCUSDT&limit=200`

Eligible pair metadata is cached in memory for 15 minutes. Candles are cached in memory for 15 seconds and include cache and fetch timestamps; they are never used as a live-price substitute. Ticker prices are never cached. The server emits structured JSON logs with request IDs, endpoint, status, duration, and failure reason. On Vercel, caches and provider-health history belong to each function instance and may be cleared at any time; they are not shared across users or instances.

## Deploy to Vercel

1. Push this project to a GitHub repository, including `api/[...path].ts`, `server/`, `vercel.json`, and `package-lock.json`. Do not commit `.env.local` or `node_modules`.
2. In Vercel, select **Add New → Project**, connect GitHub, and import the repository. Select the project root if it is in a subdirectory.
3. Keep the detected **Vite** framework and Node.js 22. The included `vercel.json` sets the build command and output directory. No environment variables or Binance API keys are required for the defaults.
4. Select **Deploy**. Vercel serves the PWA from `dist` and runs the existing public market-data API as one serverless function. The function defaults to Frankfurt (`fra1`); Binance availability can vary by region. If requests fail with a geographic restriction, inspect Vercel function logs and choose a region where Binance public Spot data is available.
5. Open the deployed URL, set capital, choose a coin, and confirm that the price, analysis, and connection status load. Test installation and offline shell behavior on the devices you intend to support.

Optional server-only settings are listed above. Set `VITE_BINANCE_WEBSOCKET_BASE_URL` only if you need a different public WebSocket endpoint; it is embedded in the frontend at build time. Vercel's free plan has usage limits, and a high number of function instances can increase Binance requests because the cache is per instance. Vercel does not guarantee uninterrupted upstream access.

### Install on your phone

- **iPhone:** Open the deployed HTTPS URL in Safari, tap Share, then **Add to Home Screen** and **Add**.
- **Android:** Open the deployed HTTPS URL in a supported browser such as Chrome, then use its **Install app** or **Add to Home screen** menu.

Open the app at least once online so its service worker can cache the application shell. Offline, the shell and calculators remain available, but live prices and analysis are hidden until fresh market data is retrieved after reconnection. Phone installation should be verified on the device after deployment; local browser emulation cannot confirm an operating system's install prompt.

### Personal-use cost

The intended recurring infrastructure cost is $0 when personal use stays within Vercel's Hobby limits. Current published limits include 1,000,000 function invocations, 4 CPU-hours, and 360 GB-hours of provisioned memory in the applicable usage window. Limits and accounting can change, and hitting a limit may temporarily pause a feature. Check the current [Vercel Hobby limits](https://vercel.com/docs/plans/hobby) and your Vercel usage dashboard rather than assuming unlimited use.

### Local production server

```bash
npm run build
npm start
```

The local Node server is for running the production build locally. Vite's development proxy is used only for local development; Vercel uses the serverless function instead.

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
