import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import ts from "typescript";

// Run when the approved artwork changes; commit all generated assets together.
const root = new URL("../public/", import.meta.url);
const source = await readFile(new URL("../lib/brand-artwork.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { brandSvg, BRAND_ASSET_ROOT, BRAND_INK, BRAND_PAPER, BRAND_SYMBOL_PATH } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const directory = new URL(`.${BRAND_ASSET_ROOT}/`, root);
await mkdir(directory, { recursive: true });
await mkdir(new URL("icons/", root), { recursive: true });
const svg = Buffer.from(brandSvg());
await writeFile(new URL("favicon.svg", root), svg);
await writeFile(new URL("okri-icon.svg", directory), svg);
await writeFile(new URL("okri-icon-reverse.svg", directory), brandSvg({ reverse: true }));
await writeFile(new URL("okri-logo.svg", directory), brandSvg({ lockup: true }));
await writeFile(new URL("okri-logo-reverse.svg", directory), brandSvg({ lockup: true, reverse: true }));
await writeFile(new URL("okri-symbol.svg", directory), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="OKRI"><path d="${BRAND_SYMBOL_PATH}" fill="${BRAND_INK}"/></svg>`);
for (const size of [192, 512]) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await writeFile(new URL(`okri-${size}.png`, directory), png);
  await writeFile(new URL(`icons/okri-${size}.png`, root), png);
}
await sharp(Buffer.from(brandSvg({ maskable: true }))).resize(512, 512).png().toFile(fileURLToPath(new URL("okri-maskable-512.png", directory)));
await sharp(svg).flatten({ background: BRAND_INK }).resize(180, 180).png().toFile(fileURLToPath(new URL("apple-touch-icon.png", directory)));
const lockup = await sharp(Buffer.from(brandSvg({ lockup: true }))).resize(896, 256).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: BRAND_PAPER } })
  .composite([{ input: lockup, left: 152, top: 187 }]).png().toFile(fileURLToPath(new URL("okri-social.png", directory)));
console.log(`Generated OKRI vector, app, Apple and share assets in public${BRAND_ASSET_ROOT}.`);
