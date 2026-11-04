import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCapitalSettings } from '@/features/capital-settings/context';
import Decimal from '@/lib/calculations/financial-decimal';

export function SettingsPage() {
  const { globalCapital, setGlobalCapital } = useCapitalSettings();
  const [value, setValue] = useState(globalCapital?.toString() ?? '');
  const [message, setMessage] = useState<string | null>(null);

  function saveCapital() {
    if (!/^\d{1,60}(?:\.\d{1,8})?$/.test(value) || new Decimal(value).lte(0)) {
      setMessage('Enter a capital amount greater than zero.');
      return;
    }

    setGlobalCapital(new Decimal(value).toFixed());
    setMessage('Global capital saved on this device.');
  }

  return (
    <section className="calculator-page" aria-labelledby="settings-title">
      <Link className="back-link" to="/">
        ← Back to analysis
      </Link>
      <p className="eyebrow">Settings</p>
      <h1 id="settings-title">Global trading capital</h1>
      <p className="calculator-intro">
        This amount is reused when you switch pairs. It stays only in this browser.
      </p>
      <div className="calculator-card settings-card">
        <label className="calculator-field" htmlFor="global-capital">
          <span>Capital available (USDT)</span>
          <input
            id="global-capital"
            inputMode="decimal"
            min="0"
            onChange={(event) => {
              setMessage(null);
              setValue(event.target.value);
            }}
            type="number"
            value={value}
          />
        </label>
        <button className="primary-action" onClick={saveCapital} type="button">
          Save capital
        </button>
        {message && (
          <p className="field-help" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
