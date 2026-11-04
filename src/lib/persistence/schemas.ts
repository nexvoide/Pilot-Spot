import { z } from 'zod';
import Decimal from '@/lib/calculations/financial-decimal';

export const PERSISTENCE_VERSION = 1;

export const applicationPreferencesSchema = z.object({
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
});

export type ApplicationPreferences = z.infer<typeof applicationPreferencesSchema>;

export const defaultApplicationPreferences: ApplicationPreferences = {
  globalCapital: null,
  version: PERSISTENCE_VERSION,
};
