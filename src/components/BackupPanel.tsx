import { useState } from "react";
import { Platform, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Directory, File, Paths } from "expo-file-system";
import { useMusic } from "../lib/music";
import { backupTrackId, matchBackupTracks, parseBackup, type MusicBackup } from "../lib/backup-model";
import { readLyrics, writeLyrics } from "../lib/metadata-storage";
import { Action } from "./ui";
import { downloads, nativeDownloads } from "../../modules/music-downloads/src";
import { parseListening } from "../lib/discovery-model";

export function BackupPanel() {
  const { colors, tracks, state, restorePreferences, updateTrackMetadata, syncBusy, syncBulk, reloadCurrentLyrics, historyEnabled, player, current, refreshListening } = useMusic();
  const [includeHistory, setIncludeHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<MusicBackup | null>(null);
  const run = async (work: () => Promise<void>) => { setBusy(true); setMessage(""); try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir o backup."); } finally { setBusy(false); } };
  const exportBackup = async () => {
    const lyrics: MusicBackup["lyrics"] = [];
    for (const track of tracks) { const data = await readLyrics(track.id); if (data) lyrics.push({ id: backupTrackId(track.id), data }); }
    const portableState = { ...state, personalGenres: (state.personalGenres ?? []).map((genre) => ({ ...genre, trackIds: genre.trackIds.map(backupTrackId) })), favorites: state.favorites.map(backupTrackId), playlists: state.playlists.map((list) => ({ ...list, trackIds: list.trackIds.map(backupTrackId) })) };
    const backup: MusicBackup = { format: "custodio-backup", version: 1, state: portableState, tracks: tracks.map(({ id, title, artist, duration, lyricsOffset }) => ({ id: backupTrackId(id), title, artist, duration, lyricsOffset })), lyrics };
    if (includeHistory && nativeDownloads) backup.listening = await downloads.listening(true);
    const text = JSON.stringify(backup, null, 2);
    if (text.length > 20 * 1024 * 1024) throw new Error("Backup excede 20 MB. Reduza a quantidade de letras importadas.");
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "CustodioMusic-backup.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      const directory = new Directory(Paths.document, "backups"); directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, "CustodioMusic-backup.json"); await file.write(text);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Salvar backup do Custódio" });
      else await file.preview({ mimeType: "application/json", title: "Backup do Custódio" });
    }
    setMessage("Backup exportado. Áudios e imagens não fazem parte do arquivo.");
  };
  const pickBackup = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > 20 * 1024 * 1024) throw new Error("Backup maior que 20 MB.");
    const text = Platform.OS === "web" && asset.file ? await asset.file.text() : await new File(asset.uri).text();
    const backup = parseBackup(text);
    if (backup.listening) backup.listening = parseListening(backup.listening);
    setPending(backup);
  };
  const restore = async () => {
    if (!pending) return;
    const mapping = matchBackupTracks(pending, tracks);
    if (pending.listening && nativeDownloads) {
      await nativeDownloads.listeningEnabled(false);
      try {
        const listening = parseListening(pending.listening);
        // Keep snapshots of unavailable tracks; remap only identities known on this device.
        const remap = (id: string) => mapping.get(id) ?? id;
        await nativeDownloads.restoreListening(JSON.stringify({ ...listening, days: listening.days.map((d) => ({ ...d, trackId: remap(d.trackId) })), events: listening.events.map((e) => ({ ...e, trackId: remap(e.trackId) })) }));
      } finally {
        await nativeDownloads.listeningEnabled(historyEnabled);
        if (historyEnabled && current && nativeDownloads.playbackQueueVersion) await nativeDownloads.observeListening(player.native, JSON.stringify({ ...current, source: current.online?.provider ?? current.origin?.provider ?? "local" }), true);
      }
      await refreshListening();
    }
    for (const entry of pending.lyrics) { const id = mapping.get(entry.id); if (id) await writeLyrics(id, entry.data); }
    for (const track of pending.tracks) { const id = mapping.get(track.id); if (id && track.lyricsOffset !== undefined) updateTrackMetadata(id, { lyricsOffset: track.lyricsOffset }); }
    const mapIds = (ids: string[]) => [...new Set(ids.map((id) => mapping.get(id)).filter((id): id is string => !!id))];
    const lists = new Map(state.playlists.map((list) => [list.id, list]));
    for (const list of pending.state.playlists) lists.set(list.id, { id: list.id, name: list.name, trackIds: mapIds(list.trackIds) });
    const genres = new Map((state.personalGenres ?? []).map((genre) => [genre.id, genre]));
    for (const genre of pending.state.personalGenres ?? []) genres.set(genre.id, { ...genre, trackIds: [...new Set([...mapIds(genre.trackIds), ...genre.trackIds.filter((id) => /^online:(youtube|jamendo|audius):/.test(id))])] });
    restorePreferences({ ...pending.state, personalGenres: [...genres.values()], favorites: [...new Set([...state.favorites, ...mapIds(pending.state.favorites)])], playlists: [...lists.values()] });
    await reloadCurrentLyrics();
    setMessage(`Backup restaurado para ${mapping.size} músicas. ${pending.tracks.length - mapping.size} não encontradas; importe os áudios correspondentes e restaure novamente.`);
    setPending(null);
  };
  return <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 24, gap: 16 }}>
    <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>Backup e restauração</Text>
    <Text style={{ color: colors.muted, lineHeight: 22 }}>Salve favoritos, playlists, preferências, letras e tempos ajustados. Os áudios precisam estar disponíveis na biblioteca ao restaurar.</Text>
    <Action label="Exportar backup" disabled={busy || !!syncBusy || syncBulk.running} onPress={() => void run(exportBackup)} />
    <Action label={includeHistory ? "Incluir histórico: sim" : "Incluir histórico: não"} selected={includeHistory} disabled={busy || !nativeDownloads} onPress={() => setIncludeHistory(!includeHistory)} />
    <Action label="Importar backup" disabled={busy || !!syncBusy || syncBulk.running} onPress={() => void run(pickBackup)} />
    {pending && <><Text style={{ color: colors.text }}>{pending.state.playlists.length} playlists · {pending.state.favorites.length} favoritos · {pending.lyrics.length} letras. As preferências serão aplicadas; playlists com o mesmo identificador serão atualizadas.{pending.listening ? " O histórico e os recaps atuais serão substituídos pelos do backup." : ""}</Text><Action label="Confirmar restauração" primary disabled={busy || (!!pending.listening && !nativeDownloads)} onPress={() => void run(restore)} /><Action label="Cancelar" disabled={busy} onPress={() => setPending(null)} /></>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, lineHeight: 22 }}>{message}</Text>}
  </View>;
}
