package expo.modules.musicdownloads
import org.junit.Assert.*
import org.junit.Test

class ListeningMathTest {
  @Test fun pausesBuffersSeeksAndSuspensionDoNotInflateTime() {
    assertEquals(1.0, ListeningMath.elapsed(1000, 2000, 1.0, true, 1f), 0.001)
    assertEquals(0.0, ListeningMath.elapsed(1000, 2000, 1.0, false, 1f), 0.001)
    assertEquals(0.0, ListeningMath.elapsed(1000, 1000, 1.0, true, 1f), 0.001)
    assertEquals(0.0, ListeningMath.elapsed(1000, 90000, 1.0, true, 1f), 0.001)
    assertEquals(0.0, ListeningMath.elapsed(90000, 1000, 1.0, true, 1f), 0.001)
    assertEquals(0.0, ListeningMath.elapsed(1000, 61000, 60.0, true, 1f), 0.001)
    assertEquals(1.0, ListeningMath.elapsed(1000, 3000, 1.0, true, 2f), 0.001)
  }
  @Test fun shortAndUnknownTracksUseTheCorrectThreshold() {
    assertFalse(ListeningMath.qualifies(29.9, 180.0)); assertTrue(ListeningMath.qualifies(30.0, 180.0))
    assertFalse(ListeningMath.qualifies(9.9, 20.0)); assertTrue(ListeningMath.qualifies(10.0, 20.0))
    assertFalse(ListeningMath.qualifies(29.0, 0.0)); assertTrue(ListeningMath.qualifies(30.0, 0.0))
  }
}
