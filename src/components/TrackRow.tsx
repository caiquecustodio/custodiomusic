import { router } from "expo-router";
import { tokens } from "../lib/theme";
import { Pressable, Text, View } from "react-native";
import { Track } from "../lib/types";
import { useMusicCommands, useMusicTheme, useTrackRows } from "../lib/music";
import { memo, useCallback, useState } from "react";
import { formatDuration } from "../lib/duration";
import { Artwork } from "./Artwork";
import { Action, ActionSheet, IconButton } from "./ui";
import { Icon } from "./Icon";
type TrackRowProps = {
  track: Track;
  onPress?: () => void;
  onSelectTrack?: (track: Track) => void;
};
export const TrackRow = memo(function TrackRow({ track, onPress, onSelectTrack }: TrackRowProps) {
  const { currentId, favorites } = useTrackRows();
  const select = useCallback(() => { if (onSelectTrack) onSelectTrack(track); else onPress?.(); }, [onSelectTrack, track, onPress]);
  return <TrackRowView track={track} onPress={select} active={currentId === track.id} favorite={favorites.has(track.id)} />;
});
const TrackRowView = memo(function TrackRowView({ track, onPress, active, favorite }: {
  track: Track; onPress: () => void; active: boolean; favorite: boolean;
}) {
  const colors = useMusicTheme();
  const { toggleFavorite, playNext } = useMusicCommands();
  const [more, setMore] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: tokens.space.sm,
        paddingHorizontal: tokens.space.sm,
        marginBottom: 4,
        borderRadius: tokens.radius.medium,
        backgroundColor: active ? colors.surface2 : "transparent",
        borderLeftWidth: 3,
        borderLeftColor: active ? colors.accent : "transparent",
        gap: tokens.space.xs,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${track.title}, ${track.artist}${active ? ", faixa atual" : ""}`}
        android_ripple={{ color: colors.line }}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: tokens.space.md,
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <View>
          <Artwork track={track} />
          {active && (
            <View
              style={{
                position: "absolute",
                right: -3,
                bottom: -3,
                padding: 3,
                borderRadius: 8,
                backgroundColor: colors.accentSurface,
              }}
            >
              <Icon name="audio" size={14} color={colors.accent} />
            </View>
          )}
        </View>
        <View
          style={{ flex: 1, minWidth: 0, paddingVertical: tokens.space.sm }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: tokens.font.body,
              fontWeight: "600",
            }}
          >
            {track.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.muted,
              fontSize: tokens.font.caption,
              marginTop: tokens.space.xs,
            }}
          >
            {track.artist} · {formatDuration(track.duration)}
          </Text>
        </View>
      </Pressable>
      <IconButton icon="more" label={`Opções de ${track.title}`} onPress={() => setMore(true)} />
      <IconButton
        icon="heart"
        label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        onPress={() => toggleFavorite(track.id)}
        active={favorite}
        filled={favorite}
      />
      <ActionSheet visible={more} title={track.title} close={() => setMore(false)}>
        <Action label="Tocar a seguir" icon="queue" disabled={active} onPress={() => { playNext(track.id); setMore(false); }} />
        <Action label="Organizar gêneros" icon="music" onPress={() => { setMore(false); router.navigate({ pathname: "/track-details", params: { id: track.id } }); }} />
      </ActionSheet>
    </View>
  );
});
