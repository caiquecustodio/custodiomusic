import AsyncStorage from "@react-native-async-storage/async-storage";
import { downloads } from "../../modules/music-downloads/src";
import type { SearchResults } from "./downloads/types";
import { isCatalogItem } from "./catalog";
let pending: Promise<SearchResults> | null = null;
let memory: { at: number; result: SearchResults } | null = null;
export async function popularRadio(force = false): Promise<SearchResults> {
  if (!force && memory && Date.now() - memory.at < 3600000) return memory.result;
  if (pending) return pending;
  pending = (async () => {
    let saved: typeof memory = null;
    try {
      saved = JSON.parse(await AsyncStorage.getItem("custodio.popular.v2") ?? "null");
      if (saved && Array.isArray(saved.result?.items)) saved.result.items = saved.result.items.filter(isCatalogItem);
    } catch { /* Cache is optional. */ }
    if (!force && saved && Array.isArray(saved.result?.items) && saved.result.items.length && Date.now() - saved.at < 3600000) { memory = saved; return saved.result; }
    try {
      const result = await downloads.popular(force);
      if (result.items.length) { memory = { at: Date.now(), result }; await AsyncStorage.setItem("custodio.popular.v2", JSON.stringify(memory)).catch(() => undefined); return result; }
      if (saved && Date.now() - saved.at < 7 * 86400000 && saved.result?.items?.length) return { ...saved.result, errors: { youtube: "Usando uma seleção em alta salva anteriormente; a fonte está indisponível agora." } };
      return result;
    } catch (error) {
      if (saved && Date.now() - saved.at < 7 * 86400000 && saved.result?.items?.length) return { ...saved.result, errors: { youtube: "Usando uma seleção salva anteriormente." } };
      throw error;
    }
  })();
  try { return await pending; } finally { pending = null; }
}
