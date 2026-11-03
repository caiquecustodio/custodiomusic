import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Platform, Text, View, type ViewProps } from "react-native";
import { useMusic, usePlaybackStatus } from "../lib/music";
import { formatDuration, formatPosition } from "../lib/duration";

export function PlayerTimeline() {
  const { current, colors, player } = useMusic();
  const status = usePlaybackStatus();
  const [preview, setPreview] = useState<number | null>(null);
  const [seekError, setSeekError] = useState(false);
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const [progress] = useState(() => new Animated.Value(0));
  const duration = status.duration || current?.duration || 0;
  const latest = useRef({ duration, loaded: status.isLoaded, id: current?.id });
  const dragId = useRef<string | undefined>(undefined);
  const seek = useCallback((seconds: number) => {
    if (!player.isLoaded || duration <= 0) return;
    setSeekError(false);
    void player.seekTo(Math.max(0, Math.min(duration, seconds))).catch(() => setSeekError(true));
  }, [player, duration]);
  useEffect(() => { latest.current = { duration, loaded: status.isLoaded, id: current?.id }; }, [duration, status.isLoaded, current?.id]);
  // Capture absolute progress within the bar; nativeEvent.locationX is relative to its children.
  const start = useRef(0);
  const last = useRef(0);
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => latest.current.loaded && latest.current.duration > 0,
    onPanResponderGrant: (event) => {
      dragId.current = latest.current.id;
      start.current = event.nativeEvent.locationX;
      last.current = Math.max(0, Math.min(1, start.current / widthRef.current)) * latest.current.duration;
      setPreview(last.current);
    },
    onPanResponderMove: (_event, gesture) => {
      last.current = Math.max(0, Math.min(1, (start.current + gesture.dx) / widthRef.current)) * latest.current.duration;
      setPreview(last.current);
    },
    onPanResponderRelease: () => {
      if (dragId.current === latest.current.id && latest.current.loaded) {
        setSeekError(false);
        void player.seekTo(last.current).catch(() => setSeekError(true));
      }
      setPreview(null);
    },
    onPanResponderTerminate: () => setPreview(null),
  }), [player]);
  useEffect(() => {
    const position = preview ?? status.currentTime;
    progress.stopAnimation();
    progress.setValue(duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0);
    if (preview !== null || !status.playing || status.isBuffering || duration <= 0) return;
    const animation = Animated.timing(progress, {
      toValue: Math.min(1, (position + 0.25 * status.playbackRate) / duration),
      duration: 250, easing: Easing.linear, useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, status.currentTime, status.playing, status.isBuffering, status.playbackRate, duration, preview]);
  const position = preview ?? status.currentTime;
  const keyboard: Pick<ViewProps, "onKeyDown" | "tabIndex"> = Platform.OS === "web" ? {
    tabIndex: 0 as const,
    onKeyDown: (event) => {
      const key = "key" in event && typeof event.key === "string" ? event.key
        : "key" in event.nativeEvent && typeof event.nativeEvent.key === "string" ? event.nativeEvent.key : "";
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
      event.preventDefault();
      seek(key === "Home" ? 0 : key === "End" ? duration : player.currentTime + (["ArrowLeft", "ArrowDown"].includes(key) ? -10 : 10));
    },
  } : {};
  return <View style={{ width: "100%", marginTop: 16 }}>
    <View {...responder.panHandlers} {...keyboard} accessible accessibilityRole="adjustable" accessibilityLabel="Posição da música"
      aria-valuemin={0} aria-valuemax={Math.floor(duration)} aria-valuenow={Math.floor(position)} aria-valuetext={formatPosition(position)}
      accessibilityValue={{ min: 0, max: Math.floor(duration), now: Math.floor(position), text: formatPosition(position) }}
      accessibilityActions={[{ name: "increment", label: "Avançar 10 segundos" }, { name: "decrement", label: "Voltar 10 segundos" }]}
      onAccessibilityAction={(event) => seek(player.currentTime + (event.nativeEvent.actionName === "increment" ? 10 : -10))}
      onLayout={(event) => { widthRef.current = event.nativeEvent.layout.width; setWidth(event.nativeEvent.layout.width); }}
      style={{ height: 48, justifyContent: "center" }}>
      <View pointerEvents="none" style={{ height: 5, borderRadius: 3, backgroundColor: colors.line }}>
        <Animated.View style={{ height: 5, borderRadius: 3, backgroundColor: colors.accent, width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }} />
        <Animated.View style={{ position: "absolute", top: -4, marginLeft: -6, height: 13, width: 13, borderRadius: 7, backgroundColor: colors.accent, left: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }} />
      </View>
    </View>
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: preview === null ? colors.muted : colors.accent, fontSize: 12, fontVariant: ["tabular-nums"] }}>{formatPosition(position)}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{formatDuration(duration)}</Text>
    </View>
    {seekError && <Text accessibilityRole="alert" style={{ color: colors.muted, fontSize: 12 }}>Não foi possível mudar a posição. Tente novamente.</Text>}
  </View>;
}
