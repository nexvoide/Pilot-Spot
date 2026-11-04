import { useMemo, useState } from 'react';
import { calculateAverageBuy } from '@/lib/calculations/calculators';
import { CalculatorLayout } from '@/features/calculators/CalculatorLayout';
import Decimal from '@/lib/calculations/financial-decimal';

interface BuyRow {
  amount: string;
  id: number;
  price: string;
}

interface ExistingPosition {
  averagePrice: string;
  quantity: string;
}

const INITIAL_ROWS: BuyRow[] = [{ amount: '', id: 1, price: '' }];
const INITIAL_POSITION: ExistingPosition = { averagePrice: '', quantity: '' };

export function AverageBuyCalculatorPage() {
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [existingPosition, setExistingPosition] = useState(INITIAL_POSITION);
  const completedBuyCount = rows.filter((row) => row.amount.trim() && row.price.trim()).length;
  const hasExistingPosition = Boolean(
    existingPosition.quantity.trim() && existingPosition.averagePrice.trim(),
  );
  const result = useMemo(() => {
    const completeRows = rows.filter((row) => row.amount.trim() && row.price.trim());

    if (completeRows.length === 0 && !hasExistingPosition) {
      return null;
    }

    try {
      const existingQuantity = new Decimal(existingPosition.quantity || 0);
      const existingAveragePrice = existingPosition.averagePrice;
      const existingBuy = hasExistingPosition
        ? [
            {
              amount: existingQuantity.mul(existingAveragePrice).toString(),
              price: existingAveragePrice,
            },
          ]
        : [];

      return calculateAverageBuy([
        ...existingBuy,
        ...completeRows.map((row) => ({ amount: row.amount, price: row.price })),
      ]);
    } catch {
      return null;
    }
  }, [existingPosition, hasExistingPosition, rows]);

  function updateRow(id: number, field: 'amount' | 'price', value: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function updateExistingPosition(field: keyof ExistingPosition, value: string) {
    setExistingPosition((current) => ({ ...current, [field]: value }));
  }

  return (
    <CalculatorLayout
      compact
      description="Start with your current position, then add planned buys to see your updated average entry."
      title="Average buy calculator"
    >
      <div className="calculator-card average-buy-card">
        <header className="average-buy-card-header">
          <div>
            <p className="average-buy-card-kicker">Manual entries</p>
            <h1 id="average-buy-calculator-title">Average buy calculator</h1>
            <p className="average-buy-card-description">
              Calculate your position's weighted average cost basis and planned purchases.
            </p>
          </div>
          <span className="average-buy-count">
            {completedBuyCount + Number(hasExistingPosition)} valid entries
          </span>
        </header>
        <section className="existing-position" aria-labelledby="existing-position-title">
          <div className="existing-position-heading">
            <div>
              <p>Current position</p>
              <h3 id="existing-position-title">Coins you already own</h3>
            </div>
            <span>Optional</span>
          </div>
          <div className="existing-position-fields">
            <label className="calculator-field calculator-field-unit">
              <span>Coin quantity</span>
              <div>
                <input
                  aria-label="Current coin quantity"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => updateExistingPosition('quantity', event.target.value)}
                  placeholder="0.00"
                  type="number"
                  value={existingPosition.quantity}
                />
                <i>Coin</i>
              </div>
            </label>
            <label className="calculator-field calculator-field-unit">
              <span>Current average cost (USDT)</span>
              <div>
                <input
                  aria-label="Current average cost"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => updateExistingPosition('averagePrice', event.target.value)}
                  placeholder="0.00"
                  type="number"
                  value={existingPosition.averagePrice}
                />
                <i>USDT</i>
              </div>
            </label>
          </div>
        </section>
        <div className="planned-buys-heading">
          <div>
            <p>New purchase</p>
            <h3>Planned buys</h3>
          </div>
          <span>Enter USDT and price</span>
        </div>
        <div className="calculator-grid-head average-buy-grid-head" aria-hidden="true">
          <span>Buy</span>
          <span>Amount (USDT)</span>
          <span>Coin price (USDT)</span>
        </div>
        {rows.map((row, index) => (
          <div className="calculator-input-row average-buy-input-row" key={row.id}>
            <span className="average-buy-row-number">{index + 1}</span>
            <div className="average-buy-row-field">
              <input
                aria-label={`Buy amount ${row.id}`}
                inputMode="decimal"
                min="0"
                onChange={(event) => updateRow(row.id, 'amount', event.target.value)}
                placeholder="Amount"
                type="number"
                value={row.amount}
              />
              <i>USDT</i>
            </div>
            <div className="average-buy-row-field">
              <input
                aria-label={`Buy price ${row.id}`}
                inputMode="decimal"
                min="0"
                onChange={(event) => updateRow(row.id, 'price', event.target.value)}
                placeholder="Coin price"
                type="number"
                value={row.price}
              />
              <i>USDT</i>
            </div>
          </div>
        ))}
        <button
          className="secondary-button"
          onClick={() =>
            setRows((current) => [...current, { amount: '', id: Date.now(), price: '' }])
          }
          type="button"
        >
          + Add another buy
        </button>
        <CalculatorResult result={result} />
      </div>
    </CalculatorLayout>
  );
}

function CalculatorResult({ result }: { result: ReturnType<typeof calculateAverageBuy> | null }) {
  return (
    <output className="calculator-result average-buy-result">
      <div>
        <span>Weighted average entry</span>
        <strong>
          {result === null ? 'Add valid buys to calculate.' : formatUsdt(result.averagePrice)}
        </strong>
      </div>
      {result !== null && (
        <div className="average-buy-result-details">
          <span>
            <small>Total invested</small>
            <b>{formatUsdt(result.totalAmount)}</b>
          </span>
          <span>
            <small>Estimated quantity</small>
            <b>{formatQuantity(result.totalQuantity)}</b>
          </span>
        </div>
      )}
    </output>
  );
}

function formatUsdt(value: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value)} USDT`;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value);
}
