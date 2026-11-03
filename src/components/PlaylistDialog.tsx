import { tokens } from "../lib/theme";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMusic } from "../lib/music";
import { Action, IconButton } from "./ui";
export function PlaylistDialog({
  visible,
  close,
  created,
}: {
  visible: boolean;
  close: () => void;
  created?: (id: string) => void;
}) {
  const { colors, state, current, createPlaylist, addCurrentToPlaylist } =
    useMusic();
  const [name, setName] = useState("");
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: "#00000099",
          justifyContent: "center",
          padding: tokens.space.xl,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: tokens.radius.large,
            padding: tokens.space.xl,
            maxHeight: "85%",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: tokens.font.heading,
                  fontWeight: "700",
                  flex: 1,
                }}
              >
                Sua playlist
              </Text>
              <IconButton icon="close" label="Fechar" onPress={close} />
            </View>
            <Text
              style={{
                color: colors.muted,
                fontSize: tokens.font.body,
                lineHeight: 24,
                marginVertical: tokens.space.md,
              }}
            >
              {current
                ? "Crie uma coleção com a faixa atual ou adicione a uma playlist existente."
                : "Dê um nome para sua nova coleção."}
            </Text>
            <TextInput
              accessibilityLabel="Nome da playlist"
              value={name}
              onChangeText={setName}
              maxLength={36}
              placeholder="Ex.: Noite tranquila"
              placeholderTextColor={colors.muted}
              style={{
                color: colors.text,
                backgroundColor: colors.surface2,
                padding: tokens.space.lg,
                borderRadius: tokens.radius.small,
                fontSize: tokens.font.body,
                marginBottom: tokens.space.lg,
              }}
            />
            <Action
              label="Criar playlist"
              icon="plus"
              selected
              onPress={() => {
                const id = createPlaylist(name);
                if (id) {
                  setName("");
                  created?.(id);
                  close();
                }
              }}
            />
            {current &&
              state.playlists.map((playlist) => (
                <View key={playlist.id} style={{ marginTop: tokens.space.md }}>
                  <Action
                    label={playlist.name}
                    icon={
                      playlist.trackIds.includes(current.id) ? "check" : "plus"
                    }
                    onPress={() => {
                      addCurrentToPlaylist(playlist.id);
                      close();
                    }}
                  />
                </View>
              ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
