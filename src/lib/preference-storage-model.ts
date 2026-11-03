type Storage = {
  legacyRead: (key: string) => Promise<string | null>;
  legacyWrite: (key: string, value: string) => Promise<unknown>;
  nativeRead?: (key: string, legacy: string | null) => Promise<string | null>;
  nativeWrite?: (key: string, value: string) => Promise<unknown>;
};
/** Serializes a key's reads/writes so migration cannot overwrite a newer preference. */
export function createPreferenceStorage(storage: Storage) {
  const pending = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    pending.set(key, result);
    void result.finally(() => { if (pending.get(key) === result) pending.delete(key); }).catch(() => undefined);
    return result;
  }
  return {
    getItem: (key: string) => serial(key, async () => {
      const journal = await storage.legacyRead(`${key}.sqlite-pending`).catch(() => null);
      if (journal) {
        try {
          const value: unknown = JSON.parse(journal);
          if (typeof value === "string") {
            if (storage.nativeWrite) {
              try {
                await storage.nativeWrite(key, value);
                await storage.legacyWrite(key, value);
                await storage.legacyWrite(`${key}.sqlite-pending`, "");
              } catch { /* Keep the journal until SQLite can be updated. */ }
            }
            return value;
          }
        } catch { /* Ignore malformed optional recovery journal. */ }
      }
      const legacy = await storage.legacyRead(key).catch(() => null);
      if (!storage.nativeRead) return legacy;
      try { return await storage.nativeRead(key, legacy); } catch { return legacy; }
    }),
    setItem: (key: string, value: string) => serial(key, async () => {
      if (!storage.nativeWrite) { await storage.legacyWrite(key, value); return; }
      // Durable journal recovers a newer legacy value if a SQLite write fails.
      await storage.legacyWrite(`${key}.sqlite-pending`, JSON.stringify(value));
      let nativeSaved = false;
      try { await storage.nativeWrite(key, value); nativeSaved = true; } catch { /* Preserve the legacy fallback. */ }
      try {
        await storage.legacyWrite(key, value);
        if (nativeSaved) await storage.legacyWrite(`${key}.sqlite-pending`, "");
      } catch { /* The durable journal retains the newest value for the next read. */ }
    }),
  };
}
