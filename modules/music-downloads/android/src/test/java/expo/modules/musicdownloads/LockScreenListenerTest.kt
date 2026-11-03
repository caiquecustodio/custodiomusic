package expo.modules.musicdownloads

import androidx.media3.common.Player
import androidx.media3.common.Timeline
import java.lang.reflect.Proxy
import java.lang.reflect.Modifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Verify the actual expo-audio class loaded by Gradle, including a prebuilt AAR. */
class LockScreenListenerTest {
  private val wrapperClass = Class.forName("expo.modules.audio.service.MetadataInjectingPlayer")
  private val forwardingClass = Class.forName("expo.modules.audio.service.MetadataInjectingPlayer\$MetadataForwardingListener")

  @Test fun everyMedia3CallbackIsImplementedExplicitly() {
    fun signature(method: java.lang.reflect.Method) = method.name + method.parameterTypes.joinToString { it.name }
    val required = Player.Listener::class.java.declaredMethods.filter { !Modifier.isStatic(it.modifiers) }.map(::signature).toSet()
    val implemented = forwardingClass.declaredMethods.map(::signature).toSet()
    val missing = required - implemented
    assertTrue("Lock-screen listener drops Media3 callbacks: $missing", missing.isEmpty())
  }

  @Test fun timelineChangesReachTheSessionBeforeTheNextTrack() {
    // The forwarding callbacks do not use Android state. Allocate only their enclosing object
    // without constructing a Handler, so this test exercises real bytecode on the JVM.
    val unsafeClass = Class.forName("sun.misc.Unsafe")
    val unsafe = unsafeClass.getDeclaredField("theUnsafe").apply { isAccessible = true }.get(null)
    val wrapper = unsafeClass.getMethod("allocateInstance", Class::class.java).invoke(unsafe, wrapperClass)
    val received = mutableListOf<String>()
    val listener = Proxy.newProxyInstance(Player.Listener::class.java.classLoader, arrayOf(Player.Listener::class.java)) { _, method, args ->
      if (method.name.startsWith("on")) received.add(method.name)
      when (method.name) { "hashCode" -> 1; "equals" -> false; "toString" -> "SessionListener"; else -> null }
    } as Player.Listener
    val constructor = forwardingClass.declaredConstructors.single().apply { isAccessible = true }
    val forwarding = constructor.newInstance(wrapper, listener) as Player.Listener
    forwarding.onTimelineChanged(Timeline.EMPTY, Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED)
    forwarding.onMediaItemTransition(null, Player.MEDIA_ITEM_TRANSITION_REASON_SEEK)
    forwarding.onPlaybackStateChanged(Player.STATE_READY)
    forwarding.onIsPlayingChanged(true)
    forwarding.onPlayerErrorChanged(null)
    assertEquals(listOf("onTimelineChanged", "onMediaItemTransition", "onPlaybackStateChanged", "onIsPlayingChanged", "onPlayerErrorChanged"), received)
  }
}
