import { normalized, rankLyrics, searchIdentity, type LyricsMatch } from "./metadata-model";
import type { Track } from "./types";
import { discoveryIdentity, matchRecording } from "./discovery-metadata";

export async function request(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(cancel, 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "CustodioMusic/1.0 (local music player)" } });
    if (!response.ok) throw new Error(`Serviço indisponível (${response.status}). Tente novamente.`);
    return await response.json();
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); }
}
export async function findLyrics(track: Track, signal: AbortSignal): Promise<LyricsMatch[]> {
  const identity = searchIdentity(track);
  const params = new URLSearchParams({ track_name: identity.title });
  if (identity.artist) params.set("artist_name", identity.artist);
  const data: unknown = await request(`https://lrclib.net/api/search?${params}`, signal);
  if (!Array.isArray(data)) throw new Error("Resposta de letras inválida.");
  return data.filter((value): value is LyricsMatch => value && typeof value.id === "number" && typeof value.trackName === "string" && typeof value.artistName === "string" && typeof value.duration === "number")
    .map((value) => ({ ...value, albumName: typeof value.albumName === "string" ? value.albumName : "", plainLyrics: typeof value.plainLyrics === "string" && value.plainLyrics.length <= 50000 ? value.plainLyrics : null, syncedLyrics: typeof value.syncedLyrics === "string" && value.syncedLyrics.length <= 50000 ? value.syncedLyrics : null }))
    .filter((item) => item.instrumental || item.plainLyrics || item.syncedLyrics);
}
let musicBrainzQueue: Promise<unknown> = Promise.resolve();
let lastMusicBrainz = 0;
export function musicBrainzRequest(path: string, signal: AbortSignal): Promise<any> {
  const work = musicBrainzQueue.catch(() => undefined).then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastMusicBrainz));
    if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    signal.throwIfAborted();
    lastMusicBrainz = Date.now();
    return request(`https://musicbrainz.org/ws/2/${path}`, signal);
  });
  musicBrainzQueue = work;
  return work;
}
export async function findDiscoveryMetadata(track: Track, signal: AbortSignal): Promise<NonNullable<Track["discovery"]>> {
  const identity = searchIdentity(track);
  const base = { identity: discoveryIdentity(track), source: "MusicBrainz" as const, checkedAt: Date.now(), genres: [] as string[] };
  const quote = (text: string) => `"${text.replace(/["\\]/g, " ")}"`;
  if (!identity.artist) {
    const result = await musicBrainzRequest(`recording/?fmt=json&limit=8&query=${encodeURIComponent(`recording:${quote(identity.title)}`)}`, signal);
    type Candidate = { id?: string; title?: string; length?: number; "artist-credit"?: { name?: string; artist?: { name?: string } }[] };
    const recordings: Candidate[] = Array.isArray(result.recordings) ? result.recordings : [];
    const candidates = recordings.filter((item) => item.id && /^[a-f0-9-]{36}$/i.test(item.id) && typeof item.title === "string" && normalized(item.title) === normalized(identity.title) && (!track.duration || !item.length || Math.abs(item.length / 1000 - track.duration) <= 5))
      .map((item) => ({ recordingId: item.id!, title: item.title!, artist: item["artist-credit"]?.map((credit) => credit.name ?? credit.artist?.name ?? "").filter(Boolean).join(" ") ?? "" }))
      .filter((item, index, all) => item.artist && all.findIndex((other) => normalized(other.artist) === normalized(item.artist) && normalized(other.title) === normalized(item.title)) === index).slice(0, 5);
    return { ...base, candidates, outcome: "missing" };
  }
  const result = await musicBrainzRequest(`recording/?fmt=json&limit=5&query=${encodeURIComponent(`recording:${quote(identity.title)} AND artist:${quote(identity.artist)}`)}`, signal);
  const match = matchRecording(track, Array.isArray(result.recordings) ? result.recordings : []);
  if (!match?.id || !/^[a-f0-9-]{36}$/i.test(match.id)) return { ...base, outcome: "missing" };
  const detail = await musicBrainzRequest(`recording/${match.id}?fmt=json&inc=genres`, signal);
  const genres: string[] = Array.isArray(detail.genres) ? detail.genres.filter((g: { name?: unknown; count?: number }) => typeof g.name === "string" && (g.count ?? 0) > 0).sort((a: { count: number }, b: { count: number }) => b.count - a.count).slice(0, 5).map((g: { name: string }) => g.name) : [];
  let suggestedGenres: string[] = [];
  if (!genres.length) {
    const artistId = match["artist-credit"]?.find((credit) => normalized(credit.name ?? credit.artist?.name ?? "") === normalized(identity.artist))?.artist?.id;
    if (artistId && /^[a-f0-9-]{36}$/i.test(artistId)) {
      try {
        const artist = await musicBrainzRequest(`artist/${artistId}?fmt=json&inc=genres`, signal);
        suggestedGenres = Array.isArray(artist.genres) ? artist.genres.filter((genre: { name?: unknown; count?: number }) => typeof genre.name === "string" && genre.name.length <= 80 && (genre.count ?? 0) > 0).sort((a: { count: number }, b: { count: number }) => b.count - a.count).slice(0, 5).map((genre: { name: string }) => genre.name) : [];
      } catch { signal.throwIfAborted(); /* Keep the confirmed recording if optional artist lookup fails. */ }
    }
  }
  const year = Number(String(detail["first-release-date"] ?? match["first-release-date"] ?? "").slice(0, 4));
  return { ...base, genres, suggestedGenres, recordingId: match.id, ...(year >= 1900 && year <= new Date().getFullYear() + 1 ? { year } : {}), outcome: "found" };
}
export async function findCover(track: Track, signal: AbortSignal): Promise<string[]> {
  const identity = searchIdentity(track);
  if (!identity.artist) return [];
  const quote = (text: string) => `"${text.replace(/["\\]/g, " ")}"`;
  const query = `recording:${quote(identity.title)} AND artist:${quote(identity.artist)}`;
  const result = await musicBrainzRequest(`recording/?fmt=json&limit=5&query=${encodeURIComponent(query)}`, signal);
  type Recording = { title: string; length?: number; "artist-credit"?: { name: string }[]; releases?: { id: string; title: string }[] };
  const recordings: Recording[] = Array.isArray(result.recordings) ? result.recordings : [];
  const urls: string[] = [];
  for (const item of recordings) {
    if (typeof item.title !== "string" || normalized(item.title) !== normalized(identity.title)) continue;
    if (!item["artist-credit"]?.some((artist) => normalized(artist.name) === normalized(identity.artist))) continue;
    if (track.duration > 0 && item.length && Math.abs(item.length / 1000 - track.duration) > 5) continue;
    const releases = [...(item.releases ?? [])].sort((a, b) => Number(normalized(b.title) === normalized(identity.album)) - Number(normalized(a.title) === normalized(identity.album)));
    for (const release of releases) {
      if (/^[a-f0-9-]{36}$/i.test(release.id)) urls.push(`https://coverartarchive.org/release/${release.id}/front-500`);
    }
  }
  return [...new Set(urls)].slice(0, 3);
}
export function bestLyrics(track: Track, matches: LyricsMatch[]) {
  const ranked = rankLyrics(matches, searchIdentity(track), track.duration);
  return { chosen: ranked.find((match) => match.trusted)?.item, candidates: ranked.slice(0, 8).map((match) => match.item) };
}
