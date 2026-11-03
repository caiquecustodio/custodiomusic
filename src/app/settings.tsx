import { RadioPreferences } from "../components/RadioPreferences";
import { tokens } from "../lib/theme";
import { ScrollView, Switch, Text, View } from "react-native";
import { useMusic } from "../lib/music";
import { Action, Disclosure, Header, Screen } from "../components/ui";
import { BackupPanel } from "../components/BackupPanel";
export default function SettingsScreen() {
  const { colors, state, toggleTheme, requestLibrary, addFiles, scanning, toggleAutoSync, syncLibrary, syncBulk, syncBusy, cancelSync } =
    useMusic();
  return (
    <Screen>
      <Header title="Configurações" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: tokens.space.xl,
          gap: tokens.space.xl,
        }}
      >
        <Disclosure title="Personalizar meu mix" detail="Suas preferências de descoberta e reprodução"><RadioPreferences /></Disclosure>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: tokens.radius.large,
            padding: tokens.space.xl,
            gap: tokens.space.lg,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
            Do seu jeito
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: tokens.font.body,
              lineHeight: 24,
            }}
          >
            Aparência {state.theme === "dark" ? "escura" : "clara"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>Tema escuro</Text>
            <Switch accessibilityLabel="Tema escuro" value={state.theme === "dark"} onValueChange={toggleTheme} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.surface} />
          </View>
        </View>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: tokens.radius.large,
            padding: tokens.space.xl,
            gap: tokens.space.lg,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
            Sua biblioteca
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: tokens.font.body,
              lineHeight: 24,
            }}
          >
            Músicas, capas e letras salvas no dispositivo, para ouvir offline.
          </Text>
          <Action
            label={scanning ? "Atualizando…" : "Atualizar biblioteca"}
            icon="refresh"
            onPress={() => {
              if (!scanning) void requestLibrary();
            }}
          />
          <Action label="Adicionar músicas" icon="folder" onPress={addFiles} />
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: tokens.radius.large, padding: tokens.space.xl, gap: tokens.space.lg }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>Metadados e letras</Text>
          <Text style={{ color: colors.muted, lineHeight: 24 }}>Busca online por título, artista e duração. Capas, letras, gêneros e ano ficam salvos para uso offline. O MusicBrainz recebe título e artista, sem envio do áudio.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.text, fontSize: 16 }}>Sincronizar automaticamente</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Prioriza a música atual e mapeia a biblioteca em segundo plano</Text></View>
            <Switch accessibilityLabel="Sincronizar capas, letras, gêneros e ano automaticamente" value={state.autoSync} onValueChange={toggleAutoSync} trackColor={{ false: colors.line, true: colors.accent }} thumbColor={colors.surface} />
          </View>
          {syncBulk.running && <View accessible accessibilityRole="progressbar" accessibilityLabel="Sincronização da biblioteca" accessibilityValue={{ min: 0, max: syncBulk.total, now: syncBulk.done }} style={{ height: 6, backgroundColor: colors.line, borderRadius: 3, overflow: "hidden" }}><View style={{ height: 6, width: `${syncBulk.total ? 100 * syncBulk.done / syncBulk.total : 0}%`, backgroundColor: colors.accent }} /></View>}
          <Action label={syncBulk.running ? `Sincronizando ${syncBulk.done}/${syncBulk.total}` : "Sincronizar músicas sem capa ou letra"} icon="refresh" disabled={!!syncBusy || syncBulk.running} onPress={() => void syncLibrary()} />
          {(syncBulk.running || syncBusy) && <Action label="Cancelar sincronização" onPress={cancelSync} />}
          {!syncBulk.running && syncBulk.total > 0 && <Text style={{ color: colors.muted }}>{syncBulk.done} de {syncBulk.total} músicas processadas. Resultados individuais aparecem no player.</Text>}
        </View>
        <Text
          style={{
            color: colors.muted,
            fontSize: tokens.font.caption,
            textAlign: "center",
          }}
        >
          Custódio Music · Seu som, do seu jeito
        </Text>
        <BackupPanel />
      </ScrollView>
    </Screen>
  );
}
