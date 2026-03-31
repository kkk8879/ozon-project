type CacheEnvelope<T> = {
  value: T;
  expiresAt: number;
};

function safeGetStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function getCachedValue<T>(key: string): T | null {
  const storage = safeGetStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (!envelope || typeof envelope.expiresAt !== 'number') {
      storage.removeItem(key);
      return null;
    }

    if (Date.now() > envelope.expiresAt) {
      storage.removeItem(key);
      return null;
    }

    return envelope.value;
  } catch {
    return null;
  }
}

export function setCachedValue<T>(key: string, value: T, ttlMs: number) {
  const storage = safeGetStorage();
  if (!storage) return;

  try {
    const envelope: CacheEnvelope<T> = {
      value,
      expiresAt: Date.now() + Math.max(1, ttlMs),
    };
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // ignore write errors
  }
}
