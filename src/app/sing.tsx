import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useMusic, usePlaybackStatus } from "../lib/music";
import { lyricTimeline } from "../lib/metadata-model";
import { markedLrc } from "../lib/listening-model";
import { formatPosition } from "../lib/duration";
import { LyricsView } from "../components/LyricsView";
import { Action, EmptyState, Header, Screen } from "../components/ui";
import { PlaybackTools } from "../components/PlaybackTools";

export default function SingScreen() {
  const { current } = useMusic();
  return <Screen mini={false}><Header title="Modo cantar" detail="Acompanhe, pratique e marque os tempos" />{current ? <Singing key={current.id} /> : <EmptyState title="Escolha uma música" hint="Abra uma música da biblioteca para cantar junto." />}</Screen>;
}
function Singing() {
  const { current, currentLyrics, colors, player, togglePlay, saveManualLyrics } = useMusic();
  const status = usePlaybackStatus();
  const { height } = useWindowDimensions();
  const [marking, setMarking] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const timeline = useMemo(() => lyricTimeline(currentLyrics, status.duration || current?.duration || 1), [currentLyrics, status.duration, current?.duration]);
  const phrases = useMemo(() => timeline.lines.filter((line) => line.text.trim()).map((line) => line.text), [timeline.lines]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void activateKeepAwakeAsync("custodio-sing").then(() => { if (!active) void deactivateKeepAwake("custodio-sing").catch(() => undefined); }).catch(() => undefined);
    return () => { active = false; void deactivateKeepAwake("custodio-sing").catch(() => undefined); };
  }, []));
  const seek = (position: number) => { if (status.isLoaded) void player.seekTo(Math.max(0, Math.min(status.duration || current?.duration || 0, position))).catch(() => undefined); };
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}>
    <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }} numberOfLines={2}>{current?.title}</Text>
    <Text style={{ color: colors.muted }}>{current?.artist} · {formatPosition(status.currentTime)}</Text>
    {!marking ? <LyricsView height={Math.max(360, height - 270)} seek={seek} large /> : <View style={{ padding: 24, borderRadius: 24, backgroundColor: colors.accentSurface, gap: 20 }}>
      <Text style={{ color: colors.muted }}>Marcadas: {times.length}/{phrases.length}</Text>
      <Text style={{ color: colors.text, fontSize: 28, lineHeight: 40, fontWeight: "700" }}>{phrases[times.length] ?? "Todas as frases foram marcadas."}</Text>
      <Text style={{ color: colors.muted }}>Toque quando começar a cantar a frase mostrada. Voltar na música exige desfazer os tempos posteriores.</Text>
      <Action label="Marcar próxima frase agora" primary disabled={!status.playing || times.length >= phrases.length || (times.length > 0 && status.currentTime <= times[times.length - 1])} onPress={() => setTimes((previous) => [...previous, player.currentTime])} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Action label="Desfazer última" disabled={!times.length} onPress={() => setTimes((previous) => previous.slice(0, -1))} />
        <Action label="Recomeçar marcação" onPress={() => { setTimes([]); seek(0); }} />
        <Action label="Salvar tempos" disabled={saving || times.length !== phrases.length || !times.length} onPress={() => {
          if (!current) return;
          setSaving(true);
          void saveManualLyrics(current.id, markedLrc(phrases, times)).then(() => setMarking(false)).catch((error) => Alert.alert("Salvar tempos", error instanceof Error ? error.message : "Não foi possível salvar.")).finally(() => setSaving(false));
        }} />
      </View>
      <ScrollView nestedScrollEnabled style={{ maxHeight: 120 }}>{times.map((time, index) => <Text key={index} style={{ color: colors.muted, marginBottom: 8 }}>{formatPosition(time)} · {phrases[index]}</Text>)}</ScrollView>
    </View>}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Action label={status.playing ? "Pausar" : "Reproduzir"} icon={status.playing ? "pause" : "play"} primary onPress={togglePlay} />
      <Action label={marking ? "Sair sem salvar" : "Marcar tempos das frases"} disabled={!phrases.length || saving} onPress={() => { setMarking(!marking); setTimes([]); }} />
    </View>
    <PlaybackTools />
  </ScrollView>;
}
