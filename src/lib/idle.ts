/** Optional work yields to input; a timeout prevents starvation on busy screens. */
export function scheduleIdle(work: () => void, timeout = 1000): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(work, { timeout });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(work, 32);
  return () => clearTimeout(handle);
}

export function yieldToInput(): Promise<void> {
  return new Promise((resolve) => scheduleIdle(resolve, 100));
}
