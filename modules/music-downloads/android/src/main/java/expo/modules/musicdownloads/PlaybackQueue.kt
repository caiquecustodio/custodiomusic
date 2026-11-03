package expo.modules.musicdownloads

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.source.ShuffleOrder
import expo.modules.audio.AudioPlaylist
import expo.modules.audio.Metadata
import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.URL

/** One Expo playlist / ExoPlayer. No JS callback is needed to start the next track. */
@UnstableApi
internal class PlaybackQueue(
  private val context: Context,
  private val client: OkHttpClient,
  private val observer: ListeningObserver,
  private val emit: (String, Map<String, Any?>) -> Unit,
) {
  private val prefetch = RadioPrefetch(context.applicationContext, client)
  private var bufferingSince = 0L
  private val handler = Handler(Looper.getMainLooper())
  private var audio: AudioPlaylist? = null
  private var entries = linkedMapOf<String, JSONObject>()
  private var options = JSONObject()
  @Volatile private var request = 0L
  @Volatile private var wantsPlay = false
  private var configuring = false
  private var retryId: String? = null
  private val failedTracks = mutableSetOf<String>()
  private var startedAt = 0L
  private var firstAudioLogged = false
  private var priority: String? = null
  private var lastShuffle = false
  private var announcedId: String? = null
  private var lastCheckpoint = 0L
  private var transitionReason = Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED
  private var retiringId: String? = null
  private data class Stream(val uri: Uri, val at: Long)
  private val streams = linkedMapOf<String, Stream>()

  fun intent(token: Long, playing: Boolean) { request = token; wantsPlay = playing }
  private fun listeningEnabled() = context.getSharedPreferences("listening", Context.MODE_PRIVATE).getBoolean("enabled", true)
  private fun metadata(entry: JSONObject) = Metadata(
    entry.optString("title"), entry.optString("artist"), entry.optString("album").takeIf { it.isNotEmpty() },
    runCatching { URL(entry.getString("artwork")) }.getOrNull(),
  )
  private fun currentEntry() = audio?.player?.currentMediaItem?.mediaId?.let(entries::get)

  fun refreshListening() {
    val a = audio ?: return
    val entry = currentEntry() ?: return
    if (listeningEnabled()) observer.attach(a, entry.toString()) else observer.detach()
  }

  private fun announce(reason: Int, force: Boolean = false) {
    if (configuring) return
    val a = audio ?: return
    val entry = currentEntry() ?: return
    a.updateLockScreenMetadata(metadata(entry))
    refreshListening()
    if (!force && announcedId == entry.getString("id")) return
    announcedId = entry.getString("id")
    retryId = null
    checkpoint()
    emit("onPlaybackTrackChanged", mapOf("id" to entry.getString("id"), "request" to request, "reason" to reason, "streaming" to isRemote(entry)))
  }

  private val listener = object : Player.Listener {
    override fun onMediaItemTransition(item: MediaItem?, reason: Int) { transitionReason = reason }
    override fun onEvents(player: Player, events: Player.Events) {
      // Observe after discontinuity callbacks checkpoint the outgoing track's history.
      if (events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION)) {
        val retired = retiringId
        if (!configuring && retired != null && player.currentMediaItem?.mediaId != retired) {
          retiringId = null
          val index = (0 until player.mediaItemCount).firstOrNull { player.getMediaItemAt(it).mediaId == retired }
          if (index != null) player.removeMediaItem(index)
          entries.remove(retired)
          applyOptions()
        }
        announce(transitionReason)
      }
    }
    override fun onIsPlayingChanged(playing: Boolean) {
      if (!playing) prefetch.stop() else {
        audio?.player?.currentMediaItem?.mediaId?.let { failedTracks.remove(it) }
        prepareUpcoming()
      }
      if (playing && !firstAudioLogged) {
        firstAudioLogged = true
        Log.d("CustodioPlayback", "ready request=$request elapsedMs=${SystemClock.elapsedRealtime() - startedAt}")
      }
      checkpoint()
      schedule()
    }
    override fun onPlaybackStateChanged(state: Int) {
      val a = audio ?: return
      val entry = currentEntry() ?: return
      if (state == Player.STATE_BUFFERING) { if (bufferingSince == 0L) bufferingSince = SystemClock.elapsedRealtime(); prefetch.stop() } else bufferingSince = 0L
      schedule()
      if (state == Player.STATE_ENDED) resumeEndedQueue()
      if (state == Player.STATE_READY && a.duration > 0) emit("onPlaybackDuration", mapOf("id" to entry.getString("id"), "duration" to a.duration, "request" to request))
    }
    override fun onPlayWhenReadyChanged(ready: Boolean, reason: Int) {
      if (!ready && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM && options.optBoolean("sleepAtEnd")) {
        options.put("sleepAtEnd", false)
        applyOptions()
        emit("onPlaybackSleepEnded", emptyMap())
      }
    }
    override fun onPlayerError(error: PlaybackException) {
      val a = audio ?: return
      val entry = currentEntry() ?: return
      val id = entry.getString("id")
      // A URL may expire while queued. Resolve it again once, on ExoPlayer's IO thread.
      if (isRemote(entry) && retryId != id) {
        retryId = id
        runCatching { prefetch.invalidate(entry) }
        synchronized(streams) { streams.remove(id) }
        if (!wantsPlay) a.pause()
        a.player.prepare()
      } else {
        val local = entries.values.firstOrNull { candidate ->
          val uri = Uri.parse(candidate.optString("uri"))
          candidate.getString("id") != id && ((!isRemote(candidate) && (uri.scheme == "content" || (uri.scheme == "file" && File(uri.path ?: "").exists()))) || runCatching { prefetch.cached(candidate) != null }.getOrDefault(false))
        }
        if (isRemote(entry) && options.optBoolean("radio") && local != null && a.player.playWhenReady && wantsPlay) {
          a.player.seekTo(entries.keys.indexOf(local.getString("id")), 0)
          a.player.prepare()
          a.requestPlay()
          return
        }
        if (isRemote(entry) && canContinue()) {
          failedTracks.add(id)
          if (continueToNext()) return
        }
        emit("onPlaybackQueueError", mapOf("id" to id, "request" to request, "message" to "Não foi possível carregar esta faixa. Tente novamente ou escolha outra música."))
      }
    }
  }

  private fun isRemote(entry: JSONObject): Boolean {
    if (entry.optJSONObject("remote") != null) return true
    val uri = Uri.parse(entry.optString("uri"))
    return uri.scheme == "file" && !File(uri.path ?: "").exists() && entry.optJSONObject("fallback") != null
  }

  private fun resolved(entry: JSONObject): Uri {
    val original = Uri.parse(entry.optString("uri"))
    if (!isRemote(entry)) return original
    runCatching { prefetch.cached(entry) }.getOrNull()?.let { return Uri.fromFile(it) }
    val id = entry.getString("id")
    synchronized(streams) {
      streams[id]?.takeIf { SystemClock.elapsedRealtime() - it.at < 180000 }?.let { return it.uri }
    }
    val source = entry.optJSONObject("remote") ?: entry.getJSONObject("fallback")
    val choice = Providers.source(source.getString("provider")).stream(source.getString("sourceId")).second
    val uri = Uri.parse(SafeHttp.checked(choice.content).toString())
    synchronized(streams) {
      streams.remove(id)
      streams[id] = Stream(uri, SystemClock.elapsedRealtime())
      while (streams.size > 3) streams.remove(streams.keys.first())
    }
    return uri
  }

  private fun source(entry: JSONObject): ProgressiveMediaSource {
    val id = entry.getString("id")
    // The resolver runs on the loader thread, including for future tracks while JS sleeps.
    val factory = ResolvingDataSource.Factory(
      DefaultDataSource.Factory(context, OkHttpDataSource.Factory(client).setUserAgent("CustodioMusic/1.0")),
      ResolvingDataSource.Resolver { spec ->
        try { spec.withUri(resolved(entry)) } catch (error: Exception) { throw IOException("Fonte de áudio indisponível", error) }
      },
    )
    val item = MediaItem.Builder().setMediaId(id).setUri("custodio://queue/${Uri.encode(id)}")
      .setMediaMetadata(MediaMetadata.Builder().setTitle(entry.optString("title")).setArtist(entry.optString("artist"))
        .setAlbumTitle(entry.optString("album")).setArtworkUri(entry.optString("artwork").takeIf { it.isNotEmpty() }?.let(Uri::parse)).build())
      .build()
    return ProgressiveMediaSource.Factory(factory).createMediaSource(item)
  }

  fun configure(a: AudioPlaylist, raw: String, startId: String, token: Long, rawOptions: String) {
    if (token != request) return
    if (audio !== a) {
      detach()
      audio = a
      a.player.addListener(listener)
      a.player.setWakeMode(C.WAKE_MODE_NETWORK)
    }
    val incoming = JSONArray(raw)
    val desired = (0 until incoming.length()).map(incoming::getJSONObject).associateByTo(linkedMapOf()) { it.getString("id") }
    val p = a.player
    val oldId = p.currentMediaItem?.mediaId
    retiringId = null
    // Removing the current row edits the upcoming queue; its audio finishes normally.
    if (startId.isEmpty() && oldId != null && oldId !in desired) {
      entries[oldId]?.let { entry ->
        retiringId = oldId
        val ordered = PlaybackQueuePolicy.retainCurrent(desired.keys.toList(), oldId, p.currentMediaItemIndex)
          .map { id -> if (id == oldId) entry else desired.getValue(id) }
        desired.clear(); ordered.forEach { desired[it.getString("id")] = it }
      }
    }
    val ended = p.playbackState == Player.STATE_ENDED
    configuring = true
    try {
      entries = desired
      options = JSONObject(rawOptions)
      // Reconcile by ID: moving/removing future rows never reloads the current source.
      desired.values.forEachIndexed { index, entry ->
        val id = entry.getString("id")
        val existing = (index until p.mediaItemCount).firstOrNull { p.getMediaItemAt(it).mediaId == id }
        if (existing == null) p.addMediaSource(index, source(entry))
        else if (existing != index) p.moveMediaItem(existing, index)
      }
      if (p.mediaItemCount > desired.size) p.removeMediaItems(desired.size, p.mediaItemCount)
      if (startId.isNotEmpty()) {
        failedTracks.clear()
        val index = desired.keys.indexOf(startId)
        require(index >= 0) { "Faixa indisponível na fila" }
        startedAt = SystemClock.elapsedRealtime(); firstAudioLogged = false
        observer.detach("skip")
        p.seekTo(index, 0)
        lastShuffle = false // A fresh selection starts a full shuffle cycle at that track.
        applyOptions()
        p.prepare()
        a.setActiveForLockScreen(true, metadata(desired.getValue(startId)), expo.modules.audio.AudioLockScreenOptions(false, false, true, true))
        if (wantsPlay && token == request) a.requestPlay()
      } else applyOptions()
    } finally { configuring = false }
    announce(Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED, startId.isNotEmpty())
    schedule()
    prepareUpcoming()
    if (startId.isEmpty() && ended) resumeEndedQueue()
  }

  private fun canContinue(): Boolean {
    val p = audio?.player ?: return false
    return PlaybackQueuePolicy.canContinue(options.optBoolean("online") || options.optBoolean("radio"),
      wantsPlay, p.playWhenReady, options.optString("repeat"), options.optBoolean("sleepAtEnd"))
  }

  private fun continueToNext(): Boolean {
    val a = audio ?: return false
    val p = a.player
    if (!canContinue() || p.mediaItemCount == 0) return false
    val order = mutableListOf<String>()
    val repeat = if (options.optString("repeat") == "all") Player.REPEAT_MODE_ALL else Player.REPEAT_MODE_OFF
    var cursor = p.currentTimeline.getNextWindowIndex(p.currentMediaItemIndex, repeat, p.shuffleModeEnabled)
    while (cursor != C.INDEX_UNSET && order.size < p.mediaItemCount) {
      val id = p.getMediaItemAt(cursor).mediaId
      if (id == p.currentMediaItem?.mediaId || id in order) break
      order.add(id)
      cursor = p.currentTimeline.getNextWindowIndex(cursor, repeat, p.shuffleModeEnabled)
    }
    val id = PlaybackQueuePolicy.nextAvailable(order, failedTracks) ?: return false
    val index = (0 until p.mediaItemCount).first { p.getMediaItemAt(it).mediaId == id }
    p.seekTo(index, 0)
    p.prepare()
    a.requestPlay()
    return true
  }

  private fun resumeEndedQueue() {
    val token = request
    // A short song can end before recommendations arrive. Reconcile the list first.
    handler.post {
      if (request == token && audio?.player?.playbackState == Player.STATE_ENDED) continueToNext()
    }
  }

  fun updateOptions(raw: String) { options = JSONObject(raw); applyOptions(); schedule(); prepareUpcoming() }
  private fun applyOptions() {
    val p = audio?.player ?: return
    val atEnd = options.optBoolean("sleepAtEnd")
    val repeat = PlaybackQueuePolicy.effectiveRepeat(options.optString("repeat"), atEnd, retiringId != null && retiringId == p.currentMediaItem?.mediaId, p.mediaItemCount)
    p.repeatMode = when (repeat) {
      "one" -> Player.REPEAT_MODE_ONE
      "all" -> Player.REPEAT_MODE_ALL
      else -> Player.REPEAT_MODE_OFF
    }
    p.pauseAtEndOfMediaItems = atEnd || options.optString("repeat") == "single"
    val shuffle = options.optBoolean("shuffle")
    p.shuffleModeEnabled = shuffle
    val requestedPriority = options.optString("priority").takeIf { it.isNotEmpty() && it != "null" }
    if (shuffle && ((requestedPriority != null && requestedPriority != priority) || !lastShuffle)) {
      val current = p.currentMediaItemIndex
      val next = (0 until p.mediaItemCount).firstOrNull { p.getMediaItemAt(it).mediaId == requestedPriority }
      val order = mutableListOf<Int>()
      if (lastShuffle) {
        var index = p.currentTimeline.getFirstWindowIndex(true)
        while (index != C.INDEX_UNSET && order.size < p.mediaItemCount) {
          order.add(index)
          index = p.currentTimeline.getNextWindowIndex(index, Player.REPEAT_MODE_OFF, true)
        }
      } else {
        if (current in 0 until p.mediaItemCount) order.add(current)
        order.addAll((0 until p.mediaItemCount).filter { it != current }.shuffled())
      }
      if (next != null && next != current) { order.remove(next); order.add(order.indexOf(current) + 1, next) }
      p.setShuffleOrder(ShuffleOrder.DefaultShuffleOrder(order.toIntArray(), System.nanoTime()))
    }
    priority = requestedPriority; lastShuffle = shuffle
  }

  fun skip(direction: Int, token: Long) {
    if (token != request) return
    val a = audio ?: return
    val p = a.player
    if (p.mediaItemCount == 0) return
    startedAt = SystemClock.elapsedRealtime(); firstAudioLogged = false
    val next = if (direction < 0) p.currentTimeline.getPreviousWindowIndex(p.currentMediaItemIndex, Player.REPEAT_MODE_ALL, p.shuffleModeEnabled)
      else p.currentTimeline.getNextWindowIndex(p.currentMediaItemIndex, Player.REPEAT_MODE_ALL, p.shuffleModeEnabled)
    p.seekTo(if (next != C.INDEX_UNSET) next else if (direction < 0) p.mediaItemCount - 1 else 0, 0)
    p.prepare()
    if (wantsPlay) a.requestPlay()
  }

  private val tick = object : Runnable {
    override fun run() {
      val a = audio ?: return
      val deadline = options.optLong("sleepDeadline", 0)
      if (deadline > 0 && System.currentTimeMillis() >= deadline) {
        wantsPlay = false; a.pause(); options.remove("sleepDeadline")
        emit("onPlaybackSleepEnded", emptyMap())
      }
      val range = options.optJSONObject("range")
      if (a.player.isPlaying && range != null && !range.isNull("b") && range.optString("id") == a.player.currentMediaItem?.mediaId && a.currentTime >= range.optDouble("b")) {
        a.seekTo(range.optDouble("a"))
      }
      if (options.optBoolean("radio") && wantsPlay && bufferingSince > 0 && SystemClock.elapsedRealtime() - bufferingSince > 12000) {
        val currentId = a.player.currentMediaItem?.mediaId
        val local = entries.values.firstOrNull { candidate ->
          candidate.optString("id") != currentId && (!isRemote(candidate) || runCatching { prefetch.cached(candidate) != null }.getOrDefault(false))
        }
        if (local != null) {
          bufferingSince = 0L
          a.player.seekTo(entries.keys.indexOf(local.getString("id")), 0)
          a.player.prepare()
          a.requestPlay()
          emit("onPlaybackCacheFallback", mapOf("message" to "Rede lenta. Continuando com uma música disponível no aparelho."))
        }
      }
      prepareUpcoming()
      if (SystemClock.elapsedRealtime() - lastCheckpoint >= 5000) checkpoint()
      schedule()
    }
  }
  private fun schedule() {
    handler.removeCallbacks(tick)
    val range = options.optJSONObject("range")
    val deadline = options.optLong("sleepDeadline", 0)
    if (range != null && !range.isNull("b") && audio?.player?.isPlaying == true) handler.postDelayed(tick, 100)
    else if (deadline > 0 || audio?.player?.isPlaying == true || (wantsPlay && audio?.player?.playbackState == Player.STATE_BUFFERING)) {
      val wait = if (deadline > 0) (deadline - System.currentTimeMillis()).coerceIn(1, 5000) else 5000
      handler.postDelayed(tick, wait)
    }
  }
  private fun prepareUpcoming() {
    val p = audio?.player ?: return
    if (!options.optBoolean("radio") || !options.optBoolean("radioPrefetch", true) || !wantsPlay || !p.isPlaying || options.optBoolean("sleepAtEnd") || options.optString("repeat") in listOf("one", "single")) { prefetch.stop(); return }
    val current = currentEntry() ?: return
    // Protect the current stream: fetch ahead only after a healthy buffer exists.
    val bufferFloor = if (prefetch.isPreparing) 15000 else 30000
    if (isRemote(current) && runCatching { prefetch.cached(current) == null }.getOrDefault(true) && p.totalBufferedDuration < bufferFloor) { prefetch.stop(); return }
    val next = mutableListOf<JSONObject>()
    var index = p.currentTimeline.getNextWindowIndex(p.currentMediaItemIndex, Player.REPEAT_MODE_OFF, p.shuffleModeEnabled)
    while (index != C.INDEX_UNSET && next.size < 2) {
      val entry = entries[p.getMediaItemAt(index).mediaId]
      if (entry != null && isRemote(entry)) next.add(JSONObject(entry.toString()))
      index = p.currentTimeline.getNextWindowIndex(index, Player.REPEAT_MODE_OFF, p.shuffleModeEnabled)
    }
    prefetch.prepare(JSONObject(current.toString()), next)
  }
  fun release() { detach(); prefetch.release() }
  fun synchronize() { announce(Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED, true) }
  private fun checkpoint() {
    val a = audio ?: return
    val id = a.player.currentMediaItem?.mediaId ?: return
    context.getSharedPreferences("playback-session", Context.MODE_PRIVATE).edit()
      .putString("trackId", id).putFloat("position", a.currentTime.toFloat()).apply()
    lastCheckpoint = SystemClock.elapsedRealtime()
  }
  fun savedSession(): String? {
    val saved = context.getSharedPreferences("playback-session", Context.MODE_PRIVATE)
    val id = saved.getString("trackId", null) ?: return null
    return JSONObject().put("trackId", id).put("position", saved.getFloat("position", 0f).toDouble()).toString()
  }
  fun detach() {
    prefetch.stop()
    bufferingSince = 0L
    handler.removeCallbacks(tick)
    runCatching { checkpoint(); audio?.player?.removeListener(listener) }
    audio = null; entries.clear(); observer.detach()
    synchronized(streams) { streams.clear() }
    priority = null; lastShuffle = false
    announcedId = null
    retiringId = null
    failedTracks.clear()
  }
}
