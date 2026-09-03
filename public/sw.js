const CACHE_NAME = "okrptr-assets-pwa1"; // build:cache
const PRECACHE_URLS = ["/offline.html", "/favicon.svg"]; // build:precache

async function precache(path) {
  const response = await fetch(path, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error("Static asset unavailable");
  const cache = await caches.open(CACHE_NAME);
  await cache.put(path, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await precache("/offline.html");
    await Promise.allSettled(PRECACHE_URLS.filter((path) => path !== "/offline.html").map(precache));
    // Updates wait for existing app windows to close; never reload an open draft.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("okrptr-assets-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cached(request) {
  try { return await (await caches.open(CACHE_NAME)).match(request); }
  catch { return undefined; }
}

async function remember(request, response) {
  try { await (await caches.open(CACHE_NAME)).put(request, response); }
  catch { /* A storage limit must not break a successful network response. */ }
}

async function networkFirst(request) {
  try {
    return await fetch(request, { cache: "no-store" });
  } catch {
    const fallback = await cached("/offline.html");
    // Strip any static host's .html redirect so the original app URL stays intact.
    if (fallback) return new Response(fallback.body, { headers: fallback.headers });
    return new Response("OKRPTR 서버에 연결할 수 없습니다. 인터넷 연결 후 새로고침해 주세요.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

async function cacheFirst(request, event) {
  const hit = await cached(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) event.waitUntil(remember(request, response.clone()));
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(event.request, event));
  }
});
