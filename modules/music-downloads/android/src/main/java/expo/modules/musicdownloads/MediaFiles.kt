package expo.modules.musicdownloads

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaCodec
import java.io.File
import java.nio.ByteBuffer

internal object MediaFiles {
  /** Parse the bytes with the platform decoder; extensions/MIME are insufficient. */
  fun finish(input: File, output: File, extension: String): Double {
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    try {
      extractor.setDataSource(input.absolutePath)
      require(extractor.trackCount == 1) { "O arquivo não contém somente áudio." }
      val format = extractor.getTrackFormat(0)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
      val allowed = when(extension) {
        "m4a" -> setOf("audio/mp4a-latm")
        "webm", "opus", "ogg" -> setOf("audio/opus", "audio/vorbis")
        "mp3" -> setOf("audio/mpeg")
        else -> emptySet()
      }
      require(mime in allowed) { "Formato recebido diferente do anunciado pela fonte." }
      val duration = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION)/1_000_000.0 else 0.0
      require(duration > 0 && duration <= 86400 && duration.isFinite()) { "Áudio incompleto ou com duração inválida." }
      extractor.selectTrack(0)
      val buffer = ByteBuffer.allocate(1024*1024)
      var samples = 0
      var lastSample = 0L
      if (extension == "m4a") {
        muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val track = muxer.addTrack(format)
        muxer.start()
        val info = MediaCodec.BufferInfo()
        while (true) {
          val size = extractor.readSampleData(buffer, 0)
          if (size < 0) break
          require(size <= buffer.capacity())
          require((extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_ENCRYPTED) == 0) { "Áudio protegido não suportado." }
          info.set(0, size, extractor.sampleTime, if ((extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC) != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
          muxer.writeSampleData(track, buffer, info)
          lastSample = extractor.sampleTime
          samples++
          extractor.advance()
        }
        muxer.stop()
      } else {
        while (extractor.readSampleData(buffer, 0) >= 0) { lastSample = extractor.sampleTime; samples++; extractor.advance() }
        require(input.renameTo(output)) { "Não foi possível finalizar o arquivo." }
      }
      require(lastSample / 1_000_000.0 + 0.25 >= duration * 0.99) { "O arquivo recebido está incompleto." }
      require(samples > 0 && output.length() in 1..SafeHttp.MAX_FILE) { "Nenhuma amostra de áudio válida encontrada." }
      return duration
    } finally { extractor.release(); muxer?.release() }
  }
  fun cover(bytes: ByteArray, file: File): Boolean = runCatching {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    require(options.outWidth in 1..16384 && options.outHeight in 1..16384 && options.outWidth.toLong()*options.outHeight <= 64_000_000)
    options.inJustDecodeBounds = false
    options.inSampleSize = (maxOf(options.outWidth, options.outHeight)/512).coerceAtLeast(1)
    val bitmap = requireNotNull(BitmapFactory.decodeByteArray(bytes,0,bytes.size,options))
    try { file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG,85,it) } } finally { bitmap.recycle() }
  }.getOrDefault(false)
}
