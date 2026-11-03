import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { downloads } from "../../modules/music-downloads/src";
import { Action, ActionSheet, CompactAction, EmptyState, Header, IconButton, Screen } from "./ui";
import { Icon } from "./Icon";
import { Artwork } from "./Artwork";
import { OnlineTrackRow } from "./OnlineTrackRow";
import { OnlineActions } from "./OnlineActions";
import { TrackRow } from "./TrackRow";
import { useMusic } from "../lib/music";
import { useDownloads } from "../lib/downloads/context";
import { canPlay } from "../lib/downloads/model";
import type { DownloadItem } from "../lib/downloads/types";
import type { Track } from "../lib/types";
import { allowedOnlineItems, onlineId } from "../lib/online-queue";
import { isCatalogItem } from "../lib/catalog";
import { popularRadio } from "../lib/popular-radio";
import { preferences } from "../lib/preferences";
import { unifiedSearchResults } from "../lib/unified-search";

const SEARCHES_KEY = "custodio.online.searches.v1";
const moods = ["Forró", "MPB", "Sertanejo", "Rock", "Eletrônica", "Para relaxar"];
export function OnlineContent({ initialQuery = "", mode = "search" }: { initialQuery?: string; mode?: "home" | "search" }) {
  const isHome = mode === "home";
  const { colors, tracks, state, current, listening, refreshListening, playing, togglePlay, addFiles, listenOnline, playLibraryTrack, startRadio, radioReady, radioBusy, radioMessage, radioPreferences } = useMusic();
  const { available } = useDownloads();
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [popular, setPopular] = useState<DownloadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [homeBusy, setHomeBusy] = useState(available && isHome);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState("");
  const [homeMessage, setHomeMessage] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searches = useRef<string[]>([]);
  const [selected, setSelected] = useState<DownloadItem | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const homeRevision = useRef(0);
  const request = useRef(0);
  const playRequest = useRef(0);
  const active = useRef(true);
  const homeItems = useMemo(() => allowedOnlineItems(popular, tracks, radioPreferences), [popular, tracks, radioPreferences]);
  const muted = { color: colors.muted, fontSize: 13, lineHeight: 21 };
  const heading = { color: colors.text, fontSize: 21, fontWeight: "700" as const, letterSpacing: -0.4 };
  useFocusEffect(useCallback(() => {
    active.current = true;
    let alive = true;
    const focusToken = request.current;
    void Promise.resolve().then(() => { if (alive) { if (request.current === focusToken) setBusy(false); if (revision) setHomeMessage(""); setHomeBusy(available && isHome); } });
    void refreshListening();
    const force = revision !== homeRevision.current;
    homeRevision.current = revision;
    if (available && isHome) void popularRadio(force).then((result) => {
      if (!alive) return;
      setPopular(result.items.filter(isCatalogItem));
      setHomeMessage(Object.keys(result.errors).length ? "Algumas músicas podem estar indisponíveis agora. Sua seleção continua aqui." : "");
    }).catch(() => { if (alive) setHomeMessage("Não foi possível renovar a seleção. Sua biblioteca continua disponível."); })
      .finally(() => { if (alive) setHomeBusy(false); });
    return () => { alive = false; active.current = false; request.current++; };
  }, [available, refreshListening, revision, isHome]));
  useEffect(() => {
    let alive = true;
    void preferences.getItem(SEARCHES_KEY).then((raw) => {
      const saved: unknown = JSON.parse(raw ?? "[]");
      if (!alive || !Array.isArray(saved)) return;
      const valid = saved.filter((entry): entry is string => typeof entry === "string" && entry.length <= 200).slice(0, 8);
      searches.current = valid; setRecentSearches(valid);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  async function search(value = query) {
    const term = value.trim(); if (!term) return;
    const token = ++request.current;
    setQuery(term); setSubmittedQuery(term); setBusy(true); setSearched(true); setItems([]); setMessage("");
    if (!/^https?:/i.test(term)) {
      const next = [term, ...searches.current.filter((q) => q !== term)].slice(0, 8);
      searches.current = next; setRecentSearches(next);
      void preferences.setItem(SEARCHES_KEY, JSON.stringify(next)).catch(() => undefined);
    }
    if (!available) { setBusy(false); return; }
    try {
      const result = /^https?:/i.test(term)
        ? { items: [(await downloads.resolveLink(term)).item], errors: {} }
        : await downloads.search(term, "all", (partial) => { if (token === request.current && active.current) setItems(partial); });
      if (token !== request.current || !active.current) return;
      setItems(result.items.filter(isCatalogItem));
      if (Object.keys(result.errors).length) setMessage(result.items.length ? "Uma conexão oscilou. Mostrando as músicas disponíveis." : "Não foi possível buscar agora. Aguarde alguns instantes e tente novamente.");
    } catch {
      if (token === request.current && active.current) setMessage("Não foi possível encontrar essa música agora. Confira a conexão, tente outro título ou um link de música compatível.");
    } finally { if (token === request.current && active.current) setBusy(false); }
  }
  const initialSearch = useRef(false);
  useEffect(() => {
    if (initialSearch.current || !initialQuery) return;
    initialSearch.current = true; void search(initialQuery);
    // Navigation queries run once; edits in the search field remain explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, initialQuery]);
  const clearSearch = () => { ++request.current; setQuery(""); setSubmittedQuery(""); setItems([]); setSearched(false); setBusy(false); setMessage(""); };
  const play = (item: DownloadItem) => {
    const token = ++playRequest.current; setPlayingKey(onlineId(item)); setMessage("");
    void listenOnline(item, false, searched ? items : homeItems).then(() => { if (active.current && token === playRequest.current) router.navigate("/player"); })
      .catch(() => { if (active.current && token === playRequest.current) setMessage("Esta música está indisponível agora. Tente novamente ou escolha outra faixa."); })
      .finally(() => { if (token === playRequest.current) setPlayingKey(null); });
  };
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const replay = useMemo(() => [...new Set([...listening.days.filter((day) => day.plays > 0).slice().sort((a, b) => b.day.localeCompare(a.day)).map((day) => day.trackId), ...state.favorites])]
    .map((id) => byId.get(id)).filter((track): track is Track => !!track && canPlay(track) && !radioPreferences.blockedTracks.includes(track.id) && !radioPreferences.blockedArtists.includes(track.artist.trim().toLocaleLowerCase("pt-BR"))).slice(0, 6), [listening.days, state.favorites, byId, radioPreferences]);
  const results = useMemo(() => searched ? unifiedSearchResults(submittedQuery, tracks, items) : [], [submittedQuery, tracks, items, searched]);
  const localIds = useMemo(() => results.flatMap((entry) => entry.kind === "library" ? [entry.track.id] : []), [results]);
  const listItems = useMemo(() => searched ? results : isHome ? homeItems.slice(0, 20).map((item) => ({ kind: "online" as const, key: onlineId(item), item })) : [], [searched, results, isHome, homeItems]);
  const playingSource = current?.online ?? current?.origin;
  const playingId = playingSource ? `online:${playingSource.provider}:${playingSource.sourceId}` : "";
  return <Screen>
    <Header title={isHome ? "Início" : "Buscar"} detail={isHome ? "Sua próxima música começa aqui" : "No celular e na internet"} action={<IconButton icon="settings" label="Abrir ajustes" onPress={() => router.navigate("/settings")} />} />
    <FlatList
      data={listItems}
      keyExtractor={(entry) => entry.key}
      initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
      renderItem={({ item: entry }) => entry.kind === "library" ? <TrackRow track={entry.track} onPress={() => { void playLibraryTrack(entry.track, localIds).then((ok) => { if (ok) router.navigate("/player"); }); }} /> : <OnlineTrackRow item={entry.item} active={playingId === onlineId(entry.item)} pending={playingKey === onlineId(entry.item)} onPlay={play} onOptions={setSelected} />}
      ListHeaderComponent={<View style={{ gap: 20, paddingTop: 4, paddingBottom: 12 }}>
        {isHome ? <Pressable accessibilityRole="button" accessibilityLabel="Buscar músicas e artistas" onPress={() => router.navigate("/downloads")} style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.65 : 1 })}><Icon name="search" color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 16 }}>O que você quer ouvir?</Text></Pressable> : <View style={{ backgroundColor: colors.surface, borderRadius: 18, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, paddingLeft: 16 }}>
          <Icon name="search" size={21} color={colors.muted} />
          <TextInput accessibilityLabel="Buscar músicas, artistas ou colar link" placeholder="Música, artista ou link" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} returnKeyType="search" autoCapitalize="none" maxLength={4096} style={{ flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 12, fontSize: 16, color: colors.text }} />
          {!!query && <IconButton icon="close" label="Limpar pesquisa" onPress={clearSearch} />}
          <IconButton icon="search" label="Pesquisar músicas" disabled={!query.trim() || busy} onPress={() => void search()} />
        </View>}
        {!!message && <View accessibilityRole="alert" style={{ backgroundColor: colors.accentSurface, borderRadius: 16, padding: 16, gap: 8 }}><Text style={{ color: colors.text, lineHeight: 22 }}>{message}</Text>{searched && <CompactAction label="Tentar novamente" disabled={busy} onPress={() => void search()} />}</View>}
        {!available && !isHome && <Text style={muted}>A busca no celular está disponível. A pesquisa na internet precisa do app Android completo.</Text>}
        {isHome && !searched && <>
          {current && <View style={{ padding: 18, borderRadius: 20, backgroundColor: colors.surface, gap: 12 }}><Text style={heading}>Continue ouvindo</Text><Pressable accessibilityRole="button" accessibilityLabel={`Abrir player de ${current.title}`} onPress={() => router.navigate("/player")} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}><Artwork track={current} size={64} radius={14} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{current.title}</Text><Text numberOfLines={1} style={muted}>{current.artist}</Text></View></Pressable><Action label={playing ? "Pausar" : "Continuar ouvindo"} icon={playing ? "pause" : "play"} onPress={togglePlay} /></View>}
          <View style={{ padding: 24, borderRadius: 24, backgroundColor: colors.accentSurface, gap: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 2 }}>FEITO PARA VOCÊ</Text><Icon name="disc" color={colors.accent} size={30} /></View>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800", letterSpacing: -1 }}>Dê play no seu dia.</Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>Suas favoritas e novas descobertas em uma só fila.</Text>
            <Action primary icon="play" label={radioBusy ? "Preparando seu mix…" : "Ouvir meu mix"} disabled={!radioReady || radioBusy} onPress={() => void startRadio()} />
            {!!radioMessage && <Text accessibilityLiveRegion="polite" style={muted}>{radioMessage}</Text>}
          </View>
          {!!replay.length && <View style={{ gap: 12 }}><Text style={heading}>Ouça de novo</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>{replay.map((track) => <Pressable key={track.id} accessibilityRole="button" accessibilityLabel={`Ouvir novamente ${track.title}`} onPress={() => { void playLibraryTrack(track, replay.map((t) => t.id)).then((ok) => { if (ok) router.navigate("/player"); }); }} style={({ pressed }) => ({ width: 124, gap: 7, opacity: pressed ? 0.65 : 1 })}><Artwork track={track} size={124} radius={18} /><Text numberOfLines={1} style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{track.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{track.artist}</Text></Pressable>)}</ScrollView></View>}
          <View style={{ gap: 8 }}><Text style={heading}>O que combina com hoje?</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{moods.map((mood) => <CompactAction key={mood} label={mood} onPress={() => { if (isHome) router.navigate({ pathname: "/downloads", params: { query: mood } }); else void search(mood); }} />)}</View></View>
          <View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ flex: 1 }}><Text style={heading}>{available ? "Descubra agora" : "Suas músicas"}</Text><Text style={muted}>{available ? "Uma seleção para sair do mesmo lugar." : "Abra a biblioteca para ouvir seus arquivos."}</Text></View>{available && <IconButton icon="refresh" label="Atualizar sugestões" disabled={homeBusy} onPress={() => setRevision((n) => n + 1)} />}</View>
          {!!homeMessage && <Text accessibilityLiveRegion="polite" style={muted}>{homeMessage}</Text>}
          {homeBusy && <ActivityIndicator accessibilityLabel="Carregando sugestões" color={colors.accent} />}
        </>}
        {!isHome && !searched && <>          {!!recentSearches.length && <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}><Text style={[heading, { flex: 1 }]}>Buscas recentes</Text><CompactAction label="Limpar" onPress={() => { searches.current = []; setRecentSearches([]); void preferences.setItem(SEARCHES_KEY, "[]").catch(() => undefined); }} /></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{recentSearches.map((term) => <CompactAction key={term} label={term} onPress={() => void search(term)} />)}</ScrollView>
          </View>}
<Text style={heading}>Encontre sua favorita</Text><Text style={muted}>Busque uma música ou artista. As músicas do celular aparecem junto dos resultados da internet.</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{moods.map((mood) => <CompactAction key={mood} label={mood} onPress={() => { if (isHome) router.navigate({ pathname: "/downloads", params: { query: mood } }); else void search(mood); }} />)}</View></>}
        {isHome && !available && <><Action label="Abrir minha biblioteca" icon="music" onPress={() => router.navigate("/library")} /><Action label="Adicionar músicas do celular" icon="folder" onPress={addFiles} /></>}
        {searched && <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Text style={[heading, { flex: 1 }]}>{busy ? "Buscando sua música…" : `Resultados · ${results.length}`}</Text>{busy && <ActivityIndicator color={colors.accent} />}</View>}
        {searched && !!localIds.length && <Text style={muted}>As músicas da sua biblioteca aparecem primeiro.</Text>}
      </View>}
      ListEmptyComponent={searched && !busy ? <EmptyState title="Ainda não encontramos" hint="Experimente outro título, o nome do artista ou um link de música." /> : isHome && available && !homeBusy ? <View style={{ gap: 12 }}><Text style={muted}>Não conseguimos carregar as sugestões agora. Você pode buscar uma música ou ouvir sua biblioteca.</Text><Action label="Buscar uma música" icon="search" onPress={() => router.navigate("/downloads")} /></View> : undefined}
    />
    <ActionSheet visible={selected !== null} title={selected?.title ?? "Opções da música"} close={() => setSelected(null)}>{selected && <OnlineActions key={onlineId(selected)} item={selected} suggestions={searched ? items : homeItems} onNavigate={() => setSelected(null)} />}</ActionSheet>
  </Screen>;
}
