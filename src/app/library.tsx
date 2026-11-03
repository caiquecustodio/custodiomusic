import { tokens } from "../lib/theme";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useLibrary, useMusicCommands, useMusicTheme } from "../lib/music";
import type { Track } from "../lib/types";
import { TrackRow } from "../components/TrackRow";
import { BrandMark } from "../components/Artwork";
import { Icon } from "../components/Icon";
import { Action, ActionSheet, CompactAction, EmptyState, IconButton, Screen, SegmentedControl } from "../components/ui";
import { PlaylistDialog } from "../components/PlaylistDialog";
import { PlaylistManager } from "../components/PlaylistManager";
import { sortTracks } from "../lib/listening-model";
type Section = "library" | "favorites" | "playlists";
export default function LibraryScreen() {
  const {
    tracks,
    state,
    hydrated,
    libraryError,
    scanning,
  } = useLibrary();
  const colors = useMusicTheme();
  const { playLibraryTrack: playTrack, requestLibrary, addFiles, setLibrarySort, removeFromPlaylist } = useMusicCommands();
  const [section, setSection] = useState<Section>("library");
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [libraryPanel, setLibraryPanel] = useState<"add" | "sort" | null>(null);
  const [dialog, setDialog] = useState(false);
  const playlist = state.playlists.find((item) => item.id === activePlaylist);
  const tracksById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);

  const displayed = useMemo(() => {
    const ids =
      section === "favorites"
        ? state.favorites
        : section === "playlists"
          ? (playlist?.trackIds ?? [])
          : null;
    const result = ids
      ? ids
          .map((id) => tracksById.get(id))
          .filter((track) => !!track)
      : tracks;
    return sortTracks(result, state.librarySort);
  }, [section, tracks, tracksById, state.favorites, state.librarySort, playlist]);
  const displayedIds = useMemo(() => displayed.map((track) => track.id), [displayed]);
  const selectTrack = useCallback((track: Track) => {
    void playTrack(track, displayedIds);
    router.navigate("/player");
  }, [playTrack, displayedIds]);
  const playlistId = section === "playlists" ? playlist?.id : undefined;
  const renderTrack = useCallback(({ item }: { item: Track }) => (
    <LibraryTrack track={item} onSelectTrack={selectTrack} playlistId={playlistId} removeFromPlaylist={removeFromPlaylist} />
  ), [selectTrack, playlistId, removeFromPlaylist]);
  return (
    <Screen>
      <FlatList
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        data={section === "playlists" && !playlist ? [] : displayed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: tokens.space.xl,
          paddingBottom: tokens.space.xl,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.md,
                paddingTop: tokens.space.lg,
                paddingBottom: tokens.space.xl,
              }}
            >
              <BrandMark size={36} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: tokens.font.heading,
                    fontWeight: "800",
                    letterSpacing: -1,
                  }}
                >
                  Biblioteca
                </Text>

              </View>
              <IconButton
                icon="settings"
                label="Abrir ajustes"
                onPress={() => router.navigate("/settings")}
              />
              <IconButton icon="plus" label="Adicionar músicas" onPress={() => setLibraryPanel("add")} />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.sm,
                backgroundColor: colors.surface,
                borderRadius: tokens.radius.medium,
                paddingLeft: tokens.space.lg,
                paddingRight: tokens.space.xs,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Icon name="search" color={colors.muted} size={20} />
              <Pressable accessibilityRole="button" accessibilityLabel="Buscar músicas e artistas" onPress={() => router.navigate("/downloads")} style={{ flex: 1, minHeight: 56, justifyContent: "center", paddingHorizontal: 12 }}><Text style={{ color: colors.muted, fontSize: 16 }}>Buscar músicas e artistas</Text></Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}><CompactAction label="Organizar biblioteca" onPress={() => router.navigate("/organize")} /><CompactAction label="Downloads" onPress={() => router.navigate("/download-manager")} /><CompactAction label="Meu histórico" onPress={() => router.navigate("/for-you")} /></View>
            <View style={{ marginTop: 4, marginBottom: 12 }}>
              <SegmentedControl value={section} options={[{ value: "library", label: "Músicas" }, { value: "favorites", label: "Favoritos" }, { value: "playlists", label: "Playlists" }]} onChange={setSection} />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: tokens.space.lg,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 20,
                    fontWeight: "700",
                  }}
                >
                  {section === "library"
                    ? "Sua biblioteca"
                    : section === "favorites"
                      ? "Suas favoritas"
                      : (playlist?.name ?? "Suas playlists")}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: tokens.font.caption,
                    marginTop: tokens.space.sm,
                  }}
                >
                  {section === "playlists" && !playlist
                    ? `${state.playlists.length} coleções`
                    : `${displayed.length} ${displayed.length === 1 ? "música" : "músicas"} na biblioteca`}
                </Text>
              </View>
              {section === "playlists" && !playlist ? <IconButton icon="plus" label="Criar playlist" onPress={() => setDialog(true)} /> : <CompactAction label={`Ordenar: ${{ original: "original", title: "título", artist: "artista", album: "álbum" }[state.librarySort]}`} onPress={() => setLibraryPanel("sort")} />}
            </View>
            {playlist && <PlaylistManager key={playlist.id} id={playlist.id} />}
            {libraryError && (
              <View
                style={{
                  backgroundColor: colors.accentSurface,
                  padding: tokens.space.lg,
                  borderRadius: tokens.radius.medium,
                  gap: tokens.space.md,
                  marginBottom: tokens.space.lg,
                }}
              >
                <Text
                  style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}
                >
                  {libraryError}
                </Text>
                <Action
                  label="Tentar novamente"
                  onPress={() => void requestLibrary()}
                />
              </View>
            )}
            {section === "playlists" && playlist && (
              <View style={{ marginBottom: tokens.space.lg }}>
                <Action
                  label="Todas as playlists"
                  icon="back"
                  onPress={() => setActivePlaylist(null)}
                />
              </View>
            )}
            {section === "playlists" &&
              !playlist &&
              state.playlists.map((item) => (
                <View key={item.id} style={{ marginBottom: tokens.space.md, padding: 16, backgroundColor: colors.surface, borderRadius: tokens.radius.medium, borderWidth: 1, borderColor: colors.line, gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{item.trackIds.length} {item.trackIds.length === 1 ? "música" : "músicas"}</Text>
                  <Action label="Abrir playlist" icon="queue" onPress={() => setActivePlaylist(item.id)} />
                </View>
              ))}
          </>
        }
        renderItem={renderTrack}
        ListEmptyComponent={
          section === "playlists" &&
          !playlist &&
          state.playlists.length > 0 ? undefined : section === "library" && hydrated && !scanning ? (
            <View style={{ paddingTop: 8, paddingBottom: 24, gap: 16 }}>
              <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>Suas músicas baixadas e arquivos do celular ficam aqui. Você já pode descobrir músicas no Início ou fazer uma busca.</Text>
              <Action primary label="Buscar uma música" icon="search" onPress={() => router.navigate("/downloads")} /><Action label="Acessar músicas do dispositivo" icon="folder" onPress={() => void requestLibrary()} />
            </View>
          ) : (
            <View>
              <EmptyState
                busy={!hydrated || scanning}
                title={
                  !hydrated
                    ? "Carregando biblioteca"
                    : section === "favorites"
                        ? "Guarde as suas favoritas"
                        : section === "playlists"
                          ? playlist
                            ? "Sua playlist está vazia"
                            : "Uma coleção para cada momento"
                          : "Sua música começa aqui"
                }
                hint={
                  section === "favorites"
                      ? "Toque no coração ao lado de uma música."
                      : section === "playlists"
                        ? playlist
                          ? "Abra uma música e adicione pelo botão Playlist no player."
                          : "Crie sua primeira playlist para organizar suas músicas."
                        : "Permita o acesso à biblioteca ou escolha arquivos do celular."
                }
              />
              {section === "library" && hydrated && (
                <View style={{ gap: tokens.space.md }}>
                  <Action
                    label="Acessar músicas do dispositivo"
                    selected
                    icon="music"
                    onPress={() => void requestLibrary()}
                  />
                  <Action
                    label="Escolher arquivos"
                    icon="folder"
                    onPress={addFiles}
                  />
                </View>
              )}
            </View>
          )
        }
      />
      <ActionSheet visible={libraryPanel !== null} title={libraryPanel === "sort" ? "Ordenar músicas" : "Adicionar músicas"} close={() => setLibraryPanel(null)}>
        {libraryPanel === "sort" ? ([{ value: "original", label: "Ordem original" }, { value: "title", label: "Título" }, { value: "artist", label: "Artista" }, { value: "album", label: "Álbum" }] as const).map((option) => <CompactAction key={option.value} label={option.label} selected={state.librarySort === option.value} onPress={() => { setLibrarySort(option.value); setLibraryPanel(null); }} />) : <>
          <Action label="Escolher arquivos" icon="plus" onPress={() => { setLibraryPanel(null); void addFiles(); }} />
          <Action label="Acessar músicas do dispositivo" icon="folder" onPress={() => { setLibraryPanel(null); void requestLibrary(); }} />
          <Action label={scanning ? "Atualizando…" : "Atualizar biblioteca"} icon="refresh" disabled={scanning} onPress={() => { void requestLibrary(); setLibraryPanel(null); }} />
        </>}
      </ActionSheet>
      <PlaylistDialog
        visible={dialog}
        close={() => setDialog(false)}
        created={(id) => setActivePlaylist(id)}
      />
    </Screen>
  );
}

const LibraryTrack = memo(function LibraryTrack({ track, onSelectTrack, playlistId, removeFromPlaylist }: {
  track: Track; onSelectTrack: (track: Track) => void; playlistId?: string;
  removeFromPlaylist: (id: string, trackId: string) => void;
}) {
  return <View><TrackRow track={track} onSelectTrack={onSelectTrack} />
    {playlistId && <Action label={`Retirar ${track.title} desta playlist`} onPress={() => removeFromPlaylist(playlistId, track.id)} />}
  </View>;
});
