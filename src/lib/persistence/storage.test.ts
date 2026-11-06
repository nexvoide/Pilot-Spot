import { describe, expect, it, vi } from 'vitest';
import { readJson, writeJson, type StorageAdapter } from '@/lib/persistence/storage';
import { applicationPreferencesSchema } from '@/lib/persistence/schemas';

function createStorage(): StorageAdapter {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('storage helpers', () => {
  it('retains exact new capital strings and accepts legacy numeric settings', () => {
    expect(
      applicationPreferencesSchema.parse({ version: 1, globalCapital: '9007199254740993.25' })
        .globalCapital,
    ).toBe('9007199254740993.25');
    expect(
      applicationPreferencesSchema.parse({ version: 1, globalCapital: 1000 }).globalCapital,
    ).toBe('1000');
  });
  it('preserves capital when reading old or invalid mode settings', () => {
    expect(applicationPreferencesSchema.parse({ version: 1, globalCapital: '1000' })).toMatchObject({ globalCapital: '1000', method: 'zones', ladderMode: '15m', classicMode: 'balanced' });
    expect(applicationPreferencesSchema.parse({ version: 1, globalCapital: '1000', ladderMode: 'unknown' })).toMatchObject({ globalCapital: '1000', ladderMode: '15m' });
    expect(applicationPreferencesSchema.parse({ version: 1, globalCapital: '1000', ladderMode: 'extended' })).toMatchObject({ method: 'classic', classicMode: 'extended', ladderMode: '15m' });
  });
  it('round-trips JSON through a storage adapter', () => {
    const storage = createStorage();

    expect(writeJson(storage, 'preferences', { globalCapital: 500 })).toBe(true);
    expect(readJson(storage, 'preferences')).toEqual({ globalCapital: 500 });
  });

  it('handles invalid JSON and unavailable storage safely', () => {
    const storage = createStorage();
    storage.setItem('invalid', '{');

    expect(readJson(storage, 'invalid')).toBeNull();
    expect(writeJson(null, 'preferences', {})).toBe(false);
  });

  it('handles storage write failures safely', () => {
    const storage: StorageAdapter = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error('Quota exceeded');
      }),
    };

    expect(writeJson(storage, 'preferences', {})).toBe(false);
  });
});
