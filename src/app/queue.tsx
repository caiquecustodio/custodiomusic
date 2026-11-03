import { tokens } from "../lib/theme";
import { FlatList, Text, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useFocusEffect } from "expo-router";
import { useMusic } from "../lib/music";
import { Track } from "../lib/types";
import { QueueEntry } from "../components/QueueEntry";
import { Action, EmptyState, Header, Screen } from "../components/ui";
export default function QueueScreen() {
  const { queue, tracks, current, state, colors, onlineSession, onlineQueueBusy, onlineQueueMessage, loadMoreOnline } = useMusic();
  const [dragging, setDragging] = useState(false);
  const list = useRef<FlatList<{ track: Track; index: number }>>(null);
  const viewport = useRef<ComponentRef<typeof View>>(null);
  const offset = useRef(0);
  const contentHeight = useRef(0);
  const bounds = useRef({ top: 0, height: 0 });
  const pointer = useRef<number | null>(null);
  const getScrollOffset = useCallback(() => offset.current, []);
  const dragPosition = useCallback((y: number | null) => { pointer.current = y; }, []);
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const items = useMemo(() => queue.map((id, index) => ({ track: byId.get(id), index }))
    .filter((item): item is { track: Track; index: number } => !!item.track), [queue, byId]);
  const currentIndex = queue.indexOf(current?.id ?? "");
  useFocusEffect(useCallback(() => () => { pointer.current = null; setDragging(false); }, []));
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    let previousTime = 0;
    const tick = (time: number) => {
      const y = pointer.current;
      const { top, height } = bounds.current;
      const elapsed = previousTime ? Math.min(32, time - previousTime) : 16;
      previousTime = time;
      if (y !== null && height > 0) {
        const edge = 64;
        const velocity = y < top + edge ? -Math.min(1, (top + edge - y) / edge) : y > top + height - edge ? Math.min(1, (y - top - height + edge) / edge) : 0;
        const next = Math.max(0, Math.min(Math.max(0, contentHeight.current - height), offset.current + velocity * elapsed * 0.45));
        if (next !== offset.current) { offset.current = next; list.current?.scrollToOffset({ offset: next, animated: false }); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);
  return (
    <Screen>
      <Header
        title="Fila"
        detail={`${items.length} ${items.length === 1 ? "música" : "músicas"} para ouvir`}
      />
      <View ref={viewport} style={{ flex: 1 }} onLayout={() => viewport.current?.measureInWindow((_x, top, _width, height) => { bounds.current = { top, height }; })}>
      <FlatList
        ref={list}
        scrollEnabled={!dragging}
        onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onContentSizeChange={(_width, height) => { contentHeight.current = height; }}
        removeClippedSubviews={!dragging}
        showsVerticalScrollIndicator={false}
        data={items}
        ListHeaderComponent={items.length ? <View style={{ backgroundColor: colors.accentSurface, padding: 16, borderRadius: 20, marginBottom: 16, gap: 6 }}>
          <Text style={{ color: colors.accent, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" }}>{state.shuffle ? "ORDEM ALEATÓRIA" : "SUA SEQUÊNCIA"}</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }} numberOfLines={2}>{current ? `Agora: ${current.title}` : "Escolha uma música para começar"}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{state.repeat === "one" ? "Repetindo a música atual" : state.repeat === "single" ? "A reprodução para ao terminar esta faixa" : state.repeat === "all" ? "A fila recomeça ao terminar" : "A reprodução para ao terminar a fila"}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Arraste pela alça para mudar a ordem. Remover a faixa atual deixa o áudio terminar.</Text>
        </View> : undefined}
        keyExtractor={(item) => item.track.id}
        contentContainerStyle={{
          paddingHorizontal: tokens.space.xl,
          paddingBottom: tokens.space.xl,
        }}
        renderItem={({ item }) => (
          <QueueEntry track={item.track} index={item.index} phase={item.index === currentIndex ? "Tocando agora" : !state.shuffle && currentIndex >= 0 && item.index < currentIndex ? "Antes da atual" : "A seguir"}
            dragging={setDragging} dragPosition={dragPosition} getScrollOffset={getScrollOffset} />
        )}
        ListFooterComponent={onlineSession ? <View style={{ paddingVertical: 20, gap: 12 }}>{!!onlineQueueMessage && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{onlineQueueMessage}</Text>}<Action icon="refresh" label={onlineQueueBusy ? "Buscando próximas músicas…" : "Carregar mais 10 online"} disabled={onlineQueueBusy} onPress={() => void loadMoreOnline()} /></View> : undefined}
        ListEmptyComponent={
          <EmptyState
            title="Sua fila está vazia"
            hint="Escolha uma música da biblioteca para começar."
          />
        }
      />
      </View>
    </Screen>
  );
}
