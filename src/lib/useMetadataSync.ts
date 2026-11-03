import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Platform } from "react-native";
import type { Track } from "./types";
import { bestLyrics, findCover, findLyrics } from "./metadata-service";
import { parseLrc, searchIdentity, type LyricsMatch, type LyricsRecord } from "./metadata-model";
import { downloadCover, readCandidates, readLyrics, writeCandidates, writeLyrics } from "./metadata-storage";

export function useMetadataSync(tracks: Track[], setTracks: Dispatch<SetStateAction<Track[]>>, current: Track | null, auto: boolean, hydrated: boolean, playing: boolean) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<{ id: string; data: LyricsRecord | null } | null>(null);
  const [candidates, setCandidates] = useState<{ id: string; items: LyricsMatch[] } | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; running: boolean }>({ done: 0, total: 0, running: false });
  const lock = useRef(false);
  const bulkLock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const bulkCancelled = useRef(false);
  const attempted = useRef(new Set<string>());
  const update = useCallback((id: string, patch: Partial<Track>) => {
    setTracks((previous) => previous.map((track) => track.id === id ? { ...track, ...patch, ...((patch.title !== undefined && patch.title !== track.title) || (patch.artist !== undefined && patch.artist !== track.artist) ? { discovery: undefined } : {}) } : track));
  }, [setTracks]);

  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    let alive = true;
    void Promise.all([readLyrics(currentId), readCandidates(currentId)]).then(([data, items]) => {
      if (alive) { setLyrics({ id: currentId, data }); setCandidates({ id: currentId, items }); }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [currentId]);
  useEffect(() => () => { controller.current?.abort(); bulkCancelled.current = true; }, []);

  const syncTrack = useCallback(async (original: Track, force = false) => {
    if (lock.current) return false;
    if (!force && original.sync && Date.now() - original.sync.checkedAt < (original.sync.outcome === "error" ? 60000 : 7 * 86400000)) return true;
    lock.current = true;
    setBusy(original.id);
    const abort = new AbortController();
    controller.current = abort;
    let track = original;
    try {
      let saved = await readLyrics(track.id);
      if (Platform.OS === "android") {
        try {
          const native = (await import("../../modules/audio-analysis/src/AudioAnalysisModule")).default;
          const metadata = await native.readMetadata(track.uri);
          if (!saved && metadata.lyrics) {
            saved = { plain: metadata.lyrics, synced: parseLrc(metadata.lyrics).length ? metadata.lyrics : "", instrumental: false, source: "Arquivo local" };
            await writeLyrics(track.id, saved);
            setLyrics((previous) => previous?.id === track.id ? { id: track.id, data: saved } : previous);
          }
          const patch: Partial<Track> = {
            ...(!track.metadataEdited ? { title: metadata.title || track.title, artist: metadata.artist || track.artist, album: metadata.album || track.album } : {}),
            artwork: track.artwork || metadata.artwork,
            duration: metadata.duration || track.duration,
          };
          track = { ...track, ...patch };
          update(track.id, patch);
        } catch { /* Existing APKs and other platforms can use filename/manual metadata. */ }
      }
      abort.signal.throwIfAborted();
      const identity = searchIdentity(track);
      if (!identity.artist || !identity.title) {
        update(track.id, { sync: { checkedAt: Date.now(), outcome: "review", message: "Informe título e artista em Corrigir busca para encontrar a versão certa." } });
        return true;
      }
      let message = "", failed = false, review = false;
      if (force || !saved?.synced) {
        try {
          const result = bestLyrics(track, await findLyrics(track, abort.signal));
          await writeCandidates(track.id, result.candidates);
          setCandidates((previous) => previous?.id === track.id ? { id: track.id, items: result.candidates } : previous);
          if (result.chosen) {
            // A local import is always preserved until the user selects another version explicitly.
            if (saved?.source !== "Arquivo local") {
              saved = { plain: result.chosen.plainLyrics ?? "", synced: result.chosen.syncedLyrics ?? "", instrumental: !!result.chosen.instrumental, source: `LRCLIB · ${result.chosen.id}` };
              await writeLyrics(track.id, saved);
            }
          } else if (result.candidates.length) review = true;
        } catch { failed = true; message = "Não foi possível consultar letras. Verifique a conexão e tente novamente."; }
      }
      if (!track.artwork || /^https?:/.test(track.artwork) || (force && track.artwork.includes("music-covers"))) {
        try {
          const urls = await findCover(track, abort.signal);
          for (let index = 0; index < urls.length; index++) {
            try {
              const artwork = await downloadCover(urls[index], abort.signal);
              update(track.id, { artwork }); track = { ...track, artwork };
              break;
            } catch (error) {
              abort.signal.throwIfAborted();
              if (index === urls.length - 1) throw error;
            }
          }
        } catch { failed = true; message += " A capa não pôde ser baixada."; }
      }
      abort.signal.throwIfAborted();
      setLyrics((previous) => previous?.id === track.id ? { id: track.id, data: saved } : previous);
      const outcome = failed ? "error" : review ? "review" : saved || track.artwork ? "found" : "missing";
      update(track.id, { sync: { checkedAt: Date.now(), outcome, hasLyrics: !!saved, message: message || (review ? "Há versões para conferir em Escolher versão." : saved?.synced ? "Letra sincronizada salva no aparelho." : saved?.instrumental ? "Faixa identificada como instrumental." : saved?.plain ? "Letra comum salva; versão sincronizada não encontrada." : "Letra não encontrada para esta gravação.") } });
      return true;
    } catch {
      if (!abort.signal.aborted) update(track.id, { sync: { checkedAt: Date.now(), outcome: "error", message: "Falha na sincronização. Seus dados anteriores foram preservados." } });
      return false;
    } finally { lock.current = false; controller.current = null; setBusy(null); }
  }, [update]);

  useEffect(() => {
    if (!auto || !hydrated || !playing || !current || busy || bulk.running || attempted.current.has(current.id)) return;
    const timer = setTimeout(() => {
      if (lock.current || bulkLock.current) return;
      attempted.current.add(current.id);
      void syncTrack(current);
    }, 1200);
    return () => clearTimeout(timer);
  }, [auto, hydrated, playing, current, busy, bulk.running, syncTrack]);

  const syncLibrary = async () => {
    if (bulkLock.current || lock.current) return;
    bulkLock.current = true;
    bulkCancelled.current = false;
    const pending = tracks.filter((track) => !track.sync || track.sync.outcome !== "found" || !track.sync.hasLyrics || !track.artwork);
    setBulk({ done: 0, total: pending.length, running: true });
    try {
      for (const track of pending) {
        if (bulkCancelled.current) break;
        await syncTrack(track, true);
        if (bulkCancelled.current) break;
        setBulk((previous) => ({ ...previous, done: previous.done + 1 }));
      }
    } finally { bulkLock.current = false; setBulk((previous) => ({ ...previous, running: false })); }
  };
  const cancelSync = () => { bulkCancelled.current = true; controller.current?.abort(); };
  const chooseLyrics = async (id: string, match: LyricsMatch) => {
    const data = { plain: match.plainLyrics ?? "", synced: match.syncedLyrics ?? "", instrumental: !!match.instrumental, source: `LRCLIB · ${match.id}` };
    await writeLyrics(id, data);
    setLyrics((previous) => previous?.id === id ? { id, data } : previous);
    update(id, { sync: { checkedAt: Date.now(), outcome: "found", hasLyrics: true, message: "Versão escolhida e salva." } });
  };
  const importLyrics = async (id: string, text: string) => {
    const data = { plain: text, synced: parseLrc(text).length ? text : "", instrumental: false, source: "Arquivo local" };
    await writeLyrics(id, data);
    setLyrics((previous) => previous?.id === id ? { id, data } : previous);
    update(id, { sync: { checkedAt: Date.now(), outcome: "found", hasLyrics: true, message: "Letra importada e salva no aparelho." } });
  };
  return {
    reloadCurrentLyrics: async () => {
      if (!currentId) return;
      const data = await readLyrics(currentId);
      setLyrics((previous) => previous?.id === currentId ? { id: currentId, data } : previous);
    },
    saveManualLyrics: async (id: string, synced: string) => {
      const data = { plain: parseLrc(synced).map((line) => line.text).join("\n"), synced, instrumental: false, source: "Arquivo local" };
      await writeLyrics(id, data);
      setLyrics((previous) => previous?.id === id ? { id, data } : previous);
      update(id, { lyricsOffset: 0, sync: { checkedAt: Date.now(), outcome: "found", hasLyrics: true, message: "Tempos marcados por você e salvos no aparelho." } });
    },
    syncBusy: busy, syncTrack, syncLibrary, syncBulk: bulk, cancelSync, chooseLyrics, importLyrics,
    currentLyrics: lyrics && lyrics.id === current?.id ? lyrics.data : null,
    lyricCandidates: candidates && candidates.id === current?.id ? candidates.items : [],
    updateTrackMetadata: update,
  };
}
