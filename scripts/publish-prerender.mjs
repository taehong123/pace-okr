import { copyFile, mkdir } from "node:fs/promises";
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

console.log("Published prerendered HTML to the static asset root.");
