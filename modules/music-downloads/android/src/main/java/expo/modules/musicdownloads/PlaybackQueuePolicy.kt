package expo.modules.musicdownloads

internal object PlaybackQueuePolicy {
  fun effectiveRepeat(repeat: String, sleepAtEnd: Boolean, retiringCurrent: Boolean, count: Int): String =
    if (sleepAtEnd || (retiringCurrent && (repeat == "one" || count <= 1))) "off" else repeat
  /** Recovery may continue an online queue, but never cancel an explicit pause or sleep. */
  fun canContinue(continuous: Boolean, wantsPlay: Boolean, playWhenReady: Boolean, repeat: String, sleepAtEnd: Boolean): Boolean =
    continuous && wantsPlay && playWhenReady && !sleepAtEnd && repeat != "one" && repeat != "single"

  fun nextAvailable(orderedUpcoming: List<String>, failed: Set<String>): String? =
    orderedUpcoming.firstOrNull { it !in failed }

  /** Keep a removed, still playing item at its current cursor until it finishes. */
  fun retainCurrent(ids: List<String>, current: String?, position: Int): List<String> {
    val unique = ids.distinct().toMutableList()
    if (current != null && current !in unique) unique.add(position.coerceIn(0, unique.size), current)
    return unique
  }
}
