import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const sourceRoot = join(process.cwd(), "dist", "server", "prerendered-routes");
const clientRoot = join(process.cwd(), "dist", "client");
const routes = [
  ["index.html", "index.html"],
  ["privacy.html", join("privacy", "index.html")],
  ["terms.html", join("terms", "index.html")],
  ["404.html", "404.html"],
];

for (const [source, destination] of routes) {
  const target = join(clientRoot, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(sourceRoot, source), target);
}

const staticHtml = await readFile(join(clientRoot, "index.html"), "utf8");
const offlineHtml = await readFile(join(clientRoot, "offline.html"), "utf8");
const precacheUrls = [
  "/offline.html", "/favicon.svg", "/icons/okri-192.png", "/icons/okri-512.png",
  ...new Set([...offlineHtml.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((match) => match[1])),
  ...new Set([...staticHtml.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((match) => match[1])),
];
const serviceWorkerTemplate = await readFile(join(process.cwd(), "public", "sw.js"), "utf8");
const fingerprint = createHash("sha256").update(serviceWorkerTemplate).update(staticHtml);
for (const path of precacheUrls) fingerprint.update(await readFile(join(clientRoot, path)));
const cacheVersion = fingerprint.digest("hex").slice(0, 16);
const serviceWorker = serviceWorkerTemplate
  .replace(/const CACHE_NAME = "[^"]+"; \/\/ build:cache/, `const CACHE_NAME = "okri-assets-${cacheVersion}"; // build:cache`)
  .replace(
    /const PRECACHE_URLS = \[[^;]*\]; \/\/ build:precache/,
    `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)}; // build:precache`,
  );
await writeFile(join(clientRoot, "sw.js"), serviceWorker);

console.log("Published prerendered HTML to the static asset root.");
