export function normalizeDuration(
  value: unknown,
  unit: "seconds" | "milliseconds",
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return 0;
  return unit === "milliseconds" ? value / 1000 : value;
}
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—:—";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
export function formatPosition(seconds: number): string {
  return seconds > 0 ? formatDuration(seconds) : "0:00";
}

export function restoreDuration<
  T extends { duration: number; durationUnit?: "seconds" },
>(track: T): T & { durationUnit: "seconds" } {
  return {
    ...track,
    duration:
      track.durationUnit === "seconds"
        ? normalizeDuration(track.duration, "seconds")
        : 0,
    durationUnit: "seconds",
  };
}
