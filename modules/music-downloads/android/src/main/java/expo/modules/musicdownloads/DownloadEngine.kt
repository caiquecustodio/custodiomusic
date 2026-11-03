package expo.modules.musicdownloads

import android.content.Context
import android.content.Intent
import android.net.Uri
import okhttp3.Call
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InterruptedIOException
import java.security.MessageDigest

internal class DownloadEngine private constructor(val context: Context) {
  companion object {
    const val CHANGED = "com.custodio.music.DOWNLOADS_CHANGED"
    @Volatile private var instance: DownloadEngine? = null
    fun get(context: Context): DownloadEngine = instance ?: synchronized(this) {
      instance ?: DownloadEngine(context.applicationContext).also { instance = it }
    }
    fun key(provider: String, id: String, format: String): String = MessageDigest.getInstance("SHA-256")
      .digest("$provider:$id:$format".toByteArray()).joinToString("") { "%02x".format(it) }
  }
  val dao = DownloadsDb.get(context).entries()
  private val lock = Any()
  private val folder = File(context.filesDir, "music-downloads").apply { mkdirs() }
  @Volatile var activeId: String? = null
    private set
  @Volatile private var cancelled: String? = null
  @Volatile private var call: Call? = null
  init { dao.recover() }
  fun interrupt() { call?.cancel() }
  fun changed() { context.sendBroadcast(Intent(CHANGED).setPackage(context.packageName)) }
  fun json(entry: DownloadsDb.Entry): JSONObject {
    val payload = JSONObject(entry.payload)
    return JSONObject().put("id", entry.id).put("item", payload.getJSONObject("item"))
      .put("format", payload.getJSONObject("format")).put("state", entry.state)
      .put("bytes", entry.done).put("total", entry.total).put("created", entry.created)
      .put("uri", entry.uri ?: JSONObject.NULL).put("artwork", entry.artwork ?: JSONObject.NULL)
      .put("duration", entry.duration).put("error", entry.error ?: JSONObject.NULL)
  }
  fun list(): JSONArray = JSONArray(dao.all().map(::json))
  fun enqueue(provider: String, trackId: String, formatId: String): JSONObject {
    val resolved = Providers.prepared(provider, trackId)
    val format = resolved.formats.firstOrNull { it.id == formatId } ?: error("Formato indisponível. Consulte a faixa novamente.")
    val id = key(provider, trackId, format.id)
    synchronized(lock) {
      val previous = dao.find(id)
      if (previous != null && previous.state !in setOf("failed", "cancelled", "interrupted")) {
        if (previous.state != "completed" || previous.uri?.let { File(Uri.parse(it).path ?: "").isFile } == true) return json(previous)
      }
      val entry = previous ?: DownloadsDb.Entry().also { it.id = id }
      entry.payload = JSONObject().put("item", resolved.item).put("format", format.publicJson()).toString()
      entry.state = "queued"; entry.error = null; entry.uri = null
      entry.created = System.currentTimeMillis()
      dao.save(entry); changed()
      return json(entry)
    }
  }
  fun retry(id: String) = synchronized(lock) {
    val entry = dao.find(id) ?: error("Download não encontrado.")
    require(entry.state in setOf("failed", "cancelled", "interrupted")) { "Download já está na fila." }
    entry.state = "queued"; entry.error = null; entry.created = System.currentTimeMillis()
    dao.save(entry); changed()
  }
  fun cancel(id: String) = synchronized(lock) {
    val entry = dao.find(id) ?: return@synchronized
    if (entry.state in setOf("completed", "cancelled")) return@synchronized
    if (activeId == id) { cancelled = id; call?.cancel() }
    dao.state(id, "cancelled", null)
    if (activeId != id) clearParts(id)
    changed()
  }
  private fun clearParts(id: String) { folder.listFiles()?.filter { it.name.startsWith("$id.") && !it.name.endsWith(".jpg") }?.forEach { it.delete() } }
  private fun check(entry: DownloadsDb.Entry) { if (cancelled == entry.id || Thread.currentThread().isInterrupted) throw InterruptedIOException("Download cancelado.") }
  private fun save(entry: DownloadsDb.Entry) = synchronized(lock) { check(entry); dao.save(entry); changed() }
  fun runNext(progress: (DownloadsDb.Entry) -> Unit): Boolean {
    val entry = dao.next() ?: return false
    activeId = entry.id; cancelled = null
    var published: File? = null
    try {
      entry.state = "resolving"; entry.error = null; save(entry); progress(entry)
      val payload = JSONObject(entry.payload)
      val item = payload.getJSONObject("item")
      val resolved = Providers.source(item.getString("provider")).resolve(item.getString("id"))
      val choice = resolved.formats.firstOrNull { it.id == payload.getJSONObject("format").getString("id") }
        ?: error("O formato mudou na fonte. Consulte a faixa novamente.")
      val urls = DashSegments.urls(choice, resolved.item.optLong("duration"))
      require(urls.isNotEmpty())
      val raw = File(folder, "${entry.id}.raw")
      entry.state = "downloading"; save(entry)
      if (urls.size == 1) {
        transfer(urls[0], raw, entry, true) { progress(entry) }
      } else {
        // A renewed signed manifest cannot prove segment identity. Restart safely.
        raw.delete(); entry.done = 0; entry.total = 0; entry.validator = null; save(entry)
        urls.forEach { url ->
          check(entry)
          val segment = File(folder, "${entry.id}.segment")
          segment.delete()
          transfer(url, segment, entry, false) { progress(entry) }
          FileOutputStream(raw, true).use { output -> segment.inputStream().use { it.copyTo(output) } }
          segment.delete()
        }
      }
      check(entry)
      entry.state = "processing"; save(entry); progress(entry)
      require(folder.usableSpace > (if (choice.extension == "m4a") raw.length() else 0L) + 8*1024*1024) { "Espaço insuficiente para finalizar o áudio." }
      val finished = File(folder, "${entry.id}.${choice.extension}")
      finished.delete(); published = finished
      entry.duration = MediaFiles.finish(raw, finished, choice.extension)
      val expected = resolved.item.optLong("duration")
      require(expected <= 0 || entry.duration + maxOf(2.0, expected * 0.01) >= expected) { "A fonte enviou áudio incompleto." }
      check(entry)
      entry.artwork = cacheCover(entry.id, resolved.item.optString("thumbnail"))
      synchronized(lock) {
        check(entry)
        entry.uri = Uri.fromFile(finished).toString()
        entry.payload = JSONObject().put("item", resolved.item).put("format", choice.publicJson()).toString()
        entry.state = "completed"; entry.done = finished.length(); entry.total = entry.done
        dao.save(entry); changed()
      }
      raw.delete(); progress(entry)
    } catch (error: Exception) {
      published?.delete()
      val wasCancelled = cancelled == entry.id
      entry.state = if (wasCancelled) "cancelled" else "failed"
      entry.uri = null
      entry.error = if (wasCancelled) null else safeMessage(error)
      synchronized(lock) { dao.save(entry); changed() }
      if (wasCancelled || error is IllegalArgumentException) clearParts(entry.id)
      progress(entry)
    } finally { activeId = null; call = null; cancelled = null }
    return true
  }
  private fun safeMessage(error: Exception): String {
    // Never return signed URLs, request bodies or underlying decoder paths to the UI/log.
    val message = error.message ?: ""
    return if (error is IllegalArgumentException || error is IllegalStateException) message.take(200).takeUnless { it.contains("http", true) || it.contains('/') } ?: "A fonte não disponibilizou áudio compatível."
      else "A transferência foi interrompida ou a fonte está indisponível. Tente novamente."
  }
  private fun transfer(url: String, file: File, entry: DownloadsDb.Entry, resumable: Boolean, progress: () -> Unit) {
    check(entry)
    var offset = if (resumable && entry.validator != null) file.length() else 0L
    if (offset == 0L) file.delete()
    val request = Request.Builder().url(SafeHttp.checked(url)).header("User-Agent", "CustodioMusic/1.0")
    if (offset > 0) request.header("Range", "bytes=$offset-").header("If-Range", requireNotNull(entry.validator))
    SafeHttp.open(request.build()) { call = it }.use { response ->
      check(entry)
      require(response.isSuccessful) { "Resposta inválida da fonte (${response.code})." }
      val type = response.header("Content-Type", "")!!.substringBefore(';').lowercase()
      require(type.startsWith("audio/") || type in setOf("video/webm", "video/mp4", "application/octet-stream", "binary/octet-stream")) { "A fonte não retornou um arquivo de áudio." }
      val validator = response.header("ETag")?.takeUnless { it.startsWith("W/") } ?: response.header("Last-Modified")
      if (resumable && response.code == 206) {
        val range = Regex("bytes ([0-9]+)-([0-9]+)/([0-9]+)").matchEntire(response.header("Content-Range", "")!!)
        require(offset > 0) { "A fonte enviou uma resposta parcial inesperada." }
        if (range == null || range.groupValues[1].toLong() != offset || validator != entry.validator) {
          response.close(); file.delete(); entry.validator = null
          transfer(url, file, entry, resumable, progress)
          return
        }
      } else { offset = 0; file.delete() }
      val body = requireNotNull(response.body)
      val length = body.contentLength()
      require(length <= SafeHttp.MAX_FILE && offset + length.coerceAtLeast(0) <= SafeHttp.MAX_FILE) { "Arquivo excede o limite de 512 MB." }
      require(folder.usableSpace > length.coerceAtLeast(16*1024*1024) + 8*1024*1024) { "Espaço insuficiente no dispositivo." }
      if (resumable) { entry.done = offset; entry.total = if (length > 0) offset + length else 0; entry.validator = validator }
      var received = 0L; var last = 0L
      body.byteStream().use { input -> FileOutputStream(file, offset > 0).use { output ->
        val buffer = ByteArray(64*1024)
        while (true) {
          check(entry)
          val count = input.read(buffer); if (count < 0) break
          received += count
          require(entry.done + count <= SafeHttp.MAX_FILE) { "Arquivo excede o limite de 512 MB." }
          if (folder.usableSpace < 8*1024*1024) error("Espaço insuficiente no dispositivo.")
          output.write(buffer, 0, count); entry.done += count
          val now = System.currentTimeMillis()
          if (now-last > 500) { save(entry); progress(); last = now }
        }
        output.fd.sync()
      } }
      if (length >= 0 && received != length) throw IOException("Transferência incompleta.")
      require(received > 0)
      save(entry); progress()
    }
  }
  private fun cacheCover(id: String, url: String): String? = runCatching {
    val target = File(folder, "$id.jpg")
    require(url.isNotEmpty() && url != "null")
    SafeHttp.open(Request.Builder().url(SafeHttp.checked(url)).build()) { call = it }.use { response ->
      require(response.isSuccessful)
      val body = requireNotNull(response.body)
      require(body.contentLength() <= 8*1024*1024)
      val bytes = body.byteStream().use { input ->
        val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
        while (true) { val n = input.read(buffer); if (n < 0) break; require(output.size()+n <= 8*1024*1024); output.write(buffer,0,n) }
        output.toByteArray()
      }
      require(MediaFiles.cover(bytes,target))
    }
    Uri.fromFile(target).toString()
  }.getOrNull()
}
