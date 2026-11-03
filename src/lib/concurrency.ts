/** Bound native I/O so scanning a large library does not flood the bridge. */
export async function mapConcurrent<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const count = Math.min(items.length, Math.max(1, Math.floor(limit) || 1));
  await Promise.all(Array.from({ length: count }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}
