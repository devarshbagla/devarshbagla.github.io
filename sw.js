/**
 * Service worker for devarshbagla.github.io
 *
 * Cache-first for same-origin assets (css, js, images, fonts, manifest).
 * Network-first for HTML navigations, with the cached page and then
 * offline.html as fallbacks. Versioned cache name; activate deletes the rest.
 *
 * Local development: main.js never registers this worker on localhost or a
 * file origin, so a stale production cache cannot shadow python3 -m http.server.
 */

const VERSION = "2026-09-14-1";
const CACHE_NAME = `bagla-${VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./offline.html",
  "./404.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/sections.css",
  "./css/instrument.css",
  "./css/system.css",
  "./js/main.js",
  "./js/util.js",
  "./js/theme.js",
  "./assets/favicon.svg",
  "./assets/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return (
    path.startsWith("/css/") ||
    path.startsWith("/js/") ||
    path.startsWith("/assets/") ||
    path.endsWith(".svg") ||
    path.endsWith(".json") ||
    path.endsWith(".woff2")
  );
}

function isNavigation(request) {
  return request.mode === "navigate" || (request.destination === "document" && request.method === "GET");
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const home = await cache.match("./index.html") || await cache.match("./");
    if (home && new URL(request.url).pathname.endsWith("/")) return home;
    return (await cache.match("./offline.html")) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept the worker itself or anything off-origin except we let it through.
  if (url.pathname.endsWith("/sw.js")) return;

  if (isNavigation(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
