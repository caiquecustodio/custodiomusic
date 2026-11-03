import { memo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { DownloadItem } from "../lib/downloads/types";
import { formatDuration } from "../lib/duration";
import { useMusicTheme } from "../lib/music";
import { Artwork } from "./Artwork";
import { IconButton } from "./ui";

export const sourceNames = { youtube: "YouTube", jamendo: "Jamendo", audius: "Audius" };
export const OnlineTrackRow = memo(function OnlineTrackRow({ item, active, pending, onPlay, onOptions }: {
  item: DownloadItem; active: boolean; pending: boolean;
  onPlay: (item: DownloadItem) => void; onOptions: (item: DownloadItem) => void;
}) {
  const colors = useMusicTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderRadius: 16, backgroundColor: active ? colors.accentSurface : "transparent" }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ouvir ${item.title}, ${item.artist}`} accessibilityState={{ selected: active, busy: pending }} disabled={pending} onPress={() => onPlay(item)} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.6 : 1 })}>
      <Artwork track={{ id: `${item.provider}:${item.id}`, artwork: item.thumbnail ?? undefined }} size={56} radius={12} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={1} style={{ color: active ? colors.accent : colors.text, fontSize: 15, fontWeight: "700" }}>{item.title}</Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{item.artist}</Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{sourceNames[item.provider]} · {formatDuration(item.duration)}</Text>
      </View>
      {pending && <ActivityIndicator size="small" color={colors.accent} />}
    </Pressable>
    <IconButton icon="more" label={`Opções de ${item.title}`} onPress={() => onOptions(item)} />
  </View>;
});
