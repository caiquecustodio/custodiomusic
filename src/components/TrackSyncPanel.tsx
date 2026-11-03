import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useMusic } from "../lib/music";
import { searchIdentity, parseLrc } from "../lib/metadata-model";
import { formatDuration } from "../lib/duration";
import { Action, IconButton } from "./ui";

export function TrackSyncPanel() {
  const { current, colors, syncBusy, syncBulk, syncTrack, cancelSync, lyricCandidates, chooseLyrics, importLyrics, updateTrackMetadata } = useMusic();
  const [dialog, setDialog] = useState<"edit" | "versions" | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!current) return null;
  const disabled = !!syncBusy || syncBulk.running || saving;
  const importFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!/\.(lrc|txt)$/i.test(asset.name)) throw new Error("Escolha um arquivo .lrc ou .txt.");
      if ((asset.size ?? 0) > 512000) throw new Error("A letra deve ter até 500 KB.");
      const text = Platform.OS === "web" && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      if (!text.trim() || text.length > 250000) throw new Error("Letra vazia ou muito grande.");
      await importLyrics(current.id, text);
    } catch (error) { Alert.alert("Importar letra", error instanceof Error ? error.message : "Não foi possível ler a letra."); }
  };
  const inputStyle = { color: colors.text, backgroundColor: colors.surface2, padding: 14, borderRadius: 12, fontSize: 16 };
  return <View style={{ width: "100%", marginVertical: 20, padding: 16, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, gap: 12 }}>
    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Capas e letras</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Action label={syncBusy === current.id ? "Sincronizando…" : "Sincronizar capa e letra"} icon="refresh" disabled={disabled} onPress={() => void syncTrack(current, true)} />
      <Action label={expanded ? "Menos opções" : "Mais opções"} onPress={() => setExpanded(!expanded)} />
      {expanded && <>
      <Action label="Corrigir busca" disabled={disabled} onPress={() => { const identity = searchIdentity(current); setTitle(identity.title); setArtist(identity.artist); setAlbum(identity.album); setDialog("edit"); }} />
      <Action label="Escolher versão" disabled={disabled || !lyricCandidates.length} onPress={() => setDialog("versions")} />
      <Action label="Importar .lrc" icon="folder" disabled={disabled} onPress={() => void importFile()} />
      </>}
      {syncBusy === current.id && <Action label="Cancelar" onPress={cancelSync} />}
    </View>
    <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, lineHeight: 20 }}>{syncBusy === current.id ? "Buscando em segundo plano…" : current.sync?.message ?? "Capas e letras serão buscadas na primeira reprodução. Você também pode sincronizar agora."}</Text>
    <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#00000099", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, maxHeight: "85%" }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}><Text style={{ flex: 1, color: colors.text, fontSize: 22, fontWeight: "700" }}>{dialog === "edit" ? "Identificar música" : "Escolha a gravação"}</Text><IconButton icon="close" label="Fechar" onPress={() => setDialog(null)} /></View>
            {dialog === "edit" ? <>
              <Text style={{ color: colors.muted }}>Use os dados da gravação correta, incluindo “ao vivo” ou “remix” quando fizerem parte do título.</Text>
              <TextInput accessibilityLabel="Título da música" placeholder="Título" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} maxLength={200} style={inputStyle} />
              <TextInput accessibilityLabel="Artista" placeholder="Artista" placeholderTextColor={colors.muted} value={artist} onChangeText={setArtist} maxLength={200} style={inputStyle} />
              <TextInput accessibilityLabel="Álbum" placeholder="Álbum (opcional)" placeholderTextColor={colors.muted} value={album} onChangeText={setAlbum} maxLength={200} style={inputStyle} />
              <Action label="Salvar e buscar" disabled={!title.trim() || !artist.trim() || disabled} selected onPress={() => {
                const patch = { title: title.trim(), artist: artist.trim(), album: album.trim(), metadataEdited: true };
                updateTrackMetadata(current.id, patch);
                setDialog(null);
                void syncTrack({ ...current, ...patch }, true);
              }} />
            </> : lyricCandidates.map((match) => <View key={match.id} style={{ borderTopWidth: 1, borderColor: colors.line, paddingVertical: 12, gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 17 }}>{match.trackName} · {match.artistName}</Text>
              <Text style={{ color: colors.muted }}>{match.albumName} · {formatDuration(match.duration)} · {parseLrc(match.syncedLyrics ?? "").length ? "Letra sincronizada" : match.instrumental ? "Instrumental" : "Letra comum"}</Text>
              <Action label="Usar esta letra" disabled={saving} onPress={() => { setSaving(true); void chooseLyrics(current.id, match).then(() => setDialog(null)).catch(() => Alert.alert("Letra", "Não foi possível salvar a letra.")).finally(() => setSaving(false)); }} />
            </View>)}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
