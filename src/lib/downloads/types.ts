export type SourceId = "youtube" | "jamendo" | "audius";
export type SourceFilter = SourceId | "all";
export type DownloadItem = {
  provider: SourceId;
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string | null;
  url: string;
  downloadable: boolean;
  licenseUrl?: string;
};
export type AudioFormat = {
  id: string;
  extension: string;
  mime: string;
  bitrate: number;
};
export type Resolution = { item: DownloadItem; formats: AudioFormat[] };
export type StreamResolution = { uri: string; mime: string; item: DownloadItem };
export type SearchResults = {
  items: DownloadItem[];
  errors: Partial<Record<SourceId, string>>;
};
export type SourceStatus = {
  id: SourceId;
  label: string;
  available: boolean;
  reason?: string;
};
export type DownloadState =
  | "queued"
  | "resolving"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export type DownloadJob = {
  id: string;
  item: DownloadItem;
  format: AudioFormat;
  state: DownloadState;
  bytes: number;
  total: number;
  created: number;
  uri: string | null;
  artwork: string | null;
  duration: number;
  error: string | null;
};
export interface DownloadProvider {
  id: SourceId;
  search(query: string): Promise<SearchResults>;
  resolve(id: string): Promise<Resolution>;
}
