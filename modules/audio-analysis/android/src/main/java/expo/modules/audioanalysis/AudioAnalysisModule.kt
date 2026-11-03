package expo.modules.audioanalysis

import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.DataInputStream
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AudioAnalysisModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioAnalysis")

    AsyncFunction("readMetadata") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        val reader = MediaMetadataRetriever()
        try {
          reader.setDataSource(appContext.reactContext!!, Uri.parse(uri))
          val result = mutableMapOf<String, Any>()
          for ((name, field) in listOf(
            "title" to MediaMetadataRetriever.METADATA_KEY_TITLE,
            "artist" to MediaMetadataRetriever.METADATA_KEY_ARTIST,
            "album" to MediaMetadataRetriever.METADATA_KEY_ALBUM
          )) reader.extractMetadata(field)?.takeIf { it.isNotBlank() }?.let { result[name] = it }
          reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull()?.let {
            result["duration"] = it / 1000.0
          }
          reader.embeddedPicture?.takeIf { it.size <= 8 * 1024 * 1024 }?.let { picture ->
            val directory = File(appContext.reactContext!!.filesDir, "embedded-covers").apply { mkdirs() }
            val digest = MessageDigest.getInstance("SHA-256").digest(uri.toByteArray()).joinToString("") { "%02x".format(it) }
            val cover = File(directory, "$digest.jpg")
            cover.writeBytes(picture)
            result["artwork"] = Uri.fromFile(cover).toString()
          }
          readId3Lyrics(Uri.parse(uri))?.let { result["lyrics"] = it }
          result
        } finally { reader.release() }
      }
    }

  }

  // Bounded ID3v2.3/v2.4 USLT lookup. Never decode the audio to read its tags.
  private fun readId3Lyrics(uri: Uri): String? = try {
    appContext.reactContext!!.contentResolver.openInputStream(uri)?.use { stream ->
      val input = DataInputStream(BufferedInputStream(stream))
      val header = ByteArray(10).also { input.readFully(it) }
      if (String(header, 0, 3, Charsets.US_ASCII) != "ID3") return@use null
      val version = header[3].toInt()
      // Extended headers and unsynchronisation need separate decoding; leave them untouched.
      if (version !in 3..4 || (header[5].toInt() and 0xC0) != 0) return@use null
      fun size(bytes: ByteArray, start: Int, syncSafe: Boolean): Int {
        var value = 0
        for (index in start until start + 4) value = (value shl (if (syncSafe) 7 else 8)) or (bytes[index].toInt() and (if (syncSafe) 127 else 255))
        return value
      }
      val total = size(header, 6, true).coerceAtMost(1024 * 1024)
      var consumed = 0
      while (consumed + 10 <= total) {
        val frame = ByteArray(10).also { input.readFully(it) }
        consumed += 10
        val length = size(frame, 4, version == 4)
        if (length <= 0 || length > total - consumed) break
        val id = String(frame, 0, 4, Charsets.US_ASCII)
        if (id == "USLT" && frame[8].toInt() == 0 && frame[9].toInt() == 0) {
          val data = ByteArray(length).also { input.readFully(it) }
          if (data.size < 5) return@use null
          val charset = when (data[0].toInt()) { 0 -> Charsets.ISO_8859_1; 1 -> Charsets.UTF_16; 2 -> Charsets.UTF_16BE; 3 -> Charsets.UTF_8; else -> return@use null }
          val decoded = String(data, 4, data.size - 4, charset)
          return@use decoded.substringAfter('\u0000', "").trim('\uFEFF', '\u0000', ' ', '\n', '\r').takeIf { it.isNotEmpty() }
        }
        var left = length
        while (left > 0) { val skipped = input.skipBytes(left); if (skipped <= 0) return@use null; left -= skipped }
        consumed += length
      }
      null
    }
  } catch (_: Exception) { null }

}
