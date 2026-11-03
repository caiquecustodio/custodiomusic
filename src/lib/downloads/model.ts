import type { DownloadJob, SourceId } from "./types";
import type { Track } from "../types";
export function sourceLink(raw: string): { provider: SourceId; id: string } {
  const url = new URL(raw.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Use um link HTTPS de uma fonte disponível.");
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com")
  ) {
    const id =
      host === "youtu.be"
        ? parts[0]
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed", "live"].includes(parts[0])
            ? parts[1]
            : null;
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
      throw new Error(
        "Envie o link de uma faixa, não de uma playlist ou canal.",
      );
    return { provider: "youtube", id };
  }
  if (host === "jamendo.com" || host.endsWith(".jamendo.com")) {
    const position = parts.indexOf("track");
    const id = position >= 0 ? parts[position + 1] : "";
    if (/^[0-9]{1,12}$/.test(id ?? "")) return { provider: "jamendo", id };
  }
  throw new Error("Use o link de uma faixa do YouTube ou Jamendo.");
}
export function completedTracks(jobs: DownloadJob[]): Track[] {
  return jobs
    .filter((job) => job.state === "completed" && !!job.uri && job.duration > 0)
    .map((job) => ({
      id: `download:${job.id}`,
      uri: job.uri!,
      title: job.item.title,
      artist: job.item.artist,
      duration: job.duration,
      durationUnit: "seconds",
      ...(job.artwork ? { artwork: job.artwork } : {}),
      origin: {
        provider: job.item.provider,
        sourceId: job.item.id,
        sourceUrl: job.item.url,
        format: job.format.id,
      },
    }));
}
export function mergeDownloads(tracks: Track[], downloaded: Track[]): Track[] {
  const incoming = new Map(downloaded.map((track) => [track.id, track]));
  const bySource = new Map<string, Track>();
  for (const item of downloaded) {
    const key = sourceKey(item);
    if (key && !bySource.has(key)) bySource.set(key, item);
  }
  let changed = false;
  const result = tracks.map((track) => {
    const replacement = incoming.get(track.id) ?? bySource.get(sourceKey(track));
    if (replacement) incoming.delete(replacement.id);
    if (!replacement) return track;
    const merged = { ...track, ...replacement, id: track.id,
      ...(track.sync || track.metadataEdited ? { title: track.title, artist: track.artist, album: track.album } : {}),
      artwork: track.artwork && !/^https?:/.test(track.artwork) ? track.artwork : replacement.artwork,
    };
    if (
      track.uri === merged.uri &&
        track.title === merged.title &&
        track.artist === merged.artist &&
        track.duration === merged.duration &&
        track.artwork === merged.artwork &&
        track.origin?.format === merged.origin?.format
    )
      return track;
    changed = true;
    return merged;
  });
  return changed || incoming.size > 0
    ? [...result, ...incoming.values()]
    : tracks;
}
function sourceKey(track: Track) {
  const source = track.online ?? track.origin;
  return source ? `${source.provider}:${source.sourceId}` : "";
}
export function sameSource(a: Track, b: Track) {
  const source = (track: Track) => track.online ?? track.origin;
  const left = source(a), right = source(b);
  return !!left && !!right && left.provider === right.provider && left.sourceId === right.sourceId;
}
export function onlineTrack(item: import("./types").DownloadItem, tracks: Track[]): Track {
  const candidate: Track = { id: `online:${item.provider}:${item.id}`, uri: "", title: item.title, artist: item.artist, duration: item.duration, durationUnit: "seconds", artwork: item.thumbnail ?? undefined,
    online: { provider: item.provider, sourceId: item.id, sourceUrl: item.url, downloadable: item.downloadable } };
  return tracks.find((track) => sameSource(track, candidate)) ?? candidate;
}
export function canPlay(track: Track) { return !!track.uri || !!track.online || !!track.origin; }
export function isOffline(track: Track) { return !!track.uri && !/^https?:/i.test(track.uri); }
export function downloadProgress(
  job: Pick<DownloadJob, "bytes" | "total">,
): number | null {
  return job.total > 0 ? Math.min(1, Math.max(0, job.bytes / job.total)) : null;
}
