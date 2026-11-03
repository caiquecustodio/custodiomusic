import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { thumbnail } from "../lib/artwork-cache";
import Svg, { Path, Rect } from "react-native-svg";
import { Track } from "../lib/types";
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={16} fill="#2A203D" />
      <Path
        d="M32 14a14 14 0 1 0 0 20"
        fill="none"
        stroke="#C7A7FF"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Path
        d="M21 20v8m6-12v20m6-14v4"
        stroke="#C7A7FF"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}
export const Artwork = memo(function Artwork({
  track,
  size = 52,
  radius = 12,
}: {
  track: Pick<Track, "id" | "artwork"> & Partial<Pick<Track, "sync" | "modified">>;
  size?: number;
  radius?: number;
}) {
  const [failedUri, setFailedUri] = useState<string | undefined>();
  const [small, setSmall] = useState<{ source: string; revision: number; uri: string } | null>(null);
  const artwork = track.artwork;
  const revision = track.sync?.checkedAt ?? track.modified ?? 0;
  useEffect(() => {
    if (!artwork || size > 64) return;
    let alive = true;
    void thumbnail(artwork, revision).then((uri) => { if (alive && uri !== artwork) setSmall({ source: artwork, revision, uri }); }).catch(() => undefined);
    return () => { alive = false; };
  }, [artwork, size, revision]);
  const uri = small && small.source === artwork && small.revision === revision && size <= 64 ? small.uri : artwork;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: "#242030",
      }}
    >
      {track.artwork && failedUri !== track.artwork ? (
        <Image
          accessibilityLabel="Capa da música"
          source={{ uri, cacheKey: /^(file|content):/i.test(uri ?? "") ? `${uri}:${revision}` : undefined }}
          cachePolicy="disk"
          recyclingKey={`${track.id}:${uri}`}
          contentFit="cover"
          allowDownscaling
          transition={0}
          onError={() => { if (uri !== artwork) setSmall(null); else setFailedUri(artwork); }}
          style={{ width: size, height: size }}
        />
      ) : (
        <BrandMark size={size} />
      )}
    </View>
  );
});
