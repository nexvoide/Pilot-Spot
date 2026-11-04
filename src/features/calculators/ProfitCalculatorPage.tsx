import { useMemo, useState } from 'react';
import { calculateProfit } from '@/lib/calculations/calculators';
import { CalculatorLayout } from '@/features/calculators/CalculatorLayout';

interface ProfitForm {
  buyPrice: string;
  feePercent: string;
  investment: string;
  sellPrice: string;
}

const initialForm: ProfitForm = { buyPrice: '', feePercent: '0.1', investment: '', sellPrice: '' };

export function ProfitCalculatorPage() {
  const [form, setForm] = useState(initialForm);
  const result = useMemo(() => {
    try {
      return calculateProfit({
        buyPrice: form.buyPrice,
        feePercent: form.feePercent,
        investment: form.investment,
        sellPrice: form.sellPrice,
      });
    } catch {
      return null;
    }
  }, [form]);

  function updateForm(field: keyof ProfitForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <CalculatorLayout
      description="Estimate your potential result between a buy price and a sell price."
      title="Buy and sell profit calculator"
    >
      <div className="calculator-card">
        <div className="calculator-form-grid">
          <NumberField
            label="Investment (USDT)"
            value={form.investment}
            onChange={(value) => updateForm('investment', value)}
          />
          <NumberField
            label="Buy price (USDT)"
            value={form.buyPrice}
            onChange={(value) => updateForm('buyPrice', value)}
          />
          <NumberField
            label="Sell price (USDT)"
            value={form.sellPrice}
            onChange={(value) => updateForm('sellPrice', value)}
          />
          <NumberField
            label="Fee per side (%)"
            value={form.feePercent}
            onChange={(value) => updateForm('feePercent', value)}
          />
        </div>
        <output className="calculator-result">
          <span>Estimated net result</span>
          <strong
            className={
              result !== null && result.netProfit < 0 ? 'negative-value' : 'positive-value'
            }
          >
            {result === null ? 'Add valid values.' : formatUsdt(result.netProfit)}
          </strong>
          {result && (
            <small>Includes {formatUsdt(result.totalFees)} in estimated buy and sell fees.</small>
          )}
        </output>
      </div>
    </CalculatorLayout>
  );
}

function NumberField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        min="0"
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </label>
  );
}

function formatUsdt(value: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} USDT`;
}
