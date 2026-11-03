package expo.modules.musicdownloads

import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import okhttp3.Request

/** Opt-in network metadata probe. Never downloads the audio/video payload. */
class LiveSourceSmokeTest {
  @Test fun publicYoutubeMusicChart() {
    assumeTrue(System.getenv("CUSTODIO_POPULAR_SMOKE") == "1")
    val items = YoutubeSource().popular()
    assertTrue("Ranking musical vazio", items.isNotEmpty())
    assertTrue(items.all { it.getString("provider") == "youtube" && it.getLong("duration") > 0 })
  }
  @Test fun publicYoutubeMetadataAndAudioFormats() {
    assumeTrue(System.getenv("CUSTODIO_LIVE_SMOKE") == "1")
    val source = YoutubeSource()
    val results = source.search("Blender Big Buck Bunny")
    assertTrue(results.isNotEmpty())
    val resolved = source.resolve("aqz-KE-bpKQ")
    assertEquals("youtube", resolved.item.getString("provider"))
    assertTrue(resolved.formats.isNotEmpty())
    assertTrue(resolved.formats.all { it.extension in setOf("m4a", "webm", "opus", "ogg") })
    val (_, stream) = source.stream("aqz-KE-bpKQ")
    assertFalse(stream.manifest)
    SafeHttp.open(Request.Builder().url(stream.content).header("Range", "bytes=0-1023").build()).use { response ->
      assertTrue("Streaming HTTP ${response.code}", response.isSuccessful)
      val buffer = ByteArray(1024)
      assertTrue(requireNotNull(response.body).byteStream().read(buffer) > 0)
    }
  }
}
