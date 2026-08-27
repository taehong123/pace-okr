import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
const precacheUrls = [
  "/",
  ...new Set([...staticHtml.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((match) => match[1])),
];
const cacheVersion = precacheUrls
  .find((path) => path.startsWith("/_next/static/chunks/index-"))
  ?.match(/index-([A-Za-z0-9_-]+)\.js$/)?.[1] ?? "v4";
const serviceWorkerTemplate = await readFile(join(process.cwd(), "public", "sw.js"), "utf8");
const serviceWorker = serviceWorkerTemplate
  .replace(/const CACHE_NAME = "[^"]+"; \/\/ build:cache/, `const CACHE_NAME = "okrptr-assets-${cacheVersion}"; // build:cache`)
  .replace(
    /const PRECACHE_URLS = \[[^;]*\]; \/\/ build:precache/,
    `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)}; // build:precache`,
  );
await writeFile(join(clientRoot, "sw.js"), serviceWorker);

console.log("Published prerendered HTML to the static asset root.");
