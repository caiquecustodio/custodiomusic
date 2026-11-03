import type { Track } from "./types";

export function moveQueue(queue: string[], id: string, target: number) {
  const from = queue.indexOf(id);
  if (from < 0 || !Number.isFinite(target)) return queue;
  const result = queue.filter((item) => item !== id);
  result.splice(Math.max(0, Math.min(result.length, Math.round(target))), 0, id);
  return result;
}
export function queueNext(queue: string[], currentId: string | null, id: string) {
  if (id === currentId) return queue;
  const result = queue.filter((item) => item !== id);
  const position = currentId ? result.indexOf(currentId) + 1 : 0;
  result.splice(Math.max(0, position), 0, id);
  return result;
}
export function sortTracks(tracks: Track[], sort: "original" | "title" | "artist" | "album") {
  if (sort === "original") return tracks;
  return [...tracks].sort((a, b) => (a[sort] ?? "").localeCompare(b[sort] ?? "", "pt-BR", { numeric: true, sensitivity: "base" }) || a.title.localeCompare(b.title, "pt-BR"));
}
export function markedLrc(texts: string[], times: number[]) {
  if (!texts.length || texts.length !== times.length || times.some((time, index) => !Number.isFinite(time) || time < 0 || (index > 0 && time <= times[index - 1]))) throw new Error("Marque todas as frases, em ordem, antes de salvar.");
  return texts.map((text, index) => {
    const hundredths = Math.round(times[index] * 100);
    const minutes = Math.floor(hundredths / 6000);
    const seconds = Math.floor(hundredths / 100) % 60;
    return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths % 100).padStart(2, "0")}]${text.replace(/[\r\n]/g, " ")}`;
  }).join("\n");
}
