import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { downloads } from "../../modules/music-downloads/src";
import { genreStations, contextMatches, contextQuery, confirmedGenres, personalGenreMatches } from "../lib/discovery-metadata";
import { normalized } from "../lib/metadata-model";
import type { DownloadItem } from "../lib/downloads/types";
import { useMusic } from "../lib/music";
import { Artwork } from "./Artwork";
import { Action, CompactAction } from "./ui";

type Station = { items: DownloadItem[]; checkedAt: number; partial: boolean };
const cache = new Map<string, Station>();
const pending = new Map<string, Promise<Station>>();
async function stationPreview(genre: string) {
  const known = cache.get(genre);
  if (known && Date.now() - known.checkedAt < 86400000) return known;
  if (pending.has(genre)) return pending.get(genre)!;
  const work = (async () => {
    const key = `custodio.station.v1.${genre}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) as Station : null;
      if (saved && Array.isArray(saved.items) && saved.items.length && Date.now() - saved.checkedAt < 86400000) { cache.set(genre, saved); return saved; }
    } catch { /* A broken cache does not prevent a live search. */ }
    const result = await downloads.search(`${genre} músicas`, "all");
    if (!result.items.length && Object.keys(result.errors).length) throw new Error("Fonte indisponível");
    const value = { items: result.items.filter((item, index, all) => all.findIndex((other) => other.id === item.id && other.provider === item.provider) === index).slice(0, 3), checkedAt: Date.now(), partial: Object.keys(result.errors).length > 0 };
    if (value.items.length) { cache.set(genre, value); await AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined); }
    return value;
  })();
  pending.set(genre, work);
  try { return await work; } finally { pending.delete(genre); }
}
export function GenreStations() {
  const { colors, tracks, state, radioPreferences, radioReady, radioBusy, radioMessage, startGenreRadio, startRadio, listenOnline, playLibraryTrack, deleteGenre } = useMusic();
  const [selection, setGenre] = useState(genreStations[0]);
  const [filter, setFilter] = useState("");
  const category = state.personalGenres?.find((entry) => entry.id === selection);
  const genre = category?.name ?? selection;
  const searchTerm = category ? contextQuery({ category }).replace(/ músicas$/, "") : genre;
  const knownGenres = [...new Set([...genreStations, ...tracks.flatMap(confirmedGenres)])];
  const choices = [...knownGenres.map((name) => ({ id: name, name })), ...(state.personalGenres ?? []).map((entry) => ({ id: entry.id, name: entry.name }))].filter((entry) => normalized(entry.name).includes(normalized(filter)));
  const [preview, setPreview] = useState<Record<string, Station>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [playBusy, setPlayBusy] = useState(false);
  useEffect(() => {
    if (!radioReady || radioPreferences.offline || !downloads.available) return;
    let alive = true;
    void (async () => {
      setLoading(true); setMessage("");
      // Fetch only the selected station; searches share a persistent cache.
      for (const name of [searchTerm]) {
        if (!alive) break;
        try { const result = await stationPreview(name); if (alive) setPreview((previous) => ({ ...previous, [name]: result })); }
        catch { if (alive) setMessage("Não foi possível buscar esta rádio agora."); }
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [searchTerm, radioReady, radioPreferences.offline, revision]);
  const local = tracks.filter((track) => contextMatches(track, category ? { category } : { genre }) && (!radioPreferences.offline || (!!track.uri && !/^https?:/i.test(track.uri)))).slice(0, 3);
  const items = radioPreferences.offline ? [] : preview[searchTerm]?.items ?? [];
  return <View style={{ gap: 10 }}>
    <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>Rádios por gênero</Text>
    <TextInput accessibilityLabel="Pesquisar gênero ou estilo" placeholder="Busque um gênero ou estilo na internet" placeholderTextColor={colors.muted} value={filter} onChangeText={setFilter} maxLength={80} returnKeyType="search" onSubmitEditing={() => { if (filter.trim()) setGenre(filter.trim()); }} style={{ color: colors.text, minHeight: 48, padding: 12, backgroundColor: colors.surface2, borderRadius: 14 }} />
    {!!filter.trim() && <CompactAction label={`Pesquisar rádio: ${filter.trim()}`} onPress={() => { setGenre(filter.trim()); setRevision((value) => value + 1); }} />}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
      {choices.map((entry) => <CompactAction key={entry.id} label={entry.name} selected={selection === entry.id} onPress={() => setGenre(entry.id)} />)}
    </ScrollView>
    <View style={{ padding: 18, borderRadius: 20, backgroundColor: colors.surface2, gap: 14 }}>
      <View><Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>{genre}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{radioPreferences.offline ? "Da sua biblioteca" : "Sugestões online · seleção por busca"}</Text></View>
      {loading && !radioPreferences.offline && <ActivityIndicator color={colors.accent} accessibilityLabel="Buscando rádio" />}
      {items.map((item) => <Pressable key={`${item.provider}:${item.id}`} accessibilityRole="button" accessibilityLabel={`Ouvir ${item.title}`} disabled={playBusy} onPress={() => { setPlayBusy(true); void listenOnline(item).catch(() => setMessage("Não foi possível tocar esta faixa.")).finally(() => setPlayBusy(false)); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
        <Artwork track={{ id: item.id, artwork: item.thumbnail ?? undefined }} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>{item.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{item.artist}</Text></View>
      </Pressable>)}
      {!items.length && local.map((track) => <Pressable key={track.id} accessibilityRole="button" onPress={() => void playLibraryTrack(track)} style={{ minHeight: 48, justifyContent: "center" }}><Text style={{ color: colors.text }}>{track.title}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{track.artist}</Text></Pressable>)}
      {!loading && !items.length && !local.length && <Text style={{ color: colors.muted, lineHeight: 20 }}>{radioPreferences.offline ? "Nenhuma faixa mapeada neste gênero no aparelho." : downloads.available ? "Ainda sem sugestões para este gênero." : "As sugestões online precisam do módulo Android."}</Text>}
      {!!message && <><Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{message}</Text><CompactAction label="Tentar novamente" onPress={() => setRevision((value) => value + 1)} /></>}
      {preview[searchTerm]?.partial && <Text style={{ color: colors.muted, fontSize: 12 }}>Uma fonte não respondeu; mostrando as disponíveis.</Text>}
      {!!radioMessage && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{radioMessage}</Text>}
      {category && <><Text style={{ color: colors.muted, lineHeight: 20 }}>Seu gênero · {tracks.filter((track) => personalGenreMatches(track, category)).length} músicas catalogadas{category.autoInclude ? " · inclui futuras músicas pela sua regra" : " · seleção manual"}</Text><CompactAction label="Excluir este gênero pessoal" onPress={() => { deleteGenre(category.id); setGenre(genreStations[0]); }} /></>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Action label={radioBusy ? "Preparando…" : "Tocar rádio"} icon="play" primary disabled={radioBusy || !radioReady || (!downloads.available && !local.length)} onPress={() => void (category ? startRadio(undefined, { category }) : startGenreRadio(genre))} />
        <CompactAction label="Ver mais" onPress={() => router.navigate({ pathname: "/downloads", params: { query: `${searchTerm} músicas` } })} />
      </View>
    </View>
  </View>;
}
