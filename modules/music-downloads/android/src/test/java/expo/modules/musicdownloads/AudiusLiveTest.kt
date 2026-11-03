package expo.modules.musicdownloads

import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import okhttp3.Request

class AudiusLiveTest {
  @Test fun publicCatalogAndAuthorizedStream() {
    assumeTrue(System.getenv("CUSTODIO_AUDIUS_SMOKE") == "1")
    val source = AudiusSource()
    val items = source.popular()
    assertTrue("Catálogo vazio", items.isNotEmpty())
    val (item, stream) = source.stream(items.first().getString("id"))
    assertEquals("audius", item.getString("provider"))
    assertEquals(item.getString("id"), source.linkId(item.getString("url")))
    SafeHttp.open(Request.Builder().url(stream.content).header("Range", "bytes=0-31").build(), timeoutSeconds = 8).use { response ->
      assertTrue("Stream HTTP ${response.code}", response.isSuccessful)
      assertTrue(requireNotNull(response.body).byteStream().read(ByteArray(32)) > 0)
    }
  }
}
