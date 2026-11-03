export function nextTrackId(
  queue: string[],
  currentId: string | null,
  options: {
    automatic: boolean;
    repeat: "off" | "all" | "one" | "single";
    shuffle: boolean;
    played: Set<string>;
  },
): string | null {
  if (!queue.length) return null;
  if (options.automatic && options.repeat === "single") return null;
  if (options.automatic && options.repeat === "one") return currentId;
  if (options.shuffle) {
    let candidates = queue.filter((id) => id !== currentId && !options.played.has(id));
    if (!candidates.length) {
      if (options.automatic && options.repeat !== "all") return null;
      options.played.clear();
      if (currentId) options.played.add(currentId);
      candidates = queue.filter((id) => id !== currentId);
    }
    return candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : queue[0];
  }
  const next = queue.indexOf(currentId ?? "") + 1;
  if (next < queue.length) return queue[next];
  return !options.automatic || options.repeat === "all" ? queue[0] : null;
}
