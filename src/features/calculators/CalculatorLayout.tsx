import type { PropsWithChildren } from 'react';
import { Link, NavLink } from 'react-router-dom';

interface CalculatorLayoutProps extends PropsWithChildren {
  compact?: boolean;
  description: string;
  title: string;
}

export function CalculatorLayout({
  children,
  compact = false,
  description,
  title,
}: CalculatorLayoutProps) {
  return (
    <section
      aria-labelledby={compact ? undefined : 'calculator-page-title'}
      className={`calculator-page${compact ? ' calculator-page-compact' : ''}`}
    >
      <Link className="back-link" to="/coins">
        ← Back to markets
      </Link>
      <nav className="calculator-tabs" aria-label="Calculators">
        <NavLink to="/calculators/average-buy" className={({ isActive }) => `calculator-tab${isActive ? ' is-active' : ''}`}>
          Average buy
        </NavLink>
        <NavLink to="/calculators/profit" className={({ isActive }) => `calculator-tab${isActive ? ' is-active' : ''}`}>
          Profit estimate
        </NavLink>
      </nav>
      {!compact && (
        <>
          <p className="eyebrow">Independent calculator</p>
          <h1 id="calculator-page-title">{title}</h1>
          <p className="calculator-intro">{description}</p>
        </>
      )}
      {children}
    </section>
  );
}
