package expo.modules.musicdownloads

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackQueuePolicyTest {
  @Test fun removedCurrentNeverLoopsForever() {
    assertEquals("off", PlaybackQueuePolicy.effectiveRepeat("one", false, true, 3))
    assertEquals("off", PlaybackQueuePolicy.effectiveRepeat("all", false, true, 1))
    assertEquals("all", PlaybackQueuePolicy.effectiveRepeat("all", false, true, 3))
    assertEquals("one", PlaybackQueuePolicy.effectiveRepeat("one", false, false, 3))
    assertEquals("off", PlaybackQueuePolicy.effectiveRepeat("all", true, false, 3))
  }
  @Test fun removingCurrentKeepsItsCursorAndUpcomingTrack() {
    assertEquals(listOf("a", "b", "c"), PlaybackQueuePolicy.retainCurrent(listOf("a", "c"), "b", 1))
  }
  @Test fun clearingQueueLetsCurrentFinishAlone() {
    assertEquals(listOf("b"), PlaybackQueuePolicy.retainCurrent(emptyList(), "b", 30))
  }
  @Test fun movingCurrentDoesNotAddAnotherCopy() {
    assertEquals(listOf("c", "b", "a"), PlaybackQueuePolicy.retainCurrent(listOf("c", "b", "a", "b"), "b", 0))
  }
  @Test fun absentCurrentDoesNotInventAnEntry() {
    assertEquals(listOf("a", "c"), PlaybackQueuePolicy.retainCurrent(listOf("a", "c"), null, -1))
  }

  @Test fun onlineRecoveryRespectsPauseSleepAndRepeatOne() {
    assertEquals(true, PlaybackQueuePolicy.canContinue(true, true, true, "off", false))
    assertEquals(false, PlaybackQueuePolicy.canContinue(true, false, true, "off", false))
    assertEquals(false, PlaybackQueuePolicy.canContinue(true, true, false, "off", false))
    assertEquals(false, PlaybackQueuePolicy.canContinue(true, true, true, "off", true))
    assertEquals(false, PlaybackQueuePolicy.canContinue(true, true, true, "one", false))
    assertEquals(false, PlaybackQueuePolicy.canContinue(true, true, true, "single", false))
    assertEquals(false, PlaybackQueuePolicy.canContinue(false, true, true, "off", false))
  }
  @Test fun failedSourcesAreSkippedWithoutRetryingTheWholeQueueForever() {
    assertEquals("c", PlaybackQueuePolicy.nextAvailable(listOf("b", "c", "d"), setOf("b")))
    assertEquals(null, PlaybackQueuePolicy.nextAvailable(listOf("b", "c"), setOf("b", "c")))
    assertEquals(null, PlaybackQueuePolicy.nextAvailable(emptyList(), emptySet()))
  }
}
