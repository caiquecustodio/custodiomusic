import AsyncStorage from "@react-native-async-storage/async-storage";
import { nativeDownloads } from "../../modules/music-downloads/src";
import { createPreferenceStorage } from "./preference-storage-model";

export const preferences = createPreferenceStorage({
  legacyRead: (key) => AsyncStorage.getItem(key),
  legacyWrite: (key, value) => AsyncStorage.setItem(key, value),
  nativeRead: nativeDownloads?.preferenceRead ? (key, legacy) => nativeDownloads!.preferenceRead!(key, legacy) : undefined,
  nativeWrite: nativeDownloads?.preferenceWrite ? (key, value) => nativeDownloads!.preferenceWrite!(key, value) : undefined,
});
