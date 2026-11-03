import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, usePathname } from "expo-router";
import { useMusicCommands, usePlayback, useMusicTheme, useGlobalPlaybackStatus } from "../lib/music";
import { goHome, mainSections, openSection } from "../lib/navigation";
import { tokens } from "../lib/theme";
import { Icon, IconName } from "./Icon";
import { Artwork } from "./Artwork";
import { SwipeTrack } from "./SwipeTrack";
export function ActionSheet({ visible, title, close, children }: { visible: boolean; title: string; close: () => void; children: ReactNode }) {
  const colors = useMusicTheme();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
      <Pressable accessibilityLabel="Fechar painel" accessibilityRole="button" onPress={close} style={{ flex: 1 }} />
      <SafeAreaView edges={["bottom", "left", "right"]} style={{ backgroundColor: colors.surface, maxHeight: "85%", width: "100%", maxWidth: 760, alignSelf: "center", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <View style={{ paddingLeft: 24, paddingRight: 12, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: "700", flex: 1 }}>{title}</Text>
          <IconButton icon="close" label="Fechar" onPress={close} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: 8, gap: 12 }}>{children}</ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}
export function CompactAction({ label, onPress, selected = false, disabled = false }: { label: string; onPress: () => void; selected?: boolean; disabled?: boolean }) {
  const colors = useMusicTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center", borderRadius: 12, backgroundColor: selected ? colors.accentSurface : "transparent", opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}><Text style={{ color: selected ? colors.accent : colors.muted, fontSize: 13, fontWeight: "600", flexShrink: 1 }}>{selected ? "✓ " : ""}{label}</Text></Pressable>;
}
export function IconButton({
  icon,
  label,
  onPress,
  active = false,
  filled = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  filled?: boolean;
  disabled?: boolean;
}) {
  const colors = useMusicTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.line }}
      style={({ pressed }) => [
        ui.iconButton,
        {
          backgroundColor: active && icon !== "heart" ? colors.accentSurface : "transparent",
          opacity: disabled ? 0.35 : pressed ? 0.55 : 1,
        },
      ]}
    >
      <Icon
        name={icon}
        color={active ? icon === "heart" ? colors.pink : colors.accent : colors.text}
        filled={filled}
      />
    </Pressable>
  );
}
export function Action({
  label,
  onPress,
  icon,
  selected = false,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  const colors = useMusicTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.line }}
      style={({ pressed }) => [
        ui.action,
        {
          backgroundColor: primary ? colors.accent : selected ? colors.accentSurface : colors.surface,
          borderColor: primary ? colors.accent : selected ? colors.accent : colors.line,
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
        },
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={20}
          color={primary ? colors.onAccent : selected ? colors.accent : colors.muted}
        />
      )}
      <Text
        style={{
          color: primary ? colors.onAccent : selected ? colors.accent : colors.text,
          fontSize: 14,
          fontWeight: "600",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Screen({
  children,
  mini = true,
}: {
  children: ReactNode;
  mini?: boolean;
}) {
  const colors = useMusicTheme();
  const pathname = usePathname();
  useFocusEffect(useCallback(() => {
    if (pathname === "/" || !mainSections.has(pathname)) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { goHome(); return true; });
    return () => subscription.remove();
  }, [pathname]));
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={mini ? ["top", "left", "right"] : ["top", "bottom", "left", "right"]}
    >
      <View style={{ flex: 1, width: "100%", maxWidth: 760, alignSelf: "center" }}>{children}</View>
    </SafeAreaView>
  );
}
export function SegmentedControl<T extends string>({ value, options, onChange }: {
  value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const colors = useMusicTheme();
  return <View style={{ flexDirection: "row", width: "100%", maxWidth: 420, backgroundColor: colors.surface2, padding: 4, borderRadius: 18 }}>
    {options.map((option) => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)} style={({ pressed }) => ({ flex: 1, minHeight: 44, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: value === option.value ? colors.surface : "transparent", opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: value === option.value ? colors.accent : colors.muted, fontSize: 13, fontWeight: "600", textAlign: "center" }}>{option.label}</Text>
    </Pressable>)}
  </View>;
}
export function BottomNavigation() {
  const colors = useMusicTheme();
  const pathname = usePathname();
  const destinations = [
    { path: "/", label: "Início", icon: "home" },
    { path: "/downloads", label: "Buscar", icon: "search" },
    { path: "/library", label: "Biblioteca", icon: "music" },
  ] as const;
  return <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.background, paddingTop: 8, paddingBottom: 4, width: "100%", maxWidth: 760, alignSelf: "center" }}>
    {destinations.map((item) => <Pressable key={item.path} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: pathname === item.path }} onPress={() => { if (pathname !== item.path) openSection(item.path); }} style={({ pressed }) => ({ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 3, borderRadius: 16, backgroundColor: pathname === item.path ? colors.accentSurface : "transparent" }}><Icon name={item.icon} size={21} color={pathname === item.path ? colors.accent : colors.muted} /></View>
      <Text style={{ color: pathname === item.path ? colors.accent : colors.muted, fontSize: 11, fontWeight: "600" }}>{item.label}</Text>
    </Pressable>)}
  </View>;
}
export function Disclosure({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  const colors = useMusicTheme();
  const [expanded, setExpanded] = useState(false);
  return <View style={{ width: "100%", marginTop: tokens.space.lg, borderWidth: 1, borderColor: colors.line, borderRadius: tokens.radius.medium, backgroundColor: colors.surface, overflow: "hidden" }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => ({ minHeight: tokens.touch, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        {detail && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{detail}</Text>}
      </View>
      <Icon name={expanded ? "close" : "plus"} color={colors.muted} size={20} />
    </Pressable>
    {expanded && <View style={{ borderTopWidth: 1, borderColor: colors.line, padding: 16, gap: 16 }}>{children}</View>}
  </View>;
}
export function Header({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const colors = useMusicTheme();
  const pathname = usePathname();
  return (
    <View style={ui.header}>
      { !mainSections.has(pathname) && <IconButton
        icon="back"
        label="Voltar"
        onPress={() =>
          mainSections.has(pathname) ? goHome() : router.canGoBack() ? router.back() : goHome()
        }
      /> }
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: tokens.font.heading,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
        {detail && (
          <Text
            style={{
              color: colors.muted,
              fontSize: tokens.font.caption,
              marginTop: tokens.space.xs,
            }}
          >
            {detail}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}
export function EmptyState({
  title,
  hint,
  busy = false,
}: {
  title: string;
  hint: string;
  busy?: boolean;
}) {
  const colors = useMusicTheme();
  return (
    <View style={ui.empty}>
      <View style={[ui.emptyIcon, { backgroundColor: colors.accentSurface }]}>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Icon name="music" color={colors.accent} size={32} />
        )}
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: 20,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontSize: tokens.font.body,
          lineHeight: 24,
          textAlign: "center",
          marginTop: tokens.space.sm,
        }}
      >
        {hint}
      </Text>
    </View>
  );
}
export function MiniPlayer() {
  const { current, playing, playbackError, resolvingStream, shuffle, repeat } = usePlayback();
  const colors = useMusicTheme();
  const { togglePlay, goToQueueTrack, toggleShuffle, cycleRepeat } = useMusicCommands();
  if (!current) return null;
  return <View style={[ui.mini, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
    <View style={ui.row}>
      <SwipeTrack onSkip={goToQueueTrack} label={`Abrir player: ${current.title}`} onPress={() => router.navigate("/player")}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Artwork track={current} size={40} />
          <View style={{ flex: 1, minWidth: 0, maxWidth: 190 }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{current.title}</Text>
            <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{playbackError ? "Falha ao carregar" : resolvingStream ? "Conectando…" : current.artist}</Text>
          </View>
        </View>
      </SwipeTrack>
      <MiniModeButton icon="shuffle" label={shuffle ? "Aleatório ligado" : "Ativar aleatório"} active={shuffle} onPress={toggleShuffle} />
      <MiniModeButton icon="repeat" label={repeat === "one" ? "Repetindo música atual" : repeat === "all" ? "Repetindo fila" : repeat === "single" ? "Tocar só esta música" : "Ativar repetição"} active={repeat !== "off"} repeatOne={repeat === "one"} onPress={cycleRepeat} />
      <IconButton icon={playing ? "pause" : "play"} label={playing ? "Pausar" : "Reproduzir"} onPress={togglePlay} active filled />
      <IconButton icon="next" label="Próxima música" onPress={() => goToQueueTrack(1)} />
    </View>
    <MiniTimeline />
  </View>;
}
function MiniModeButton({ icon, label, active, repeatOne = false, onPress }: { icon: IconName; label: string; active: boolean; repeatOne?: boolean; onPress: () => void }) {
  const colors = useMusicTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: 36, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: active ? colors.accentSurface : "transparent", opacity: pressed ? 0.55 : 1 })}>
    <View><Icon name={icon} size={19} color={active ? colors.accent : colors.muted} />{repeatOne && <View style={{ position: "absolute", right: -5, top: -6, backgroundColor: colors.accent, borderRadius: 6, minWidth: 12, height: 12, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.onAccent, fontSize: 8, lineHeight: 10, fontWeight: "800" }}>1</Text></View>}</View>
  </Pressable>;
}
function MiniTimeline() {
  const { current } = usePlayback();
  const colors = useMusicTheme();
  const status = useGlobalPlaybackStatus();
  const duration = status.duration || current?.duration || 0;
  const progress = duration > 0 ? Math.min(100, Math.max(0, status.currentTime / duration * 100)) : 0;
  return <View>
      <View
        style={{
          height: 2,
          marginTop: tokens.space.sm,
          backgroundColor: colors.line,
        }}
      >
        <View
          style={{
            height: 2,
            width: `${progress}%`,
            backgroundColor: colors.accent,
          }}
        />
      </View>
    </View>;
}
export const ui = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
  },
  iconButton: {
    minWidth: tokens.touch,
    minHeight: tokens.touch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.large,
  },
  action: {
    minHeight: tokens.touch,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
  },
  empty: {
    alignItems: "center",
    padding: tokens.space.xxl,
    marginTop: tokens.space.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: tokens.radius.large,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.space.xl,
  },
  mini: {
    width: "auto",
    maxWidth: 736,
    marginHorizontal: tokens.space.md,
    marginTop: tokens.space.sm,
    marginBottom: tokens.space.sm,
    borderRadius: tokens.radius.medium,
    padding: tokens.space.sm,
    paddingBottom: 0,
    borderWidth: 1,
    overflow: "hidden",
  },
});
