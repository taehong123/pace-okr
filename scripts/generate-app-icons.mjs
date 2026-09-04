import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Run only when the existing brand SVG changes. The PNG outputs are versioned.
const root = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("favicon.svg", root));
await mkdir(new URL("icons/", root), { recursive: true });
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(fileURLToPath(new URL(`icons/okri-${size}.png`, root)));
}
