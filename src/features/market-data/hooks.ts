import { useQueries, useQuery } from '@tanstack/react-query';
import {
  fetchEligibleSpotPairs,
  fetchMarketSnapshot,
  fetchMarketTicker,
} from '@/lib/api/market-data';
import { defaultCoins } from '@/features/dashboard/default-coins';

export const marketDataQueryKeys = {
  eligiblePairs: (query: string) => ['binance', 'eligible-spot-pairs', query] as const,
  snapshot: (symbol: string) => ['binance', 'market-snapshot', symbol] as const,
  ticker: (symbol: string) => ['binance', 'ticker-24hr', symbol] as const,
};

export function useEligibleSpotPairs(query: string) {
  const normalizedQuery = query.trim().toUpperCase();

  return useQuery({
    enabled: normalizedQuery.length >= 2,
    queryFn: () => fetchEligibleSpotPairs(normalizedQuery),
    queryKey: marketDataQueryKeys.eligiblePairs(normalizedQuery),
    staleTime: 60_000,
  });
}

export function useDefaultMarketTickers() {
  return useMarketTickers(
    defaultCoins.map((coin) => `${coin.symbol}USDT`),
    true,
  );
}

export function useMarketTickers(symbols: string[], refresh = false) {
  return useQueries({
    queries: symbols.map((symbol) => ({
      enabled: symbol.length > 0,
      queryFn: () => fetchMarketTicker(symbol),
      queryKey: marketDataQueryKeys.ticker(symbol),
      refetchInterval: refresh ? 300_000 : (false as const),
      staleTime: 15_000,
    })),
  });
}

export function useMarketSnapshot(symbol: string | null) {
  return useQuery({
    enabled: symbol !== null,
    queryFn: () => fetchMarketSnapshot(symbol ?? ''),
    queryKey: marketDataQueryKeys.snapshot(symbol ?? 'none'),
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
