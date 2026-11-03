import { useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import { GenreCatalog } from "../components/GenreCatalog";
import { EmptyState, Header, Screen } from "../components/ui";
import { useLibrary } from "../lib/music";
export default function TrackDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tracks } = useLibrary();
  const track = tracks.find((item) => item.id === id);
  return <Screen><Header title="Organizar música" /><ScrollView contentContainerStyle={{ padding: 24 }}>{track ? <GenreCatalog key={track.id} track={track} /> : <EmptyState title="Música indisponível" hint="Escolha outra música na Biblioteca." />}</ScrollView></Screen>;
}
