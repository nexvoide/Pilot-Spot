import { useEffect, useState } from 'react';
import {
  subscribeToTicker,
  type LiveConnectionStatus,
  type LiveTicker,
} from '@/lib/binance/websocket';

const STALE_AFTER_MS = 30_000;

export function useLiveTicker(symbol: string | null, onTicker: (ticker: LiveTicker) => void) {
  const [status, setStatus] = useState<LiveConnectionStatus>('disconnected');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (symbol === null) {
      setStatus('disconnected');
      setLastUpdatedAt(null);
      return;
    }

    const subscription = subscribeToTicker({
      onStatus: setStatus,
      onTicker: (ticker) => {
        setLastUpdatedAt(ticker.receivedAt);
        setStatus('live');
        onTicker(ticker);
      },
      symbol,
    });

    const staleTimer = setInterval(() => {
      setLastUpdatedAt((lastUpdated) => {
        if (lastUpdated !== null && Date.now() - lastUpdated > STALE_AFTER_MS) {
          setStatus('stale');
        }
        return lastUpdated;
      });
    }, 5_000);

    return () => {
      clearInterval(staleTimer);
      subscription.close();
    };
  }, [onTicker, symbol]);

  return { lastUpdatedAt, status };
}
