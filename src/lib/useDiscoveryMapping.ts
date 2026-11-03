import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AppState } from "react-native";
import { discoveryDue, discoveryIdentity } from "./discovery-metadata";
import { findDiscoveryMetadata } from "./metadata-service";
import type { Track } from "./types";

// One low-priority worker; the playing track jumps ahead of library work.
// The persisted track cache survives restarts and provides offline grouping.
export function useDiscoveryMapping(tracks: Track[], setTracks: Dispatch<SetStateAction<Track[]>>, current: Track | null, hydrated: boolean, enabled: boolean) {
  const latest = useRef({ tracks, current, enabled });
  useEffect(() => { latest.current = { tracks, current, enabled }; }, [tracks, current, enabled]);
  const [mappingId, setMappingId] = useState<string | null>(null);
  const [identifyingId, setIdentifyingId] = useState<string | null>(null);
  const manual = useRef<AbortController | null>(null);
  useEffect(() => () => manual.current?.abort(), []);
  const identifyGenre = async (track: Track, correction?: { title: string; artist: string }) => {
    manual.current?.abort();
    const controller = new AbortController(); manual.current = controller;
    const candidate = correction ? { ...track, title: correction.title.trim(), artist: correction.artist.trim(), metadataEdited: true } : track;
    if (!candidate.title) throw new Error("Informe o título da música.");
    const originalIdentity = discoveryIdentity(track);
    setIdentifyingId(track.id);
    try {
      const discovery = await findDiscoveryMetadata(candidate, controller.signal);
      controller.signal.throwIfAborted();
      setTracks((previous) => previous.map((item) => item.id === track.id && discoveryIdentity(item) === originalIdentity
        ? { ...item, ...(correction ? { title: candidate.title, artist: candidate.artist, metadataEdited: true } : {}), discovery } : item));
      return discovery;
    } finally {
      if (manual.current === controller) { manual.current = null; setIdentifyingId(null); }
    }
  };
  useEffect(() => {
    if (!hydrated || !enabled) return;
    let alive = true, running = false;
    const abort = new AbortController();
    const run = async () => {
      if (!alive || running || manual.current || !latest.current.enabled || AppState.currentState !== "active") return;
      const data = latest.current;
      const track = data.current && discoveryDue(data.current) ? data.current : data.tracks.find((item) => discoveryDue(item));
      if (!track) return;
      running = true;
      setMappingId(track.id);
      const identity = discoveryIdentity(track);
      try {
        const discovery = await findDiscoveryMetadata(track, abort.signal);
        if (alive) setTracks((previous) => previous.map((item) => item.id === track.id && discoveryIdentity(item) === identity ? { ...item, discovery } : item));
      } catch {
        if (alive && !abort.signal.aborted) setTracks((previous) => previous.map((item) => item.id === track.id && discoveryIdentity(item) === identity ? { ...item, discovery: { ...(item.discovery?.identity === identity ? item.discovery : {}), identity, source: "MusicBrainz", genres: item.discovery?.identity === identity ? item.discovery.genres : [], checkedAt: Date.now(), outcome: "error" } } : item));
      } finally { running = false; if (alive) setMappingId(null); }
    };
    const timer = setInterval(() => { void run(); }, 5000);
    const initial = setTimeout(() => { void run(); }, 1500);
    const resume = AppState.addEventListener("change", (state) => { if (state === "active") void run(); });
    return () => { alive = false; abort.abort(); clearInterval(timer); clearTimeout(initial); resume.remove(); };
  }, [hydrated, enabled, setTracks]);
  return { mappingId, identifyingId, identifyGenre, mappedCount: tracks.filter((track) => track.discovery?.identity === discoveryIdentity(track) && !!track.discovery.genres.length).length };
}
