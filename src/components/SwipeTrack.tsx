import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable } from "react-native";

export function SwipeTrack({ children, onSkip, onPress, label }: { children: ReactNode; onSkip: (direction: number) => void; onPress?: () => void; label?: string }) {
  const latest = useRef(onSkip);
  const swiped = useRef(false);
  const [offset] = useState(() => new Animated.Value(0));
  useEffect(() => { latest.current = onSkip; }, [onSkip]);
  // The responder reads refs only when a gesture is delivered.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => { swiped.current = false; return false; },
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      const horizontal = Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
      if (horizontal) swiped.current = true;
      return horizontal;
    },
    onPanResponderMove: (_event, gesture) => offset.setValue(Math.max(-72, Math.min(72, gesture.dx * 0.4))),
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) >= 48 || (Math.abs(gesture.dx) >= 24 && Math.abs(gesture.vx) >= 0.4)) latest.current(gesture.dx < 0 ? 1 : -1);
      Animated.spring(offset, { toValue: 0, useNativeDriver: Platform.OS !== "web", speed: 30, bounciness: 0 }).start();
    },
    onPanResponderTerminate: () => offset.setValue(0),
  }), [offset]);
  useEffect(() => () => offset.stopAnimation(), [offset]);
  return <Animated.View {...responder.panHandlers} style={{ flex: 1, minWidth: 0, transform: [{ translateX: offset }] }}>
    {onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { if (!swiped.current) onPress(); }} style={{ minHeight: 48, justifyContent: "center" }}>{children}</Pressable> : children}
  </Animated.View>;
}
