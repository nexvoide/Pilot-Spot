import { createContext, useContext } from 'react';
import type { LadderMode, LegacyMode } from '@/lib/calculations/ladders';

export interface CapitalSettingsContextValue {
  globalCapital: string | null;
  method: 'zones' | 'classic';
  classicMode: LegacyMode;
  setMethod: (method: 'zones' | 'classic') => void;
  setClassicMode: (mode: LegacyMode) => void;
  ladderMode: LadderMode;
  setLadderMode: (mode: LadderMode) => void;
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
