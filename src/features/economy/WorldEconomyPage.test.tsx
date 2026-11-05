import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldEconomyPage } from './WorldEconomyPage';

function mount() { return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WorldEconomyPage /></QueryClientProvider>); }
afterEach(() => vi.restoreAllMocks());
describe('world economy navigator', () => {
  it('opens directly to market strength without the removed flow section', async () => {
    const now = Date.now(), end = now - 1000;
    const candles = Array.from({length:7},(_,i)=>({openTime:end-(6-i)*14_400_000-14_399_999,closeTime:end-(6-i)*14_400_000,close:100+i}));
    vi.spyOn(globalThis,'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/economy-quote')) return new Response(JSON.stringify({price:110,previousClose:100,observedAt:now,fetchedAt:now}));
      if (url.includes('/api/economy-series')) return new Response(JSON.stringify({observations:[{date:'2026-01-05',value:90},{date:'2026-01-02',value:100}],fetchedAt:now}));
      if (url.includes('/api/klines')) return new Response(JSON.stringify({candles,candlesFetchedAt:now}));
      return new Response('',{status:503});
    });
    mount();
    expect(screen.queryByRole('button',{name:'Actual capital flows'})).not.toBeInTheDocument();
    const bubbles=screen.getByLabelText('Market bubbles');
    await waitFor(()=>expect(within(bubbles).getByRole('button',{name:/Bonds/})).toHaveTextContent('+10.00%'));
    for(const [name,label] of [['Stocks','S&P 500 index'],['Bonds','BND US bond ETF'],['Forex','EUR / USD reference'],['Commodities','GLD gold ETF'],['Cryptocurrency','BTC / USDT']]) expect(within(bubbles).getByRole('button',{name:new RegExp(name)})).toHaveTextContent(label);
    for (const period of ['7D', '30D', '90D']) {
      fireEvent.click(screen.getByRole('button',{name:period}));
      await waitFor(()=>expect(within(bubbles).queryByRole('button',{name:/Bonds/})).not.toBeInTheDocument());
      expect(within(bubbles).queryByRole('button',{name:/Commodities/})).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button',{name:'24H'}));
    await waitFor(()=>expect(within(bubbles).getByRole('button',{name:/Bonds/})).toHaveTextContent('+10.00%'));
  });
});
