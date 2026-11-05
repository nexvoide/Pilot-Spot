import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCapitalSettings } from '@/features/capital-settings/context';
import { useMarketConnection } from '@/features/market-data/useMarketConnection';

const navigationItems = [
  { label: 'Setup capital', shortLabel: 'Capital', to: '/setup-capital' },
  { label: 'Coins dashboard', shortLabel: 'Markets', to: '/coins' },
  { label: 'World Economy Flow', shortLabel: 'World', to: '/world-economy' },
  { label: 'Crypto news', shortLabel: 'News', to: '/news' },
  { label: 'Extra tools', shortLabel: 'Tools', to: '/calculators/average-buy' },
] as const;

function formatCapital(capital: string | null): string {
  if (capital === null) {
    return 'Not set';
  }
  const [whole, fraction] = capital.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

function connectionLabel(status: ReturnType<typeof useMarketConnection>): string {
  if (status === 'connected') {
    return 'Market data connected';
  }
  if (status === 'degraded') {
    return 'Market data degraded';
  }
  if (status === 'checking') {
    return 'Checking market data';
  }
  return 'Market data unavailable';
}

export function AppShell() {
  const { globalCapital } = useCapitalSettings();
  const connection = useMarketConnection();
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <NavLink className="brand" to="/" aria-label="Spot Ladder Analyzer home">
          <img className="brand-mark" src="/spot-ladder-logo.png" alt="" />
          <span>Spot Ladder</span>
        </NavLink>
        <nav aria-label="Primary navigation" className="app-navigation">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) => `app-navigation-link${isActive || (item.to === '/coins' && pathname.startsWith('/analysis')) || (item.to === '/calculators/average-buy' && pathname.startsWith('/calculators/')) ? ' is-active' : ''}`}
              key={item.label}
              to={item.to}
              aria-label={item.label}
            >
              <span className="navigation-label-full">{item.label}</span>
              <span className="navigation-label-short" aria-hidden="true">{item.shortLabel}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-header-metrics">
          <span
            className={`connection-chip connection-chip-${connection}`}
            title={connectionLabel(connection)}
          >
            <i aria-hidden="true" />
            <span>{connectionLabel(connection)}</span>
          </span>
          <NavLink className="capital-chip" to="/setup-capital">
            <span>Capital</span>
            <strong>{globalCapital === null ? formatCapital(globalCapital) : `$${formatCapital(globalCapital)}`}</strong>
            {globalCapital !== null && <em>USDT</em>}
          </NavLink>
        </div>
      </header>
      <main className="app-main" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="app-footer">
        Educational market analysis only. Hypothetical levels are not orders or financial advice.
      </footer>
    </div>
  );
}
