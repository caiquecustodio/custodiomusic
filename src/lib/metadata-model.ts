export type LyricLine = { time: number; text: string };
export type LyricsMatch = {
  id: number; trackName: string; artistName: string; albumName: string;
  duration: number; instrumental: boolean; plainLyrics: string | null; syncedLyrics: string | null;
};
export type LyricsRecord = { plain: string; synced: string; instrumental: boolean; source: string };

export function lyricTimeline(lyrics: LyricsRecord | null, duration: number): {
  lines: LyricLine[]; mode: "synced" | "estimated" | "none";
} {
  if (!lyrics || lyrics.instrumental) return { lines: [], mode: "none" };
  // Real timestamps always take precedence, including LRC imported as plain text.
  const synced = parseLrc(lyrics.synced || lyrics.plain);
  if (synced.length) return { lines: synced, mode: "synced" };
  if (!Number.isFinite(duration) || duration <= 0) return { lines: [], mode: "none" };
  const paragraphs = (lyrics.plain || lyrics.synced).split(/\r?\n/)
    .map((line) => line.trim()).filter((line) => line && !/^\[[^\]]+\]$/.test(line));
  // Preserve authored lyric lines; split sentences when a file is one paragraph.
  const phrases = paragraphs.length === 1
    ? (paragraphs[0].match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? paragraphs).map((line) => line.trim()).filter(Boolean)
    : paragraphs;
  if (!phrases.length) return { lines: [], mode: "none" };
  const step = duration / phrases.length;
  return { lines: phrases.map((text, index) => ({ time: index * step, text })), mode: "estimated" };
}

export function parseLrc(source: string): LyricLine[] {
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  const lines: LyricLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g)];
    const text = raw.replace(/\[[^\]]*\]/g, "").replace(/<\d+:\d+(?:\.\d+)?>/g, "").trim();
    for (const stamp of stamps) lines.push({
      time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + Number(`0.${stamp[3] ?? "0"}`) + offset), text,
    });
  }
  return lines.sort((a, b) => a.time - b.time);
}
export function activeLyric(lines: LyricLine[], seconds: number) {
  let low = 0, high = lines.length - 1, found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lines[mid].time <= seconds) { found = mid; low = mid + 1; } else high = mid - 1;
  }
  return found;
}
export function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function searchIdentity(track: { title: string; artist: string; album?: string }) {
  let title = track.title.trim(), artist = track.artist.trim();
  artist = artist.replace(/\s*-\s*Topic$/i, "").trim();
  // YouTube titles often repeat the known artist before the actual song name.
  const credited = title.split(/\s+[-–—]\s+/);
  if (credited.length === 2 && artist && normalized(credited[0]) === normalized(artist)) title = credited[1];
  if (/^(arquivo|pasta) /i.test(artist)) artist = "";
  if (!artist) {
    const parts = title.split(/\s+[-–—]\s+/);
    if (parts.length === 2) [artist, title] = parts;
  }
  title = title.replace(/\s*[\[(](?:official\s*(?:music\s*)?(?:video|audio)|lyric(?:s)?(?: video)?|audio oficial|video oficial)[\])]\s*/gi, " ").trim();
  return { title, artist, album: track.album ?? "" };
}
export function rankLyrics(matches: LyricsMatch[], identity: ReturnType<typeof searchIdentity>, duration: number) {
  const score = (item: LyricsMatch) => {
    const exact = normalized(item.trackName) === normalized(identity.title);
    const artist = !!identity.artist && normalized(item.artistName) === normalized(identity.artist);
    const delta = duration > 0 ? Math.abs(item.duration - duration) : Infinity;
    const versionMatches = ["live", "remix", "acoustic", "instrumental", "karaoke", "ao vivo"].every(
      (version) => normalized(identity.title).includes(version) === normalized(item.trackName).includes(version),
    );
    const trusted = exact && artist && delta <= 3 && versionMatches;
    return { item, trusted, score: (exact ? 40 : 0) + (artist ? 35 : 0) + (delta <= 3 ? 20 : delta <= 8 ? 5 : 0) + (parseLrc(item.syncedLyrics ?? "").length ? 4 : 0) };
  };
  return matches.map(score).sort((a, b) => b.score - a.score);
}
