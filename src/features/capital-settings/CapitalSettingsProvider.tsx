import { type PropsWithChildren, useEffect, useState } from 'react';
import { CapitalSettingsContext } from '@/features/capital-settings/context';
import {
  applicationPreferencesSchema,
  defaultApplicationPreferences,
  type ApplicationPreferences,
} from '@/lib/persistence/schemas';
import { getBrowserStorage, readJson, writeJson } from '@/lib/persistence/storage';
import type { LadderMode } from '@/lib/calculations/ladders';

const PREFERENCES_STORAGE_KEY = 'spot-ladder-analyzer:preferences';

function readPreferences(): ApplicationPreferences {
  const storedValue = readJson<unknown>(getBrowserStorage(), PREFERENCES_STORAGE_KEY);
  const parsed = applicationPreferencesSchema.safeParse(storedValue);

  return parsed.success ? parsed.data : defaultApplicationPreferences;
}

export function CapitalSettingsProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<ApplicationPreferences>(readPreferences);

  useEffect(() => {
    writeJson(getBrowserStorage(), PREFERENCES_STORAGE_KEY, preferences);
  }, [preferences]);

  function setGlobalCapital(globalCapital: string | null) {
    if (globalCapital !== null && !/^\d{1,60}(?:\.\d{1,8})?$/.test(globalCapital)) {
      return;
    }

    setPreferences((current) => ({ ...current, globalCapital }));
  }

  function setLadderMode(ladderMode: LadderMode) {
    setPreferences((current) => ({ ...current, ladderMode }));
  }

  return (
    <CapitalSettingsContext.Provider
      value={{ globalCapital: preferences.globalCapital, ladderMode: preferences.ladderMode, setGlobalCapital, setLadderMode }}
    >
      {children}
    </CapitalSettingsContext.Provider>
  );
}
