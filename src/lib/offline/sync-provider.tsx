"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CloudOff, RefreshCw } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "./db";
import { flush } from "./outbox";

type SyncContextValue = {
  online: boolean;
  queued: number;
  flushNow: () => void;
};

const SyncContext = createContext<SyncContextValue>({
  online: true,
  queued: 0,
  flushNow: () => {},
});

export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}

function subscribeToOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** §16: background drain on reconnect + foreground retry; nothing blocks the operator. */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const online = useSyncExternalStore(
    subscribeToOnline,
    () => navigator.onLine,
    () => true,
  );
  const queued = useLiveQuery(() => offlineDb.outbox.count(), [], 0);

  const flushNow = useCallback(() => {
    void flush().then((remaining) => {
      if (remaining === 0) router.refresh(); // pull authoritative state after drain
    });
  }, [router]);

  // drain on reconnect
  useEffect(() => {
    if (online) flushNow();
  }, [online, flushNow]);

  useEffect(() => {
    // service worker background-sync ping (SW posts 'kp-flush')
    const onMessage = (event: MessageEvent) => {
      if (event.data === "kp-flush") flushNow();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    const interval = setInterval(() => {
      if (navigator.onLine) {
        void offlineDb.outbox.count().then((count) => {
          if (count > 0) flushNow();
        });
      }
    }, 15_000);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      clearInterval(interval);
    };
  }, [flushNow]);

  return (
    <SyncContext.Provider value={{ online, queued: queued ?? 0, flushNow }}>
      {children}
    </SyncContext.Provider>
  );
}

/** Subtle status pill (§16 UI): offline state + queued count, never blocking. */
export function OfflinePill() {
  const t = useTranslations("offline");
  const { online, queued } = useSync();
  if (online && queued === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-sm"
      data-testid="offline-pill"
    >
      {online ? (
        <RefreshCw className="size-4 animate-spin text-primary" />
      ) : (
        <CloudOff className="size-4 text-muted-foreground" />
      )}
      {online
        ? t("syncing", { count: queued })
        : queued > 0
          ? t("offlineQueued", { count: queued })
          : t("offline")}
    </span>
  );
}
