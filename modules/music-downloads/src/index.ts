import { requireOptionalNativeModule } from "expo-modules-core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createCatalog } from "../../../src/lib/catalog";
import type {
  SourceFilter,
  SourceId,
  SourceStatus,
  Resolution,
  SearchResults,
  DownloadJob,
  DownloadProvider,
  StreamResolution,
  DownloadItem,
} from "../../../src/lib/downloads/types";
import type { AudioPlaylist } from "expo-audio";
import type { ListeningData } from "../../../src/lib/discovery-model";
type Events = {
  onDownloadsChanged: () => void;
  onSharedLink: (event: { url: string }) => void;
  onListeningError: (event: { message: string }) => void;
  onPlaybackTrackChanged: (event: { id: string; request: number; reason: number; streaming: boolean }) => void;
  onPlaybackQueueError: (event: { id: string; request: number; message: string }) => void;
  onPlaybackSleepEnded: () => void;
  onPlaybackDuration: (event: { id: string; duration: number; request: number }) => void;
  onPlaybackCacheFallback: (event: { message: string }) => void;
};
type DownloadsNative = {
  playbackQueueVersion?: number;
  onlineCatalogVersion?: number;
  catalogPopular?(provider: string): Promise<string>;
  preferenceRead?(key: string, legacy: string | null): Promise<string | null>;
  preferenceWrite?(key: string, value: string): Promise<void>;
  setPlaybackIntent(token: number, playing: boolean): void;
  synchronizePlayback(): Promise<void>;
  playbackSavedSession(): Promise<string | null>;
  configurePlaybackQueue(player: AudioPlaylist, raw: string, startId: string, token: number, options: string): Promise<void>;
  playbackOptions(raw: string): Promise<void>;
  skipPlaybackTrack(direction: number, token: number): Promise<void>;
  addListener<Name extends keyof Events>(
    name: Name,
    listener: Events[Name],
  ): { remove(): void };
  sources(): Promise<string>;
  search(query: string, provider: string): Promise<string>;
  popular?(): Promise<string>;
  resolve(provider: string, id: string): Promise<string>;
  stream(provider: string, id: string): Promise<string>;
  setOnlineSource(player: AudioPlaylist, uri: string, mime: string): Promise<void>;
  observeListening(player: AudioPlaylist, metadata: string, restart: boolean): Promise<void>;
  flushListening(): Promise<void>;
  listeningEnabled(enabled: boolean): Promise<void>;
  getListeningEnabled(): Promise<boolean>;
  listeningSnapshot(includeEvents: boolean): Promise<string>;
  clearListening(): Promise<void>;
  fileHash(uri: string): Promise<string>;
  localInfo(uri: string): Promise<{ title?: string; artist?: string; album?: string; folder?: string }>;
  restoreListening(raw: string): Promise<void>;
  resolveLink(url: string): Promise<string>;
  list(): Promise<string>;
  enqueue(provider: string, id: string, format: string): Promise<string>;
  cancel(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  resumeQueue(): Promise<void>;
  getSharedLink(): Promise<string | null>;
};
export const nativeDownloads =
  requireOptionalNativeModule<DownloadsNative>("MusicDownloads");
function native(): DownloadsNative {
  if (!nativeDownloads)
    throw new Error(
      "Os downloads precisam do APK Android atualizado do Custódio.",
    );
  return nativeDownloads;
}
export const downloads = {
  available: !!nativeDownloads,
  async sources(): Promise<SourceStatus[]> {
    return JSON.parse(await native().sources());
  },
  async search(query: string, provider: SourceFilter, onPartial?: (items: DownloadItem[]) => void): Promise<SearchResults> {
    return catalog.search(query, provider, onPartial);
  },
  async popular(force = false): Promise<SearchResults> {
    const module = native();
    if (module.catalogPopular) return catalog.popular(force);
    if (!module.popular) return { items: [], errors: { youtube: "Atualize a versão Android para consultar músicas em alta." } };
    return JSON.parse(await module.popular());
  },
  async resolve(provider: SourceId, id: string): Promise<Resolution> {
    return JSON.parse(await native().resolve(provider, id));
  },
  async stream(provider: SourceId, id: string): Promise<StreamResolution> {
    return JSON.parse(await native().stream(provider, id));
  },
  async listening(includeEvents = false): Promise<ListeningData> {
    if (!nativeDownloads) return { version: 1, days: [], events: [] };
    await nativeDownloads.flushListening();
    return JSON.parse(await nativeDownloads.listeningSnapshot(includeEvents));
  },
  async resolveLink(url: string): Promise<Resolution> {
    return JSON.parse(await native().resolveLink(url));
  },
  async list(): Promise<DownloadJob[]> {
    return JSON.parse(await native().list());
  },
  async enqueue(
    provider: SourceId,
    id: string,
    format: string,
  ): Promise<DownloadJob> {
    return JSON.parse(await native().enqueue(provider, id, format));
  },
  cancel: (id: string) => native().cancel(id),
  retry: (id: string) => native().retry(id),
  resumeQueue: () => native().resumeQueue(),
};
const catalog = createCatalog({
  sources: () => downloads.sources(),
  search: async (id, query) => {
    const result: SearchResults = JSON.parse(await native().search(query, id));
    if (result.errors[id]) throw new Error(result.errors[id]);
    return result.items;
  },
  popular: async (id) => JSON.parse(await native().catalogPopular!(id)),
  readCache: () => AsyncStorage.getItem("custodio.catalog.v1"),
  writeCache: (value) => AsyncStorage.setItem("custodio.catalog.v1", value),
});
export function provider(id: SourceId): DownloadProvider {
  return {
    id,
    search: (query) => downloads.search(query, id),
    resolve: (trackId) => downloads.resolve(id, trackId),
  };
}
