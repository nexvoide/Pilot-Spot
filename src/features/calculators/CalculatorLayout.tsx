import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

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
      <Link className="back-link" to="/">
        ← Back to analysis
      </Link>
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
