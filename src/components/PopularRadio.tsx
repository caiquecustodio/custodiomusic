import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { downloads } from "../../modules/music-downloads/src";
import { popularRadio } from "../lib/popular-radio";
import type { DownloadItem } from "../lib/downloads/types";
import { useMusic } from "../lib/music";
import { normalizeName } from "../lib/discovery-model";
import { onlineTrack } from "../lib/downloads/model";
import { Artwork } from "./Artwork";
import { CompactAction, IconButton } from "./ui";

export function PopularRadio() {
  const { colors, tracks, radioPreferences, radioReady, listenOnline } = useMusic();
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  useEffect(() => {
    if (!radioReady || radioPreferences.offline || !downloads.available) return;
    let alive = true;
    void Promise.resolve().then(() => { if (alive) setBusy(true); });
    void popularRadio().then((result) => { if (alive) { setItems(result.items); setMessage(Object.values(result.errors).join(" ")); } }).catch(() => { if (alive) setMessage("As músicas em alta não estão disponíveis agora."); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [radioReady, radioPreferences.offline, revision]);
  if (radioPreferences.offline || !downloads.available) return null;
  const visible = items.filter((item) => !radioPreferences.blockedArtists.includes(normalizeName(item.artist)) && !radioPreferences.blockedTracks.includes(onlineTrack(item, tracks).id)).slice(0, 3);
  return <View style={{ gap: 12 }}>
    <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>Em alta para começar</Text>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Músicas em alta no YouTube Brasil e populares no Jamendo, quando disponível. Sua rádio se adapta às suas escutas.</Text>
    {busy && <ActivityIndicator color={colors.accent} accessibilityLabel="Buscando músicas em alta" />}
    {visible.map((item) => <View key={`${item.provider}:${item.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Artwork track={{ id: item.id, artwork: item.thumbnail ?? undefined }} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{item.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{item.artist}</Text></View>
      <IconButton icon="play" label={`Ouvir ${item.title}`} disabled={playingId !== null} onPress={() => { setPlayingId(item.id); void listenOnline(item).catch(() => setMessage("Esta música não pôde ser reproduzida agora.")).finally(() => setPlayingId(null)); }} />
    </View>)}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{message}</Text>}
    {!busy && !visible.length && <CompactAction label="Tentar novamente" onPress={() => setRevision((value) => value + 1)} />}
  </View>;
}
