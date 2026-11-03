import { allowedOnlineItems, excludedOnlineIds, onlineId, selectOnlineBatch } from "./online-queue";
import { createPersonalGenre, genreKey } from "./discovery-metadata";
import { subscribePlayback, useMusicPlayer } from "./useMusicPlayer";
import { nativeQueueTracks, type NativeQueueOptions } from "./native-queue";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import {
  AssetField,
  MediaType,
  Query,
  type AssetInfo,
} from "expo-media-library";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, AppState, Platform } from "react-native";
import {
  loadImportedTracks,
  loadQueue,
  loadState,
  saveImportedTracks,
  saveQueue,
  saveState,
  loadSession,
  saveSession,
  type PlaybackSession,
} from "./persistence";
import { DEFAULT_STATE, StoredState, Track } from "./types";
import { themes } from "./theme";
import { downloads, nativeDownloads } from "../../modules/music-downloads/src";
import { mergeDownloads, onlineTrack, canPlay, isOffline } from "./downloads/model";
import { useCompletedDownloads } from "./downloads/context";
import { normalizeDuration } from "./duration";
import { nextTrackId } from "./playback";
import { useMetadataSync } from "./useMetadataSync";
import { usePlaybackTools } from "./usePlaybackTools";
import { moveQueue, queueNext } from "./listening-model";
import { usePlaybackSummary } from "./usePlaybackSummary";
import { mapConcurrent } from "./concurrency";
import { useListening, useRadio } from "./useDiscovery";
import type { DownloadItem } from "./downloads/types";
import { useDiscoveryMapping } from "./useDiscoveryMapping";
import { scheduleIdle, yieldToInput } from "./idle";

function trackFromAsset(asset: AssetInfo): Track {
  return {
    id: String(asset.id),
    uri: asset.uri,
    title: asset.filename.replace(/\.[^.]+$/, ""),
    artist: "Arquivo local",
    duration: normalizeDuration(asset.duration, "milliseconds"),
    durationUnit: "seconds",
    modified: asset.modificationTime ?? 0,
  };
}
async function scanMediaLibrary(previous: Track[], alive = () => true) {
  const cached = new Map(previous.map((track) => [track.id, track]));
  const result: Track[] = [];
  for (let offset = 0; alive(); offset += 200) {
    const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.AUDIO).orderBy(AssetField.CREATION_TIME).offset(offset).limit(200).exe();
    const page = await mapConcurrent(assets, 8, async (asset) => {
      const track = trackFromAsset(await asset.getInfo());
      const saved = cached.get(track.id);
      if (saved && saved.duration > 0 && track.modified && saved.modified === track.modified && saved.uri === track.uri) return saved;
      if (nativeDownloads) { try { return { ...track, ...await nativeDownloads.localInfo(track.uri) }; } catch { /* Older APK: keep readable media entries. */ } }
      return track;
    });
    result.push(...page);
    if (assets.length < 200) break;
    await yieldToInput();
  }
  return [...new Map(result.map((track) => [track.id, track])).values()];
}
function mergeLibrary(loaded: Track[], previous: Track[]) {
  const old = new Map(previous.map((track) => [track.id, track]));
  const ids = new Set(loaded.map((track) => track.id));
  return [
    ...loaded.map((track) => {
      const previous = old.get(track.id);
      return { ...previous, ...track,
        ...(previous?.sync || previous?.metadataEdited ? { title: previous.title, artist: previous.artist, album: previous.album } : {}),
        artwork: previous?.artwork ?? track.artwork,
      };
    }),
    ...previous.filter(
      (track) =>
        (track.id.startsWith("document:") || track.origin !== undefined || track.online !== undefined) &&
        !ids.has(track.id),
    ),
  ];
}

function useMusicState() {
  const completedDownloads = useCompletedDownloads();
  const player = useMusicPlayer();
  const nativeQueue = Platform.OS === "android" && nativeDownloads?.playbackQueueVersion === 1;
  const status = usePlaybackSummary(player, nativeQueue);
  const appActive = useAppActive();
  const [state, setState] = useState<StoredState>(DEFAULT_STATE);
  const colors = themes[state.theme];
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const pendingResume = useRef<PlaybackSession | null>(null);
  const playRequest = useRef(0);
  const streamRetry = useRef(false);
  const handledStreamError = useRef<string | null>(null);
  const activeSourceId = useRef<string | null>(null);
  const sourceChanges = useRef<Promise<void>>(Promise.resolve());
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [resolvingStream, setResolvingStream] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [playIntent, setPlayIntent] = useState<boolean | null>(null);
  const playbackWanted = useRef(false);
  const nativeConfigured = useRef(false);
  const [onlineSession, setOnlineSession] = useState(false);
  const restoring = useRef(false);
  const priorityNext = useRef<string | null>(null);
  const [priorityId, setPriorityId] = useState<string | null>(null);
  const playbackTools = usePlaybackTools(player, status, currentId, nativeQueue);
  const { clearRange, sleepAtEnd, cancelSleep, loopRange } = playbackTools;
  const nativeOptions = useMemo<NativeQueueOptions>(() => ({
    repeat: state.repeat, shuffle: state.shuffle, priority: priorityId,
    sleepAtEnd, sleepDeadline: playbackTools.sleepDeadline, range: loopRange,
  }), [state.repeat, state.shuffle, priorityId, sleepAtEnd, playbackTools.sleepDeadline, loopRange]);
  const played = useRef(new Set<string>());
  const history = useRef<string[]>([]);
  const [libraryPermission, requestLibraryPermission] =
    MediaLibrary.usePermissions({
      granularPermissions: ["audio"],
      get: Platform.OS !== "web",
    });

  const tracksById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const availableQueue = useMemo(
    () => queue.filter((id) => { const t = tracksById.get(id); return !!t && canPlay(t); }),
    [queue, tracksById],
  );
  const current = tracksById.get(currentId ?? "") ?? null;
  const listeningTools = useListening(player, current, nativeQueue);
  const [hydrated, setHydrated] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanPending = useRef<Promise<void> | null>(null);
  const librarySnapshot = useRef(tracks);
  useLayoutEffect(() => { librarySnapshot.current = tracks; }, [tracks]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refreshLibrary = useCallback(() => {
    if (scanPending.current) return scanPending.current;
    setScanning(true);
    setLibraryError(null);
    const work = scanMediaLibrary(librarySnapshot.current, () => mounted.current)
      .then((loaded) => { if (mounted.current) setTracks((previous) => mergeLibrary(loaded, previous)); })
      .catch(() => { if (mounted.current) setLibraryError("Não foi possível atualizar. Tente novamente ou adicione arquivos."); })
      .finally(() => { scanPending.current = null; if (mounted.current) setScanning(false); });
    scanPending.current = work;
    return work;
  }, []);
  const metadataSync = useMetadataSync(tracks, setTracks, current, state.autoSync, hydrated, status.playing && appActive);
  const discoveryMapping = useDiscoveryMapping(tracks, setTracks, current, hydrated, state.autoSync);
  useEffect(() => {
    if (nativeQueue) return;
    if (!current) return;
    try {
      player.updateLockScreenMetadata({ title: current.title, artist: current.artist, albumTitle: current.album, artworkUrl: current.artwork });
    } catch { /* Lock-screen integration is optional on unsupported platforms. */ }
  }, [player, current, nativeQueue]);
  useEffect(() => {
    if (nativeQueue) return;
    // Expo exposes native loop configuration through a mutable player property.
    // eslint-disable-next-line react-hooks/immutability
    player.loop = state.repeat === "one" && !sleepAtEnd;
  }, [player, state.repeat, sleepAtEnd, nativeQueue]);
  useEffect(() => {
    let alive = true;
    const session = nativeQueue ? nativeDownloads!.playbackSavedSession().then((raw) => raw ? JSON.parse(raw) as PlaybackSession : loadSession()).catch(loadSession) : loadSession();
    Promise.all([loadState(), loadImportedTracks(), loadQueue(), session]).then(
      ([saved, imported, savedQueue, session]) => {
        if (!alive) return;
        setState(saved);
        setQueue(savedQueue);
        setTracks(imported);
        const restored = session && imported.find((track) => track.id === session.trackId && canPlay(track) && !track.uri.startsWith("blob:"));
        if (restored && session) {
          try {
            pendingResume.current = session;
            if (nativeQueue) {
              const token = ++playRequest.current;
              nativeDownloads!.setPlaybackIntent(token, false);
              nativeConfigured.current = true;
              void nativeDownloads!.configurePlaybackQueue(player.native, JSON.stringify(nativeQueueTracks(imported, savedQueue, restored)), restored.id, token,
                JSON.stringify({ repeat: saved.repeat, shuffle: saved.shuffle, priority: null, sleepAtEnd: false, sleepDeadline: null, range: null }))
                .catch(() => setPlaybackError("Não foi possível restaurar a reprodução. Toque para tentar novamente."));
            } else if (isOffline(restored)) player.replace(restored.uri);
            setCurrentId(restored.id);
          }
          catch { pendingResume.current = null; }
        }
        setHydrated(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [player, nativeQueue]);

  useEffect(() => {
    const session = pendingResume.current;
    if (!session || session.trackId !== currentId || !status.isLoaded || restoring.current) return;
    restoring.current = true;
    const position = status.duration > 0 ? Math.min(session.position, Math.max(0, status.duration - 0.1)) : session.position;
    void player.seekTo(position).catch(() => undefined).finally(() => { pendingResume.current = null; restoring.current = false; });
  }, [currentId, status.isLoaded, status.duration, player]);
  useEffect(() => {
    if (nativeQueue || !hydrated || !currentId) return;
    const store = () => {
      try {
      if (!player.isLoaded || pendingResume.current) return;
      void saveSession({ trackId: currentId, position: Math.max(0, player.currentTime) }).catch(() => undefined);
      } catch { /* The native player may already be released during unmount. */ }
    };
    store();
    const interval = setInterval(store, 5000);
    const subscription = AppState.addEventListener("change", (next) => { if (next !== "active") store(); });
    return () => { store(); clearInterval(interval); subscription.remove(); };
  }, [hydrated, currentId, status.playing, player, nativeQueue]);

  useEffect(() => {
    hydrated && saveState(state).catch(() => undefined);
  }, [state, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    const save = () => { void saveImportedTracks(tracks).catch(() => undefined); };
    const timer = setTimeout(save, 300);
    const subscription = AppState.addEventListener("change", (next) => { if (next !== "active") save(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [tracks, hydrated]);
  useEffect(() => {
    hydrated && saveQueue(queue).catch(() => undefined);
  }, [queue, hydrated]);

  useEffect(() => {
    if (!hydrated || !libraryPermission?.granted) return;
    return scheduleIdle(() => { void refreshLibrary(); });
  }, [libraryPermission?.granted, hydrated, refreshLibrary]);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    void Promise.resolve().then(() => { if (alive) setTracks((previous) => mergeDownloads(previous, completedDownloads)); });
    return () => { alive = false; };
  }, [hydrated, completedDownloads]);

  const playTrack = useCallback(
    async (track: Track, nextQueue = tracks.map((item) => item.id), allowOnline = true, queueTracks = tracks) => {
      if (!canPlay(track)) {
        Alert.alert(
          "Arquivo indisponível",
          "Selecione a música novamente pelo armazenamento do celular.",
        );
        return false;
      }
      const token = ++playRequest.current;
      playbackWanted.current = true;
      setPlayIntent(true);
      if (nativeQueue) {
        nativeDownloads!.setPlaybackIntent(token, true);
        setPlaybackError(null);
        pendingResume.current = null;
        clearRange();
        const sameQueue = queue.length === nextQueue.length && queue.every((id, index) => id === nextQueue[index]);
        if (!sameQueue) { setQueue(nextQueue); priorityNext.current = null; setPriorityId(null); played.current.clear(); history.current = []; }
        if (currentId && currentId !== track.id) { history.current.push(currentId); history.current = history.current.slice(-200); }
        played.current.add(track.id);
        setTracks((previous) => previous.some((item) => item.id === track.id) ? previous : [...previous, track]);
        setCurrentId(track.id);
        activeSourceId.current = track.id;
        setStreaming(!isOffline(track));
        setResolvingStream(!isOffline(track));
        nativeConfigured.current = true;
        try {
          await nativeDownloads!.configurePlaybackQueue(player.native,
            JSON.stringify(nativeQueueTracks(tracks, nextQueue, track, !allowOnline, true, queueTracks)), track.id, token,
            JSON.stringify({ ...nativeOptions, range: null, priority: sameQueue ? priorityId : null }));
          return token === playRequest.current;
        } catch {
          if (token === playRequest.current) {
            setResolvingStream(false); setPlayIntent(null);
            setPlaybackError("Não foi possível iniciar esta faixa. Confira o arquivo ou a conexão.");
          }
          return false;
        }
      }
      streamRetry.current = false;
      setPlaybackError(null);
      setResolvingStream(!isOffline(track));
      let stream: Awaited<ReturnType<typeof downloads.stream>> | null = null;
      try {
        const localMissing = track.uri.startsWith("file:") && !new File(track.uri).exists;
        if (!isOffline(track) || localMissing) {
          if (!allowOnline) throw new Error("Arquivo offline indisponível.");
          const source = track.online ?? track.origin;
          if (!source) throw new Error("Fonte indisponível.");
          stream = await downloads.stream(source.provider, source.sourceId);
        }
      } catch {
        if (token === playRequest.current) { setResolvingStream(false); setPlayIntent(null); setPlaybackError("Não foi possível consultar esta fonte. Confira sua conexão e tente novamente."); }
        return false;
      }
      if (token !== playRequest.current) return false;
      setTracks((previous) => previous.some((item) => item.id === track.id) ? previous : [...previous, track]);
      pendingResume.current = null;
      clearRange();
      const sameQueue = queue.length === nextQueue.length && queue.every((id, index) => id === nextQueue[index]);
      if (!sameQueue) setQueue(nextQueue);
      if (!sameQueue) {
        priorityNext.current = null;
        played.current.clear();
        history.current = [];
      }
      if (currentId && currentId !== track.id) {
        history.current.push(currentId);
        if (history.current.length > 200) history.current.shift();
      }
      played.current.add(track.id);
      setCurrentId(track.id);
      try {
        const resolved = stream;
        const change = sourceChanges.current.catch(() => undefined).then(async () => {
          if (token !== playRequest.current) return;
          activeSourceId.current = track.id;
          if (resolved && nativeDownloads?.playbackQueueVersion) await nativeDownloads.setOnlineSource(player.native, resolved.uri, resolved.mime);
          else player.replace(resolved?.uri ?? track.uri);
          if (token !== playRequest.current) return;
          if (token === playRequest.current) player.play();
        });
        sourceChanges.current = change;
        await change;
        if (token !== playRequest.current) return false;
        setResolvingStream(false);
        setStreaming(!!stream);
        player.setActiveForLockScreen(
          true,
          {
            title: track.title,
            artist: track.artist,
            artworkUrl: track.artwork,
          },
          { showNextTrack: true, showPreviousTrack: true },
        );
        return true;
      } catch {
        if (token !== playRequest.current) return false;
        setPlayIntent(null);
        setResolvingStream(false);
        setPlaybackError("Não foi possível reproduzir esta faixa. Confira o arquivo ou a conexão.");
        Alert.alert(
          "Não foi possível reproduzir",
          "O formato pode não ser compatível ou o acesso ao arquivo pode ter expirado.",
        );
        return false;
      }
    },
    [tracks, player, queue, currentId, clearRange, nativeQueue, nativeOptions, priorityId],
  );

  const radioTools = useRadio({ tracks, state, listening: listeningTools.listening, queue, current, setTracks, setQueue, playTrack });
  const nativeQueueJson = useMemo(() => current ? JSON.stringify(nativeQueueTracks(tracks, queue, current, radioTools.radioActive && radioTools.radioPreferences.offline, false)) : null,
    [tracks, queue, current, radioTools.radioActive, radioTools.radioPreferences.offline]);
  const nativeOptionsJson = JSON.stringify({ ...nativeOptions,
    radio: radioTools.radioActive, online: onlineSession,
    radioPrefetch: radioTools.radioPreferences.prefetch && !radioTools.radioPreferences.offline,
    repeat: radioTools.radioActive && state.repeat === "off" ? "all" : state.repeat });
  useEffect(() => {
    if (!nativeQueue || !nativeConfigured.current || !nativeQueueJson) return;
    void nativeDownloads!.configurePlaybackQueue(player.native, nativeQueueJson, "", playRequest.current, nativeOptionsJson)
      .catch(() => setPlaybackError("Não foi possível atualizar a fila de reprodução."));
  }, [nativeQueue, nativeQueueJson, nativeOptionsJson, player]);
  useEffect(() => {
    if (!nativeQueue) return;
    const changed = nativeDownloads!.addListener("onPlaybackTrackChanged", (event) => {
      if (event.request !== playRequest.current) return;
      activeSourceId.current = event.id;
      setCurrentId(event.id);
      setStreaming(event.streaming);
      setResolvingStream(false);
      setPlaybackError(null);
      if (priorityNext.current === event.id) { priorityNext.current = null; setPriorityId(null); }
    });
    const error = nativeDownloads!.addListener("onPlaybackQueueError", (event) => {
      if (event.request !== playRequest.current) return;
      setPlaybackError(event.message); setResolvingStream(false); setPlayIntent(null);
    });
    const sleep = nativeDownloads!.addListener("onPlaybackSleepEnded", () => {
      playbackWanted.current = false; setPlayIntent(null); cancelSleep();
    });
    const duration = nativeDownloads!.addListener("onPlaybackDuration", (event) => {
      if (!Number.isFinite(event.duration) || event.duration <= 0 || event.request !== playRequest.current) return;
      setTracks((previous) => {
        const track = previous.find((track) => track.id === event.id);
        if (!track || track.duration === event.duration) return previous;
        return previous.map((track) => track.id === event.id ? { ...track, duration: event.duration, durationUnit: "seconds" } : track);
      });
    });
    const app = AppState.addEventListener("change", (next) => {
      if (next === "active") void nativeDownloads!.synchronizePlayback().catch(() => undefined);
    });
    return () => { changed.remove(); error.remove(); sleep.remove(); duration.remove(); app.remove(); };
  }, [nativeQueue, cancelSleep]);
  useEffect(() => {
    return subscribePlayback(player, (event) => {
      setPlayIntent((intent) => event.error || event.playing === intent ? null : intent);
      if (event.isLoaded || event.error) setResolvingStream(false);
    }, nativeQueue);
  }, [player, nativeQueue]);
  const [onlineQueueBusy, setOnlineQueueBusy] = useState(false);
  const [onlineQueueMessage, setOnlineQueueMessage] = useState("");
  const onlineGeneration = useRef(0);
  const onlinePending = useRef<number | null>(null);
  const radioPreferences = radioTools.radioPreferences;
  const onlineLatest = useRef({ tracks, queue, current, radioPreferences });
  useEffect(() => { onlineLatest.current = { tracks, queue, current, radioPreferences }; }, [tracks, queue, current, radioPreferences]);
  const loadMoreOnline = async () => {
    const token = onlineGeneration.current;
    if (onlinePending.current === token) return;
    const seed = onlineLatest.current.current;
    if (!seed || !(seed.online || seed.origin)) return;
    onlinePending.current = token;
    setOnlineQueueBusy(true);
    setOnlineQueueMessage("");
    try {
      const collected: DownloadItem[] = [];
      const seen = new Set(excludedOnlineIds(onlineLatest.current.tracks, onlineLatest.current.queue));
      for (const term of [seed.artist, `${seed.artist} músicas`, `${seed.title} ${seed.artist}`]) {
        const result = await downloads.search(term, "all");
        if (token !== onlineGeneration.current) return;
        const eligible = allowedOnlineItems(result.items, onlineLatest.current.tracks, onlineLatest.current.radioPreferences);
        const batch = selectOnlineBatch(eligible, [...seen], 10 - collected.length);
        for (const item of batch) { seen.add(onlineId(item)); collected.push(item); }
        if (collected.length === 10) break;
      }
      if (token !== onlineGeneration.current) return;
      const additions = allowedOnlineItems(collected, onlineLatest.current.tracks, onlineLatest.current.radioPreferences).map((item) => onlineTrack(item, onlineLatest.current.tracks));
      setTracks((previous) => [...previous, ...additions.filter((track) => !previous.some((entry) => entry.id === track.id))]);
      setQueue((previous) => [...previous, ...additions.map((track) => track.id).filter((id) => !previous.includes(id))]);
      setOnlineQueueMessage(additions.length ? `${additions.length} músicas adicionadas à fila` : "Nenhuma faixa nova encontrada. Tente outra música ou adicione resultados da busca.");
    } catch {
      if (token === onlineGeneration.current) setOnlineQueueMessage("Não foi possível carregar mais. Sua fila continua disponível; tente novamente.");
    } finally {
      if (onlinePending.current === token) onlinePending.current = null;
      if (token === onlineGeneration.current) setOnlineQueueBusy(false);
    }
  };
  const listenOnline = async (item: DownloadItem, next = false, suggestions: DownloadItem[] = []) => {
    const track = onlineTrack(item, tracks);
    if (next && currentId) {
      priorityNext.current = track.id; setPriorityId(track.id);
      setTracks((previous) => previous.some((entry) => entry.id === track.id) ? previous : [...previous, track]);
      setQueue((previous) => queueNext(previous, currentId, track.id));
    } else {
      const token = ++onlineGeneration.current; setOnlineQueueBusy(false); setOnlineQueueMessage("");
      radioTools.stopRadio(); setOnlineSession(false);
      const upcoming = selectOnlineBatch(allowedOnlineItems(suggestions, tracks, radioPreferences), [track.id, onlineId(item)]).map((entry) => onlineTrack(entry, tracks));
      setTracks((previous) => [...previous, ...[track, ...upcoming].filter((entry) => !previous.some((old) => old.id === entry.id))]);
      if (!await playTrack(track, [track.id, ...upcoming.map((entry) => entry.id)], true, [...tracks, track, ...upcoming])) throw new Error("Fonte indisponível. Confira sua conexão.");
      if (token === onlineGeneration.current) setOnlineSession(true);
    }
  };
  const refillKey = useRef("");
  useEffect(() => {
    if (!onlineSession || !current) return;
    const remaining = queue.length - queue.indexOf(current.id) - 1;
    const key = `${onlineGeneration.current}:${current.id}`;
    if (remaining >= 10 || refillKey.current === key) return;
    refillKey.current = key;
    void loadMoreOnline();
    // Refill once per playing track; manual retry remains available after failures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineSession, current?.id, queue]);
  const radioFallback = useCallback(() => {
    if (!radioTools.radioActive) return;
    const local = queue.map((id) => tracksById.get(id)).find((track) => track && track.id !== currentId && isOffline(track));
    if (local) void playTrack(local, queue, false);
  }, [radioTools.radioActive, queue, tracksById, currentId, playTrack]);
  useEffect(() => {
    if (nativeQueue) return; // Native resolver owns bounded retries, including while JS sleeps.
    if (!status.error) { handledStreamError.current = null; return; }
    if (!current || !streaming || activeSourceId.current !== current.id) return;
    const signature = `${playRequest.current}:${status.error}`;
    if (handledStreamError.current === signature) return;
    handledStreamError.current = signature;
    if (isOffline(current)) { void Promise.resolve().then(() => playTrack(current, queue)); return; }
    const source = current.online ?? current.origin;
    if (!source || !nativeDownloads) return;
    if (streamRetry.current) { void Promise.resolve().then(radioFallback); return; }
    streamRetry.current = true;
    const token = playRequest.current;
    const position = player.currentTime;
    void downloads.stream(source.provider, source.sourceId).then(async (result) => {
      const change = sourceChanges.current.catch(() => undefined).then(async () => {
        if (token !== playRequest.current) return;
        await nativeDownloads!.setOnlineSource(player.native, result.uri, result.mime);
        if (token !== playRequest.current) return;
        await player.seekTo(position);
        if (token === playRequest.current) player.play();
      });
      sourceChanges.current = change;
      await change;
    }).catch(() => { if (token === playRequest.current) { setPlaybackError("A fonte está indisponível ou a conexão foi interrompida. Tente outra música."); radioFallback(); } });
  }, [status.error, current, player, radioFallback, streaming, playTrack, queue, nativeQueue]);

  const goToQueueTrack = useCallback(
    (direction: number, automatic = false) => {
      if (nativeQueue && nativeConfigured.current) {
        if (automatic) return;
        const token = ++playRequest.current;
        playbackWanted.current = true;
        pendingResume.current = null;
        clearRange(); setPlayIntent(true); setPlaybackError(null);
        nativeDownloads!.setPlaybackIntent(token, true);
        void nativeDownloads!.skipPlaybackTrack(direction, token).catch(() => {
          if (token === playRequest.current) { setPlayIntent(null); setPlaybackError("Não foi possível trocar a música."); }
        });
        return;
      }
      const available = radioTools.radioActive && radioTools.radioPreferences.offline ? availableQueue.filter((id) => isOffline(tracksById.get(id)!)) : availableQueue;
      if (!available.length) return;
      let nextId: string | null;
      if (direction < 0) {
        const previous = state.shuffle ? history.current.pop() : undefined;
        const index = available.indexOf(currentId ?? "");
        nextId = previous ?? available[(Math.max(0, index) - 1 + available.length) % available.length];
      } else {
        const priority = priorityNext.current;
        priorityNext.current = null;
        nextId = priority && available.includes(priority) ? priority : nextTrackId(available, currentId, {
          automatic, repeat: radioTools.radioActive && state.repeat === "off" ? "all" : state.repeat, shuffle: state.shuffle, played: played.current,
        });
      }
      const nextTrack = tracksById.get(nextId ?? "");
      if (nextTrack) {
        if (direction < 0) {
          // playTrack records the outgoing track; discard it when going back.
          void playTrack(nextTrack, queue, !(radioTools.radioActive && radioTools.radioPreferences.offline));
          history.current.pop();
        } else void playTrack(nextTrack, queue, !(radioTools.radioActive && radioTools.radioPreferences.offline)).then((success) => { if (!success) radioFallback(); });
      }
    },
    [queue, availableQueue, currentId, tracksById, playTrack, state.repeat, state.shuffle, radioFallback, radioTools.radioActive, radioTools.radioPreferences.offline, nativeQueue, clearRange],
  );

  const finishHandled = useRef(false);
  useEffect(() => {
    if (nativeQueue) return;
    if (!status.didJustFinish) {
      finishHandled.current = false;
      return;
    }
    if (finishHandled.current) return;
    finishHandled.current = true;
    if (sleepAtEnd) { player.pause(); cancelSleep(); return; }
    if (loopRange && loopRange.b !== null) return;
    if (state.repeat === "one") return; // Native looping already restarts the track.
    void Promise.resolve().then(() => goToQueueTrack(1, true));
  }, [status.didJustFinish, queue.length, goToQueueTrack, state.repeat, sleepAtEnd, cancelSleep, loopRange, player, nativeQueue]);

  const toggleFavorite = (id: string) =>
    setState((prev) => ({
      ...prev,
      favorites: prev.favorites.includes(id)
        ? prev.favorites.filter((item) => item !== id)
        : [...prev.favorites, id],
    }));

  const requestLibrary = async () => {
    if (scanning) return;
    setScanning(true);
    setLibraryError(null);
    try {
      const permission = libraryPermission?.granted
        ? libraryPermission
        : await requestLibraryPermission();
      if (!permission.granted) {
        setLibraryError(
          "Permita o acesso às músicas ou adicione arquivos manualmente.",
        );
        return;
      }
      await refreshLibrary();
    } catch {
      setLibraryError(
        "Não foi possível atualizar. Tente novamente ou adicione arquivos.",
      );
    } finally {
      setScanning(false);
    }
  };

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (result.canceled) return;
      const added = result.assets.map((asset) => ({
        id: `document:${asset.uri}`,
        uri: asset.uri,
        title: asset.name.replace(/\.[^.]+$/, ""),
        artist: "Arquivo selecionado",
        duration: 0,
        durationUnit: "seconds" as const,
        modified: asset.lastModified,
      }));
      setTracks((prev) => [
        ...prev.filter((track) => !added.some((item) => item.id === track.id)),
        ...added,
      ]);
      Alert.alert(
        "Músicas adicionadas",
        `${added.length} arquivo${added.length === 1 ? "" : "s"} disponível${added.length === 1 ? "" : "is"} na biblioteca.`,
      );
    } catch {
      Alert.alert(
        "Seletor indisponível",
        "Não foi possível abrir o seletor de arquivos do Android.",
      );
    }
  };

  const pickFolder = async () => {
    try {
      const selected = await Directory.pickDirectoryAsync();
      const audioExtensions = new Set([
        "mp3",
        "m4a",
        "aac",
        "ogg",
        "opus",
        "flac",
        "wav",
        "3gp",
        "amr",
        "wma",
      ]);
      const scan = (directory: Directory): Track[] =>
        directory.list().flatMap((entry) => {
          if (entry instanceof Directory) return scan(entry);
          if (
            !(entry instanceof File) ||
            !audioExtensions.has(
              entry.name.split(".").pop()?.toLowerCase() ?? "",
            )
          )
            return [];
          return [
            {
              id: `document:${entry.uri}`,
              uri: entry.uri,
              title: entry.name.replace(/\.[^.]+$/, ""),
              artist: "Pasta selecionada",
              duration: 0,
              durationUnit: "seconds",
              modified: entry.modificationTime ?? undefined,
              folder: directory.uri,
            },
          ];
        });
      const imported = scan(selected);
      setTracks((prev) => [
        ...prev.filter(
          (track) => !imported.some((item) => item.id === track.id),
        ),
        ...imported,
      ]);
      Alert.alert(
        "Pasta adicionada",
        `${imported.length} músicas encontradas.`,
      );
    } catch {
      Alert.alert(
        "Seletor indisponível",
        "O seletor de pastas funciona no APK próprio. Escolha arquivos pelo botão + enquanto desenvolve.",
      );
    }
  };

  const addFiles = () =>
    Platform.OS === "web"
      ? void pickFiles()
      : Alert.alert(
          "Adicionar músicas",
          "Escolha de onde importar suas faixas.",
          [
            { text: "Arquivos de áudio", onPress: () => void pickFiles() },
            { text: "Pasta do dispositivo", onPress: () => void pickFolder() },
            { text: "Cancelar", style: "cancel" },
          ],
        );

  const createPlaylist = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const playlist = {
      id: `playlist:${Date.now()}`,
      name: trimmed,
      trackIds: currentId ? [currentId] : [],
    };
    setState((prev) => ({ ...prev, playlists: [...prev.playlists, playlist] }));
    return playlist.id;
  };
  const addCurrentToPlaylist = (id: string) =>
    setState((prev) => ({
      ...prev,
      playlists: prev.playlists.map((playlist) =>
        playlist.id === id &&
        currentId &&
        !playlist.trackIds.includes(currentId)
          ? { ...playlist, trackIds: [...playlist.trackIds, currentId] }
          : playlist,
      ),
    }));

  const togglePlay = () => {
    if (!current) {
      if (tracks[0]) void playTrack(tracks[0]);
      return;
    }
    const wantsPlay = !(playIntent ?? player.playing);
    playbackWanted.current = wantsPlay;
    setPlayIntent(wantsPlay);
    if (nativeQueue) nativeDownloads!.setPlaybackIntent(playRequest.current, wantsPlay);
    const resumeToken = playRequest.current;
    if (!wantsPlay) {
      if (!nativeQueue) { ++playRequest.current; setResolvingStream(false); }
      player.pause();
    }
    else if (nativeQueue && nativeConfigured.current) {
      if (playbackError || status.error) {
        void playTrack(current, queue);
      } else if (status.duration > 0 && player.currentTime >= status.duration) {
        void player.seekTo(0).then(() => { if (playRequest.current === resumeToken && playbackWanted.current) player.play(); }).catch(() => setPlayIntent(null));
      } else player.play();
    }
    else if (status.error || (!player.isLoaded && (current.online || current.origin))) {
      const resume = pendingResume.current;
      void playTrack(current, queue).then((success) => { if (success && activeSourceId.current === current.id && resume?.trackId === current.id) void player.seekTo(resume.position).catch(() => undefined); });
    }
    else if (status.didJustFinish || (status.duration > 0 && player.currentTime >= status.duration)) {
      void player.seekTo(0).then(() => player.play()).catch(() => undefined);
    } else player.play();
  };

  const toggleShuffle = () => {
    played.current = new Set(currentId ? [currentId] : []);
    history.current = [];
    setState((prev) => ({ ...prev, shuffle: !prev.shuffle }));
  };
  const cycleRepeat = () => setState((prev) => ({
    ...prev,
    repeat: prev.repeat === "off" ? "all" : prev.repeat === "all" ? "one" : "off",
  }));

  const toggleTheme = () =>
    setState((prev) => ({
      ...prev,
      theme: prev.theme === "dark" ? "light" : "dark",
    }));

  useEffect(() => {
    if (nativeQueue) return;
    if (!currentId) return;
    let lastDuration = 0;
    const subscription = player.addListener("playbackStatusUpdate", (event) => {
      if (
        !event.isLoaded ||
        !Number.isFinite(event.duration) ||
        event.duration <= 0 ||
        event.duration === lastDuration
      )
        return;
      lastDuration = event.duration;
      setTracks((previous) => {
        const track = previous.find((item) => item.id === currentId);
        if (!track || track.duration === event.duration) return previous;
        return previous.map((item) =>
          item.id === currentId
            ? { ...item, duration: event.duration, durationUnit: "seconds" }
            : item,
        );
      });
    });
    return () => subscription.remove();
  }, [currentId, player, nativeQueue]);

  return {
    ...listeningTools,
    ...discoveryMapping,
    createGenre: (name: string, seed: Track, similar: boolean, autoInclude: boolean) => {
      if (state.personalGenres?.some((entry) => genreKey(entry.name) === genreKey(name))) throw new Error("Este gênero já existe. Use Adicionar abaixo.");
      const category = createPersonalGenre(name, seed, tracks, similar, autoInclude);
      setState((previous) => ({ ...previous, personalGenres: [...(previous.personalGenres ?? []), category] }));
      return category;
    },
    addToGenre: (genreId: string, trackId: string) => setState((previous) => ({ ...previous, personalGenres: (previous.personalGenres ?? []).map((entry) => entry.id === genreId ? { ...entry, trackIds: [...new Set([...entry.trackIds, trackId])] } : entry) })),
    deleteGenre: (genreId: string) => setState((previous) => ({ ...previous, personalGenres: (previous.personalGenres ?? []).filter((entry) => entry.id !== genreId) })),
    ...radioTools,
    startRadio: (...args: Parameters<typeof radioTools.startRadio>) => { ++onlineGeneration.current; setOnlineSession(false); setOnlineQueueBusy(false); return radioTools.startRadio(...args); },
    startGenreRadio: (genre: string) => { ++onlineGeneration.current; setOnlineSession(false); setOnlineQueueBusy(false); return radioTools.startGenreRadio(genre); },
    playbackError, resolvingStream, streaming, listenOnline, onlineSession, onlineQueueBusy, onlineQueueMessage, loadMoreOnline,
    playLibraryTrack: (track: Track, nextQueue?: string[]) => { ++onlineGeneration.current; setOnlineSession(false); setOnlineQueueBusy(false); radioTools.stopRadio(); return playTrack(track, nextQueue); },
    importPlaylist: (name: string, trackIds: string[]) => setState((previous) => ({ ...previous, playlists: [...previous.playlists, { id: `playlist:${Date.now()}`, name: name.slice(0, 80), trackIds }] })),
    ...playbackTools,
    moveQueueTrack: (id: string, target: number) => setQueue((previous) => moveQueue(previous, id, target)),
    removeQueueTrack: (id: string) => { if (priorityNext.current === id) { priorityNext.current = null; setPriorityId(null); } setQueue((previous) => previous.filter((item) => item !== id)); },
    playNext: (id: string) => { if (id === currentId) return; priorityNext.current = id; setPriorityId(id); setQueue((previous) => queueNext(previous, currentId, id)); },
    renamePlaylist: (id: string, name: string) => { if (name.trim()) setState((previous) => ({ ...previous, playlists: previous.playlists.map((list) => list.id === id ? { ...list, name: name.trim().slice(0, 80) } : list) })); },
    deletePlaylist: (id: string) => setState((previous) => ({ ...previous, playlists: previous.playlists.filter((list) => list.id !== id) })),
    removeFromPlaylist: (id: string, trackId: string) => setState((previous) => ({ ...previous, playlists: previous.playlists.map((list) => list.id === id ? { ...list, trackIds: list.trackIds.filter((item) => item !== trackId) } : list) })),
    restorePreferences: (saved: StoredState) => setState(saved),
    setLibrarySort: (librarySort: StoredState["librarySort"]) => setState((previous) => ({ ...previous, librarySort })),
    ...metadataSync,
    toggleAutoSync: () => setState((previous) => ({ ...previous, autoSync: !previous.autoSync })),
    state,
    colors,
    tracks,
    current,
    queue,
    status,
    playing: playIntent ?? status.playing,
    player,
    hydrated,
    libraryError,
    scanning,
    playTrack,
    goToQueueTrack,
    toggleFavorite,
    requestLibrary,
    addFiles,
    createPlaylist,
    addCurrentToPlaylist,
    togglePlay,
    toggleShuffle,
    cycleRepeat,
    toggleTheme,
  };
}
type MusicContextValue = ReturnType<typeof useMusicState>;
const MusicContext = createContext<MusicContextValue | null>(null);
type CommandName = "playLibraryTrack" | "requestLibrary" | "addFiles" | "setLibrarySort" | "removeFromPlaylist" | "toggleFavorite" | "playNext" | "togglePlay" | "goToQueueTrack" | "toggleShuffle" | "cycleRepeat";
type MusicCommands = Pick<MusicContextValue, CommandName>;
const ThemeContext = createContext(themes.dark);
const PlayerContext = createContext<MusicContextValue["player"] | null>(null);
const CommandsContext = createContext<MusicCommands | null>(null);
type LibraryValue = Pick<MusicContextValue, "tracks" | "hydrated" | "libraryError" | "scanning"> & {
  state: Pick<StoredState, "favorites" | "playlists" | "personalGenres" | "librarySort">;
};
const LibraryContext = createContext<LibraryValue | null>(null);
type PlaybackValue = Pick<MusicContextValue, "current" | "status" | "playing" | "playbackError" | "resolvingStream"> & { shuffle: boolean; repeat: StoredState["repeat"] };
const PlaybackContext = createContext<PlaybackValue | null>(null);
const RowContext = createContext<{ currentId: string | null; favorites: ReadonlySet<string> } | null>(null);
export function MusicProvider({ children }: { children: ReactNode }) {
  const music = useMusicState();
  const latest = useRef(music);
  useLayoutEffect(() => { latest.current = music; }, [music]);
  // Stable command identities with the latest committed playback/queue state.
  const commands = useMemo<MusicCommands>(() => ({
    playLibraryTrack: (...args) => latest.current.playLibraryTrack(...args),
    requestLibrary: () => latest.current.requestLibrary(),
    addFiles: () => latest.current.addFiles(),
    setLibrarySort: (...args) => latest.current.setLibrarySort(...args),
    removeFromPlaylist: (...args) => latest.current.removeFromPlaylist(...args),
    toggleFavorite: (...args) => latest.current.toggleFavorite(...args),
    playNext: (...args) => latest.current.playNext(...args),
    togglePlay: () => latest.current.togglePlay(),
    goToQueueTrack: (...args) => latest.current.goToQueueTrack(...args),
    toggleShuffle: () => latest.current.toggleShuffle(),
    cycleRepeat: () => latest.current.cycleRepeat(),
  }), []);
  const { favorites: favoriteIds, playlists, personalGenres, librarySort } = music.state;
  const libraryState = useMemo(() => ({ favorites: favoriteIds, playlists, personalGenres, librarySort }), [favoriteIds, playlists, personalGenres, librarySort]);
  const library = useMemo(() => ({ tracks: music.tracks, state: libraryState, hydrated: music.hydrated, libraryError: music.libraryError, scanning: music.scanning }),
    [music.tracks, libraryState, music.hydrated, music.libraryError, music.scanning]);
  const { current: currentTrack, status: playbackStatus, playing, playbackError, resolvingStream } = music;
  const playback = useMemo(() => ({ current: currentTrack, status: playbackStatus, playing, playbackError, resolvingStream, shuffle: music.state.shuffle, repeat: music.state.repeat }),
    [currentTrack, playbackStatus, playing, playbackError, resolvingStream, music.state.shuffle, music.state.repeat]);
  const favorites = useMemo(() => new Set(music.state.favorites), [music.state.favorites]);
  const currentId = music.current?.id ?? null;
  const rows = useMemo(() => ({ currentId, favorites }), [currentId, favorites]);
  return (
    <ThemeContext.Provider value={music.colors}>
      <PlayerContext.Provider value={music.player}>
        <CommandsContext.Provider value={commands}>
          <LibraryContext.Provider value={library}>
            <RowContext.Provider value={rows}>
              <PlaybackContext.Provider value={playback}>
                <MusicContext.Provider value={music}>{children}</MusicContext.Provider>
              </PlaybackContext.Provider>
            </RowContext.Provider>
          </LibraryContext.Provider>
        </CommandsContext.Provider>
      </PlayerContext.Provider>
    </ThemeContext.Provider>
  );
}
export const useMusicTheme = () => useContext(ThemeContext);
export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("MusicProvider ausente");
  return value;
}
export function useMusicCommands() {
  const value = useContext(CommandsContext);
  if (!value) throw new Error("MusicProvider ausente");
  return value;
}
export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("MusicProvider ausente");
  return value;
}
export function useTrackRows() {
  const value = useContext(RowContext);
  if (!value) throw new Error("MusicProvider ausente");
  return value;
}
function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("MusicProvider ausente");
  return value;
}
export function useMusic() {
  const value = useContext(MusicContext);
  if (!value) throw new Error("MusicProvider ausente");
  return value;
}
export function usePlaybackStatus(enabled = true) {
  const player = usePlayer();
  const active = useAppActive();
  const [status, setStatus] = useState(() => player.currentStatus);
  useFocusEffect(useCallback(() => {
    void Promise.resolve().then(() => setStatus(player.currentStatus));
    if (!enabled || !active) return;
    const subscription = player.addListener("playbackStatusUpdate", setStatus);
    return () => subscription.remove();
  }, [player, enabled, active]));
  return status;
}

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === "active" || Platform.OS === "web");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}

// Persistent chrome lives outside individual screen navigation contexts.
export function useGlobalPlaybackStatus() {
  const player = usePlayer();
  const active = useAppActive();
  const [status, setStatus] = useState(() => player.currentStatus);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) setStatus(player.currentStatus); });
    if (!active) return () => { alive = false; };
    const subscription = player.addListener("playbackStatusUpdate", setStatus);
    return () => { alive = false; subscription.remove(); };
  }, [player, active]);
  return status;
}
