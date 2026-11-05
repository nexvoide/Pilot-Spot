import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AverageBuyCalculatorPage } from '@/features/calculators/AverageBuyCalculatorPage';
import { ProfitCalculatorPage } from '@/features/calculators/ProfitCalculatorPage';
import { CapitalSetupPage } from '@/features/capital-settings/CapitalSetupPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { NotFoundPage } from '@/features/foundation/NotFoundPage';
import { WorldEconomyPage } from '@/features/economy/WorldEconomyPage';
import { CryptoNewsPage } from '@/features/news/CryptoNewsPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="setup-capital" element={<CapitalSetupPage />} />
          <Route path="coins" element={<DashboardPage />} />
          <Route path="world-economy" element={<WorldEconomyPage />} />
          <Route path="news" element={<CryptoNewsPage />} />
          <Route path="analysis" element={<DashboardPage />} />
          <Route path="analysis/:symbol" element={<DashboardPage />} />
          <Route path="calculators/average-buy" element={<AverageBuyCalculatorPage />} />
          <Route path="calculators/profit" element={<ProfitCalculatorPage />} />
          <Route path="settings" element={<CapitalSetupPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
