import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import type { LyricsMatch, LyricsRecord } from "./metadata-model";

const key = (id: string) => `custodio.lyrics.v1:${id}`;
export async function readLyrics(id: string): Promise<LyricsRecord | null> {
  const raw = await AsyncStorage.getItem(key(id));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return typeof data.plain === "string" && typeof data.synced === "string" ? data : null;
  } catch { return null; }
}
export function writeLyrics(id: string, lyrics: LyricsRecord) {
  return AsyncStorage.setItem(key(id), JSON.stringify(lyrics));
}
export async function readCandidates(id: string): Promise<LyricsMatch[]> {
  try {
    const data = JSON.parse(await AsyncStorage.getItem(`${key(id)}:candidates`) ?? "[]");
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
export function writeCandidates(id: string, matches: LyricsMatch[]) {
  return AsyncStorage.setItem(`${key(id)}:candidates`, JSON.stringify(matches));
}
export async function downloadCover(url: string, signal: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Capa não encontrada.");
    if (Number(response.headers.get("content-length")) > 8 * 1024 * 1024) throw new Error("Capa muito grande.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) throw new Error("Capa muito grande.");
    if (Platform.OS === "web") {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${response.headers.get("content-type")};base64,${btoa(binary)}`;
    }
    const directory = new Directory(Paths.document, "music-covers");
    directory.create({ idempotent: true, intermediates: true });
    // A provider release has a stable key; resync overwrites only that cached image.
    const name = url.match(/release\/([a-f0-9-]+)\//i)?.[1];
    if (!name) throw new Error("Endereço de capa inválido.");
    const file = new File(directory, `${name}.jpg`);
    await file.write(bytes);
    return file.uri;
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); }
}
