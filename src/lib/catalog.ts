import type { DownloadItem, SearchResults, SourceFilter, SourceId, SourceStatus } from "./downloads/types.ts";

export const catalogSources: readonly SourceId[] = ["youtube", "audius", "jamendo"];
type Entry = { at: number; items: DownloadItem[] };
type Dependencies = {
  sources: () => Promise<SourceStatus[]>;
  search: (source: SourceId, query: string) => Promise<DownloadItem[]>;
  popular: (source: SourceId) => Promise<DownloadItem[]>;
  readCache?: () => Promise<string | null>;
  writeCache?: (value: string) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  cooldownMs?: number;
};
export function isCatalogItem(value: unknown): value is DownloadItem {
  if (!value || typeof value !== "object") return false;
  const item = value as DownloadItem;
  return catalogSources.includes(item.provider) && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 128 &&
    typeof item.title === "string" && item.title.length <= 500 && typeof item.artist === "string" && item.artist.length <= 500 &&
    Number.isFinite(item.duration) && item.duration > 0 && typeof item.url === "string" && /^https:\/\//.test(item.url) &&
    (item.thumbnail === null || typeof item.thumbnail === "string") && typeof item.downloadable === "boolean";
}
/** Search and home suggestions have separate bounded slots so discovery never blocks a search. */
export function createCatalog(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, Entry>();
  const pending = new Map<string, { key: string; promise: Promise<DownloadItem[]> }>();
  const cooldown = new Map<string, number>();
  let hydrated: Promise<void> | null = null;
  const hydrate = () => hydrated ??= (async () => {
    try {
      const saved: unknown = JSON.parse(await deps.readCache?.() ?? "[]");
      if (!Array.isArray(saved)) return;
      for (const row of saved.slice(-24)) {
        if (Array.isArray(row) && typeof row[0] === "string" && row[0].length <= 220 && Number.isFinite(row[1]?.at) && Array.isArray(row[1]?.items)) {
          cache.set(row[0], { at: row[1].at, items: row[1].items.filter(isCatalogItem).slice(0, 30) });
        }
      }
    } catch { /* Cache is optional; network results remain available. */ }
  })();
  const remember = (key: string, items: DownloadItem[]) => {
    cache.delete(key); cache.set(key, { at: now(), items });
    while (cache.size > 24) cache.delete(cache.keys().next().value!);
  };
  async function one(id: SourceId, query: string, popular: boolean, force = false): Promise<{ items: DownloadItem[]; error?: string }> {
    const key = `${id}:${popular ? "popular" : `search:${query.toLocaleLowerCase("pt-BR")}`}`;
    const slot = `${id}:${popular ? "popular" : "search"}`;
    const saved = cache.get(key);
    const age = saved ? Math.max(0, now() - saved.at) : Infinity;
    if (!force && saved && age < (popular ? 3600000 : 300000)) return { items: saved.items };
    const stale = saved && age < 7 * 86400000 ? saved.items : [];
    const active = pending.get(slot);
    if ((cooldown.get(slot) ?? 0) > now() || (active && active.key !== key)) {
      return { items: stale, error: stale.length ? "Seleção salva anteriormente." : "Conexão temporariamente indisponível." };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let work = active?.promise;
      if (!work) {
        work = Promise.resolve().then(() => popular ? deps.popular(id) : deps.search(id, query))
          .then((items) => {
            const valid = items.filter(isCatalogItem).filter((item) => item.provider === id).slice(0, 30);
            remember(key, valid); cooldown.delete(slot); return valid;
          }).finally(() => { if (pending.get(slot)?.key === key) pending.delete(slot); });
        pending.set(slot, { key, promise: work });
      }
      const items = await Promise.race([work, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Catalog timeout")), deps.timeoutMs ?? 10000);
      })]);
      return { items };
    } catch {
      cooldown.set(slot, now() + (deps.cooldownMs ?? 30000));
      return { items: stale, error: stale.length ? "Seleção salva anteriormente." : "Conexão temporariamente indisponível." };
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  function merge(rows: { items: DownloadItem[] }[]) {
    const items: DownloadItem[] = []; const seen = new Set<string>();
    for (let index = 0; index < Math.max(0, ...rows.map((r) => r.items.length)); index++) {
      for (const row of rows) {
        const item = row.items[index]; if (!item) continue;
        const key = `${item.provider}:${item.id}`;
        if (!seen.has(key)) { seen.add(key); items.push(item); }
      }
    }
    return items;
  }
  async function collect(query: string, source: SourceFilter, popular: boolean, onPartial?: (items: DownloadItem[]) => void, force = false): Promise<SearchResults> {
    await hydrate();
    const statuses = await deps.sources();
    const ids = catalogSources.filter((id) => (source === "all" || source === id) && statuses.some((s) => s.id === id && s.available));
    if (!ids.length) throw new Error("Nenhuma conexão online disponível. Atualize o aplicativo ou tente novamente.");
    const partial: { items: DownloadItem[] }[] = ids.map(() => ({ items: [] }));
    const rows = await Promise.all(ids.map(async (id, index) => {
      const row = await one(id, query, popular, force);
      partial[index] = row;
      try { onPartial?.(merge(partial)); } catch { /* A view callback cannot fail a catalog query. */ }
      return row;
    }));
    // Interleave relevance-ranked lists so a larger catalog does not hide the others.
    const items = merge(rows);
    const errors = Object.fromEntries(rows.flatMap((row, i) => row.error ? [[ids[i], row.error]] : []));
    await deps.writeCache?.(JSON.stringify([...cache])).catch(() => undefined);
    return { items, errors };
  }
  return {
    search(query: string, source: SourceFilter = "all", onPartial?: (items: DownloadItem[]) => void) {
      const value = query.trim();
      if (!value || value.length > 200) return Promise.reject(new Error("Digite até 200 caracteres para pesquisar."));
      return collect(value, source, false, onPartial);
    },
    popular: (force = false) => collect("", "all", true, undefined, force),
  };
}
