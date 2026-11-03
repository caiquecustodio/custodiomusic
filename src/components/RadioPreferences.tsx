import { Text, View } from "react-native";
import { useMusic } from "../lib/music";
import { Action } from "./ui";
export function RadioPreferences() {
  const { colors, radioPreferences, setRadioPreferences } = useMusic();
  const heading = { color: colors.text, fontSize: 18, fontWeight: "700" as const };
  const muted = { color: colors.muted, lineHeight: 22 };
  return <View style={{ gap: 12 }}>
        <Text style={heading}>Perfil de descoberta</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{([{ value: 0, label: "Conhecidas" }, { value: 0.3, label: "Equilibrada" }, { value: 0.7, label: "Descobertas" }, { value: 1, label: "Surpreenda" }]).map((option) => <Action key={option.value} label={option.label} selected={radioPreferences.discovery === option.value} onPress={() => setRadioPreferences({ discovery: option.value })} />)}</View>
      <Action label={radioPreferences.offline ? "Somente offline" : "Biblioteca e online"} selected={radioPreferences.offline} onPress={() => setRadioPreferences({ offline: !radioPreferences.offline })} />
      <Action label={radioPreferences.prefetch ? "Preparar próximas músicas: ligado" : "Preparar próximas músicas: desligado"} selected={radioPreferences.prefetch} onPress={() => setRadioPreferences({ prefetch: !radioPreferences.prefetch })} />
      <Text style={muted}>Prepara até duas músicas quando o áudio atual está estável. Usa internet e até 192 MB de cache temporário, sem adicionar downloads à biblioteca.</Text>

      {!!(radioPreferences.blockedArtists.length + radioPreferences.blockedTracks.length) && <Action label={`Limpar bloqueios (${radioPreferences.blockedArtists.length + radioPreferences.blockedTracks.length})`} onPress={() => setRadioPreferences({ blockedArtists: [], blockedTracks: [] })} />}
        <Text style={muted}>O aprendizado fica no celular. Metadados de gênero e ano são consultados online quando a sincronização automática está ativa.</Text>
</View>;
}
