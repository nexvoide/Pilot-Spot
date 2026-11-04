import { expect, test } from '@playwright/test';
import Decimal from 'decimal.js';

test('production UI receives symbol filters and displays tick-aligned plans when live data is available', async ({
  page,
}) => {
  const snapshots = new Map<
    string,
    {
      filters: {
        tickSize: string;
        stepSize: string;
        minQty: string;
        minNotional: string | null;
      } | null;
    }
  >();
  page.on('response', async (response) => {
    if (response.url().includes('/api/market-snapshot?') && response.ok()) {
      const data = await response.json();
      snapshots.set(data.symbol, data);
    }
  });
  await page.goto('/setup-capital');
  await page.getByLabel('Total planning capital').fill('1000');
  await page.getByRole('button', { name: /confirm.*continue/i }).click();
  let initialInvestment = 0;
  for (const symbol of ['SUIUSDT', 'BTCUSDT']) {
    await page.goto(`/analysis/${symbol}`);
    await expect.poll(() => snapshots.get(symbol)?.filters, { timeout: 60_000 }).not.toBeNull();
    await expect(page.getByText(/Hypothetical planning estimates only/)).toBeVisible({
      timeout: 60_000,
    });
    const filters = snapshots.get(symbol)!.filters!;
    const tick = filters.tickSize;
    const prices = await page.locator('.level-price').allTextContents();
    expect(prices).toHaveLength(8);
    for (const price of prices)
      expect(new Decimal(price.replace(/[, ]|USDT/g, '')).mod(tick).isZero()).toBe(true);
    const quantities = await page
      .locator('.level-list li[data-quantity]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-quantity')!));
    expect(quantities).toHaveLength(8);
    quantities.forEach((quantity, index) => {
      const amount = new Decimal(quantity);
      expect(amount.mod(filters.stepSize).isZero()).toBe(true);
      expect(amount.gte(filters.minQty)).toBe(true);
      if (filters.minNotional)
        expect(amount.mul(prices[index].replace(/[, ]|USDT/g, '')).gte(filters.minNotional)).toBe(
          true,
        );
    });
    const bought = quantities
      .slice(0, 4)
      .reduce((sum, quantity) => sum.plus(quantity), new Decimal(0));
    const sold = quantities.slice(4).reduce((sum, quantity) => sum.plus(quantity), new Decimal(0));
    expect(sold.lte(bought)).toBe(true);
    if (bought.gt(sold))
      await expect(page.getByText('Unallocated quantity after rounding')).toBeVisible();
    await expect(page.getByText(/Total planned investment/)).toBeVisible();
    if (symbol === 'SUIUSDT') {
      const text = await page
        .locator('dt', { hasText: 'Total planned investment' })
        .locator('..')
        .locator('dd')
        .textContent();
      initialInvestment = Number(text?.replace(/[^\d.]/g, ''));
      expect(initialInvestment).toBeGreaterThan(0);
    }
  }
  await page.goto('/setup-capital');
  await page.getByLabel('Total planning capital').fill('2000');
  await page.getByRole('button', { name: /confirm.*continue/i }).click();
  await page.goto('/analysis/SUIUSDT');
  const investment = page
    .locator('dt', { hasText: 'Total planned investment' })
    .locator('..')
    .locator('dd');
  await expect(investment).toBeVisible({ timeout: 60_000 });
  const updatedInvestment = Number((await investment.textContent())?.replace(/[^\d.]/g, ''));
  expect(updatedInvestment / initialInvestment).toBeGreaterThan(1.9);
  expect(updatedInvestment / initialInvestment).toBeLessThan(2.1);
});

test('missing filters and failing minimum notional produce a safe state', async ({ page }) => {
  await page.goto('/setup-capital');
  await page.getByLabel('Total planning capital').fill('1000');
  await page.getByRole('button', { name: /confirm.*continue/i }).click();
  let mode: 'missing' | 'min-notional' | 'min-quantity' = 'missing';
  await page.route('**/api/market-snapshot?*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.filters =
      mode === 'missing'
        ? null
        : mode === 'min-notional'
          ? { ...data.filters, minNotional: '999999999999' }
          : { ...data.filters, minQty: '999999999999' };
    await route.fulfill({ response, json: data });
  });
  await page.goto('/analysis/SUIUSDT');
  await expect(page.getByText(/Binance symbol filters are unavailable/).first()).toBeVisible({
    timeout: 60_000,
  });
  mode = 'min-notional';
  await page.reload();
  await expect(
    page.getByText(/Buying plan unavailable: Order value is below the exchange minimum/).first(),
  ).toBeVisible({ timeout: 60_000 });
  mode = 'min-quantity';
  await page.reload();
  await expect(
    page.getByText(/Buying plan unavailable: Quantity is below the exchange minimum/).first(),
  ).toBeVisible({ timeout: 60_000 });
});

test('a disconnected live feed does not present the ladder as current', async ({ page }) => {
  await page.goto('/setup-capital');
  await page.getByLabel('Total planning capital').fill('1000');
  await page.getByRole('button', { name: /confirm.*continue/i }).click();
  await page.routeWebSocket(/stream\.binance\.com/, (socket) => socket.close());
  await page.goto('/analysis/SUIUSDT');
  await expect(
    page.getByText(
      /Live price is unavailable or stale\. The technical ladder is not shown as current/,
    ),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.level-price')).toHaveCount(0);
});

test('a live price crossing triggers a refreshed ladder below the new price', async ({ page }) => {
  await page.goto('/setup-capital');
  await page.getByLabel('Total planning capital').fill('1000');
  await page.getByRole('button', { name: /confirm.*continue/i }).click();
  let socket: import('@playwright/test').WebSocketRoute | undefined;
  let reference: number | undefined;
  const send = (price: number) =>
    socket?.send(JSON.stringify({ e: '24hrTicker', s: 'SUIUSDT', c: String(price) }));
  await page.routeWebSocket(/\/ws\/suiusdt@ticker/, (connection) => {
    socket = connection;
    if (reference !== undefined) send(reference);
  });
  await page.route('**/api/market-snapshot?*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    reference = data.currentPrice;
    await route.fulfill({ response, json: data });
    if (reference !== undefined) send(reference);
  });
  await page.goto('/analysis/SUIUSDT');
  await expect(page.locator('.level-price')).toHaveCount(8, { timeout: 60_000 });
  const initialFirst = new Decimal(
    (await page.locator('.level-price').first().textContent())!.replace(/[, ]|USDT/g, ''),
  );
  const next = initialFirst.mul('0.99');
  send(next.toNumber());
  await expect
    .poll(
      async () => {
        const text = await page
          .locator('.level-price')
          .first()
          .textContent()
          .catch(() => null);
        return text ? new Decimal(text.replace(/[, ]|USDT/g, '')).lt(next) : false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});
