import { useCallback, useEffect, useRef, useState } from "react";
import { preferences } from "./preferences";
import { AppState } from "react-native";
import { downloads, nativeDownloads } from "../../modules/music-downloads/src";
import { DEFAULT_RADIO, normalizeName, radioCandidates, extendRadioQueue, type ListeningData, type RadioPreferences } from "./discovery-model";
import { onlineTrack, isOffline } from "./downloads/model";
import type { StoredState, Track } from "./types";
import { contextMatches, contextQuery, confirmedGenres, personalGenreMatches, type DiscoveryContext } from "./discovery-metadata";
import { popularRadio } from "./popular-radio";
import { interleaveLocal, radioSearchPlan } from "./radio-network-model";
import type { MusicPlayer } from "./useMusicPlayer";

export function useListening(player: MusicPlayer, current: Track | null, nativeQueue = false) {
  const [listening, setListening] = useState<ListeningData>({ version: 1, days: [], events: [] });
  const [historyEnabled, setEnabled] = useState(true);
  const [historyReady, setReady] = useState(false);
  const [historyError, setError] = useState<string | null>(null);
  const refreshListening = useCallback(async () => { try { setListening(await downloads.listening()); } catch { setError("Não foi possível ler o histórico local."); } }, []);
  useEffect(() => { let alive = true; void (nativeDownloads?.getListeningEnabled() ?? Promise.resolve(true)).then((enabled) => { if (alive) { setEnabled(enabled); setReady(true); } }).catch(() => setError("Não foi possível carregar a preferência do histórico.")); return () => { alive = false; }; }, []);
  const metadata = current ? JSON.stringify({ id: current.id, title: current.title, artist: current.artist, duration: current.duration, source: current.online?.provider ?? current.origin?.provider ?? "local" }) : null;
  useEffect(() => { if (nativeQueue || !historyReady || !metadata || !historyEnabled || !nativeDownloads?.playbackQueueVersion) return; void nativeDownloads.observeListening(player.native, metadata, false).catch(() => setError("Atualize o APK para registrar escutas em segundo plano.")); }, [player, metadata, historyEnabled, historyReady, nativeQueue]);
  useEffect(() => {
    if (!nativeDownloads) return;
    const errors = nativeDownloads.addListener("onListeningError", ({ message }) => setError(message));
    const state = AppState.addEventListener("change", (next) => { if (next === "active") void refreshListening(); else void nativeDownloads!.flushListening().catch(() => undefined); });
    return () => { errors.remove(); state.remove(); };
  }, [refreshListening]);
  useEffect(() => { void Promise.resolve().then(refreshListening); }, [refreshListening, current?.id]);
  const toggleHistory = async () => { if (!nativeDownloads) return; const enabled = !historyEnabled; try { await nativeDownloads.listeningEnabled(enabled); setEnabled(enabled); await refreshListening(); } catch { setError("Não foi possível alterar a coleta."); } };
  const clearHistory = async () => { if (!nativeDownloads) return; try { await nativeDownloads.listeningEnabled(false); await nativeDownloads.clearListening(); if (historyEnabled) { await nativeDownloads.listeningEnabled(true); if (!nativeQueue && metadata && nativeDownloads.playbackQueueVersion) await nativeDownloads.observeListening(player.native, metadata, false); } await refreshListening(); } catch { setError("Não foi possível apagar o histórico."); } };
  return { listening, historyEnabled, historyReady, historyError, refreshListening, toggleHistory, clearHistory };
}

type RadioInput = { tracks: Track[]; state: StoredState; listening: ListeningData; queue: string[]; current: Track | null; setTracks: React.Dispatch<React.SetStateAction<Track[]>>; setQueue: React.Dispatch<React.SetStateAction<string[]>>; playTrack: (track: Track, queue?: string[], allowOnline?: boolean, queueTracks?: Track[]) => Promise<boolean> };
export function useRadio(input: RadioInput) {
  const [radioPreferences, setPreferences] = useState<RadioPreferences>(DEFAULT_RADIO);
  const [radioReady, setReady] = useState(false);
  const [radioActive, setActive] = useState(false);
  const [radioBusy, setBusy] = useState(false);
  const [radioMessage, setMessage] = useState("");
  const [radioReasons, setReasons] = useState<Record<string, string>>({});
  const latest = useRef(input);
  useEffect(() => { latest.current = input; }, [input]);
  const generation = useRef(0); const recent = useRef<string[]>([]); const seed = useRef<Track | null>(null); const pending = useRef(false);
  const station = useRef<DiscoveryContext>({});
  const stationSuggestions = useRef(new Set<string>());
  const lastSearch = useRef(0);
  const searchRound = useRef(0);
  const lastRefill = useRef("");
  useEffect(() => {
    if (!nativeDownloads?.popular) return;
    const subscription = nativeDownloads.addListener("onPlaybackCacheFallback", ({ message }) => setMessage(message));
    return () => subscription.remove();
  }, []);
  useEffect(() => { let alive = true; void preferences.getItem("custodio.radio.v1").then((raw) => { if (!alive) return; if (raw) { const p = JSON.parse(raw); setPreferences({ prefetch: p.prefetch !== false, discovery: [0, 0.3, 0.7, 1].includes(p.discovery) ? p.discovery : DEFAULT_RADIO.discovery, offline: p.offline === true, blockedTracks: Array.isArray(p.blockedTracks) ? p.blockedTracks.filter((s: unknown) => typeof s === "string").slice(0, 10000) : [], blockedArtists: Array.isArray(p.blockedArtists) ? p.blockedArtists.filter((s: unknown) => typeof s === "string").slice(0, 10000) : [] }); } setReady(true); }).catch(() => { if (alive) setReady(true); }); return () => { alive = false; }; }, []);
  useEffect(() => { if (radioReady) void preferences.setItem("custodio.radio.v1", JSON.stringify(radioPreferences)).catch(() => setMessage("Não foi possível salvar as preferências da rádio.")); }, [radioPreferences, radioReady]);
  useEffect(() => { if (input.current?.id && recent.current.at(-1) !== input.current.id) { recent.current.push(input.current.id); recent.current = recent.current.slice(-30); } }, [input]);
  const batch = useCallback(async (token: number, starting = false) => {
    const data = latest.current; let pool = data.tracks; const newcomers = new Set<string>(); let sourceReason = "Descoberta a partir dos seus artistas";
    if (!radioPreferences.offline && (radioPreferences.discovery > 0 || !!station.current.category || !!station.current.genre || !!station.current.artist || !!station.current.year) && downloads.available && Date.now() - lastSearch.current > 60000) {
      lastSearch.current = Date.now();
      const allowedDays = data.listening.days.filter((day) => !radioPreferences.blockedArtists.includes(normalizeName(day.artist)) && !radioPreferences.blockedTracks.includes(day.trackId));
      const plan = radioSearchPlan(allowedDays, data.tracks.filter((track) => !radioPreferences.blockedArtists.includes(normalizeName(track.artist))), data.state.favorites, station.current);
      sourceReason = plan.kind === "popular" ? "Seleção de músicas em alta" : "Descoberta a partir das suas escutas";
      const query = station.current.category ? contextQuery(station.current, searchRound.current++) : plan.kind === "search" ? plan.query : "";
      {
        try { const results = plan.kind === "popular" ? await popularRadio() : await downloads.search(query, "all"); if (generation.current !== token) return [];
          const known = new Set(pool.map((t) => t.id)); const added = results.items.map((item) => onlineTrack(item, pool)).filter((t, index, all) => !known.has(t.id) && all.findIndex((a) => a.id === t.id) === index).slice(0, 12);
          added.forEach((t) => newcomers.add(t.id));
          results.items.forEach((item) => stationSuggestions.current.add(onlineTrack(item, pool).id));
          pool = [...pool, ...added];

          if (!results.items.length && Object.keys(results.errors).length) pool = pool.filter(isOffline);
          if (Object.keys(results.errors).length) setMessage("Uma fonte não respondeu. A rádio usa as músicas disponíveis.");
        } catch { setMessage("Sem resposta online. Continuando com a biblioteca disponível."); pool = pool.filter(isOffline); }
      }
    }
    if (generation.current !== token) return [];
    const ahead = starting ? [] : data.queue.slice(Math.max(0, data.queue.indexOf(data.current?.id ?? "") + 1));
    const excluded = [...recent.current, ...ahead];
    const scoped = Object.keys(station.current).length ? pool.filter((track) => contextMatches(track, station.current) || stationSuggestions.current.has(track.id)) : pool;
    const candidates = radioCandidates(scoped, data.listening.days, data.state.favorites, radioPreferences, excluded, data.current?.artist ?? "").filter((entry) => !ahead.includes(entry.track.id));
    const heard = new Set(data.listening.days.map((day) => day.trackId));
    const known = candidates.filter((e) => !newcomers.has(e.track.id) && (isOffline(e.track) || heard.has(e.track.id)));
    const knownIds = new Set(known.map((entry) => entry.track.id));
    const fresh = candidates.filter((e) => !knownIds.has(e.track.id)); const chosen: typeof candidates = [];
    while (chosen.length < 8 && (known.length || fresh.length)) { const preferFresh = Math.random() < radioPreferences.discovery; const source = preferFresh ? fresh.length ? fresh : known : known.length ? known : fresh; const previousArtist = chosen.at(-1)?.track.artist ?? data.current?.artist; const different = source.findIndex((e) => normalizeName(e.track.artist) !== normalizeName(previousArtist ?? "")); chosen.push(source.splice(Math.max(0, different), 1)[0]); }
    const mixed = interleaveLocal([...chosen, ...candidates.filter((entry) => !chosen.some((item) => item.track.id === entry.track.id))]);
    setReasons((previous) => ({ ...previous, ...Object.fromEntries(mixed.map((e) => [e.track.id, newcomers.has(e.track.id) ? sourceReason : e.reason])) }));
    data.setTracks((previous) => { const additions = mixed.map((e) => e.track).filter((t) => !previous.some((p) => p.id === t.id)); return additions.length ? [...previous, ...additions] : previous; });
    return mixed.map((e) => e.track);
  }, [radioPreferences]);
  const startRadio = async (track?: Track, context?: DiscoveryContext) => {
    if (pending.current || !radioReady) return; pending.current = true; setBusy(true); setMessage(""); const token = ++generation.current; seed.current = track ?? null; stationSuggestions.current.clear();
    const personal = track ? latest.current.state.personalGenres?.find((category) => personalGenreMatches(track, category)) : undefined;
    const genre = track ? confirmedGenres(track)[0] : undefined;
    station.current = context ?? (personal ? { category: personal } : genre ? { genre } : track ? { artist: track.artist } : {}); lastSearch.current = 0; searchRound.current = 0;
    try {
      const data = latest.current;
      const local = radioCandidates(data.tracks.filter((candidate) => isOffline(candidate) && contextMatches(candidate, station.current)), data.listening.days, data.state.favorites, radioPreferences, recent.current, data.current?.artist ?? "")[0]?.track;
      const immediate = track && (!radioPreferences.offline || isOffline(track)) ? track : local;
      let started: Track | null = null;
      if (immediate) {
        const success = await data.playTrack(immediate, [immediate.id], !radioPreferences.offline);
        if (generation.current !== token) return;
        if (success) { started = immediate; setActive(true); }
      }
      const result = await batch(token, true);
      if (generation.current !== token) return;
      if (started) {
        const activeId = started.id;
        latest.current.setQueue((previous) => extendRadioQueue(previous, activeId, result.filter((item) => item.id !== activeId).map((item) => item.id)));
        return;
      }
      const first = result[0];
      if (!first) { setMessage("Não há músicas disponíveis agora. Confira a rede ou adicione faixas à biblioteca."); return; }
      const success = await latest.current.playTrack(first, result.map((item) => item.id), !radioPreferences.offline, [...latest.current.tracks, ...result]);
      if (generation.current === token) { setActive(success); if (!success) setMessage("Não foi possível iniciar esta faixa. Tente a rádio somente offline."); }
    } catch { if (generation.current === token) setMessage("Não foi possível renovar as sugestões. As músicas disponíveis continuam na fila."); }
    finally { pending.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!radioActive || pending.current) return;
    const index = input.queue.indexOf(input.current?.id ?? "");
    if (input.queue.length - index - 1 > 3) return;
    const key = `${generation.current}:${input.current?.id}:${input.queue.join("|")}`;
    if (lastRefill.current === key) return;
    lastRefill.current = key;
    pending.current = true; const token = generation.current;
    void batch(token).then((tracks) => {
      if (token !== generation.current) return;
      const added = tracks.filter((track) => track.id !== latest.current.current?.id);
      if (!added.length) { setMessage("A rádio seguirá com as músicas disponíveis. Adicione mais faixas para aumentar a variedade."); return; }
      input.setQueue((previous) => extendRadioQueue(previous, latest.current.current?.id ?? null, added.map((track) => track.id)));
    }).catch(() => setMessage("Não foi possível renovar a rádio. Suas músicas continuam disponíveis.")).finally(() => { pending.current = false; });
  }, [radioActive, input.queue, input.current?.id, batch, input]);

  return { radioPreferences, radioReady, radioActive, radioBusy, radioMessage, radioReasons, startRadio,
    startGenreRadio: (genre: string) => startRadio(undefined, { genre }),
    stopRadio: () => { generation.current++; setActive(false); setMessage(""); },
    setRadioPreferences: (patch: Partial<RadioPreferences>) => { if (Object.keys(patch).some((key) => key !== "prefetch")) { generation.current++; setActive(false); } setPreferences((p) => ({ ...p, ...patch })); },
    blockRecommendation: (track: Track, artist = false) => { generation.current++; setPreferences((p) => ({ ...p, blockedTracks: artist ? p.blockedTracks : [...new Set([...p.blockedTracks, track.id])], blockedArtists: artist ? [...new Set([...p.blockedArtists, normalizeName(track.artist)])] : p.blockedArtists })); input.setQueue((q) => q.filter((id) => id === input.current?.id || (artist ? normalizeName(input.tracks.find((t) => t.id === id)?.artist ?? "") !== normalizeName(track.artist) : id !== track.id))); },
  };
}
