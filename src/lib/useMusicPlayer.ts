import { useAudioPlaylist, type AudioPlaylistStatus, type AudioStatus } from "expo-audio";
import { useMemo } from "react";
import { AppState } from "react-native";

// Keep the app-facing controls stable while the single native engine owns its queue.
function statusOf(status: AudioPlaylistStatus): AudioStatus {
  const error = (status as AudioPlaylistStatus & { error?: { message?: string } | string }).error;
  return {
    ...status,
    playbackState: status.isBuffering ? "buffering" : status.isLoaded ? "ready" : "idle",
    timeControlStatus: status.playing ? "playing" : "paused",
    reasonForWaitingToPlay: "",
    mute: status.muted,
    loop: status.loop === "single",
    shouldCorrectPitch: true,
    isLive: false,
    currentOffsetFromLive: null,
    error: typeof error === "string" ? error : error?.message ?? null,
  };
}

export function useMusicPlayer() {
  const native = useAudioPlaylist({ updateInterval: 250 });
  return useMemo(() => ({
    native,
    get currentStatus() { return statusOf(native.currentStatus); },
    get currentTime() { return native.currentTime; },
    get isLoaded() { return native.isLoaded; },
    get playing() { return native.playing; },
    get loop() { return native.loop === "single"; },
    set loop(value: boolean) { native.loop = value ? "single" : "none"; },
    play: () => native.play(),
    pause: () => native.pause(),
    seekTo: (seconds: number) => native.seekTo(seconds),
    replace: (uri: string) => { native.clear(); native.add(uri); },
    setActiveForLockScreen: native.setActiveForLockScreen.bind(native),
    updateLockScreenMetadata: native.updateLockScreenMetadata.bind(native),
    addListener: (_event: "playbackStatusUpdate", listener: (status: AudioStatus) => void) =>
      native.addListener("playlistStatusUpdate", (status) => listener(statusOf(status))),
  }), [native]);
}
export type MusicPlayer = ReturnType<typeof useMusicPlayer>;

export function subscribePlayback(player: MusicPlayer, listener: (status: AudioStatus) => void, foregroundOnly = false) {
  let subscription: { remove(): void } | undefined;
  const attach = () => { subscription = player.addListener("playbackStatusUpdate", listener); };
  if (!foregroundOnly || AppState.currentState === "active") attach();
  const app = foregroundOnly ? AppState.addEventListener("change", (state) => {
    subscription?.remove(); subscription = undefined;
    if (state === "active") { listener(player.currentStatus); attach(); }
  }) : undefined;
  return () => { subscription?.remove(); app?.remove(); };
}
