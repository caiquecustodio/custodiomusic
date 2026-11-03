import { normalized, searchIdentity } from "./metadata-model.ts";
import type { PersonalGenre, Track } from "./types";

export const genreStations = ["Funk brasileiro", "Sertanejo", "Forró", "Gospel", "MPB", "Rock", "Pop", "Hip hop", "Eletrônica", "Samba e pagode"];
export type DiscoveryContext = { genre?: string; artist?: string; year?: number; category?: PersonalGenre };
export function genreKey(value: string) {
  const key = normalized(value);
  const aliases: Record<string, string> = { "brazilian funk": "funk brasileiro", "funk carioca": "funk brasileiro", "baile funk": "funk brasileiro", "hip hop": "hip hop", rap: "hip hop", electronic: "eletronica", electronica: "eletronica", "musica popular brasileira": "mpb", samba: "samba e pagode", pagode: "samba e pagode" };
  return aliases[key] ?? key;
}
export function discoveryIdentity(track: Track) {
  const identity = searchIdentity(track);
  return `${normalized(identity.title)}|${normalized(identity.artist)}|${normalized(identity.album)}`;
}
export function discoveryDue(track: Track, now = Date.now()) {
  const cached = track.discovery;
  const ttl = cached?.outcome === "error" ? 3600000 : (cached?.outcome === "missing" ? 7 : 90) * 86400000;
  return !cached || cached.identity !== discoveryIdentity(track) || now - cached.checkedAt > ttl;
}
export function contextMatches(track: Track, context: DiscoveryContext) {
  if (context.category && !personalGenreMatches(track, context.category)) return false;
  if (context.artist && !normalized(track.artist).includes(normalized(context.artist))) return false;
  if ((context.genre || context.year) && track.discovery?.identity !== discoveryIdentity(track)) return false;
  if (context.genre && !track.discovery?.genres.some((genre) => genreKey(genre) === genreKey(context.genre!))) return false;
  return !context.year || track.discovery?.year === context.year;
}
export function contextQuery(context: DiscoveryContext, round = 0) {
  if (context.category) return [context.category.matchGenres.length ? context.category.matchGenres[round % context.category.matchGenres.length] : context.category.matchArtist || context.category.name, "músicas"].join(" ");
  return [context.artist, context.genre, context.year, "música"].filter(Boolean).join(" ");
}

export function isPersonalGenre(value: unknown): value is PersonalGenre {
  if (!value || typeof value !== "object") return false;
  const entry = value as PersonalGenre;
  return typeof entry.id === "string" && entry.id.length > 0 && entry.id.length <= 200
    && typeof entry.name === "string" && !!normalized(entry.name) && entry.name.length <= 60
    && Array.isArray(entry.trackIds) && entry.trackIds.length <= 10000 && entry.trackIds.every((id) => typeof id === "string" && id.length <= 2000)
    && Array.isArray(entry.matchGenres) && entry.matchGenres.length <= 20 && entry.matchGenres.every((name) => typeof name === "string" && name.length > 0 && name.length <= 80)
    && (entry.matchArtist === undefined || (typeof entry.matchArtist === "string" && entry.matchArtist.length <= 200)) && typeof entry.autoInclude === "boolean";
}

export function confirmedGenres(track: Track): string[] {
  return track.discovery?.identity === discoveryIdentity(track) ? track.discovery.genres : [];
}
export function personalGenreMatches(track: Track, category: PersonalGenre) {
  const source = track.online ?? track.origin;
  if (category.trackIds.includes(track.id) || (source && category.trackIds.includes(`online:${source.provider}:${source.sourceId}`))) return true;
  if (!category.autoInclude) return false;
  return confirmedGenres(track).some((genre) => category.matchGenres.some((rule) => genreKey(rule) === genreKey(genre)))
    || (!!category.matchArtist && normalized(searchIdentity(track).artist) === normalized(category.matchArtist));
}
export function createPersonalGenre(name: string, seed: Track, tracks: Track[], similar: boolean, autoInclude: boolean): PersonalGenre {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!normalized(clean)) throw new Error("Dê um nome ao seu gênero.");
  const matchGenres = similar ? confirmedGenres(seed) : [];
  const matchArtist = similar && !matchGenres.length ? searchIdentity(seed).artist || undefined : undefined;
  const source = seed.online ?? seed.origin;
  const references = [seed.id, ...(source ? [`online:${source.provider}:${source.sourceId}`] : [])];
  const rule: PersonalGenre = { id: `genre:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, name: clean, trackIds: references, matchGenres, matchArtist, autoInclude: similar };
  rule.trackIds = [...new Set([...references, ...tracks.filter((track) => personalGenreMatches(track, rule)).map((track) => track.id)])];
  rule.autoInclude = similar && autoInclude;
  return rule;
}
type Recording = { id?: string; title?: string; score?: number; length?: number; "artist-credit"?: { name?: string; artist?: { id?: string; name?: string } }[]; "first-release-date"?: string; releases?: { title?: string }[] };
export function matchRecording(track: Track, recordings: Recording[]) {
  const identity = searchIdentity(track);
  if (!identity.artist) return undefined;
  const candidates = recordings.filter((item) => normalized(item.title ?? "") === normalized(identity.title)
    && (item.score ?? 100) >= 90
    && (item["artist-credit"]?.some((credit) => normalized(credit.name ?? credit.artist?.name ?? "") === normalized(identity.artist))
      || normalized(item["artist-credit"]?.map((credit) => credit.name ?? credit.artist?.name ?? "").join(" ") ?? "") === normalized(identity.artist))
    && (!track.duration || !item.length || Math.abs(item.length / 1000 - track.duration) <= 5));
  const albumMatch = (item: Recording) => !!identity.album && !!item.releases?.some((release) => normalized(release.title ?? "") === normalized(identity.album));
  const delta = (item: Recording) => track.duration && item.length ? Math.abs(item.length / 1000 - track.duration) : 999;
  candidates.sort((a, b) => Number(albumMatch(b)) - Number(albumMatch(a)) || delta(a) - delta(b) || (b.score ?? 0) - (a.score ?? 0));
  const [best, second] = candidates;
  if (best && second && best.id !== second.id && albumMatch(best) === albumMatch(second) && Math.abs(delta(best) - delta(second)) < 2 && best.score === second.score) return undefined;
  return best;
}
