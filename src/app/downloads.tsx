import { useLocalSearchParams } from "expo-router";
import { OnlineContent } from "../components/OnlineContent";

export default function SearchScreen() {
  const params = useLocalSearchParams<{ query?: string; url?: string }>();
  return <OnlineContent key={params.url ?? params.query ?? "search"} initialQuery={params.url ?? params.query ?? ""} />;
}
