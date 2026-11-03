import { Text, View } from "react-native";
import { router } from "expo-router";
import { useMusic } from "../lib/music";
import { Artwork } from "./Artwork";
import { Action, IconButton } from "./ui";
import { formatDuration } from "../lib/duration";

export function OnlineQueue() {
  const { current, tracks, queue, colors, onlineSession, onlineQueueBusy, onlineQueueMessage, loadMoreOnline, playTrack, removeQueueTrack } = useMusic();
  if (!onlineSession) return null;
  const index = queue.indexOf(current?.id ?? "");
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const upcoming = queue.slice(index + 1).flatMap((id) => { const track = byId.get(id); return track ? [track] : []; });
  return <View style={{ width: "100%", backgroundColor: colors.surface, borderRadius: 24, padding: 16, gap: 12, marginTop: 24 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View><Text style={{ color: colors.text, fontSize: 21, fontWeight: "700" }}>A seguir</Text><Text style={{ color: colors.muted, marginTop: 4 }}>{upcoming.length} na fila · reprodução online</Text></View>
      <IconButton icon="queue" label="Editar toda a fila" onPress={() => router.navigate("/queue")} />
    </View>
    {upcoming.slice(0, 10).map((track, position) => <View key={track.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ color: colors.muted, width: 18, fontSize: 12 }}>{position + 1}</Text>
      <Artwork track={track} size={44} radius={10} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: "600" }}>{track.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{track.artist} · {formatDuration(track.duration)}</Text></View>
      <IconButton icon="play" label={`Reproduzir ${track.title}`} onPress={() => void playTrack(track, queue)} />
      <IconButton icon="close" label={`Remover ${track.title}`} onPress={() => removeQueueTrack(track.id)} />
    </View>)}
    {!upcoming.length && <Text style={{ color: colors.muted }}>Carregue sugestões ou adicione músicas pela pesquisa.</Text>}
    {!!onlineQueueMessage && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13 }}>{onlineQueueMessage}</Text>}
    <Action icon="refresh" label={onlineQueueBusy ? "Buscando próximas músicas…" : "Carregar mais 10"} disabled={onlineQueueBusy} onPress={() => void loadMoreOnline()} />
  </View>;
}
