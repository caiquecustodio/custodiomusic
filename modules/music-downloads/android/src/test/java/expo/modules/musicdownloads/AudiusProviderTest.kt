package expo.modules.musicdownloads

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AudiusProviderTest {
  private fun track() = JSONObject("""{"id":"abc123","title":"Original","duration":120,"user":{"name":"Autor"},"permalink":"/autor/original","is_streamable":true,"is_stream_gated":false,"access":{"stream":true},"stream":{"url":"https://primary.audius-test.example/tracks/file?signature=example","mirrors":["https://mirror.audius-test.example"]}}""")
  @Test fun filtersRestrictedTracksAndKeepsSourceIdentity() {
    val entries = listOf(track(), track().put("is_stream_gated", true), track().put("is_streamable", false), track().put("access_authorities", JSONArray(listOf("restricted"))), track().put("is_private", true))
    val source = AudiusSource({ JSONObject().put("data", JSONArray(entries)).toString() }, { true })
    val results = source.search("Original")
    assertEquals(1, results.size)
    assertEquals("audius", results.single().getString("provider"))
    assertEquals("https://audius.co/autor/original", results.single().getString("url"))
    assertFalse(results.single().getBoolean("downloadable"))
  }
  @Test fun retriesTheSameFileOnAnOfficialMirrorWithoutChangingTheTrack() {
    val attempts = mutableListOf<String>()
    val source = AudiusSource({ JSONObject().put("data", track()).toString() }, { url -> attempts.add(url); url.contains("mirror.") })
    val (item, audio) = source.stream("abc123")
    assertEquals("abc123", item.getString("id"))
    assertEquals(2, attempts.size)
    assertEquals("https://mirror.audius-test.example/tracks/file?signature=example", audio.content)
    assertEquals("audio/mpeg", audio.mime)
  }
  @Test fun restrictedTrackNeverProbesOrReturnsAudio() {
    var probes = 0
    val source = AudiusSource({ JSONObject().put("data", track().put("is_stream_gated", true)).toString() }, { probes++; true })
    assertThrows(IllegalArgumentException::class.java) { source.stream("abc123") }
    assertEquals(0, probes)
  }
  @Test fun failuresAreBoundedAndDownloadsStaySeparateFromStreaming() {
    var probes = 0
    val source = AudiusSource({ JSONObject().put("data", track()).toString() }, { probes++; false })
    assertTrue(source.resolve("abc123").formats.isEmpty())
    assertThrows(IllegalStateException::class.java) { source.stream("abc123") }
    assertEquals(2, probes)
    assertThrows(IllegalStateException::class.java) { source.stream("abc123") }
    assertEquals(2, probes) // unavailable nodes rest for one minute
  }
  @Test fun mediaTrustIsExactAndStillRejectsCredentialsPortsAndLocalAddresses() {
    val host = "registered.audius-test.example"
    assertFalse(SafeHttp.allowedHost(host))
    SafeHttp.registerAudiusMedia("https://$host/audio")
    assertTrue(SafeHttp.allowedHost(host))
    assertFalse(SafeHttp.allowedHost("child.$host"))
    for (url in listOf("http://$host/a", "https://user:pass@$host/a", "https://$host:444/a", "https://127.0.0.1/a", "https://localhost/a")) {
      assertThrows(IllegalArgumentException::class.java) { SafeHttp.registerAudiusMedia(url) }
    }
  }
}
