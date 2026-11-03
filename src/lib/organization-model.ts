import type { PersonalGenre, Track } from "./types";
import { confirmedGenres, personalGenreMatches } from "./discovery-metadata.ts";
const normalize = (s: string) => s.trim().toLocaleLowerCase("pt-BR");
export type LibraryGroup = "artist" | "album" | "folder" | "genre" | "year";
export function groupName(track: Track, group: LibraryGroup) {
  if (group === "genre") return track.discovery?.genres[0] ?? "Gênero não identificado";
  if (group === "year") return track.discovery?.year ? String(track.discovery.year) : "Ano não identificado";
  const name = (group === "folder" ? track.folder : track[group])?.trim();
  return name && !(group === "artist" && ["Arquivo local", "Arquivo selecionado", "Pasta selecionada"].includes(name)) ? name : ({ artist: "Artista desconhecido", album: "Álbum desconhecido", folder: "Pasta desconhecida" }[group]);
}
export function groupNames(track: Track, group: LibraryGroup, categories: PersonalGenre[] = []) {
  if (group !== "genre") return [groupName(track, group)];
  const names = [...confirmedGenres(track), ...categories.filter((category) => personalGenreMatches(track, category)).map((category) => category.name)];
  return names.length ? [...new Set(names)] : ["Gênero não identificado"];
}
export function possibleDuplicates(tracks: Track[]) {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) { if (!track.duration || ["Arquivo local", "Arquivo selecionado", "Pasta selecionada"].includes(track.artist)) continue; const key = `${normalize(track.title)}\u0000${normalize(track.artist)}`; groups.set(key, [...(groups.get(key) ?? []), track]); }
  return [...groups.values()].flatMap((group) => { const remaining = [...group].sort((a, b) => a.duration - b.duration); const result: Track[][] = []; while (remaining.length) { const first = remaining.shift()!; const similar = remaining.filter((t) => Math.abs(t.duration - first.duration) <= 3); for (const t of similar) remaining.splice(remaining.indexOf(t), 1); if (similar.length) result.push([first, ...similar]); } return result; });
}
function basename(uri: string) { try { return normalize(decodeURIComponent(uri.split(/[?#]/)[0].split(/[\\/]/).at(-1) ?? "")); } catch { return normalize(uri); } }
export function importM3u(text: string, tracks: Track[]) {
  if (text.length > 5 * 1024 * 1024) throw new Error("Playlist maior que 5 MB.");
  const available = tracks.filter((t) => !!t.uri && !/^https?:|^blob:|^data:/i.test(t.uri));
  const ids: string[] = []; const missing: string[] = []; let info = "";
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    if (line.startsWith("#EXTINF:")) { info = line.slice(line.indexOf(",") + 1); continue; }
    if (line.startsWith("#")) continue;
    const exact = available.filter((t) => t.uri === line);
    const names = available.filter((t) => t.uri && basename(t.uri) === basename(line));
    const metadata = available.filter((t) => normalize(`${t.artist} - ${t.title}`) === normalize(info));
    const candidates = exact.length ? exact : names.length ? names : metadata;
    if (candidates.length === 1) { if (!ids.includes(candidates[0].id)) ids.push(candidates[0].id); } else missing.push(line);
    info = "";
  }
  return { ids, missing };
}
export function exportM3u(tracks: Track[]) {
  const available = tracks.filter((t) => t.uri && !/^https?:|^blob:|^data:/i.test(t.uri));
  const clean = (s: string) => s.replace(/[\r\n]/g, " ");
  return { text: "#EXTM3U\n" + available.map((t) => `#EXTINF:${Math.round(t.duration)},${clean(t.artist)} - ${clean(t.title)}\n${clean(t.uri)}`).join("\n") + "\n", omitted: tracks.length - available.length };
}
