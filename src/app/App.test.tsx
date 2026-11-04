import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from '@/app/App';
import { AppProviders } from '@/app/providers';

vi.mock('@/features/market-data/hooks', () => ({
  useEligibleSpotPairs: () => ({
    data: [
      { baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', symbol: 'BTCUSDT' },
      { baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING', symbol: 'ETHUSDT' },
    ],
    isError: false,
    isLoading: false,
  }),
  useDefaultMarketTickers: () =>
    Array.from({ length: 13 }, (_, index) => ({
      data: {
        highPrice: 102 + index,
        lowPrice: 98 + index,
        price: 100 + index,
        priceChangePercent: index % 2 === 0 ? 2.5 : -1.5,
        symbol: 'TESTUSDT',
      },
    })),
  useMarketTickers: () => [],
  useMarketSnapshot: () => ({
    data: undefined,
    isError: false,
    isLoading: false,
  }),
}));

vi.mock('@/features/market-data/useMarketConnection', () => ({
  useMarketConnection: () => 'connected',
}));

describe('App', () => {
  it('renders the application foundation', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      screen.getByRole('heading', { name: /explore spot markets with a clear plan/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /spot ladder analyzer home/i })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('button', { name: /open sui analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open xrp analysis/i })).toBeInTheDocument();
    expect(screen.getByText('Market data connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /setup capital/i })).toHaveAttribute(
      'href',
      '/setup-capital',
    );
  });

  it('updates the analysis state after a pair is submitted', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    const searchInput = screen.getByLabelText(/pair symbol or name/i);
    const analyzeButton = screen.getByRole('button', { name: /analyze/i });

    expect(analyzeButton).toBeDisabled();

    fireEvent.change(searchInput, { target: { value: 'btc/usdt' } });
    fireEvent.click(analyzeButton);

    expect(screen.getByRole('heading', { name: /btcusdt is ready/i })).toBeInTheDocument();
  });
});
