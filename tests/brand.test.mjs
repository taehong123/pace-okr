import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("lib/brand-artwork.ts", root), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { brandSvg, BRAND_ASSET_ROOT, BRAND_SYMBOL_PATH, BRAND_WORDMARK_PATH } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const asset = (name) => new URL(`public${BRAND_ASSET_ROOT}/${name}`, root);

test("public vectors and compatibility favicon share the approved artwork", async () => {
  for (const [file, options] of [
    ["okri-icon.svg", {}], ["okri-icon-reverse.svg", { reverse: true }],
    ["okri-logo.svg", { lockup: true }], ["okri-logo-reverse.svg", { lockup: true, reverse: true }],
  ]) assert.equal(await readFile(asset(file), "utf8"), brandSvg(options));
  assert.equal(await readFile(new URL("public/favicon.svg", root), "utf8"), brandSvg());
  const route = await readFile(new URL("app/favicon.ico/route.ts", root), "utf8");
  assert.match(route, /new Response\(brandSvg\(\)/);
  assert.doesNotMatch(route, /24323a|9fd4bf/);
  assert.ok(BRAND_SYMBOL_PATH.length > 0 && BRAND_WORDMARK_PATH.length > 0);
});

test("app and share PNGs are nonblank monochrome with exact sizes", async () => {
  for (const [name, width, height] of [["okri-192.png", 192, 192], ["okri-512.png", 512, 512], ["apple-touch-icon.png", 180, 180], ["okri-social.png", 1200, 630]]) {
    const { data, info } = await sharp(await readFile(asset(name))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, width);
    assert.equal(info.height, height);
    let white = 0;
    let black = 0;
    for (let p = 0; p < data.length; p += 4) {
      assert.equal(data[p], data[p + 1], name);
      assert.equal(data[p], data[p + 2], name);
      if (data[p + 3] === 255) { if (data[p] > 245) white++; if (data[p] < 25) black++; }
    }
    assert.ok(white > width * height * .05 && black > width * height * .05, name);
  }
  for (const size of [192, 512]) assert.deepEqual(await readFile(asset(`okri-${size}.png`)), await readFile(new URL(`public/icons/okri-${size}.png`, root)));
});

test("maskable mark stays inside the circular safe zone with an opaque background", async () => {
  const { data, info } = await sharp(await readFile(asset("okri-maskable-512.png"))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const index = (y * 512 + x) * 4;
    assert.equal(data[index + 3], 255);
    if (data[index] > 127) assert.ok(Math.hypot(x + .5 - 256, y + .5 - 256) <= 512 * .4, `unsafe mark pixel ${x},${y}`);
  }
});

test("manifest keeps the installed app identity while using fresh branded URLs", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) assert.ok(icon.src.startsWith(`${BRAND_ASSET_ROOT}/`));
  const offline = await readFile(new URL("public/offline.html", root), "utf8");
  assert.ok(offline.includes(`${BRAND_ASSET_ROOT}/okri-logo.svg`));
  assert.ok(offline.includes(`${BRAND_ASSET_ROOT}/okri-logo-reverse.svg`));
  assert.doesNotMatch(offline, /\{\{brandRoot\}\}/);
  const publisher = await readFile(new URL("scripts/publish-prerender.mjs", root), "utf8");
  assert.match(publisher, /manifest\.icons\.map/);
  assert.match(publisher, /offlineHtml\.matchAll/);
});
