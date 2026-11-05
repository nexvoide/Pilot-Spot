import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
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
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
  });
  it('offers capital setup instead of showing loading ladders when capital is not set', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: /open sui analysis/i }));
    expect(screen.getAllByText('Capital needed')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /set planning capital/i })).toHaveLength(2);
    expect(screen.queryByRole('list', { name: /buying levels/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /take-profit targets/i })).not.toBeInTheDocument();
  });
  it('keeps the normal ladders available with stored preferences', () => {
    window.localStorage.setItem('spot-ladder-analyzer:preferences', JSON.stringify({ version: 1, globalCapital: '1000', ladderMode: 'balanced' }));
    render(<AppProviders><App /></AppProviders>);
    fireEvent.click(screen.getByRole('button', { name: /open sui analysis/i }));
    expect(screen.getByRole('heading', { name: /buying ladder/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /take-profit ladder/i })).toBeInTheDocument();
  });
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
