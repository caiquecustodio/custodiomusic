import { router } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { downloads } from "../../modules/music-downloads/src";
import { useDownloads } from "../lib/downloads/context";
import { useMusic } from "../lib/music";
import type { DownloadItem } from "../lib/downloads/types";
import { Action } from "./ui";

export function OnlineActions({ item, playing = false, suggestions = [], onNavigate }: { item: DownloadItem; playing?: boolean; suggestions?: DownloadItem[]; onNavigate?: () => void }) {
  const { colors, listenOnline } = useMusic();
  const { notifications, refresh, jobs } = useDownloads();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const existing = jobs.find((j) => j.item.provider === item.provider && j.item.id === item.id && ["queued", "resolving", "downloading", "processing", "completed"].includes(j.state));
  const run = async (work: () => Promise<unknown>) => { setBusy(true); setMessage(""); try { await work(); } catch { setMessage("Não foi possível concluir. Confira a fonte e sua conexão."); } finally { setBusy(false); } };
  const download = async () => { const result = await downloads.resolve(item.provider, item.id); const format = result.formats[0]; if (!format) throw new Error("Formato indisponível"); await notifications(); await downloads.enqueue(item.provider, item.id, format.id); await refresh(); setMessage("Download iniciado. Ouvir e baixar simultaneamente pode consumir internet duas vezes."); };
  return <View style={{ gap: 8 }}>
    <Text style={{ color: colors.muted, fontSize: 13 }}>{item.artist} · {{ youtube: "YouTube", jamendo: "Jamendo", audius: "Audius" }[item.provider]}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {!playing && <><Action label="Ouvir" icon="play" disabled={busy} onPress={() => void run(async () => { await listenOnline(item, false, suggestions); onNavigate?.(); router.navigate("/player"); })} /><Action label="Tocar a seguir" icon="queue" disabled={busy} onPress={() => void run(async () => { await listenOnline(item, true); setMessage("Adicionada para tocar a seguir."); })} /></>}
      {item.downloadable && <Action label={existing?.state === "completed" ? "Disponível offline" : existing ? "Download na fila" : playing ? "Baixar esta música" : "Baixar"} disabled={busy || !!existing} onPress={() => void run(download)} />}
      <Action label="Abrir página da música" disabled={busy} onPress={() => void run(() => Linking.openURL(item.url))} />
    </View>
    {!item.downloadable && <Text style={{ color: colors.muted }}>A fonte não disponibilizou download desta faixa.</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{message}</Text>}
  </View>;
}
