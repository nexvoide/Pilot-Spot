import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { CryptoNewsPage } from './CryptoNewsPage';

afterEach(() => vi.unstubAllGlobals());

it('shows crypto-related headlines once and excludes unrelated stories', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ articles: [
      { title: 'Bitcoin market update', source: 'News', link: 'https://example.com/bitcoin', pubDate: '2026-01-01T00:00:00Z' },
      { title: 'Local football results', source: 'News', link: 'https://example.com/sports' },
    ] }),
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CryptoNewsPage /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Bitcoin market update')).toBeInTheDocument());
  expect(screen.getAllByText('Bitcoin market update')).toHaveLength(1);
  expect(screen.queryByText('Local football results')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(4);
});
