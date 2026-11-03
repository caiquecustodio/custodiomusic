import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import {
  downloads,
  nativeDownloads,
} from "../../../modules/music-downloads/src";
import type { DownloadJob, SourceStatus } from "./types";
import { latestRefresh } from "../latest-refresh";
import { completedTracks } from "./model";
import type { Track } from "../types";
function useDownloadsState() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sharedLink, setSharedLink] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Track[]>([]);
  const mounted = useRef(true);
  const readQueue = useCallback(async () => {
    if (!downloads.available) return;
    try {
      const queue = await downloads.list();
      if (!mounted.current) return;
      setJobs(queue);
      const next = completedTracks(queue);
      setCompleted((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setError(null);
    } catch {
      if (mounted.current) setError("Não foi possível ler a fila de downloads. Tente novamente.");
    }
  }, []);
  const refreshRunner = useRef<ReturnType<typeof latestRefresh> | null>(null);
  useEffect(() => {
    refreshRunner.current = latestRefresh(readQueue);
    return () => { refreshRunner.current = null; };
  }, [readQueue]);
  const refresh = useCallback(() => refreshRunner.current?.() ?? Promise.resolve(), []);
  useEffect(() => {
    mounted.current = true;
    const module = nativeDownloads;
    if (!module) return;
    let alive = true;
    const checkShared = () => {
      module
        .getSharedLink()
        .then((url) => {
          if (alive && url) setSharedLink(url);
        })
        .catch(() => undefined);
    };
    const checkSources = () => { void downloads.sources().then((status) => { if (alive) setSources(status); }).catch(() => undefined); };
    void refresh();
    checkSources();
    checkShared();
    const changed = module.addListener("onDownloadsChanged", () => {
      void refresh();
    });
    const shared = module.addListener("onSharedLink", ({ url }) => {
      if (alive) setSharedLink(url);
    });
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
        checkSources();
        checkShared();
      }
    });
    return () => {
      alive = false;
      mounted.current = false;
      changed.remove();
      shared.remove();
      active.remove();
    };
  }, [refresh]);
  const consumeSharedLink = useCallback(() => setSharedLink(null), []);
  const notifications = async () => {
    if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
      const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (
        !(await PermissionsAndroid.check(permission)) &&
        (await PermissionsAndroid.request(permission)) !==
          PermissionsAndroid.RESULTS.GRANTED
      )
        throw new Error(
          "Permita as notificações para acompanhar e cancelar seus downloads.",
        );
    }
  };
  return {
    jobs,
    completed,
    sources,
    error,
    refresh,
    sharedLink,
    consumeSharedLink,
    available: downloads.available,
    notifications,
  };
}
const DownloadsContext = createContext<ReturnType<
  typeof useDownloadsState
> | null>(null);
const CompletedDownloadsContext = createContext<Track[]>([]);
const SharedLinkContext = createContext<{ sharedLink: string | null; consumeSharedLink: () => void } | null>(null);
export function DownloadsProvider({ children }: { children: ReactNode }) {
  const downloadsState = useDownloadsState();
  const { sharedLink, consumeSharedLink } = downloadsState;
  const shared = useMemo(() => ({ sharedLink, consumeSharedLink }), [sharedLink, consumeSharedLink]);
  return (
    <DownloadsContext.Provider value={downloadsState}>
      <CompletedDownloadsContext.Provider value={downloadsState.completed}>
        <SharedLinkContext.Provider value={shared}>{children}</SharedLinkContext.Provider>
      </CompletedDownloadsContext.Provider>
    </DownloadsContext.Provider>
  );
}
export const useCompletedDownloads = () => useContext(CompletedDownloadsContext);
export function useSharedLink() {
  const value = useContext(SharedLinkContext);
  if (!value) throw new Error("DownloadsProvider ausente");
  return value;
}
export function useDownloads() {
  const value = useContext(DownloadsContext);
  if (!value) throw new Error("DownloadsProvider ausente");
  return value;
}
