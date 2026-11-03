type PlaybackSummary = {
  id: string; isLoaded: boolean; playing: boolean; duration: number;
  didJustFinish: boolean; isBuffering: boolean; error?: string | null;
};
export function samePlaybackSummary(a: PlaybackSummary, b: PlaybackSummary) {
  return a.id === b.id && a.isLoaded === b.isLoaded && a.playing === b.playing &&
    a.duration === b.duration && a.didJustFinish === b.didJustFinish &&
    a.isBuffering === b.isBuffering && a.error === b.error;
}
