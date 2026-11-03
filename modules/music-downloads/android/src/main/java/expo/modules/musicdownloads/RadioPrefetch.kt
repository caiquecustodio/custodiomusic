package expo.modules.musicdownloads

import android.content.Context
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Shares completed audio with the playback resolver, independent of JS timers. */
internal class RadioPrefetch(context: Context, client: OkHttpClient) {
  private val store by lazy { RadioCacheStore(File(context.cacheDir, "radio-audio-v1")) }
  private val network = client.newBuilder().callTimeout(60, TimeUnit.SECONDS).build()
  private val executor = Executors.newSingleThreadExecutor { work -> Thread(work, "CustodioRadioCache").apply { isDaemon = true; priority = Thread.MIN_PRIORITY } }
  @Volatile private var generation = 0L
  @Volatile private var call: Call? = null
  val isPreparing get() = call != null
  private var plan = ""
  private var planAt = 0L
  private fun source(entry: JSONObject) = entry.optJSONObject("remote") ?: entry.optJSONObject("fallback")
  private fun key(entry: JSONObject) = source(entry)?.let { RadioCacheStore.key(it.getString("provider"), it.getString("sourceId")) }
  fun cached(entry: JSONObject): File? = key(entry)?.let { store.completed(it) }
  fun invalidate(entry: JSONObject) { key(entry)?.let { store.remove(it) } }
  @Synchronized fun stop() { generation++; plan = ""; call?.cancel(); call = null }
  @Synchronized fun prepare(current: JSONObject?, upcoming: List<JSONObject>) {
    if (upcoming.isEmpty()) { stop(); return }
    val signature = upcoming.joinToString("|") { key(it) ?: "" }
    if (signature == plan && System.currentTimeMillis() - planAt < 60000) return
    stop(); plan = signature; planAt = System.currentTimeMillis()
    val token = generation
    val protected = (listOfNotNull(current) + upcoming).mapNotNull(::key).toSet()
    executor.execute {
      for (entry in upcoming) {
        if (generation != token) break
        val info = source(entry) ?: continue
        try {
          if (cached(entry) != null) continue
          val choice = Providers.source(info.getString("provider")).stream(info.getString("sourceId")).second
          if (generation != token) break
          val request = Request.Builder().url(SafeHttp.checked(choice.content)).header("User-Agent", "CustodioMusic/1.0").build()
          val download = network.newCall(request)
          synchronized(this) { if (generation != token) return@execute; call = download }
          download.execute().use { response ->
            if (!response.isSuccessful || response.code == 206) throw java.io.IOException("Resposta de áudio incompleta")
            val body = requireNotNull(response.body)
            val type = body.contentType()?.toString().orEmpty()
            if (type.startsWith("text/") || type.contains("json")) throw java.io.IOException("A fonte não retornou áudio")
            body.byteStream().use { input -> store.write(key(entry)!!, input, body.contentLength(), { generation != token }, protected) }
          }
        } catch (_: Exception) { /* Preparation is optional; playback may still stream normally. */ }
        finally { synchronized(this) { if (generation == token) call = null } }
      }
    }
  }
  fun release() { stop(); executor.shutdownNow() }
}
