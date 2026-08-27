const CACHE_NAME = "okrptr-shell-v1";
const SHELL_PATH = "/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(SHELL_PATH)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

async function staleWhileRevalidate(request, cacheKey = request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);
  const network = fetch(request).then((response) => {
    if (response.ok) void cache.put(cacheKey, response.clone());
    return response;
  }).catch(() => cached);
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate" && url.pathname === SHELL_PATH) {
    event.respondWith(staleWhileRevalidate(event.request, SHELL_PATH));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
