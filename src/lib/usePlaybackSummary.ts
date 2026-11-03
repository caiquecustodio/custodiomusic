import { useEffect, useState } from "react";
import type { MusicPlayer } from "./useMusicPlayer";
import { subscribePlayback } from "./useMusicPlayer";
import { samePlaybackSummary } from "./playback-summary";

// Position ticks belong to the visible player, never to the entire library context.
export function usePlaybackSummary(player: MusicPlayer, foregroundOnly = false) {
  const [status, setStatus] = useState(() => player.currentStatus);
  useEffect(() => {
    let previous = player.currentStatus;
    return subscribePlayback(player, (next) => {
      if (samePlaybackSummary(previous, next)) return;
      previous = next;
      setStatus(next);
    }, foregroundOnly);
  }, [player, foregroundOnly]);
  return status;
}
