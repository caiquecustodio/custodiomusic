import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, ScrollView, Text, View } from "react-native";
import { nativeDownloads } from "../../modules/music-downloads/src";
import { useMusic } from "../lib/music";
import { recapPeriods, summarize } from "../lib/discovery-model";
import { Action, ActionSheet, CompactAction, Disclosure, Header, IconButton, Screen } from "../components/ui";
import { TrackRow } from "../components/TrackRow";

export default function ForYouScreen() {
  const { colors, tracks, playLibraryTrack, listening, refreshListening, historyEnabled, historyReady, historyError, toggleHistory, clearHistory } = useMusic();
  const [panel, setPanel] = useState<"period" | null>(null);
  const [period, setPeriod] = useState("rolling");
  useFocusEffect(useCallback(() => { void refreshListening(); }, [refreshListening]));
  const periods = recapPeriods(listening.days); const selected = periods.find((p) => p.id === period) ?? periods[0];
  const { from, to } = selected;
  const recap = summarize(listening.days, from, to);
  const muted = { color: colors.muted, lineHeight: 22 }; const heading = { color: colors.text, fontSize: 20, fontWeight: "700" as const };
  return <Screen><Header title="Meu histórico" detail="As músicas que acompanham seus dias" /><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, gap: 16 }}>
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
      <Text style={[heading, { flex: 1 }]}>Seu resumo</Text>
      <CompactAction label={selected.label} onPress={() => setPanel("period")} />
      <IconButton icon="refresh" label="Atualizar resumo" onPress={() => void refreshListening()} />
    </View>
    {!recap.seconds ? <Text style={muted}>Seus destaques aparecem aqui conforme você ouve músicas.</Text> : <>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: "800" }}>{Math.round(recap.seconds / 60)} minutos · {recap.distinct} músicas</Text>
      <Text style={heading}>Músicas mais ouvidas</Text>
      {recap.tracks.slice(0, 10).map((row) => { const track = tracks.find((t) => t.id === row.trackId); return <View key={row.trackId} style={{ gap: 4 }}>{track ? <TrackRow track={track} onPress={() => void playLibraryTrack(track)} /> : <Text style={{ color: colors.text }}>{row.title} · {row.artist} · indisponível na biblioteca</Text>}<Text style={muted}>{row.plays} escutas · {Math.round(row.seconds / 60)} min</Text></View>; })}
      <Text style={heading}>Artistas</Text>{recap.artists.slice(0, 5).map((a) => <Text key={a.artist} style={muted}>{a.artist} · {Math.round(a.seconds / 60)} min</Text>)}
      <Text style={heading}>Atividade por dia</Text>{recap.activity.map(([day, seconds]) => <View key={day} style={{ gap: 4 }}><Text style={muted}>{new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR")} · {Math.round(seconds / 60)} min</Text><View style={{ height: 6, width: `${Math.max(1, seconds / Math.max(...recap.activity.map(([, value]) => value)) * 100)}%`, backgroundColor: colors.accent, borderRadius: 3 }} /></View>)}
    </>}
    <Disclosure title="Histórico e privacidade" detail={!nativeDownloads ? "Disponível no APK Android" : historyEnabled ? "Coleta local ativada" : "Coleta pausada"}>
      <Text style={muted}>O mapeamento online consulta título e artista no MusicBrainz; o arquivo de áudio não é enviado. O histórico anterior à atualização não é recriado. Conta como escuta após 30 segundos ou metade da faixa. Pausas, carregamento e avanços manuais não contam como tempo ouvido. Últimos 7 dias inclui hoje e os seis dias anteriores. Semanas encerradas vão de segunda a domingo.</Text>
      <Action label={historyEnabled ? "Pausar coleta" : "Ativar coleta"} disabled={!nativeDownloads || !historyReady} onPress={() => void toggleHistory()} />
      <Action label="Apagar todo o histórico e recaps" disabled={!nativeDownloads} onPress={() => Alert.alert("Apagar histórico?", "Os recaps e o aprendizado de escutas serão apagados. Favoritos e playlists serão preservados.", [{ text: "Cancelar", style: "cancel" }, { text: "Apagar", style: "destructive", onPress: () => void clearHistory() }])} />
      {!nativeDownloads && <Text style={muted}>A coleta de escutas precisa do APK Android atualizado.</Text>}
    </Disclosure>
    {!!historyError && <Text accessibilityRole="alert" style={muted}>{historyError}</Text>}
  </ScrollView>
    <ActionSheet visible={panel !== null} title="Período do resumo" close={() => setPanel(null)}>
      {periods.map((option) => <CompactAction key={option.id} label={option.label} selected={selected.id === option.id} onPress={() => { setPeriod(option.id); setPanel(null); }} />)}
    </ActionSheet>
  </Screen>;
}
