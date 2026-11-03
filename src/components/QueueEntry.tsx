import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import { router } from "expo-router";
import { useMusic } from "../lib/music";
import type { Track } from "../lib/types";
import { TrackRow } from "./TrackRow";
import { IconButton } from "./ui";

export function QueueEntry({ track, index, phase, dragging, dragPosition, getScrollOffset }: {
  track: Track; index: number; phase: string; dragging: (active: boolean) => void;
  dragPosition: (y: number | null) => void; getScrollOffset: () => number;
}) {
  const { queue, colors, playTrack, moveQueueTrack, removeQueueTrack } = useMusic();
  const latest = useRef({ index, moveQueueTrack, dragging, dragPosition, getScrollOffset });
  const rowHeight = useRef(128);
  const origin = useRef(index);
  const originScroll = useRef(0);
  const [dy, setDy] = useState(0);
  useEffect(() => { latest.current = { index, moveQueueTrack, dragging, dragPosition, getScrollOffset }; }, [index, moveQueueTrack, dragging, dragPosition, getScrollOffset]);
  // PanResponder registers callbacks here; refs are read only when a gesture runs.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_event, gesture) => { origin.current = latest.current.index; originScroll.current = latest.current.getScrollOffset(); latest.current.dragging(true); latest.current.dragPosition(gesture.y0); },
    onPanResponderMove: (_event, gesture) => { latest.current.dragPosition(gesture.moveY); setDy(gesture.dy + latest.current.getScrollOffset() - originScroll.current); },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_event, gesture) => {
      latest.current.moveQueueTrack(track.id, origin.current + Math.round((gesture.dy + latest.current.getScrollOffset() - originScroll.current) / rowHeight.current));
      setDy(0); latest.current.dragging(false); latest.current.dragPosition(null);
    },
    onPanResponderTerminate: () => { setDy(0); latest.current.dragging(false); latest.current.dragPosition(null); },
  }), [track.id]);
  return <View onLayout={(event) => { rowHeight.current = event.nativeEvent.layout.height; }} style={{ borderBottomWidth: 1, borderColor: colors.line, transform: [{ translateY: dy }], zIndex: dy ? 2 : 0, backgroundColor: dy ? colors.surface2 : colors.background }}>
    <TrackRow track={track} onPress={() => { void playTrack(track, queue); router.navigate("/player"); }} />
    <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: 8 }}>
      <View {...responder.panHandlers} accessible accessibilityLabel={`Arrastar ${track.title} para reordenar`} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={{ color: colors.muted, fontSize: 24 }}>☰</Text></View>
      <Text style={{ flex: 1, color: colors.muted, fontSize: 12 }}>{phase} · {index + 1}</Text>
      <IconButton icon="previous" label="Mover para cima" disabled={index <= 0} onPress={() => moveQueueTrack(track.id, index - 1)} />
      <IconButton icon="next" label="Mover para baixo" disabled={index >= queue.length - 1} onPress={() => moveQueueTrack(track.id, index + 1)} />
      <IconButton icon="close" label={`Remover ${track.title} da fila`} onPress={() => removeQueueTrack(track.id)} />
    </View>
  </View>;
}
