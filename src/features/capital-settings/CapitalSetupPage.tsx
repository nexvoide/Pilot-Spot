import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCapitalSettings } from '@/features/capital-settings/context';
import Decimal from '@/lib/calculations/financial-decimal';

const QUICK_CAPITAL_AMOUNTS = [2_500, 5_000, 10_000, 25_000, 50_000] as const;

function formatCapital(value: number | string): string {
  const [whole, fraction] = new Decimal(value).toFixed().split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

function parseCapital(value: string): string | null {
  const normalized = value.replaceAll(',', '').trim();
  if (!/^\d{1,60}(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = new Decimal(normalized);
  return parsed.isFinite() && parsed.gt(0) ? parsed.toFixed() : null;
}

export function CapitalSetupPage() {
  const { globalCapital, setGlobalCapital } = useCapitalSettings();
  const [value, setValue] = useState(() => (globalCapital ? formatCapital(globalCapital) : ''));
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setValue(globalCapital ? formatCapital(globalCapital) : '');
  }, [globalCapital]);

  function chooseCapital(amount: number) {
    setError(null);
    setValue(formatCapital(amount));
  }

  function submitCapital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseCapital(value);

    if (amount === null) {
      setError('Enter a positive capital amount in USDT.');
      return;
    }

    setGlobalCapital(amount);
    navigate('/coins');
  }

  return (
    <section className="capital-setup" aria-labelledby="capital-setup-title">
      <div className="capital-setup-intro">
        <p className="terminal-kicker">
          <span aria-hidden="true" /> Planning capital
        </p>
        <h1 id="capital-setup-title">Your trading plan, made simple.</h1>
        <p>
          Set your spot capital once. It is reused to calculate hypothetical buying ladders and
          take-profit targets as you explore coins.
        </p>
      </div>

      <form className="capital-setup-card" onSubmit={submitCapital}>
        <div className="capital-setup-card-heading">
          <p className="terminal-kicker">
            <span aria-hidden="true" /> Step 01 / capital setup
          </p>
          <h2>Spot capital sizing</h2>
          <p>Choose the amount you want to use for planning. This does not place any orders.</p>
        </div>

        <label className="terminal-field-label" htmlFor="setup-capital">
          <span>Total planning capital</span>
          <small>Saved privately in this browser</small>
        </label>
        <div className={`capital-input ${error ? 'capital-input-error' : ''}`}>
          <span aria-hidden="true">$</span>
          <input
            id="setup-capital"
            inputMode="decimal"
            onChange={(event) => {
              setError(null);
              setValue(event.target.value.replace(/[^0-9.,]/g, ''));
            }}
            placeholder="10,000"
            type="text"
            value={value}
          />
          <span className="capital-input-unit">USDT</span>
        </div>
        {error && (
          <p className="terminal-error" role="alert">
            {error}
          </p>
        )}

        <div className="capital-quick-options" aria-label="Quick capital amounts">
          {QUICK_CAPITAL_AMOUNTS.map((amount) => (
            <button
              className={parseCapital(value) === String(amount) ? 'is-selected' : ''}
              key={amount}
              onClick={() => chooseCapital(amount)}
              type="button"
            >
              ${formatCapital(amount)}
            </button>
          ))}
        </div>

        <button className="terminal-primary-button capital-confirm-button" type="submit">
          Confirm &amp; continue to dashboard <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}
