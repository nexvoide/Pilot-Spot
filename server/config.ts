const DEFAULT_PORT = 8787;

function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function readUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  return new URL(candidate).toString().replace(/\/+$/, '');
}

export const serverConfig = Object.freeze({
  candleCacheTtlMs: readBoundedInteger(
    process.env.MARKET_DATA_CANDLE_CACHE_TTL_MS,
    15_000,
    0,
    60_000,
  ),
  fallbackBaseUrl: readUrl(
    process.env.BINANCE_FALLBACK_BASE_URL,
    'https://data-api.binance.vision',
  ),
  host: '127.0.0.1',
  metadataCacheTtlMs: readBoundedInteger(
    process.env.MARKET_DATA_METADATA_CACHE_TTL_MS,
    15 * 60_000,
    60_000,
    24 * 60 * 60_000,
  ),
  port: readBoundedInteger(process.env.PORT, DEFAULT_PORT, 1, 65_535),
  primaryBaseUrl: readUrl(process.env.BINANCE_PRIMARY_BASE_URL, 'https://api.binance.com'),
  requestTimeoutMs: readBoundedInteger(
    process.env.MARKET_DATA_REQUEST_TIMEOUT_MS,
    10_000,
    1_000,
    30_000,
  ),
});
