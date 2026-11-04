const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const readUrl = (value: string | undefined, fallback: string): string => {
  const resolvedValue = value?.trim() || fallback;

  try {
    return trimTrailingSlash(new URL(resolvedValue).toString());
  } catch {
    throw new Error(`Invalid application URL configuration: ${resolvedValue}`);
  }
};

export const environment = Object.freeze({
  binanceWebSocketBaseUrl: readUrl(
    import.meta.env.VITE_BINANCE_WEBSOCKET_BASE_URL,
    'wss://stream.binance.com:9443',
  ),
});
