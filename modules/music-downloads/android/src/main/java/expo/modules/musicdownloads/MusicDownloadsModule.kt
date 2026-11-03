package expo.modules.musicdownloads

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.asCoroutineDispatcher
import expo.modules.kotlin.functions.Queues
import expo.modules.audio.AudioPlaylist
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import java.util.concurrent.Executors
import org.json.JSONObject

@UnstableApi
class MusicDownloadsModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private var registeredContext: Context? = null
  private var receiver: BroadcastReceiver? = null
  private var sharedText: String? = null
  private val historyIo = Executors.newSingleThreadExecutor()
  private val historyDispatcher = historyIo.asCoroutineDispatcher()
  private val listeningStore by lazy { ListeningStore(context.applicationContext) }
  private val preferencesStore by lazy { PreferencesStore(context.applicationContext) }
  private val observer by lazy { ListeningObserver(listeningStore, historyIo) { message -> sendEvent("onListeningError", mapOf("message" to message)) } }
  private val playback by lazy { PlaybackQueue(context.applicationContext, streamClient, observer) { name, body -> sendEvent(name, body) } }
  private val streamClient by lazy { SafeHttp.client.newBuilder().followRedirects(true).followSslRedirects(false).addNetworkInterceptor { chain ->
    SafeHttp.checked(chain.request().url.toString())
    chain.proceed(chain.request())
  }.build() }
  private fun capture(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.take(4096) ?: return
    sharedText = Regex("https://[^\\s]+", RegexOption.IGNORE_CASE).find(text)?.value
    intent.removeExtra(Intent.EXTRA_TEXT)
    sharedText?.let { sendEvent("onSharedLink", mapOf("url" to it)) }
  }
  private fun start() {
    if(Build.VERSION.SDK_INT >= 33) require(ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) { "Permita as notificações para acompanhar os downloads." }
    ContextCompat.startForegroundService(context, Intent(context, DownloadService::class.java))
  }
  override fun definition() = ModuleDefinition {
    Name("MusicDownloads")
    Events("onDownloadsChanged", "onSharedLink", "onListeningError", "onPlaybackTrackChanged", "onPlaybackSleepEnded", "onPlaybackQueueError", "onPlaybackDuration", "onPlaybackCacheFallback")
    Constants("playbackQueueVersion" to 1, "onlineCatalogVersion" to 1)
    OnCreate {
      receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) { sendEvent("onDownloadsChanged", emptyMap<String, Any>()) }
      }
      registeredContext = context
      ContextCompat.registerReceiver(context, receiver, IntentFilter(DownloadEngine.CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
    }
    OnDestroy { android.os.Handler(android.os.Looper.getMainLooper()).post { playback.release(); observer.detach(); historyIo.shutdown() }; receiver?.let { registeredContext?.unregisterReceiver(it) }; receiver = null; registeredContext = null }
    OnNewIntent { intent -> capture(intent) }
    AsyncFunction("getSharedLink") {
      capture(appContext.currentActivity?.intent)
      val result = sharedText
      sharedText = null
      result
    }
    AsyncFunction("sources") { Providers.states().toString() }
    AsyncFunction("catalogPopular") Coroutine { provider: String -> withContext(Dispatchers.IO) {
      val source = Providers.source(provider)
      org.json.JSONArray(if (source.available) source.popular() else emptyList()).toString()
    } }
    AsyncFunction("preferenceRead") Coroutine { key: String, legacy: String? -> withContext(historyDispatcher) { preferencesStore.read(key, legacy) } }
    AsyncFunction("preferenceWrite") Coroutine { key: String, value: String -> withContext(historyDispatcher) { preferencesStore.write(key, value) } }
    AsyncFunction("popular") Coroutine { -> withContext(Dispatchers.IO) { Providers.popular().toString() } }
    AsyncFunction("search") Coroutine { query: String, provider: String -> withContext(Dispatchers.IO) { Providers.search(query, provider).toString() } }
    AsyncFunction("resolve") Coroutine { provider: String, id: String -> withContext(Dispatchers.IO) { Providers.inspect(provider, id).publicJson().toString() } }
    AsyncFunction("stream") Coroutine { provider: String, id: String -> withContext(Dispatchers.IO) {
      val (item, choice) = Providers.source(provider).stream(id)
      JSONObject().put("item", item).put("uri", SafeHttp.checked(choice.content).toString()).put("mime", choice.mime).toString()
    } }
    Function("setPlaybackIntent") { token: Double, playing: Boolean -> playback.intent(token.toLong(), playing) }
    AsyncFunction("synchronizePlayback") { playback.synchronize() }.runOnQueue(Queues.MAIN)
    AsyncFunction("playbackSavedSession") { playback.savedSession() }
    AsyncFunction("configurePlaybackQueue") { player: AudioPlaylist, raw: String, startId: String, token: Double, options: String ->
      playback.configure(player, raw, startId, token.toLong(), options)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("playbackOptions") { raw: String -> playback.updateOptions(raw) }.runOnQueue(Queues.MAIN)
    AsyncFunction("skipPlaybackTrack") { direction: Int, token: Double -> playback.skip(direction, token.toLong()) }.runOnQueue(Queues.MAIN)
    AsyncFunction("setOnlineSource") { player: AudioPlaylist, uri: String, mime: String ->
      val source = ProgressiveMediaSource.Factory(OkHttpDataSource.Factory(streamClient).setUserAgent("CustodioMusic/1.0"))
        .createMediaSource(MediaItem.Builder().setUri(SafeHttp.checked(uri).toString()).setMimeType(mime).build())
      player.player.setMediaSource(source)
      player.player.prepare()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("observeListening") { player: AudioPlaylist, metadata: String, restart: Boolean ->
      if (context.getSharedPreferences("listening", Context.MODE_PRIVATE).getBoolean("enabled", true)) observer.attach(player, metadata, restart)
      else observer.detach()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("flushListening") { observer.flush() }.runOnQueue(Queues.MAIN)
    AsyncFunction("listeningEnabled") { enabled: Boolean ->
      context.getSharedPreferences("listening", Context.MODE_PRIVATE).edit().putBoolean("enabled", enabled).apply()
      if (!enabled) observer.detach()
      else playback.refreshListening()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("getListeningEnabled") { context.getSharedPreferences("listening", Context.MODE_PRIVATE).getBoolean("enabled", true) }
    AsyncFunction("fileHash") Coroutine { raw: String -> withContext(Dispatchers.IO) {
      val uri = android.net.Uri.parse(raw)
      require(uri.scheme in listOf("file", "content")) { "Escolha um arquivo local." }
      val digest = java.security.MessageDigest.getInstance("SHA-256")
      requireNotNull(context.contentResolver.openInputStream(uri)).use { input ->
        val buffer = ByteArray(65536)
        while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
      }
      digest.digest().joinToString("") { "%02x".format(it) }
    } }
    AsyncFunction("localInfo") Coroutine { raw: String -> withContext(Dispatchers.IO) {
      val uri = android.net.Uri.parse(raw); val result = mutableMapOf<String, String>()
      if (uri.scheme == "content" && uri.authority == "media") {
        val folderColumn = if (Build.VERSION.SDK_INT >= 29) "relative_path" else "_data"
        context.contentResolver.query(uri, arrayOf("title", "artist", "album", folderColumn), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            listOf("title", "artist", "album").forEach { key -> cursor.getString(cursor.getColumnIndexOrThrow(key))?.takeIf { it.isNotBlank() && it != "<unknown>" }?.let { result[key] = it } }
            cursor.getString(cursor.getColumnIndexOrThrow(folderColumn))?.let { result["folder"] = if (Build.VERSION.SDK_INT >= 29) it else it.substringBeforeLast('/') }
          }
        }
      } else if (uri.scheme == "file") { uri.path?.substringBeforeLast('/')?.let { result["folder"] = it } }
      result
    } }
    AsyncFunction("listeningSnapshot") Coroutine { includeEvents: Boolean -> withContext(historyDispatcher) { listeningStore.prune(); listeningStore.snapshot(includeEvents) } }
    AsyncFunction("clearListening") Coroutine { -> withContext(historyDispatcher) { listeningStore.clear() } }
    AsyncFunction("restoreListening") Coroutine { raw: String -> withContext(historyDispatcher) { listeningStore.restore(raw) } }
    AsyncFunction("resolveLink") Coroutine { raw: String -> withContext(Dispatchers.IO) {
      val (provider,id) = Providers.link(raw)
      JSONObject().put("item", Providers.source(provider).lookup(id)).put("formats", org.json.JSONArray()).toString()
    } }
    AsyncFunction("list") Coroutine { -> withContext(Dispatchers.IO) { DownloadEngine.get(context).list().toString() } }
    AsyncFunction("enqueue") Coroutine { provider: String, id: String, format: String -> withContext(Dispatchers.IO) {
      val result = DownloadEngine.get(context).enqueue(provider,id,format).toString()
      start()
      result
    } }
    AsyncFunction("cancel") Coroutine { id: String -> withContext(Dispatchers.IO) { DownloadEngine.get(context).cancel(id) } }
    AsyncFunction("retry") Coroutine { id: String -> withContext(Dispatchers.IO) { DownloadEngine.get(context).retry(id); start() } }
    AsyncFunction("resumeQueue") { start() }
  }
}
