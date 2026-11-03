import type { Track } from "./types";

export type ListeningDay = { day: string; trackId: string; title: string; artist: string; seconds: number; plays: number; skips: number; completions: number };
export type ListeningEvent = { id: string; trackId: string; title: string; artist: string; source: string; started: number; seconds: number; qualified: boolean; reason: string };
export type ListeningData = { version: 1; days: ListeningDay[]; events: ListeningEvent[] };
export type RadioPreferences = { discovery: number; offline: boolean; prefetch: boolean; blockedTracks: string[]; blockedArtists: string[] };
export const DEFAULT_RADIO: RadioPreferences = { discovery: 0.7, offline: false, prefetch: true, blockedTracks: [], blockedArtists: [] };
export const normalizeName = (name: string) => name.trim().toLocaleLowerCase("pt-BR");
export function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function weekStart(date: Date) { const result = new Date(date); result.setHours(0, 0, 0, 0); result.setDate(result.getDate() - (result.getDay() + 6) % 7); return result; }
export function recapPeriods(days: ListeningDay[], now = new Date()) {
  const start = new Date(now); start.setDate(start.getDate() - 6);
  const currentWeek = dayKey(weekStart(now));
  const weeks = [...new Set(days.map((d) => dayKey(weekStart(new Date(`${d.day}T12:00:00`)))))].filter((key) => key < currentWeek).sort().reverse();
  return [{ id: "rolling", label: "Últimos 7 dias", from: dayKey(start), to: dayKey(now) }, ...weeks.map((key) => { const end = new Date(`${key}T12:00:00`); end.setDate(end.getDate() + 6); return { id: key, label: `${new Date(`${key}T12:00:00`).toLocaleDateString("pt-BR")} – ${end.toLocaleDateString("pt-BR")}`, from: key, to: dayKey(end) }; })];
}
export function summarize(days: ListeningDay[], from: string, to: string) {
  const selected = days.filter((day) => day.day >= from && day.day <= to);
  const tracks = new Map<string, ListeningDay>(); const artists = new Map<string, { artist: string; seconds: number; plays: number }>(); const activity = new Map<string, number>();
  for (const row of selected) {
    const previous = tracks.get(row.trackId);
    tracks.set(row.trackId, previous ? { ...previous, seconds: previous.seconds + row.seconds, plays: previous.plays + row.plays } : { ...row });
    const key = normalizeName(row.artist); const artist = artists.get(key) ?? { artist: row.artist, seconds: 0, plays: 0 };
    artists.set(key, { ...artist, seconds: artist.seconds + row.seconds, plays: artist.plays + row.plays });
    activity.set(row.day, (activity.get(row.day) ?? 0) + row.seconds);
  }
  return { seconds: selected.reduce((sum, row) => sum + row.seconds, 0), distinct: tracks.size,
    tracks: [...tracks.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds),
    artists: [...artists.values()].sort((a, b) => b.seconds - a.seconds), activity: [...activity].sort(([a], [b]) => a.localeCompare(b)) };
}
export function extendRadioQueue(queue: string[], currentId: string | null, added: string[]) {
  const current = queue.indexOf(currentId ?? ""); const ids = new Set(added);
  const history = current < 0 ? [] : queue.slice(Math.max(0, current - 30), current).filter((id) => !ids.has(id));
  const next = [...new Set([...history, ...queue.slice(Math.max(0, current)), ...added])];
  return next.length === queue.length && next.every((id, i) => id === queue[i]) ? queue : next;
}
export function radioCandidates(tracks: Track[], days: ListeningDay[], favorites: string[], preferences: RadioPreferences, recent: string[], lastArtist: string, random = Math.random, now = new Date()) {
  const stats = new Map<string, { seconds: number; plays: number; skips: number; completions: number }>();
  const artistScores = new Map<string, number>();
  for (const d of days) {
    const age = Math.max(0, (now.getTime() - new Date(`${d.day}T12:00:00`).getTime()) / 86400000);
    const decay = Math.exp(-age / 60);
    const old = stats.get(d.trackId) ?? { seconds: 0, plays: 0, skips: 0, completions: 0 };
    stats.set(d.trackId, { seconds: old.seconds + d.seconds * decay, plays: old.plays + d.plays * decay, skips: old.skips + d.skips * decay, completions: old.completions + d.completions * decay });
    artistScores.set(normalizeName(d.artist), (artistScores.get(normalizeName(d.artist)) ?? 0) + d.plays * decay);
  }
  const blockedTracks = new Set(preferences.blockedTracks), blockedArtists = new Set(preferences.blockedArtists), favoriteIds = new Set(favorites), recentlyPlayed = new Set(recent.slice(-30));
  const allowed = tracks.filter((t) => (t.uri || t.online || t.origin) && (!preferences.offline || (t.uri && !/^https?:/i.test(t.uri))) && !blockedTracks.has(t.id) && !blockedArtists.has(normalizeName(t.artist)));
  let pool = allowed.filter((t) => !recentlyPlayed.has(t.id));
  if (!pool.length) pool = allowed.filter((t) => t.id !== recent.at(-1));
  if (!pool.length) pool = allowed;
  const scored = pool.map((track) => { const s = stats.get(track.id); const weight = Math.max(0.15, 1 + (favoriteIds.has(track.id) ? 5 : 0) + Math.log1p(s?.seconds ?? 0) / 3 + (s?.completions ?? 0) * 0.5 + Math.log1p(artistScores.get(normalizeName(track.artist)) ?? 0) - (s?.skips ?? 0) * 1.5);
    return { track, reason: favoriteIds.has(track.id) ? "Uma das suas favoritas" : s?.plays ? "Você costuma ouvir" : artistScores.has(normalizeName(track.artist)) ? "Artista do seu histórico" : "Para variar sua rádio", key: -Math.log(Math.max(0.000001, random())) / weight }; });
  scored.sort((a, b) => a.key - b.key);
  if (scored.length > 1) { const index = scored.findIndex((entry) => normalizeName(entry.track.artist) !== normalizeName(lastArtist)); if (index > 0) scored.unshift(...scored.splice(index, 1)); }
  return scored;
}
export function parseListening(value: unknown): ListeningData {
  const data = value as ListeningData;
  if (!data || data.version !== 1 || !Array.isArray(data.days) || !Array.isArray(data.events) || data.days.length > 100000 || data.events.length > 100000) throw new Error("Histórico inválido.");
  const text = (s: unknown) => typeof s === "string" && s.length <= 2000;
  if (!data.days.every((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && text(d.trackId) && text(d.title) && text(d.artist) && [d.seconds, d.plays, d.skips, d.completions].every((n) => Number.isFinite(n) && n >= 0)) || !data.events.every((e) => e && text(e.id) && text(e.trackId) && text(e.title) && text(e.artist) && text(e.source) && text(e.reason) && Number.isFinite(e.started) && e.started >= 0 && Number.isFinite(e.seconds) && e.seconds >= 0 && typeof e.qualified === "boolean")) throw new Error("Histórico inválido.");
  return data;
}
