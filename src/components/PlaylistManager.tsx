import { useState } from "react";
import { Modal, Text, TextInput, View } from "react-native";
import { useMusic } from "../lib/music";
import { Action } from "./ui";

export function PlaylistManager({ id }: { id: string }) {
  const { state, colors, renamePlaylist, deletePlaylist } = useMusic();
  const playlist = state.playlists.find((item) => item.id === id);
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  if (!playlist) return null;
  return <View style={{ gap: 8, marginBottom: 16 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Action label="Renomear" onPress={() => { setName(playlist.name); setMode("rename"); }} />
      <Action label="Excluir playlist" onPress={() => setMode("delete")} />
    </View>
    <Modal visible={!!mode} transparent animationType="fade" onRequestClose={() => setMode(null)}>
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: "#00000099", padding: 24 }}><View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 24, gap: 16 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{mode === "rename" ? "Renomear playlist" : `Excluir ${playlist.name}?`}</Text>
        {mode === "rename" ? <TextInput accessibilityLabel="Novo nome da playlist" value={name} onChangeText={setName} maxLength={80} style={{ color: colors.text, borderColor: colors.line, borderWidth: 1, padding: 16, borderRadius: 12 }} /> : <Text style={{ color: colors.muted }}>As músicas permanecem na biblioteca. Apenas esta coleção será removida.</Text>}
        <Action label={mode === "rename" ? "Salvar nome" : "Confirmar exclusão"} primary disabled={mode === "rename" && !name.trim()} onPress={() => { if (mode === "rename") renamePlaylist(id, name); else deletePlaylist(id); setMode(null); }} />
        <Action label="Cancelar" onPress={() => setMode(null)} />
      </View></View>
    </Modal>
  </View>;
}
