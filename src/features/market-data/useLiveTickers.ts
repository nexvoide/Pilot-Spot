import { useEffect, useMemo, useState } from 'react';
import {
  subscribeToTickers,
  type LiveConnectionStatus,
  type LiveTicker,
} from '@/lib/binance/websocket';

export function useLiveTickers(symbols: string[], onTicker: (ticker: LiveTicker) => void) {
  const [status, setStatus] = useState<LiveConnectionStatus>('disconnected');
  const symbolKey = useMemo(
    () =>
      [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))]
        .filter(Boolean)
        .sort()
        .join('|'),
    [symbols],
  );

  useEffect(() => {
    if (!symbolKey) {
      setStatus('disconnected');
      return;
    }

    const subscription = subscribeToTickers({
      onStatus: setStatus,
      onTicker,
      symbols: symbolKey.split('|'),
    });

    return () => subscription.close();
  }, [onTicker, symbolKey]);

  return { status };
}
