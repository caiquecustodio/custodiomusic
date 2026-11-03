package expo.modules.musicdownloads

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest

/** Completed files only: an interrupted prefetch can never become playable audio. */
internal class RadioCacheStore(private val directory: File, private val capacity: Long = 192L * 1024 * 1024) {
  companion object {
    const val MAX_TRACK_BYTES = 16L * 1024 * 1024
    fun key(provider: String, id: String): String = MessageDigest.getInstance("SHA-256")
      .digest("$provider:$id".toByteArray()).joinToString("") { "%02x".format(it) }
  }
  init { directory.mkdirs(); directory.listFiles()?.filter { it.name.endsWith(".part") }?.forEach { it.delete() }; trim(emptySet()) }
  @Synchronized fun completed(key: String): File? {
    require(key.matches(Regex("[a-f0-9]{64}")))
    return File(directory, "$key.audio").takeIf { it.isFile && it.length() > 0 }?.also { it.setLastModified(System.currentTimeMillis()) }
  }
  @Synchronized fun remove(key: String) { require(key.matches(Regex("[a-f0-9]{64}"))); File(directory, "$key.audio").delete() }
  fun write(key: String, input: InputStream, expected: Long, cancelled: () -> Boolean, protected: Set<String>): File {
    require(key.matches(Regex("[a-f0-9]{64}")))
    require(expected <= MAX_TRACK_BYTES) { "Faixa maior que o limite de preparação" }
    synchronized(this) { trim(protected, if (expected > 0) expected else MAX_TRACK_BYTES) }
    val part = File(directory, "$key.part")
    try {
      var total = 0L
      part.outputStream().use { output ->
        val buffer = ByteArray(32768)
        while (true) {
          if (cancelled()) throw IOException("Preparação cancelada")
          val count = input.read(buffer)
          if (count < 0) break
          total += count
          if (total > MAX_TRACK_BYTES) throw IOException("Limite de preparação atingido")
          output.write(buffer, 0, count)
        }
      }
      if (cancelled() || total == 0L || (expected >= 0 && total != expected)) throw IOException("Áudio incompleto")
      synchronized(this) {
        trim(protected, total)
        val completed = File(directory, "$key.audio")
        if (!part.renameTo(completed)) throw IOException("Não foi possível guardar o áudio")
        completed.setLastModified(System.currentTimeMillis())
        return completed
      }
    } finally { part.delete() }
  }
  @Synchronized fun trim(protected: Set<String>, incoming: Long = 0) {
    val files = directory.listFiles()?.filter { it.name.endsWith(".audio") }?.sortedBy { it.lastModified() } ?: return
    var total = files.sumOf { it.length() }
    for (file in files) {
      if (total + incoming <= capacity) break
      if (file.name.removeSuffix(".audio") in protected) continue
      val size = file.length(); if (file.delete()) total -= size
    }
    if (total + incoming > capacity) throw IOException("Cache temporário cheio")
  }
}
