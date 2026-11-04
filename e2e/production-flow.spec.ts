import { expect, test } from '@playwright/test';

const symbols = ['BTCUSDT', 'SOLUSDT', 'SUIUSDT'] as const;

function collectBrowserFailures(page: import('@playwright/test').Page): string[] {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    failures.push(`request: ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`);
  });
  return failures;
}

async function selectPair(
  page: import('@playwright/test').Page,
  asset: 'BTC' | 'SOL' | 'SUI',
): Promise<void> {
  await page.getByLabel('Pair symbol or name').fill(asset);
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page).toHaveURL(new RegExp(`/analysis/${asset}USDT$`));
  await expect(page.locator('.analysis-status h2')).not.toContainText(
    `${asset}USDT is ready for analysis.`,
    { timeout: 30_000 },
  );
  await expect(page.getByText(/Latest price:/)).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .locator('.plan-card')
      .filter({ has: page.getByRole('heading', { name: 'Buying ladder' }) })
      .locator('ol li'),
  ).toHaveCount(4);
  await expect(
    page
      .locator('.plan-card')
      .filter({ has: page.getByRole('heading', { name: 'Buying ladder' }) }),
  ).toContainText('BL1');
  await expect(
    page
      .locator('.plan-card')
      .filter({ has: page.getByRole('heading', { name: 'Take-profit ladder' }) })
      .locator('ol li'),
  ).toHaveCount(4);
}

test('production dashboard loads, persists capital, and analyses BTC, SOL, and SUI', async ({
  page,
}, testInfo) => {
  const failures = collectBrowserFailures(page);
  const snapshots = new Map<string, unknown>();

  page.on('response', async (response) => {
    if (!response.url().includes('/api/market-snapshot') || !response.ok()) {
      return;
    }

    const payload = (await response.json()) as {
      candles?: Record<string, unknown[]>;
      symbol?: string;
    };
    if (payload.symbol) {
      snapshots.set(payload.symbol, payload);
    }
  });

  await page.goto('/setup-capital');
  await page.getByLabel('Total planning capital').fill('1000');
  await page.getByRole('button', { name: /confirm.*continue/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Explore spot markets with a clear plan.' }),
  ).toBeVisible();

  for (const symbol of symbols) {
    await page.goto('/coins');
    await selectPair(page, symbol.replace('USDT', '') as 'BTC' | 'SOL' | 'SUI');
    await expect.poll(() => snapshots.has(symbol)).toBeTruthy();
    const snapshot = snapshots.get(symbol) as { candles: Record<string, unknown[]> };
    expect(snapshot.candles['15m']).toHaveLength(200);
    expect(snapshot.candles['1h']).toHaveLength(200);
    expect(snapshot.candles['4h']).toHaveLength(200);
  }

  await page.screenshot({
    path: testInfo.outputPath('dashboard-sui-analysis.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole('link', { name: /capital.*\$1,000/i })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard-success.png'), fullPage: true });
  expect(failures).toEqual([]);
});

test('calculators work independently and reject incomplete input', async ({ page }) => {
  const failures = collectBrowserFailures(page);

  await page.goto('/calculators/average-buy');
  await page.getByLabel('Buy amount 1').fill('100');
  await page.getByLabel('Buy price 1').fill('10');
  await page.getByRole('button', { name: /add another buy/i }).click();
  await page
    .getByLabel(/Buy amount/)
    .nth(1)
    .fill('100');
  await page
    .getByLabel(/Buy price/)
    .nth(1)
    .fill('20');
  await expect(page.locator('output')).toContainText('13.33333333 USDT');

  await page.goto('/calculators/profit');
  await page.getByLabel('Investment (USDT)').fill('100');
  await page.getByLabel('Buy price (USDT)').fill('10');
  await page.getByLabel('Sell price (USDT)').fill('12');
  await expect(page.locator('output')).toContainText('19.78 USDT');
  await page.getByLabel('Investment (USDT)').fill('-1');
  await expect(page.locator('output')).toContainText('Add valid values.');
  expect(failures).toEqual([]);
});

test('desktop, tablet, and mobile layouts avoid horizontal overflow', async ({ page }) => {
  const failures = collectBrowserFailures(page);

  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 1024, width: 768 },
    { height: 844, width: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Explore spot markets with a clear plan.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }

  expect(failures).toEqual([]);
});

test('communicates invalid symbols, unavailable API responses, and slow snapshots clearly', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByLabel('Pair symbol or name').fill('X');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(
    page.getByText('Select an eligible Binance Spot pair from the results.'),
  ).toBeVisible();

  await page.reload();
  await page.route('**/api/market-snapshot?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.continue();
  });
  await page.getByLabel('Pair symbol or name').fill('BTC');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Retrieving the latest price and market candles…')).toBeVisible();
  await expect(page.getByText(/Latest price:/)).toBeVisible();

  await page.unroute('**/api/market-snapshot?*');
  await page.route('**/api/market-snapshot?*', (route) => route.abort('failed'));
  await page.goto('/coins');
  await page.getByLabel('Pair symbol or name').fill('SOL');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText(/Current market data could not be retrieved:/)).toBeVisible();
});
