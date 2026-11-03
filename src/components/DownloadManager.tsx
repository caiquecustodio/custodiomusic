import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { downloads } from "../../modules/music-downloads/src";
import { useDownloads } from "../lib/downloads/context";
import { downloadProgress } from "../lib/downloads/model";
import { useMusicTheme } from "../lib/music";
import { Action, EmptyState } from "./ui";

const labels = { queued: "Na fila", resolving: "Preparando", downloading: "Baixando", processing: "Finalizando", completed: "Disponível offline", failed: "Falha no download", cancelled: "Cancelado", interrupted: "Interrompido" };
export function DownloadManager() {
  const colors = useMusicTheme();
  const { jobs, error, refresh, notifications } = useDownloads();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function run(work: () => Promise<unknown>, needsNotification = false) {
    setPending(true); setMessage("");
    try { if (needsNotification) await notifications(); await work(); await refresh(); }
    catch { setMessage("Não foi possível atualizar o download. Confira sua conexão e tente novamente."); }
    finally { setPending(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
    <Text style={{ color: colors.muted, lineHeight: 22 }}>Suas músicas para ouvir mesmo sem internet.</Text>
    {!!(message || error) && <Text accessibilityRole="alert" style={{ color: colors.text }}>{message || error}</Text>}
    {jobs.some((job) => job.state === "queued") && <Action label="Continuar downloads" disabled={pending} onPress={() => void run(downloads.resumeQueue, true)} />}
    {!jobs.length && <EmptyState title="Sua música, sempre por perto" hint="Abra as opções de uma música online e toque em Baixar. As faixas concluídas aparecem na Biblioteca." />}
    {[...jobs].reverse().map((job) => {
      const progress = downloadProgress(job);
      const active = ["queued", "resolving", "downloading", "processing"].includes(job.state);
      return <View key={job.id} style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 10 }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{job.item.title}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{job.item.artist} · {labels[job.state]}</Text>
        {job.state === "downloading" && <>
          <View style={{ height: 4, backgroundColor: colors.line, borderRadius: 4, overflow: "hidden" }}><View style={{ height: 4, width: `${Math.round((progress ?? 0) * 100)}%`, backgroundColor: colors.accent }} /></View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{(job.bytes / 1048576).toFixed(1)} MB{progress !== null ? ` · ${Math.round(progress * 100)}%` : " · baixando"}</Text>
        </>}
        {!!job.error && <Text style={{ color: colors.muted, lineHeight: 20 }}>{job.error.replace(/https?:\/\/\S+/g, "[fonte]").slice(0, 250)}</Text>}
        {active && <Action label="Cancelar" disabled={pending} onPress={() => void run(() => downloads.cancel(job.id))} />}
        {["failed", "cancelled", "interrupted"].includes(job.state) && <Action label="Tentar novamente" icon="refresh" disabled={pending} onPress={() => void run(() => downloads.retry(job.id), true)} />}
      </View>;
    })}
  </ScrollView>;
}
