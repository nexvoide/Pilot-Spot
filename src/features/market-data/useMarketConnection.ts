import { useQuery } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';

type MarketConnectionStatus = 'checking' | 'connected' | 'degraded' | 'unavailable';

interface ProviderHealthPayload {
  status?: unknown;
  timestamp?: unknown;
}

async function fetchMarketConnection(): Promise<MarketConnectionStatus> {
  const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Market-data health check failed.');
  }

  const payload = (await response.json()) as ProviderHealthPayload;
  if (payload.status === 'healthy') {
    return 'connected';
  }
  if (payload.status === 'degraded') {
    return 'degraded';
  }
  throw new Error('Market-data health check returned an invalid status.');
}

export function useMarketConnection(): MarketConnectionStatus {
  const { online } = useOnlineStatus();
  const query = useQuery({
    queryFn: fetchMarketConnection,
    queryKey: ['market-data', 'health'],
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 15_000,
  });

  if (!online) {
    return 'unavailable';
  }
  if (query.isLoading) {
    return 'checking';
  }
  if (query.isError) {
    return 'unavailable';
  }
  return query.data ?? 'unavailable';
}
