import type { Track } from "./types";
import type { DownloadItem } from "./downloads/types";

export type SearchEntry = { kind: "library"; key: string; track: Track } | { kind: "online"; key: string; item: DownloadItem };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const sourceKey = (provider: string, id: string) => `${provider}:${id}`;
/** Prefer downloaded copies by source identity, never collapse different recordings by title. */
export function unifiedSearchResults(query: string, tracks: Track[], online: DownloadItem[]): SearchEntry[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const sources = new Set<string>();
  const ids = new Set<string>();
  const local: SearchEntry[] = [];
  // Local files win even when an online session already has the same song in memory.
  const candidates = [...tracks.filter((track) => !!track.uri && !/^https?:/i.test(track.uri)), ...tracks.filter((track) => !track.uri || /^https?:/i.test(track.uri))];
  for (const track of candidates) {
    const source = track.online ?? track.origin;
    const key = source ? sourceKey(source.provider, source.sourceId) : undefined;
    if ((!track.uri && !source) || ids.has(track.id) || (key && sources.has(key))) continue;
    const text = normalize(`${track.title} ${track.artist} ${track.album ?? ""}`);
    if (!terms.every((term) => text.includes(term)) && !online.some((item) => key === sourceKey(item.provider, item.id))) continue;
    ids.add(track.id);
    if (key) sources.add(key);
    local.push({ kind: "library", key: `library:${track.id}`, track });
  }
  for (const item of online) {
    const key = sourceKey(item.provider, item.id);
    if (sources.has(key)) continue;
    sources.add(key);
    local.push({ kind: "online", key: `online:${key}`, item });
  }
  return local;
}
