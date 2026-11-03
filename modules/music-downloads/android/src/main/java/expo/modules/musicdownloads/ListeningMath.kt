package expo.modules.musicdownloads

internal object ListeningMath {
  fun elapsed(previous: Long, position: Long, wallSeconds: Double, wasPlaying: Boolean, speed: Float): Double {
    val progress = (position - previous) / 1000.0
    if (!wasPlaying || wallSeconds <= 0 || wallSeconds > 3 || speed <= 0 || progress < 0 || progress > wallSeconds * speed + 0.75) return 0.0
    return minOf(wallSeconds, progress / speed)
  }
  fun qualifies(seconds: Double, duration: Double) = seconds >= if (duration > 0) minOf(30.0, duration / 2) else 30.0
}
