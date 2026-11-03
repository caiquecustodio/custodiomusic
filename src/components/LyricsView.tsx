import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { activeLyric, lyricTimeline } from "../lib/metadata-model";
import { useMusic, usePlaybackStatus } from "../lib/music";
import { Action } from "./ui";

export function LyricsView({ height, seek, large = false }: { height: number; seek: (seconds: number) => void; large?: boolean }) {
  const { current, currentLyrics, colors, updateTrackMetadata } = useMusic();
  const status = usePlaybackStatus();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Record<number, number>>({});
  const [follow, setFollow] = useState(true);
  const duration = Number.isFinite(status.duration) && status.duration > 0 ? status.duration : current?.duration ?? 0;
  const { lines, mode } = useMemo(() => lyricTimeline(currentLyrics, duration), [currentLyrics, duration]);
  const offset = current?.lyricsOffset ?? 0;
  const active = activeLyric(lines, status.currentTime - offset);
  useEffect(() => {
    if (follow && active >= 0) scroll.current?.scrollTo({ y: Math.max(0, (positions.current[active] ?? 0) - height / 3), animated: true });
  }, [active, follow, height]);
  return <View style={{ width: "100%", height, padding: 12, gap: 8 }}>
    {mode === "estimated" && <Text style={{ color: colors.accent, fontSize: 12, lineHeight: 17 }}>Tempo aproximado · frases distribuídas pela duração da música.</Text>}
    {lines.length > 0 && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Action label={follow ? "Seguindo letra" : "Acompanhar"} selected={follow} onPress={() => setFollow(!follow)} />
      <Action label="−0,5 s" onPress={() => current && updateTrackMetadata(current.id, { lyricsOffset: Math.max(-30, offset - 0.5) })} />
      <Action label="+0,5 s" onPress={() => current && updateTrackMetadata(current.id, { lyricsOffset: Math.min(30, offset + 0.5) })} />
    </View>}
    {lines.length > 0 && <Text style={{ color: colors.muted, fontSize: 12 }}>Frase {Math.max(0, active + 1)}/{lines.length} · Atraso: {offset.toFixed(1)} s · Toque para avançar</Text>}
    <ScrollView ref={scroll} nestedScrollEnabled onScrollBeginDrag={() => setFollow(false)} contentContainerStyle={{ paddingBottom: height / 2, gap: 16 }}>
      {lines.length ? lines.map((line, index) => <Pressable key={`${index}:${line.time}`} accessibilityRole="button" accessibilityState={{ selected: index === active }} accessibilityLabel={`${line.text || "Pausa instrumental"}, ir para ${Math.floor(line.time + offset)} segundos${mode === "estimated" ? ", tempo aproximado" : ""}`} onLayout={(event) => {
        positions.current[index] = event.nativeEvent.layout.y;
        if (follow && index === active) scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - height / 3), animated: true });
      }} onPress={() => seek(line.time + offset)} style={{ minHeight: 48, justifyContent: "center", padding: 10, borderRadius: 12, backgroundColor: index === active ? colors.accentSurface : "transparent", borderLeftWidth: 3, borderLeftColor: index === active ? colors.accent : "transparent" }}>
        <Text style={{ color: index === active ? colors.accent : colors.muted, fontWeight: index === active ? "700" : "500", fontSize: large ? 29 : 21, lineHeight: large ? 42 : 30 }}>{line.text || "♪"}</Text>
      </Pressable>) : <Text style={{ color: colors.text, fontSize: 19, lineHeight: 30 }}>{currentLyrics?.instrumental ? "♪ Música instrumental" : currentLyrics?.plain || "Letra ainda não disponível. Use Sincronizar ou importe um arquivo .lrc."}</Text>}
    </ScrollView>
    {currentLyrics && <Text style={{ color: colors.muted, fontSize: 11 }}>{currentLyrics.source} · {mode === "synced" ? "Sincronizada" : mode === "estimated" ? "Sincronização aproximada" : currentLyrics.instrumental ? "Instrumental" : "Aguardando duração para destacar"} · Salva no aparelho</Text>}
  </View>;
}
