import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("lib/app-install.ts", root), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { appInstallBootstrapScript } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function installation(standalone = false) {
  const window = new EventTarget();
  const display = Object.assign(new EventTarget(), { matches: standalone });
  window.matchMedia = () => display;
  vm.runInNewContext(appInstallBootstrapScript, { window, Event });
  return { window, display, state: window.__OKRI_INSTALL__ };
}
function offer(window, prompt) {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = prompt;
  window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
}

test("install prompt is one-use, user-triggered, and accepted is not installed", async () => {
  const { window, state } = installation();
  let calls = 0;
  let finish;
  assert.equal(state.status, "unavailable");
  offer(window, () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); });
  assert.equal(calls, 0);
  assert.equal(state.status, "ready");
  const pending = state.prompt();
  await state.prompt();
  assert.equal(calls, 1);
  assert.equal(state.status, "prompting");
  finish({ outcome: "accepted" });
  await pending;
  assert.equal(state.status, "accepted");
  await state.prompt();
  assert.equal(calls, 1);
  window.dispatchEvent(new Event("appinstalled"));
  assert.equal(state.status, "installed");
});

test("cancellation and failure require a fresh browser offer, never fabricate installation", async () => {
  const { window, state } = installation();
  offer(window, async () => ({ outcome: "dismissed" }));
  await state.prompt();
  assert.equal(state.status, "unavailable");
  offer(window, async () => { throw new Error("blocked"); });
  await state.prompt();
  assert.equal(state.status, "error");
  offer(window, async () => ({ outcome: "accepted" }));
  await state.prompt();
  assert.equal(state.status, "accepted");
});

test("standalone windows do not offer installation; installed event wins a pending prompt", async () => {
  const app = installation(true);
  offer(app.window, async () => { assert.fail("must not prompt"); });
  await app.state.prompt();
  assert.equal(app.state.status, "installed");
  const { window, state } = installation();
  offer(window, async () => { window.dispatchEvent(new Event("appinstalled")); return { outcome: "accepted" }; });
  await state.prompt();
  assert.equal(state.status, "installed");
});

test("app entry points open download guidance before the browser install prompt", async () => {
  const entry = await readFile(new URL("app/app-install-button.tsx", root), "utf8");
  const download = await readFile(new URL("app/download/download-client.tsx", root), "utf8");
  assert.match(entry, /href="\/download"/);
  assert.doesNotMatch(entry, /__OKRI_INSTALL__\?\.prompt/);
  assert.match(download, /__OKRI_INSTALL__\?\.prompt/);
  assert.match(download, /파일은 자동으로 다운로드되지 않습니다/);
});

test("manifest uses stable same-origin launch paths, real PNG icons, and no account identifiers", async () => {
  const text = await readFile(new URL("public/manifest.webmanifest", root), "utf8");
  const manifest = JSON.parse(text);
  assert.equal(manifest.id, "/");
  assert.equal(manifest.name, "OKRI");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.doesNotMatch(text, /allvibe|token|workspaceId|userId|https?:/i);
  for (const shortcut of manifest.shortcuts) assert.ok(shortcut.url.startsWith("/?view="));
  for (const icon of manifest.icons) {
    const data = await readFile(new URL(`public${icon.src}`, root));
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
});

const workerSource = await readFile(new URL("public/sw.js", root), "utf8");
function worker({ offline = false, storageFails = false } = {}) {
  const handlers = new Map();
  const stores = new Map();
  const requests = [];
  const key = (request) => new URL(typeof request === "string" ? request : request.url, "https://okri.test").href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (storageFails) throw new Error("Storage blocked");
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        put: async (request, response) => { store.set(key(request), response.clone()); },
        match: async (request) => store.get(key(request))?.clone(),
      };
    },
  };
  let claimed = 0;
  const self = {
    location: { origin: "https://okri.test" },
    addEventListener: (name, handler) => handlers.set(name, handler),
    clients: { claim: async () => { claimed += 1; } },
    skipWaiting: () => assert.fail("do not interrupt existing drafts"),
  };
  vm.runInNewContext(workerSource, {
    self, caches, URL, Response,
    fetch: async (request, options) => {
      requests.push({ url: key(request), options });
      if (offline) throw new Error("Offline");
      return new Response(key(request).endsWith("offline.html") ? "OFFLINE" : "NETWORK");
    },
  });
  return {
    stores, requests, caches,
    get claimed() { return claimed; },
    setOffline(value) { offline = value; },
    async event(name) { let work; handlers.get(name)({ waitUntil: (promise) => { work = promise; } }); await work; },
    fetch(path, { mode = "cors", method = "GET" } = {}) {
      let response;
      handlers.get("fetch")({ request: { url: key(path), method, mode }, respondWith: (promise) => { response = promise; }, waitUntil() {} });
      return response;
    },
  };
}

test("installation precaches only public assets and activation removes only OKRI caches", async () => {
  const sw = worker();
  await sw.caches.open("other-service-data");
  await sw.caches.open("okri-assets-v4");
  await sw.event("install");
  assert.ok(sw.requests.every((request) => request.options.credentials === "omit"));
  assert.equal(sw.requests.some((request) => new URL(request.url).pathname === "/"), false);
  await sw.event("activate");
  assert.equal(sw.stores.has("other-service-data"), true);
  assert.equal(sw.stores.has("okri-assets-v4"), false);
  assert.equal(sw.claimed, 1);
});

test("root navigation is always fresh, offline never reveals a cached account or workspace", async () => {
  const sw = worker();
  await sw.event("install");
  assert.equal(await (await sw.fetch("/?view=my_work", { mode: "navigate" })).text(), "NETWORK");
  for (const cache of sw.stores.values()) assert.ok([...cache.keys()].every((url) => new URL(url).pathname !== "/"));
  sw.setOffline(true);
  assert.equal(await (await sw.fetch("/?auth=failed", { mode: "navigate" })).text(), "OFFLINE");
});

test("APIs, auth callbacks, invitations, external URLs and all writes bypass the service worker", () => {
  const sw = worker();
  for (const path of ["/api/bootstrap", "/api/items", "/api/auth/google/callback?code=test", "/oauth/authorize", "/entry/team", "https://accounts.google.com/"]) {
    assert.equal(sw.fetch(path, { mode: "navigate" }), undefined, path);
  }
  assert.equal(sw.fetch("/", { method: "POST", mode: "navigate" }), undefined);
  assert.equal(sw.requests.length, 0);
});

test("blocked storage preserves network responses and provides an honest offline fallback", async () => {
  const sw = worker({ storageFails: true });
  assert.equal(await (await sw.fetch("/", { mode: "navigate" })).text(), "NETWORK");
  assert.equal(await (await sw.fetch("/_next/static/test.js")).text(), "NETWORK");
  sw.setOffline(true);
  const response = await sw.fetch("/", { mode: "navigate" });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /연결할 수 없습니다/);
});

test("built offline page keeps shared themes and fonts, without bootstrap, user data or auto reload", async () => {
  const shell = await readFile(new URL("dist/client/index.html", root), "utf8");
  const manifestLink = shell.indexOf('rel="manifest"');
  assert.ok(manifestLink >= 0 && manifestLink < shell.indexOf("</head>"));
  const html = await readFile(new URL("dist/client/offline.html", root), "utf8");
  assert.doesNotMatch(html, /build:theme|build:fonts|build:preference|__OKRI_BOOTSTRAP_REQUEST__|fetch\(/);
  for (const theme of ["white", "beige", "gray", "dark", "neon", "cyberpunk"]) assert.ok(html.includes(`html[data-theme="${theme}"]`));
  const fonts = [...html.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((match) => match[1]);
  assert.ok(fonts.length > 0 && fonts.length < 92);
  const builtWorker = await readFile(new URL("dist/client/sw.js", root), "utf8");
  for (const font of fonts) assert.ok(builtWorker.includes(font));
  assert.doesNotMatch(builtWorker, /skipWaiting\(/);
  assert.doesNotMatch(builtWorker, /PRECACHE_URLS = \["\/"/);
  assert.match(builtWorker, /CACHE_NAME = "okri-assets-[a-f0-9]{16}"/);
});
