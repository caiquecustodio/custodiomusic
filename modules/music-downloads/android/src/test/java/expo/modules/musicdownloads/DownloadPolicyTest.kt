package expo.modules.musicdownloads

import org.junit.Assert.*
import org.junit.Test
import java.net.InetAddress

class DownloadPolicyTest {
  @Test fun destinationsAreBounded() {
    assertTrue(SafeHttp.allowedHost("rr1---sn.example.googlevideo.com"))
    assertFalse(SafeHttp.allowedHost("youtube.com.attacker.test"))
    for (url in listOf("http://youtube.com/", "https://youtube.com:444/", "https://user:pass@youtube.com/", "https://127.0.0.1/")) {
      try { SafeHttp.checked(url); fail(url) } catch (_: IllegalArgumentException) {}
    }
  }
  @Test fun internalAddressesAreRejected() {
    for (address in listOf("127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fc00::1")) assertFalse(address, SafeHttp.publicAddress(InetAddress.getByName(address)))
  }
  @Test fun dashAudioSegmentsHaveDeterministicOrder() {
    val manifest = """<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet mimeType="audio/mp4"><Representation id="140"><BaseURL>https://media.googlevideo.com/audio/</BaseURL><SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL media="one.m4s"/><SegmentURL media="two.m4s"/></SegmentList></Representation></AdaptationSet></Period></MPD>"""
    val choice = AudioChoice("140:default:m4a", "m4a", "audio/mp4", 128, manifest, true)
    assertEquals(listOf("https://media.googlevideo.com/audio/init.mp4", "https://media.googlevideo.com/audio/one.m4s", "https://media.googlevideo.com/audio/two.m4s"), DashSegments.urls(choice,42))
  }
  @Test fun protectedManifestsAreRejected() {
    val manifest = """<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet><ContentProtection/></AdaptationSet></Period></MPD>"""
    try { DashSegments.urls(AudioChoice("140", "m4a", "audio/mp4",128,manifest,true),42); fail() } catch (_: IllegalArgumentException) {}
  }
}
