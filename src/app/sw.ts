import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

// Service worker (§16): Serwist runtime bundled by scripts/build-sw.mjs
// (Next 16 builds with Turbopack, which @serwist/next's injection does not
// support yet — see CLAUDE.md decision log). The shell precache is explicit;
// hashed /_next/static assets are cached on first use by defaultCache.

declare const self: ServiceWorkerGlobalScope;
declare const __SW_REV__: string; // injected per build → update toast per deploy

const serwist = new Serwist({
  precacheEntries: [
    { url: "/offline", revision: __SW_REV__ },
    { url: "/manifest.webmanifest", revision: __SW_REV__ },
    { url: "/icons/icon-192.png", revision: __SW_REV__ },
    { url: "/icons/icon-512.png", revision: __SW_REV__ },
  ],
  skipWaiting: false, // "update ready" toast lets the user choose (§16)
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  const data = (event.data?.json() ?? {}) as {
    title?: string;
    body?: string;
    url?: string;
  };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "KitchenProof", {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});

// Background Sync (§16): the browser wakes us on connectivity — ping the app
// to drain its outbox (the queue lives in the page's IndexedDB context).
self.addEventListener("sync", (event) => {
  if ((event as SyncEvent).tag === "kp-outbox") {
    (event as SyncEvent).waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true })
        .then((clients) => clients.forEach((client) => client.postMessage("kp-flush"))),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});
