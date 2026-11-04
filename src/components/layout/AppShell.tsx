import { NavLink, Outlet } from 'react-router-dom';
import { useCapitalSettings } from '@/features/capital-settings/context';
import { useMarketConnection } from '@/features/market-data/useMarketConnection';

const navigationItems = [
  { label: 'Setup capital', to: '/setup-capital' },
  { label: 'Coins dashboard', to: '/coins' },
  { label: 'Extra tools', to: '/calculators/average-buy' },
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="brand" to="/" aria-label="Spot Ladder Analyzer home">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          <span>Spot Ladder</span>
        </NavLink>
        <nav aria-label="Primary navigation" className="app-navigation">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) => `app-navigation-link${isActive ? ' is-active' : ''}`}
              key={item.label}
              to={item.to}
            >
              {item.label}
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
            <strong>${formatCapital(globalCapital)}</strong>
            {globalCapital !== null && <em>USDT</em>}
          </NavLink>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        Educational market analysis only. Hypothetical levels are not orders or financial advice.
      </footer>
    </div>
  );
}
