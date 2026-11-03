import type { Track, StoredState } from "./types";
import { canPlay, isOffline } from "./downloads/model.ts";

export function nativeQueueTracks(tracks: Track[], queue: string[], current: Track, offline = false, includeCurrent = true, stagedTracks: Track[] = []) {
  const byId = new Map([...tracks, ...stagedTracks].map((track) => [track.id, track]));
  byId.set(current.id, current);
  const ids = [...new Set(queue)];
  if (includeCurrent && !ids.includes(current.id)) ids.unshift(current.id);
  return ids.map((id) => byId.get(id)).filter((track): track is Track =>
    !!track && canPlay(track) && (!offline || isOffline(track))).map((track) => ({
      id: track.id, uri: track.uri, title: track.title, artist: track.artist,
      album: track.album, artwork: track.artwork, duration: track.duration,
      source: track.online?.provider ?? track.origin?.provider ?? "local",
      remote: !isOffline(track) ? track.online ?? track.origin : undefined,
      fallback: offline ? undefined : track.origin,
    }));
}
export type NativeQueueOptions = {
  repeat: StoredState["repeat"]; shuffle: boolean; priority: string | null;
  sleepAtEnd: boolean; sleepDeadline: number | null;
  range: { id: string; a: number; b: number | null } | null;
};
