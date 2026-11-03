import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMusic } from "../lib/music";
import { confirmedGenres, discoveryIdentity, personalGenreMatches } from "../lib/discovery-metadata";
import { searchIdentity } from "../lib/metadata-model";
import type { Track } from "../lib/types";
import { Action, ActionSheet, CompactAction } from "./ui";

export function GenreCatalog({ track }: { track: Track }) {
  const { colors, tracks, state, identifyingId, mappingId, identifyGenre, createGenre, addToGenre, startGenreRadio } = useMusic();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [similar, setSimilar] = useState(true);
  const [automatic, setAutomatic] = useState(true);
  const identity = searchIdentity(track);
  const [title, setTitle] = useState(identity.title);
  const [artist, setArtist] = useState(identity.artist);
  const [message, setMessage] = useState("");
  const genres = confirmedGenres(track);
  const discovery = track.discovery?.identity === discoveryIdentity(track) ? track.discovery : undefined;
  const suggestions = discovery?.suggestedGenres ?? [];
  const categories = state.personalGenres ?? [];
  const memberships = categories.filter((category) => personalGenreMatches(track, category));
  const busy = identifyingId === track.id;
  const inputStyle = { color: colors.text, backgroundColor: colors.surface2, borderRadius: 12, minHeight: 48, paddingHorizontal: 14 };
  const rule = { id: "preview", name, trackIds: [track.id], matchGenres: similar ? genres : [], matchArtist: similar && !genres.length ? identity.artist || undefined : undefined, autoInclude: similar };
  const similarCount = tracks.filter((entry) => personalGenreMatches(entry, rule)).length;
  const identify = async (correction = { title, artist }) => {
    setMessage("");
    try {
      const result = await identifyGenre(track, correction);
      setMessage(result.genres.length ? `Identificado: ${result.genres.join(" · ")}. Já salvo no catálogo.` : result.candidates?.length ? "Encontrei possíveis artistas para esse título. Escolha o resultado correto abaixo para identificar o gênero." : result.suggestedGenres?.length ? "A faixa foi identificada. Os gêneros do artista são sugestões para você revisar." : "Sem gênero confirmado. Confira título e artista ou crie uma categoria pessoal.");
    } catch { setMessage("Não foi possível consultar agora. Confira a conexão e tente novamente."); }
  };
  return <View style={{ width: "100%", marginTop: 20, gap: 10, padding: 16, borderRadius: 20, backgroundColor: colors.surface }}>
    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Gêneros e estilos</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {genres.map((genre) => <CompactAction key={genre} label={genre} onPress={() => void startGenreRadio(genre)} />)}
      {memberships.map((category) => <Text key={category.id} style={{ color: colors.accent, paddingVertical: 10 }}>{category.name} · pessoal</Text>)}
    </View>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{mappingId === track.id || busy ? "Consultando gênero na internet…" : genres.length ? "MusicBrainz · toque em um gênero para ouvir a rádio." : "Gênero ainda não confirmado. Você pode pesquisar ou criar sua própria categoria."}</Text>
    {!memberships.length && <Text style={{ color: colors.text, lineHeight: 20 }}>Quer criar um gênero para esta música e outras parecidas?</Text>}
    <CompactAction label="Identificar ou criar gênero" onPress={() => setOpen(true)} />
    <ActionSheet visible={open} title="Catalogar música" close={() => setOpen(false)}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{track.title}</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>A pesquisa usa título e artista. Corrija os dados abaixo se necessário; ao pesquisar, eles serão salvos nesta música.</Text>
      <TextInput accessibilityLabel="Título para identificar gênero" placeholder="Título da música" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} maxLength={200} style={inputStyle} />
      <TextInput accessibilityLabel="Artista para identificar gênero" placeholder="Artista" placeholderTextColor={colors.muted} value={artist} onChangeText={setArtist} maxLength={200} style={inputStyle} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>Não sabe o artista? Deixe esse campo vazio para pesquisar pelo título e escolher entre os resultados.</Text>
      <Action label={busy ? "Identificando…" : "Pesquisar gênero na internet"} icon="search" disabled={busy || !title.trim()} onPress={() => void identify()} />
      {discovery?.candidates?.map((candidate) => <Action key={candidate.recordingId} label={`${candidate.title} · ${candidate.artist}`} disabled={busy} onPress={() => { setTitle(candidate.title); setArtist(candidate.artist); void identify({ title: candidate.title, artist: candidate.artist }); }} />)}
      {!!genres.length && <Text style={{ color: colors.text }}>Gêneros da faixa: {genres.join(" · ")}</Text>}
      {!!suggestions.length && <View style={{ gap: 8 }}><Text style={{ color: colors.muted }}>Sugestões pelo artista · confirme se combinam com esta música</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{suggestions.map((genre) => <CompactAction key={genre} label={genre} onPress={() => { setName(genre); setSimilar(false); setAutomatic(false); }} />)}</View></View>}
      {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.accent, lineHeight: 20 }}>{message}</Text>}
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 12 }}>Criar gênero com esta música e parecidas?</Text>
      <TextInput accessibilityLabel="Nome do gênero pessoal" placeholder="Ex.: Forró das antigas, Rock para viajar" placeholderTextColor={colors.muted} value={name} onChangeText={setName} maxLength={60} style={inputStyle} />
      <Action label={similar ? `Incluir parecidas · ${similarCount} músicas` : "Incluir só esta música"} selected={similar} onPress={() => setSimilar((value) => !value)} />
      <Text style={{ color: colors.muted, lineHeight: 20 }}>{similar ? genres.length ? `Parecidas = músicas com algum destes gêneros confirmados: ${genres.join(", ")}.` : identity.artist ? `Sem gênero confirmado: serão incluídas apenas músicas do artista ${identity.artist}.` : "Sem artista e gênero identificados: apenas esta música será incluída." : "Você poderá adicionar outras músicas manualmente depois."}</Text>
      {similar && <Action label={automatic ? "Incluir futuras músicas pela mesma regra" : "Adicionar apenas as músicas de agora"} selected={automatic} onPress={() => setAutomatic((value) => !value)} />}
      <Action label="Criar e catalogar" icon="plus" primary disabled={!name.trim()} onPress={() => { try { const category = createGenre(name, track, similar, automatic); setMessage(`Gênero ${category.name} criado com ${tracks.filter((entry) => personalGenreMatches(entry, category)).length} músicas.`); setName(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível criar."); } }} />
      {!!categories.length && <Text style={{ color: colors.text, fontWeight: "700", marginTop: 8 }}>Adicionar a um gênero existente</Text>}
      {categories.map((category) => <Action key={category.id} label={`${category.name}${personalGenreMatches(track, category) ? " · incluída" : " · adicionar"}`} disabled={personalGenreMatches(track, category)} onPress={() => addToGenre(category.id, track.id)} />)}
      <CompactAction label="Abrir catálogo de gêneros" onPress={() => { setOpen(false); router.push({ pathname: "/organize", params: { group: "genre" } }); }} />
    </ActionSheet>
  </View>;
}
