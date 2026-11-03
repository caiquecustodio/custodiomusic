export type Track = {
  id: string;
  uri: string;
  /** Known parent folder; content URIs cannot reliably reveal a filesystem path. */
  folder?: string;
  online?: { provider: "youtube" | "jamendo" | "audius"; sourceId: string; sourceUrl: string; downloadable: boolean };
  title: string;
  artist: string;
  /** Canonical unit for persisted and playback durations. */
  duration: number;
  durationUnit?: "seconds";
  modified?: number;
  artwork?: string;
  album?: string;
  discovery?: {
    identity: string;
    genres: string[];
    /** Artist genres are suggestions, never a confirmed classification of this recording. */
    suggestedGenres?: string[];
    candidates?: { recordingId: string; title: string; artist: string }[];
    year?: number;
    recordingId?: string;
    source: "MusicBrainz";
    checkedAt: number;
    outcome: "found" | "missing" | "error";
  };
  metadataEdited?: boolean;
  sync?: { checkedAt: number; outcome: "found" | "missing" | "review" | "error"; message: string; hasLyrics?: boolean };
  lyricsOffset?: number;
  origin?: {
    provider: "youtube" | "jamendo" | "audius";
    sourceId: string;
    sourceUrl: string;
    format: string;
  };
};

export type PersonalGenre = {
  id: string;
  name: string;
  trackIds: string[];
  matchGenres: string[];
  matchArtist?: string;
  autoInclude: boolean;
};

export type StoredState = {
  personalGenres?: PersonalGenre[];
  librarySort: "original" | "title" | "artist" | "album";
  shuffle: boolean;
  autoSync: boolean;
  repeat: "off" | "all" | "one" | "single";
  favorites: string[];
  playlists: { id: string; name: string; trackIds: string[] }[];
  theme: "dark" | "light";
};

export const DEFAULT_STATE: StoredState = {
  personalGenres: [],
  librarySort: "original",
  shuffle: false,
  autoSync: true,
  repeat: "off",
  favorites: [],
  playlists: [],
  theme: "dark",
};
