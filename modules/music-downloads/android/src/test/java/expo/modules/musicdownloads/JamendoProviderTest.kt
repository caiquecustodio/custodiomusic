package expo.modules.musicdownloads

import org.junit.Assert.*
import org.junit.Test

class JamendoProviderTest {
  @Test fun popularTracksUseTheCatalogPopularityOrder() {
    var requested = ""
    val source = JamendoSource("test") { url -> requested = url; response(true) }
    assertEquals(1, source.popular().size)
    assertTrue(requested.contains("order=popularity_week"))
    assertFalse(requested.contains("search="))
  }

  @Test fun streamingDoesNotRequireDownloadPermission() {
    val source = JamendoSource("test") { """{"headers":{"code":0},"results":[{"id":"42","name":"Faixa","artist_name":"Autor","duration":42,"audiodownload_allowed":false,"audiodownload":"","audio":"https://mp3l.jamendo.com/stream/42"}]}""" }
    val (item, audio) = source.stream("42")
    assertFalse(item.getBoolean("downloadable"))
    assertEquals("https://mp3l.jamendo.com/stream/42", audio.content)
    try { source.resolve("42"); fail() } catch (_: IllegalArgumentException) {}
  }
  private fun response(allowed: Boolean, url: String = "https://mp3d.jamendo.com/download/track/42") = """{"headers":{"code":0},"results":[{"id":"42","name":"Faixa de teste","artist_name":"Autor","duration":42,"image":"https://imgjam.com/untrusted.jpg","audiodownload_allowed":$allowed,"audiodownload":"$url","license_ccurl":"https://creativecommons.org/licenses/by/4.0/"}]}"""
  @Test fun mappedResultsKeepSourceAndDownloadPermission() {
    val source = JamendoSource("test") { response(true) }
    val results = source.search("música")
    assertEquals("jamendo", results.single().getString("provider"))
    assertTrue(results.single().getBoolean("downloadable"))
    assertTrue(results.single().isNull("thumbnail"))
    val audio = source.resolve("42")
    assertEquals("mp3", audio.formats.single().extension)
    assertEquals(42, audio.item.getInt("duration"))
  }
  @Test fun disabledArtistDownloadsCannotBeResolved() {
    val source = JamendoSource("test") { response(false) }
    assertFalse(source.search("faixa").single().getBoolean("downloadable"))
    try { source.resolve("42"); fail() } catch (_: IllegalArgumentException) {}
  }
  @Test fun aMissingConfigurationMakesNoNetworkCall() {
    var called = false
    val source = JamendoSource("") { called = true; response(true) }
    assertFalse(source.available)
    try { source.search("faixa"); fail() } catch (_: IllegalStateException) {}
    assertFalse(called)
  }
  @Test fun aHostileMediaDestinationIsRejected() {
    val source = JamendoSource("test") { response(true, "https://attacker.test/file.apk") }
    try { source.resolve("42"); fail() } catch (_: IllegalArgumentException) {}
  }
}
