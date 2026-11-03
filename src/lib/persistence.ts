import { restoreDuration } from "./duration";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_STATE, StoredState } from "./types";
import { isPersonalGenre } from "./discovery-metadata";
import { preferences } from "./preferences";

const STATE_KEY = "custodio.music.state.v1";
const TRACKS_KEY = "custodio.music.imported.v1";
const QUEUE_KEY = "custodio.music.queue.v1";
const SESSION_KEY = "custodio.music.session.v1";
export type PlaybackSession = { trackId: string; position: number };
export async function loadSession(): Promise<PlaybackSession | null> {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(SESSION_KEY) ?? "null");
    return value && typeof value.trackId === "string" && Number.isFinite(value.position) && value.position >= 0 ? value : null;
  } catch { return null; }
}
export function saveSession(session: PlaybackSession) {
  return AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadState(): Promise<StoredState> {
  try {
    const raw = await preferences.getItem(STATE_KEY);
    if (!raw) return DEFAULT_STATE;
    const saved = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...saved, repeat: saved.repeat === "all" || saved.repeat === "one" ? saved.repeat : "off", personalGenres: Array.isArray(saved.personalGenres) ? saved.personalGenres.filter(isPersonalGenre).slice(0, 200) : [] };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: StoredState) {
  return preferences.setItem(STATE_KEY, JSON.stringify(state));
}

export async function loadImportedTracks() {
  try {
    const raw = await AsyncStorage.getItem(TRACKS_KEY);
    // Older library entries contain raw Android milliseconds. Refresh them from
    // the source; do not guess or repeatedly divide persisted values.
    return raw
      ? (JSON.parse(raw) as import("./types").Track[]).map(restoreDuration)
      : [];
  } catch {
    return [];
  }
}

export function saveImportedTracks(tracks: import("./types").Track[]) {
  return AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
}

export function saveQueue(trackIds: string[]) {
  return AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trackIds));
}

export async function loadQueue() {
  try {
    return JSON.parse(
      (await AsyncStorage.getItem(QUEUE_KEY)) ?? "[]",
    ) as string[];
  } catch {
    return [];
  }
}
