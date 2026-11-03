import { startTransition, useEffect, useState } from "react";
import { genreKey } from "./discovery-metadata";
import { groupNames } from "./organization-model";
import { scheduleIdle } from "./idle";
import type { PersonalGenre, Track } from "./types";

/** Build the optional search text in bounded idle slices, outside the input render. */
export function useTrackSearchIndex(tracks: Track[], personalGenres?: PersonalGenre[]) {
  const [index, setIndex] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    let alive = true;
    let cursor = 0;
    const result = new Map<string, string>();
    let cancel: () => void = () => undefined;
    const batch = () => {
      if (!alive) return;
      const end = Math.min(cursor + 32, tracks.length);
      for (; cursor < end; cursor++) {
        const track = tracks[cursor];
        result.set(track.id, `${track.title} ${track.artist} ${groupNames(track, "genre", personalGenres).map((genre) => `${genre} ${genreKey(genre)}`).join(" ")} ${track.discovery?.year ?? ""}`.toLocaleLowerCase("pt-BR"));
      }
      if (cursor < tracks.length) cancel = scheduleIdle(batch, 100);
      else startTransition(() => { if (alive) setIndex(result); });
    };
    cancel = scheduleIdle(batch, 100);
    return () => { alive = false; cancel(); };
  }, [tracks, personalGenres]);
  return index;
}
