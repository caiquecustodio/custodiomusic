import type { LyricsRecord } from "./metadata-model";
import type { StoredState, Track } from "./types";
import type { ListeningData } from "./discovery-model";
import { parseListening } from "./discovery-model.ts";
import { isPersonalGenre } from "./discovery-metadata.ts";

export type MusicBackup = {
  format: "custodio-backup"; version: 1; state: StoredState;
  tracks: Pick<Track, "id" | "title" | "artist" | "duration" | "lyricsOffset">[];
  lyrics: { id: string; data: LyricsRecord }[];
  listening?: ListeningData;
};
export function backupTrackId(id: string) {
  // Some web pickers use a data URL as the old track id. Never embed audio in a backup.
  if (id.length <= 2000) return id;
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return `portable:${(hash >>> 0).toString(16)}:${id.length}`;
}
export function parseBackup(text: string): MusicBackup {
  if (text.length > 20 * 1024 * 1024) throw new Error("Backup maior que 20 MB.");
  const data = JSON.parse(text);
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 10000 && value.every((item) => typeof item === "string" && item.length <= 2000);
  if (data?.format !== "custodio-backup" || data.version !== 1 || !data.state || !Array.isArray(data.tracks) || !Array.isArray(data.lyrics) || data.tracks.length > 10000 || data.lyrics.length > 10000) throw new Error("Arquivo de backup inválido ou de versão não suportada.");
  const state = data.state;
  if (state.personalGenres !== undefined && (!Array.isArray(state.personalGenres) || state.personalGenres.length > 200 || !state.personalGenres.every(isPersonalGenre))) throw new Error("Gêneros pessoais inválidos no backup.");
  if (data.listening !== undefined) data.listening = parseListening(data.listening);
  if (!strings(state.favorites) || !Array.isArray(state.playlists) || state.playlists.length > 1000 || !state.playlists.every((list: { id: unknown; name: unknown; trackIds: unknown }) => list && typeof list.id === "string" && typeof list.name === "string" && list.name.length <= 80 && strings(list.trackIds)) || !["dark", "light"].includes(state.theme) || !["off", "all", "one", "single"].includes(state.repeat) || typeof state.shuffle !== "boolean" || typeof state.autoSync !== "boolean") throw new Error("Preferências inválidas no backup.");
  if (!data.tracks.every((track: Track) => track && typeof track.id === "string" && typeof track.title === "string" && typeof track.artist === "string" && Number.isFinite(track.duration) && track.duration >= 0 && (track.lyricsOffset === undefined || (Number.isFinite(track.lyricsOffset) && Math.abs(track.lyricsOffset) <= 30))) || !data.lyrics.every((entry: { id: string; data: LyricsRecord }) => entry && typeof entry.id === "string" && entry.data && typeof entry.data.plain === "string" && typeof entry.data.synced === "string" && entry.data.plain.length <= 250000 && entry.data.synced.length <= 250000 && typeof entry.data.instrumental === "boolean" && typeof entry.data.source === "string")) throw new Error("Dados de músicas ou letras inválidos.");
  return { ...data, state: { ...state, repeat: state.repeat === "single" ? "off" : state.repeat, librarySort: ["original", "title", "artist", "album"].includes(state.librarySort) ? state.librarySort : "original" } };
}
export function matchBackupTracks(backup: MusicBackup, tracks: Track[]) {
  const ids = new Map<string, string>();
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  for (const source of backup.tracks) {
    const byId = tracks.find((track) => backupTrackId(track.id) === source.id);
    const candidates = tracks.filter((track) => normalize(track.title) === normalize(source.title) && normalize(track.artist) === normalize(source.artist) && Math.abs(track.duration - source.duration) <= 3);
    const matched = byId ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (matched) ids.set(source.id, matched.id);
  }
  return ids;
}
