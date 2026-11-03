/** Collapse bursts into one in-flight read plus one trailing read, never lose the last event. */
export function latestRefresh(work: () => Promise<void>) {
  let pending: Promise<void> | null = null;
  let dirty = false;
  return function refresh(): Promise<void> {
    dirty = true;
    if (pending) return pending;
    pending = (async () => {
      try {
        while (dirty) { dirty = false; await work(); }
      } finally { pending = null; }
    })();
    return pending;
  };
}
