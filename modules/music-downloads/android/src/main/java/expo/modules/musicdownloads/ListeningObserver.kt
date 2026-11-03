package expo.modules.musicdownloads

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import expo.modules.audio.AudioPlaylist
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ExecutorService

/** Observes the real native player while JS sleeps. No PCM processing or UI tick events. */
@UnstableApi
internal class ListeningObserver(private val store: ListeningStore, private val io: ExecutorService, private val onError: (String) -> Unit) {
  private val handler = Handler(Looper.getMainLooper())
  private var player: Player? = null
  private var track = JSONObject()
  private var id = ""
  private var started = 0L
  private var seconds = 0.0
  private var last = 0L
  private var lastPosition = 0L
  private var wasPlaying = false
  private var savedAt = 0.0
  private var day = ""
  private var qualified = false
  private var terminal: String? = null
  private fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
  private fun save(reason: String = "playing") {
    if (id.isEmpty() || seconds <= 0) return
    if (reason in listOf("completed", "error")) terminal = reason
    val key = id; val metadata = track; val start = started; val amount = seconds; val date = day; val counted = qualified
    val ending = terminal ?: (if (reason == "skip" && qualified) "changed" else reason)
    io.execute { try { store.checkpoint(key, metadata, start, amount, counted, ending, date) } catch (_: Exception) { onError("Não foi possível gravar o histórico local.") } }
    savedAt = seconds
  }
  private fun sample(positionOverride: Long? = null) {
    val p = player ?: return
    val now = SystemClock.elapsedRealtime(); val position = positionOverride ?: p.currentPosition
    if (today() != day) { save(); day = today() }
    val elapsed = (now - last).coerceAtLeast(0) / 1000.0
    if (terminal == null) seconds += ListeningMath.elapsed(lastPosition, position, elapsed, wasPlaying, p.playbackParameters.speed)
    val duration = if (p.duration > 0) p.duration / 1000.0 else track.optDouble("duration", 0.0)
    qualified = qualified || ListeningMath.qualifies(seconds, duration)
    last = now; lastPosition = position; wasPlaying = p.isPlaying
    if (seconds - savedAt >= 10) save()
  }
  private val tick = object : Runnable {
    override fun run() { sample(); if (player?.isPlaying == true) handler.postDelayed(this, 1000) }
  }
  private val listener = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) { if (isPlaying && terminal == "error") newSession(); sample(); handler.removeCallbacks(tick); if (isPlaying) handler.postDelayed(tick, 1000) else save() }
    override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
      sample(oldPosition.positionMs)
      if (terminal != null && reason == Player.DISCONTINUITY_REASON_SEEK) newSession()
      lastPosition = newPosition.positionMs; last = SystemClock.elapsedRealtime()
      if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) { save("completed"); newSession() }
    }
    override fun onPlaybackStateChanged(playbackState: Int) { if (playbackState == Player.STATE_ENDED) { sample(); save("completed") } }
    override fun onPlayerError(error: androidx.media3.common.PlaybackException) { sample(); save("error") }
  }
  private fun newSession() { id = UUID.randomUUID().toString(); started = System.currentTimeMillis(); seconds = 0.0; savedAt = 0.0; qualified = false; terminal = null; day = today(); last = SystemClock.elapsedRealtime(); lastPosition = player?.currentPosition ?: 0; wasPlaying = player?.isPlaying == true }
  fun attach(audio: AudioPlaylist, metadata: String, restart: Boolean = false) {
    val parsed = JSONObject(metadata)
    if (!restart && player === audio.player && track.optString("id") == parsed.optString("id") && id.isNotEmpty()) return
    detach("skip")
    player = audio.player; track = parsed; newSession(); player?.addListener(listener)
    if (player?.isPlaying == true) handler.postDelayed(tick, 1000)
  }
  fun flush() { sample(); save() }
  fun detach(reason: String = "closed") { sample(); save(reason); player?.removeListener(listener); handler.removeCallbacks(tick); player = null; id = "" }
}
