import { z } from 'zod';
import Decimal from '@/lib/calculations/financial-decimal';

export const PERSISTENCE_VERSION = 1;

export const applicationPreferencesSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && 'ladderMode' in value) {
    const stored = value as Record<string, unknown>;
    if (stored.ladderMode === 'aggressive' || stored.ladderMode === 'balanced' || stored.ladderMode === 'extended') {
      return { ...stored, method: stored.method ?? 'classic', classicMode: stored.classicMode ?? stored.ladderMode, ladderMode: '15m' };
    }
  }
  return value;
}, z.object({
  method: z.enum(['zones', 'classic']).catch('zones').default('zones'),
  classicMode: z.enum(['aggressive', 'balanced', 'extended']).catch('balanced').default('balanced'),
  ladderMode: z.enum(['15m', '4h', '1d']).catch('15m').default('15m'),
  globalCapital: z
    .union([
      z
        .number()
        .finite()
        .nonnegative()
        .transform((value) => new Decimal(value).toFixed()),
      z.string().regex(/^\d{1,60}(?:\.\d{1,8})?$/),
    ])
    .nullable(),
  version: z.literal(PERSISTENCE_VERSION),
  lastSelectedSymbol: z.string().trim().min(1).max(20).optional(),
}));

export type ApplicationPreferences = z.infer<typeof applicationPreferencesSchema>;

export const defaultApplicationPreferences: ApplicationPreferences = {
  globalCapital: null,
  method: 'zones',
  classicMode: 'balanced',
  ladderMode: '15m',
  version: PERSISTENCE_VERSION,
};
