import { createContext, useContext } from 'react';

export interface CapitalSettingsContextValue {
  globalCapital: string | null;
  setGlobalCapital: (capital: string | null) => void;
}

export const CapitalSettingsContext = createContext<CapitalSettingsContextValue | null>(null);

export function useCapitalSettings(): CapitalSettingsContextValue {
  const context = useContext(CapitalSettingsContext);

  if (context === null) {
    throw new Error('useCapitalSettings must be used within CapitalSettingsProvider.');
  }

  return context;
}
