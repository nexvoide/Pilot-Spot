export interface StorageAdapter {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const isStorageAdapter = (value: unknown): value is StorageAdapter => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<StorageAdapter>;

  return (
    typeof candidate.getItem === 'function' &&
    typeof candidate.removeItem === 'function' &&
    typeof candidate.setItem === 'function'
  );
};

export const getBrowserStorage = (): StorageAdapter | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storage = window.localStorage;
    const probeKey = '__spot_ladder_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);

    return isStorageAdapter(storage) ? storage : null;
  } catch {
    return null;
  }
};

export function readJson<T>(storage: StorageAdapter | null, key: string): T | null {
  if (storage === null) {
    return null;
  }

  try {
    const value = storage.getItem(key);
    return value === null ? null : (JSON.parse(value) as T);
  } catch {
    return null;
  }
}

export function writeJson(storage: StorageAdapter | null, key: string, value: unknown): boolean {
  if (storage === null) {
    return false;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
