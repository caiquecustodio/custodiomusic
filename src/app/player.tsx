import { ContextDiscovery } from "../components/ContextDiscovery";
import { GenreStations } from "../components/GenreStations";
import { OnlineActions } from "../components/OnlineActions";
import { tokens } from "../lib/theme";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useMusic } from "../lib/music";
import { PlayerTimeline } from "../components/PlayerTimeline";
import { SwipeTrack } from "../components/SwipeTrack";
import { Artwork } from "../components/Artwork";
import {
  Action,
  ActionSheet,
  CompactAction,
  Disclosure,
  EmptyState,
  Header,
  IconButton,
  Screen,
  SegmentedControl,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { PlaylistDialog } from "../components/PlaylistDialog";
import { LyricsView } from "../components/LyricsView";
import { TrackSyncPanel } from "../components/TrackSyncPanel";
import { PlaybackTools } from "../components/PlaybackTools";
import { router } from "expo-router";
export default function PlayerScreen() {
  const {
    current,
    colors,
    player,
    playTrack,
    queue,
    state,
    toggleFavorite,
    togglePlay,
    playing,
    status,
    toggleShuffle,
    cycleRepeat,
    goToQueueTrack,
    addFiles,
    startRadio, stopRadio, radioActive, blockRecommendation, playbackError, resolvingStream, streaming,
  } = useMusic();
  const { width, height } = useWindowDimensions();
  const [showLyrics, setShowLyrics] = useState(false);
  const [more, setMore] = useState(false);
  const [dialog, setDialog] = useState(false);
  if (!current)
    return (
      <Screen mini={false}>
        <Header title="Tocando agora" />
        <EmptyState
          title="Escolha a sua trilha"
          hint="Escolha uma música no Início, na Busca ou na Biblioteca."
        />
      </Screen>
    );
  const size = Math.max(160, Math.min(width - 64, height * 0.29, 340));
  const duration = status.duration || current.duration;
  const favorite = state.favorites.includes(current.id);
  const seek = (value: number) => {
    if (status.isLoaded && duration > 0)
      void player.seekTo(Math.max(0, Math.min(duration, value))).catch(() => undefined);
  };
  return (
    <Screen mini={false}>
      <Header
        title="Tocando agora"
        detail={resolvingStream ? "Conectando à fonte…" : status.isBuffering ? "Carregando áudio…" : streaming ? "Reprodução online" : "Da sua biblioteca"}
        action={
          <IconButton
            icon="queue"
            label="Abrir fila"
            onPress={() => router.navigate("/queue")}
          />
        }
      />
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: tokens.space.xl,
          paddingBottom: tokens.space.xxl,
          alignItems: "center",
        }}
      >
        {(playbackError || status.error) && (
          <View
            accessibilityRole="alert"
            style={{
              width: "100%",
              padding: tokens.space.lg,
              marginTop: tokens.space.lg,
              borderRadius: tokens.radius.medium,
              backgroundColor: colors.accentSurface,
              gap: tokens.space.md,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: tokens.font.body,
                lineHeight: 24,
              }}
            >
              {playbackError ?? "Não foi possível abrir esta música. Confira o arquivo ou a conexão e tente novamente."}
            </Text>
            <Action label="Tentar novamente" icon="play" onPress={() => void playTrack(current, queue)} />
            {!current.online && !streaming && <Action label="Escolher arquivo" icon="folder" onPress={addFiles} />}
          </View>
        )}

        <View
          style={{
            width: showLyrics ? "100%" : size,
            height: showLyrics ? Math.max(380, size) : size,
            marginTop: tokens.space.sm,
            marginBottom: tokens.space.lg,
            borderRadius: tokens.radius.large,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surface,
          }}
        >
          {showLyrics ? <LyricsView key={current.id} height={Math.max(380, size)} seek={seek} /> : <SwipeTrack onSkip={goToQueueTrack}><Artwork track={current} size={size} radius={24} /></SwipeTrack>}
        </View>
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            gap: tokens.space.lg,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                color: colors.text,
                fontSize: tokens.font.heading,
                fontWeight: "700",
                letterSpacing: -0.5,
              }}
            >
              {current.title}
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: tokens.font.body,
                marginTop: tokens.space.sm,
              }}
            >
              {current.artist}
            </Text>
          </View>
          <IconButton
            icon="heart"
            label={
              favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"
            }
            active={favorite}
            filled={favorite}
            onPress={() => toggleFavorite(current.id)}
          />
        </View>
        <PlayerTimeline key={`timeline:${current.id}`} />
        <View style={{ width: "100%", flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginTop: tokens.space.md }}>
          <Pressable accessibilityRole="button" accessibilityLabel={state.shuffle ? "Desativar reprodução aleatória" : "Ativar reprodução aleatória"} accessibilityState={{ selected: state.shuffle }} onPress={toggleShuffle} style={({ pressed }) => ({ minWidth: 140, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 24, backgroundColor: state.shuffle ? colors.accentSurface : "transparent", opacity: pressed ? 0.55 : 1 })}>
            <Icon name="shuffle" size={20} color={state.shuffle ? colors.accent : colors.muted} />
            <Text style={{ color: state.shuffle ? colors.accent : colors.muted, fontSize: 13, fontWeight: "600" }}>Aleatório</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={state.repeat === "one" ? "Repetindo música atual. Alterar modo de repetição" : state.repeat === "all" ? "Repetindo fila. Alterar modo de repetição" : "Ativar repetição"} accessibilityState={{ selected: state.repeat !== "off" }} onPress={cycleRepeat} style={({ pressed }) => ({ minWidth: 140, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 24, backgroundColor: state.repeat !== "off" ? colors.accentSurface : "transparent", opacity: pressed ? 0.55 : 1 })}>
            <Icon name="repeat" size={20} color={state.repeat !== "off" ? colors.accent : colors.muted} />
            <Text style={{ color: state.repeat !== "off" ? colors.accent : colors.muted, fontSize: 13, fontWeight: "600" }}>{state.repeat === "one" ? "Repetir música · 1" : state.repeat === "all" ? "Repetir fila" : "Repetir"}</Text>
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: "row",
            width: "100%",
            maxWidth: 360,
            justifyContent: "space-between",
            alignItems: "center",
            marginVertical: tokens.space.lg,
          }}
        >
          <IconButton
            icon="previous"
            label="Música anterior"
            onPress={() => goToQueueTrack(-1)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pausar" : "Reproduzir"}
            onPress={togglePlay}
            style={({ pressed }) => ({
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.65 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Icon
              name={playing ? "pause" : "play"}
              size={32}
              color={colors.onAccent}
              filled
            />
          </Pressable>
          <IconButton
            icon="next"
            label="Próxima música"
            onPress={() => goToQueueTrack(1)}
          />
        </View>
        <View
          style={{
            width: "100%",
            alignItems: "center",
            marginVertical: tokens.space.md,
          }}
        >
          <SegmentedControl value={showLyrics ? "lyrics" : "artwork"} options={[{ value: "artwork", label: "Capa" }, { value: "lyrics", label: "Letra" }]} onChange={(value) => setShowLyrics(value === "lyrics")} />
        </View>
        <CompactAction label="A seguir · abrir fila" onPress={() => router.navigate("/queue")} />
        <View style={{ width: "100%", alignItems: "center", marginTop: 16 }}><CompactAction label="Mais opções" onPress={() => setMore(true)} /></View>
      </ScrollView>
      <ActionSheet visible={more} title="Opções da música" close={() => setMore(false)}>
        {(current.online || current.origin) && <OnlineActions playing item={{ provider: (current.online ?? current.origin)!.provider, id: (current.online ?? current.origin)!.sourceId, url: (current.online ?? current.origin)!.sourceUrl, title: current.title, artist: current.artist, duration: current.duration, thumbnail: current.artwork ?? null, downloadable: current.online?.downloadable ?? true }} />}
        <ContextDiscovery onSearch={(query) => { setMore(false); router.navigate({ pathname: "/downloads", params: { query } }); }} />
        <GenreStations />
        <Disclosure title="Rádio e descoberta" detail={radioActive ? "Rádio ativa" : "Escolhas para você"}>
          <Action label="Rádio desta música" onPress={() => void startRadio(current)} />
          {radioActive && <Action label="Encerrar rádio" onPress={stopRadio} />}
          <Action label="Não recomendar esta música" onPress={() => blockRecommendation(current)} />
          <Action label="Não recomendar este artista" onPress={() => blockRecommendation(current, true)} />
        </Disclosure>
        <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap: tokens.space.md, marginTop: tokens.space.lg }}>
          <Action
            label="Playlist"
            icon="plus"
            onPress={() => { setMore(false); setTimeout(() => setDialog(true), 200); }}
          />
        <Action label="Cantar em tela cheia" icon="audio" onPress={() => { setMore(false); router.navigate("/sing"); }} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Action label="Voltar 10 segundos" icon="rewind" onPress={() => seek(player.currentTime - 10)} /><Action label="Avançar 10 segundos" icon="forward" onPress={() => seek(player.currentTime + 10)} /></View>
        <Action label="Organizar gêneros desta música" onPress={() => { setMore(false); router.navigate({ pathname: "/track-details", params: { id: current.id } }); }} />
        <PlaybackTools />
        <Disclosure title="Capas e letras" detail="Sincronizar, identificar música e importar letra">
          <TrackSyncPanel key={current.id} />
        </Disclosure>
      </ActionSheet>
      <PlaylistDialog visible={dialog} close={() => setDialog(false)} />
    </Screen>
  );
}
