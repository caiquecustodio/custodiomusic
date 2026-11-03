import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { AudioStatus } from "expo-audio";
import type { MusicPlayer } from "./useMusicPlayer";

export function usePlaybackTools(player: MusicPlayer, status: AudioStatus, currentId: string | null, nativeQueue = false) {
  const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
  const [sleepAtEnd, setSleepAtEnd] = useState(false);
  const [range, setRange] = useState<{ id: string; a: number; b: number | null } | null>(null);
  const seeking = useRef(false);
  const loopRange = range?.id === currentId ? range : null;
  const cancelSleep = useCallback(() => { setSleepDeadline(null); setSleepAtEnd(false); }, []);
  const setSleep = (minutes: number | "end" | null) => {
    cancelSleep();
    if (minutes === "end") setSleepAtEnd(true);
    else if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) setSleepDeadline(Date.now() + minutes * 60000);
  };
  useEffect(() => {
    if (nativeQueue || !sleepDeadline) return;
    const check = () => {
      if (Date.now() >= sleepDeadline) { player.pause(); cancelSleep(); }
    };
    check();
    const interval = setInterval(check, 1000);
    const app = AppState.addEventListener("change", (next) => { if (next === "active") check(); });
    const playback = player.addListener("playbackStatusUpdate", () => { if (Date.now() >= sleepDeadline) check(); });
    return () => { clearInterval(interval); app.remove(); playback.remove(); };
  }, [sleepDeadline, player, cancelSleep, nativeQueue]);
  useEffect(() => {
    if (nativeQueue || !loopRange || loopRange.b === null) return;
    const subscription = player.addListener("playbackStatusUpdate", (event) => {
      if (!event.isLoaded || seeking.current || (sleepAtEnd && event.didJustFinish) || (!event.playing && !event.didJustFinish)) return;
      if (event.currentTime < loopRange.b! - 0.05 && !event.didJustFinish) return;
      seeking.current = true;
      void player.seekTo(loopRange.a).then(() => player.play()).catch(() => setRange(null)).finally(() => { seeking.current = false; });
    });
    return () => subscription.remove();
  }, [loopRange, player, sleepAtEnd, nativeQueue]);
  const clearRange = useCallback(() => setRange(null), []);
  return {
    sleepDeadline, sleepAtEnd, setSleep, cancelSleep, loopRange,
    markA: () => { if (currentId && status.isLoaded) setRange({ id: currentId, a: player.currentTime, b: null }); },
    markB: () => { if (loopRange && player.currentTime > loopRange.a + 0.5) setRange({ ...loopRange, b: player.currentTime }); },
    clearRange,
  };
}
