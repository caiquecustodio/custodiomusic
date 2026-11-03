import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import { useMusic, usePlaybackStatus } from "../lib/music";
import { formatPosition } from "../lib/duration";
import { Action } from "./ui";

export function PlaybackTools() {
  const { colors, loopRange, markA, markB, clearRange, sleepDeadline, sleepAtEnd, setSleep } = useMusic();
  const [open, setOpen] = useState(false);
  const status = usePlaybackStatus(open);
  return <View style={{ width: "100%", gap: 12, marginTop: 16 }}>
    <Action label={open ? "Fechar ferramentas" : "Treinar trecho e temporizador"} onPress={() => setOpen(!open)} />
    {(sleepDeadline || sleepAtEnd) && <Text style={{ color: colors.accent }}>Temporizador: {sleepAtEnd ? "parar ao fim da música" : sleepDeadline && <SleepCountdown key={sleepDeadline} deadline={sleepDeadline} />}</Text>}
    {loopRange && <Text style={{ color: colors.accent }}>Trecho A: {formatPosition(loopRange.a)} · B: {loopRange.b === null ? "a marcar" : formatPosition(loopRange.b)}</Text>}
    {open && <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 20, gap: 12 }}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>Repetir trecho A–B</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>Marque o início A. Depois avance ou ouça até o fim do trecho e marque B.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Action label="Marcar A" disabled={!status.isLoaded} onPress={markA} />
        <Action label="Marcar B" disabled={!loopRange || status.currentTime <= loopRange.a + 0.5} onPress={markB} />
        <Action label="Limpar trecho" disabled={!loopRange} onPress={clearRange} />
      </View>
      <Text style={{ color: colors.text, fontWeight: "700" }}>Parar reprodução</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[15, 30, 60].map((minutes) => <Action key={minutes} label={`${minutes} min`} onPress={() => setSleep(minutes)} />)}
        <Action label="Fim da música" selected={sleepAtEnd} onPress={() => setSleep("end")} />
        <Action label="Cancelar timer" disabled={!sleepDeadline && !sleepAtEnd} onPress={() => setSleep(null)} />
      </View>
    </View>}
  </View>;
}
function SleepCountdown({ deadline }: { deadline: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  useFocusEffect(useCallback(() => {
    const interval = setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 1000);
    return () => clearInterval(interval);
  }, [deadline]));
  return <Text>{formatPosition(remaining)}</Text>;
}
