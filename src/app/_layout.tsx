import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { setAudioModeAsync } from "expo-audio";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppState, View } from "react-native";
import { BottomNavigation, MiniPlayer } from "../components/ui";
import { DownloadsProvider, useSharedLink } from "../lib/downloads/context";
import { MusicProvider, useLibrary, useMusic, useMusicTheme } from "../lib/music";
import { scheduleIdle } from "../lib/idle";
import { prefetchArtwork } from "../lib/artwork-cache";
export const unstable_settings = { anchor: "index" };
function Navigation() {
  const colors = useMusicTheme();
  const pathname = usePathname();
  const chrome = pathname !== "/player" && pathname !== "/sing";
  const { sharedLink, consumeSharedLink } = useSharedLink();
  useEffect(() => {
    if (!sharedLink) return;
    router.dismissTo("/");
    router.navigate({ pathname: "/downloads", params: { url: sharedLink } });
    consumeSharedLink();
  }, [sharedLink, consumeSharedLink]);
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMixPersistent",
    }).catch(() => undefined);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={colors.background === "#0C0B12" ? "light" : "dark"} />
      <PrepareScreens />
      <PrepareArtwork />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: colors.background },
          freezeOnBlur: true,
        }}
      />
      {chrome && <SafeAreaView edges={["bottom", "left", "right"]} style={{ backgroundColor: colors.background }}>
        <View style={{ width: "100%", maxWidth: 760, alignSelf: "center" }}><MiniPlayer /></View>
        <BottomNavigation />
      </SafeAreaView>}
    </View>
  );
}
function PrepareScreens() {
  const { hydrated } = useLibrary();
  const prepared = useRef(false);
  useEffect(() => {
    if (!hydrated || prepared.current) return;
    const cancel = scheduleIdle(() => {
      if (AppState.currentState !== "active") return;
      prepared.current = true;
      router.prefetch("/player");
      router.prefetch("/queue");
    }, 2000);
    return cancel;
  }, [hydrated]);
  return null;
}
function PrepareArtwork() {
  const { current, queue, tracks, state, status, radioPreferences } = useMusic();
  useEffect(() => {
    if (!current || !status.playing || status.isBuffering || radioPreferences.offline || state.shuffle) return;
    const cancel = scheduleIdle(() => {
      if (AppState.currentState !== "active") return;
      const index = queue.indexOf(current.id);
      if (index < 0) return;
      const byId = new Map(tracks.map((track) => [track.id, track]));
      const uris = [current.artwork, ...queue.slice(index + 1, index + 3).map((id) => byId.get(id)?.artwork)].filter((uri): uri is string => !!uri);
      void prefetchArtwork(uris).catch(() => undefined);
    });
    return cancel;
  }, [current, queue, tracks, status.playing, status.isBuffering, radioPreferences.offline, state.shuffle]);
  return null;
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DownloadsProvider>
        <MusicProvider>
          <Navigation />
        </MusicProvider>
      </DownloadsProvider>
    </SafeAreaProvider>
  );
}
