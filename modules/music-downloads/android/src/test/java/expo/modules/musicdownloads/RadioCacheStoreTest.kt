package expo.modules.musicdownloads

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.file.Files

class RadioCacheStoreTest {
  private fun directory() = Files.createTempDirectory("radio-cache-test").toFile().apply { deleteOnExit() }
  @Test fun incompleteAndCancelledAudioIsNeverPlayable() {
    val root = directory(); val store = RadioCacheStore(root); val key = RadioCacheStore.key("youtube", "track")
    try { store.write(key, ByteArrayInputStream(byteArrayOf(1, 2)), 5, { false }, emptySet()); fail() } catch (_: java.io.IOException) {}
    assertNull(store.completed(key)); assertEquals(0, root.listFiles()!!.size)
    try { store.write(key, ByteArrayInputStream(byteArrayOf(1, 2)), 2, { true }, emptySet()); fail() } catch (_: java.io.IOException) {}
    assertNull(store.completed(key)); assertEquals(0, root.listFiles()!!.size)
    root.deleteRecursively()
  }
  @Test fun completedAudioSurvivesRestartAndKeysSeparateSources() {
    val root = directory(); val key = RadioCacheStore.key("youtube", "track")
    val store = RadioCacheStore(root)
    store.write(key, ByteArrayInputStream(byteArrayOf(1, 2, 3)), 3, { false }, emptySet())
    File(root, "leftover.part").writeText("unfinished")
    assertArrayEquals(byteArrayOf(1, 2, 3), RadioCacheStore(root).completed(key)!!.readBytes())
    assertFalse(File(root, "leftover.part").exists())
    assertNotEquals(key, RadioCacheStore.key("jamendo", "track"))
    store.remove(key)
    assertNull(store.completed(key))
    root.deleteRecursively()
  }
  @Test fun storageBoundEvictsOldFilesButProtectsThePlayingTrack() {
    val root = directory(); val store = RadioCacheStore(root, 6)
    val playing = RadioCacheStore.key("youtube", "playing"); val old = RadioCacheStore.key("youtube", "old"); val next = RadioCacheStore.key("youtube", "next")
    store.write(playing, ByteArrayInputStream(byteArrayOf(1, 2, 3)), 3, { false }, emptySet())
    store.write(old, ByteArrayInputStream(byteArrayOf(1, 2, 3)), 3, { false }, setOf(playing))
    store.write(next, ByteArrayInputStream(byteArrayOf(1, 2, 3)), 3, { false }, setOf(playing))
    assertNotNull(store.completed(playing)); assertNull(store.completed(old)); assertNotNull(store.completed(next))
    assertTrue(root.listFiles()!!.sumOf { it.length() } <= 6)
    root.deleteRecursively()
  }
  @Test fun cacheKeysCannotEscapeThePrivateDirectory() {
    val root = directory(); val store = RadioCacheStore(root)
    try { store.completed("../outside"); fail() } catch (_: IllegalArgumentException) {}
    try { store.write("../outside", ByteArrayInputStream(byteArrayOf(1)), 1, { false }, emptySet()); fail() } catch (_: IllegalArgumentException) {}
    root.deleteRecursively()
  }
}
