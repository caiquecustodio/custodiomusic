import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { FlatList, Platform, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { nativeDownloads } from "../../modules/music-downloads/src";
import { useMusic } from "../lib/music";
import { exportM3u, groupNames, importM3u, possibleDuplicates, type LibraryGroup } from "../lib/organization-model";
import { Action, Header, Screen } from "../components/ui";
import { TrackRow } from "../components/TrackRow";
import type { Track } from "../lib/types";

export default function OrganizeScreen() {
  const params = useLocalSearchParams<{ group?: string }>();
  const { colors, tracks, state, playLibraryTrack, importPlaylist } = useMusic();
  const [group, setGroup] = useState<LibraryGroup>(params.group === "genre" ? "genre" : "artist"); const [selected, setSelected] = useState<string | null>(null); const [query, setQuery] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState(false); const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const groups = useMemo(() => [...new Set([...tracks.flatMap((t) => groupNames(t, group, state.personalGenres)), ...(group === "genre" ? (state.personalGenres ?? []).map((entry) => entry.name) : [])])].sort((a, b) => a.localeCompare(b, "pt-BR")), [tracks, group, state.personalGenres]);
  const duplicates = useMemo(() => possibleDuplicates(tracks), [tracks]);
  const displayed = useMemo(() => (duplicateMode ? duplicates.flat() : selected ? tracks.filter((t) => groupNames(t, group, state.personalGenres).includes(selected)) : []).filter((t) => `${t.title} ${t.artist}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [tracks, duplicates, duplicateMode, selected, group, query, state.personalGenres]);
  const run = async (work: () => Promise<void>) => { setBusy(true); setMessage(""); try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir."); } finally { setBusy(false); } };
  const pickPlaylist = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true }); if (result.canceled) return;
    const asset = result.assets[0]; if (!/\.m3u8?$/i.test(asset.name)) throw new Error("Selecione um arquivo M3U ou M3U8."); if ((asset.size ?? 0) > 5 * 1024 * 1024) throw new Error("Playlist maior que 5 MB.");
    const text = Platform.OS === "web" && asset.file ? await asset.file.text() : await new File(asset.uri).text();
    const parsed = importM3u(text, tracks);
    if (parsed.ids.length) importPlaylist(asset.name.replace(/\.m3u8?$/i, ""), parsed.ids);
    setMessage(`${parsed.ids.length} músicas relacionadas. ${parsed.missing.length} entradas ausentes ou ambíguas.${parsed.missing.length ? ` Primeiras entradas: ${parsed.missing.slice(0, 5).join(", ")}` : ""}`);
  };
  const savePlaylist = async (name: string, entries: Track[]) => {
    const result = exportM3u(entries); if (result.omitted === entries.length) throw new Error("Esta seleção não possui arquivos locais exportáveis.");
    const filename = `${name.replace(/[^\p{L}\p{N} _-]/gu, "_").slice(0, 60)}.m3u8`;
    if (Platform.OS === "web") { const url = URL.createObjectURL(new Blob([result.text], { type: "audio/x-mpegurl;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    else { const file = new File(Paths.cache, filename); file.write(result.text); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "audio/x-mpegurl" }); else await file.preview({ mimeType: "audio/x-mpegurl", title: name }); }
    setMessage(`Playlist exportada em UTF-8. ${result.omitted} faixas online ou temporárias omitidas. URIs privadas dependem do acesso concedido no aparelho.`);
  };
  const confirmDuplicates = async () => {
    if (!nativeDownloads) throw new Error("A confirmação de arquivos idênticos precisa do APK Android.");
    const hashes = new Map<string, string[]>(); let failed = 0;
    for (const track of duplicates.flat()) { if (!track.uri || /^https?:/i.test(track.uri)) continue; try { const hash = await nativeDownloads.fileHash(track.uri); hashes.set(hash, [...(hashes.get(hash) ?? []), track.id]); } catch { failed++; } }
    const result: Record<string, string> = {}; for (const ids of hashes.values()) if (ids.length > 1) ids.forEach((id) => { result[id] = "Arquivo idêntico confirmado por SHA-256"; });
    setConfirmed(result); setMessage(`${Object.keys(result).length} arquivos idênticos confirmados. ${failed} arquivos não puderam ser lidos. Nenhum arquivo foi excluído.`);
  };
  const entries: (string | Track)[] = !selected && !duplicateMode ? groups.filter((name) => name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))) : displayed;
  return <Screen><Header title="Organizar biblioteca" /><FlatList<string | Track> data={entries} keyExtractor={(t) => typeof t === "string" ? `group:${t}` : t.id} contentContainerStyle={{ padding: 24, gap: 12 }} ListHeaderComponent={<View style={{ gap: 12 }}>
    <TextInput accessibilityLabel="Buscar grupos ou músicas" placeholder="Buscar" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={{ color: colors.text, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12 }} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(["artist", "album", "folder", "genre", "year"] as const).map((value) => <Action key={value} label={{ artist: "Artistas", album: "Álbuns", folder: "Pastas", genre: "Gêneros", year: "Anos" }[value]} selected={value === group && !duplicateMode} onPress={() => { setGroup(value); setSelected(null); setDuplicateMode(false); }} />)}<Action label="Possíveis duplicatas" selected={duplicateMode} onPress={() => { setSelected(null); setDuplicateMode(true); }} /></View>
    <Action label="Importar M3U/M3U8" disabled={busy} onPress={() => void run(pickPlaylist)} />
    <Action label="Exportar seleção local" disabled={busy} onPress={() => void run(() => savePlaylist(selected ?? "CustodioMusic", selected || duplicateMode ? displayed : tracks))} />
    {selected && <Action label={`Voltar · ${selected}`} onPress={() => setSelected(null)} />}
    {duplicateMode && <><Text style={{ color: colors.muted }}>Correspondências de título, artista e duração são apenas sugestões. A confirmação compara os arquivos, sem alterar o áudio.</Text><Action label={busy ? "Comparando arquivos…" : "Confirmar arquivos idênticos"} disabled={busy || !duplicates.length} onPress={() => void run(confirmDuplicates)} /></>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{message}</Text>}
    {!selected && !duplicateMode && !!state.playlists.length && <><Text style={{ color: colors.text, fontWeight: "700", marginTop: 12 }}>Exportar playlist</Text>{state.playlists.map((list) => <Action key={list.id} label={list.name} disabled={busy} onPress={() => void run(() => savePlaylist(list.name, list.trackIds.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Track => !!t)))} />)}</>}
  </View>} renderItem={({ item }) => typeof item === "string" ? <Action label={item} onPress={() => { setSelected(item); setQuery(""); }} /> : <View><TrackRow track={item} onPress={() => void playLibraryTrack(item, displayed.map((t) => t.id))} />{confirmed[item.id] && <Text style={{ color: colors.accent }}>{confirmed[item.id]}</Text>}</View>} ListEmptyComponent={selected || duplicateMode ? <Text style={{ color: colors.muted }}>Nenhuma música nesta seleção.</Text> : undefined} /></Screen>;
}
