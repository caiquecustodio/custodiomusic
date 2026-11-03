import type { Track } from "./types";
import type { ListeningDay } from "./discovery-model";
import { contextQuery, type DiscoveryContext } from "./discovery-metadata.ts";
import { isOffline } from "./downloads/model.ts";

export function radioSearchPlan(days: ListeningDay[], tracks: Track[], favorites: string[], context: DiscoveryContext, random = Math.random): { kind: "popular" } | { kind: "search"; query: string } {
  if (Object.values(context).some(Boolean)) return { kind: "search", query: contextQuery(context) };
  const plays = days.reduce((sum, row) => sum + row.plays, 0);
  const confidence = Math.min(0.8, plays / 40 + favorites.length * 0.03);
  if (random() >= confidence) return { kind: "popular" };
  const artists = [...days].sort((a, b) => b.plays + b.completions - b.skips - (a.plays + a.completions - a.skips)).filter((row) => row.plays > 0 && row.skips <= row.plays * 2).map((row) => row.artist);
  const preferred = [...new Set([...artists, ...tracks.filter((track) => favorites.includes(track.id)).map((track) => track.artist)])].filter((artist) => artist && !/^(arquivo|pasta) /i.test(artist)).slice(0, 5);
  if (!preferred.length) return { kind: "popular" };
  return { kind: "search", query: `${preferred[Math.min(preferred.length - 1, Math.floor(random() * preferred.length))]} músicas` };
}

/** Keep online discovery moving, with a local bridge after every two remote tracks. */
export function interleaveLocal<T extends { track: Track }>(ranked: T[], limit = 8) {
  const local = ranked.filter((entry) => isOffline(entry.track));
  const online = ranked.filter((entry) => !isOffline(entry.track));
  const result: T[] = [];
  while (result.length < limit && (local.length || online.length)) {
    const pool = result.length % 3 === 2 && local.length ? local : online.length ? online : local;
    const next = pool.shift(); if (next) result.push(next);
  }
  return result;
}
