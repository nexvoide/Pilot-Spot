import { expect, test } from '@playwright/test';

test('market strength supports crypto drilldown and time filters', async ({ page }) => {
  await page.route('**/api/klines?*', async (route) => {
    const symbol = new URL(route.request().url()).searchParams.get('symbol');
    const end = Date.now() - 1000;
    const candles = Array.from({length: 550}, (_, index) => ({ openTime: end - (549 - index) * 14_400_000 - 14_399_999, closeTime: end - (549 - index) * 14_400_000, close: symbol === 'BTCUSDT' ? 100 + index : 1000 - index }));
    await route.fulfill({json: {candles, candlesFetchedAt: end}});
  });
  await page.goto('/world-economy');
  await expect(page.getByRole('button',{name:'Actual capital flows'})).toHaveCount(0);
  const bubbles = page.getByLabel('Market bubbles');
  await expect(bubbles.getByRole('button')).toHaveCount(5);
  await bubbles.getByRole('button', {name: /Cryptocurrency/}).click();
  await expect(bubbles.getByRole('button', {name: /Bitcoin/})).toHaveClass(/positive/);
  await expect(bubbles.getByRole('button', {name: /Ethereum/})).toHaveClass(/negative/);
  await page.getByRole('button', {name: '90D'}).click();
  await expect(page.getByRole('button', {name: '90D'})).toHaveAttribute('aria-pressed', 'true');
});

test('market strength shows five labeled representative price changes', async ({ page }) => {
  const now = Date.now(), end = now - 1000;
  await page.route('**/api/economy-quote?*', (route) => route.fulfill({json:{price:110, previousClose:100, observedAt:now, fetchedAt:now}}));
  await page.route('**/api/economy-series?*', (route) => route.fulfill({json:{observations:[{date:'2026-01-05',value:90},{date:'2026-01-02',value:100}],fetchedAt:now}}));
  await page.route('**/api/klines?*', (route) => route.fulfill({json:{candles:Array.from({length:7},(_,i)=>({openTime:end-(6-i)*14_400_000-14_399_999,closeTime:end-(6-i)*14_400_000,close:100+i})),candlesFetchedAt:now}}));
  await page.goto('/world-economy');
  const bubbles = page.getByLabel('Market bubbles');
  await expect(bubbles.getByRole('button',{name:/Stocks/})).toContainText('S&P 500 index');
  await expect(bubbles.getByRole('button',{name:/Bonds/})).toContainText('BND US bond ETF');
  await expect(bubbles.getByRole('button',{name:/Forex/})).toContainText('EUR / USD reference');
  await expect(bubbles.getByRole('button',{name:/Commodities/})).toContainText('GLD gold ETF');
  await expect(bubbles.getByRole('button',{name:/Cryptocurrency/})).toContainText('BTC / USDT');
  await page.getByRole('button',{name:'7D'}).click();
  await expect(bubbles.getByRole('button',{name:/Bonds/})).toHaveCount(0);
  await expect(bubbles.getByRole('button',{name:/Commodities/})).toHaveCount(0);
  await page.getByRole('button',{name:'24H'}).click();
  await expect(bubbles.getByRole('button',{name:/Bonds/})).toBeVisible();
});
