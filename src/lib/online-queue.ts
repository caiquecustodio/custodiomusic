import type { DownloadItem } from "./downloads/types";
import type { Track } from "./types";
export const ONLINE_BATCH_SIZE = 10;
export function onlineId(item: Pick<DownloadItem, "provider" | "id">) {
  return `online:${item.provider}:${item.id}`;
}
export function excludedOnlineIds(tracks: Track[], ids: string[]) {
  const selected = new Set(ids);
  return [...ids, ...tracks.filter((track) => selected.has(track.id)).flatMap((track) => {
    const source = track.online ?? track.origin;
    return source ? [`online:${source.provider}:${source.sourceId}`] : [];
  })];
}
export function allowedOnlineItems(items: DownloadItem[], tracks: Track[], preferences: { blockedArtists: string[]; blockedTracks: string[] }) {
  const artists = new Set(preferences.blockedArtists.map((name) => name.trim().toLocaleLowerCase("pt-BR")));
  const blocked = new Set(excludedOnlineIds(tracks, preferences.blockedTracks));
  return items.filter((item) => !artists.has(item.artist.trim().toLocaleLowerCase("pt-BR")) && !blocked.has(onlineId(item)));
}
export function selectOnlineBatch(items: DownloadItem[], excluded: string[], limit = ONLINE_BATCH_SIZE) {
  if (limit <= 0) return [];
  const seen = new Set(excluded);
  const result: DownloadItem[] = [];
  for (const item of items) {
    const id = onlineId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}
