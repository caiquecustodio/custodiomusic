import { router } from "expo-router";
import { Text, View } from "react-native";
import { useMusic } from "../lib/music";
import { searchIdentity } from "../lib/metadata-model";
import { confirmedGenres, discoveryIdentity } from "../lib/discovery-metadata";
import { CompactAction } from "./ui";

export function ContextDiscovery({ onSearch }: { onSearch?: (query: string) => void }) {
  const { current, colors, mappingId, mappedCount, tracks, state } = useMusic();
  if (!current) return null;
  const artist = searchIdentity(current).artist;
  const discovery = current.discovery?.identity === discoveryIdentity(current) ? current.discovery : undefined;
  const search = (query: string) => onSearch ? onSearch(query) : router.navigate({ pathname: "/downloads", params: { query } });
  return <View style={{ gap: 4 }}>
    <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>A partir de {current.title}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {!!artist && <CompactAction label="Mais deste artista" onPress={() => search(`${artist} músicas`)} />}
      {confirmedGenres(current).slice(0, 2).map((genre) => <CompactAction key={genre} label={genre} onPress={() => search(`${genre} músicas`)} />)}
      <CompactAction label="Catalogar gênero" onPress={() => router.navigate("/player")} />
      {!!discovery?.year && <CompactAction label={`Do mesmo ano · ${discovery.year}`} onPress={() => search(`músicas ${discovery.year}`)} />}
    </View>
    <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>{mappingId === current.id ? "Identificando gênero e ano…" : discovery?.outcome === "error" ? "Mapeamento indisponível agora; nova tentativa será feita depois." : discovery?.outcome === "missing" ? "Gênero e ano ainda não identificados com segurança." : discovery?.outcome === "found" ? `MusicBrainz${!discovery.genres.length ? " · gênero não informado" : ""}${!discovery.year ? " · ano não informado" : ""}` : state.autoSync ? "O gênero e o ano serão consultados automaticamente." : "Ative a sincronização automática em Ajustes para mapear gênero e ano."} · {mappedCount}/{tracks.length} faixas identificadas</Text>
  </View>;
}
