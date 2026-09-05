import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
import postcss from "postcss";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("lib/themes.ts", root), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { THEMES, DEFAULT_THEME, themeCss, themeBootstrapScript } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const brandSource = await readFile(new URL("lib/brand-artwork.ts", root), "utf8");
const brandCompiled = ts.transpileModule(brandSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { BRAND_ASSET_ROOT } = await import(`data:text/javascript;base64,${Buffer.from(brandCompiled).toString("base64")}`);
const tokens = THEMES.find((theme) => theme.mode === DEFAULT_THEME).tokens;
const manifest = {
  id: "/",
  name: "OKRI",
  short_name: "OKRI",
  description: "OKR, Project, Task, Routine을 관리하는 워크스페이스",
  lang: "ko",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: tokens["bg-page"],
  theme_color: tokens["bg-sidebar"],
  icons: [
    ...[192, 512].map((size) => ({ src: `${BRAND_ASSET_ROOT}/okri-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
    { src: `${BRAND_ASSET_ROOT}/okri-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [
    { name: "내 업무", url: "/?view=my_work" },
    { name: "OKR", url: "/?view=okr" },
  ],
};
await writeFile(new URL("public/manifest.webmanifest", root), `${JSON.stringify(manifest, null, 2)}\n`);

const template = await readFile(new URL("app/pwa/offline.html", root), "utf8");
const globals = postcss.parse(await readFile(new URL("app/globals.css", root), "utf8"));
const sharedTokens = globals.nodes.find((node) => node.type === "rule" && node.selector === ":root").toString();
// Cache only the font subsets used by this fixed offline message, not all 92 subsets.
const codepoints = [...new Set([...template].map((char) => char.codePointAt(0)))];
const fontCss = postcss.parse(await readFile(new URL("app/fonts.css", root), "utf8"));
const offlineFonts = [];
fontCss.walkAtRules("font-face", (rule) => {
  const ranges = rule.nodes.find((node) => node.prop === "unicode-range")?.value;
  if (!ranges) return;
  const covered = ranges.split(",").some((range) => {
    const [from, to = from] = range.trim().slice(2).split("-").map((hex) => parseInt(hex, 16));
    return codepoints.some((point) => point >= from && point <= to);
  });
  if (covered) offlineFonts.push(rule.toString());
});
const offline = template
  .replaceAll("{{brandRoot}}", BRAND_ASSET_ROOT)
  .replace("/* build:theme */", themeCss)
  .replace("/* build:tokens */", sharedTokens)
  .replace("/* build:preference */", themeBootstrapScript)
  .replace("/* build:fonts */", offlineFonts.join("\n"));
await writeFile(new URL("public/offline.html", root), offline);
console.log(`Prepared install manifest and offline page (${offlineFonts.length} font subsets).`);
