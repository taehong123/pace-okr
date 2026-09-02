import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import postcss from "postcss";

const source = await readFile(new URL("../lib/themes.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { THEMES, DEFAULT_THEME, isThemeMode, themeColorScheme, themeCss, themeBootstrapScript } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const css = (await Promise.all(["../app/globals.css", "../app/project-review/review.css"].map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
const luminance = (hex) => {
  const c = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test("six complete themes share identity, first paint, editor scheme and preview palettes", () => {
  assert.deepEqual(THEMES.map((theme) => theme.mode), ["white", "beige", "gray", "dark", "neon", "cyberpunk"]);
  assert.equal(DEFAULT_THEME, "white");
  assert.equal(isThemeMode("toString"), false);
  const expected = Object.keys(THEMES[0].tokens).sort();
  for (const theme of THEMES) {
    assert.deepEqual(Object.keys(theme.tokens).sort(), expected);
    assert.equal(themeColorScheme(theme.mode), ["dark", "neon", "cyberpunk"].includes(theme.mode) ? "dark" : "light");
    assert.ok(themeCss.includes(`[data-theme-preview="${theme.mode}"]`));
    assert.ok(themeCss.includes(`html[data-theme="${theme.mode}"]`));
  }
});

for (const theme of THEMES) {
  test(`${theme.mode}: semantic text, actions, states, badges and focus meet contrast targets`, () => {
    const t = theme.tokens;
    function pair(fg, bg, minimum = 4.5) {
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= minimum, `${theme.mode}: ${fg}/${bg} is ${ratio}, expected ${minimum}`);
    }
    for (const bg of ["bg-page", "bg-surface", "bg-raised", "bg-subtle", "bg-hover", "bg-sidebar"]) {
      for (const fg of ["text-primary", "text-secondary", "text-tertiary", "text-link", "input-placeholder", "icon-default"]) pair(fg, bg);
      pair("focus-ring", bg, 3);
      pair("border-control", bg, 3);
      for (const role of ["success", "warning", "danger", "info", "purple", "orange"]) pair(`${role}-fg`, bg, 3);
    }
    for (const state of ["", "hover-", "active-"]) pair(`button-primary-${state}fg`, `button-primary-${state}bg`);
    for (const state of ["", "hover-", "active-"]) pair("button-danger-fg", `button-danger-${state}bg`);
    for (const state of ["", "hover-", "active-"]) pair(`button-secondary-${state}fg`, `button-secondary-${state}bg`);
    for (const state of ["hover-", "active-"]) pair(`button-ghost-${state}fg`, `button-ghost-${state}bg`);
    pair("button-disabled-fg", "button-disabled-bg", 3);
    for (const role of ["success", "warning", "danger", "info", "purple", "orange", "neutral-badge", "selected", "toast"]) pair(`${role}-fg`, `${role}-bg`);
    pair("kr-badge-text", "kr-badge-bg");
    pair("initiative-badge-text", "initiative-badge-bg");
    pair("kr-rail", "bg-raised", 3);
    pair("initiative-rail", "bg-raised", 3);
  });
}

test("all stylesheet palette references resolve and no action uses a text token as its fill", () => {
  const declared = new Set([...`${themeCss}\n${css}`.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]));
  for (const match of css.matchAll(/var\(--([\w-]+)/g)) {
    assert.ok(declared.has(match[1]) || ["font-geist-sans", "custom-columns", "depth"].includes(match[1]), `missing --${match[1]}`);
  }
  const root = postcss.parse(css);
  root.walkDecls((decl) => {
    if (/^background(-color)?$/.test(decl.prop)) assert.doesNotMatch(decl.value, /^var\(--(?:ink|accent-strong)\)$/);
    if (decl.prop === "color") assert.doesNotMatch(decl.value, /^(white|#fff(?:fff)?|var\(--(?:raised|paper)\))$/i);
    if (/^color$|^background(-color)?$/.test(decl.prop)) assert.doesNotMatch(decl.value, /^(#[a-f\d]{3,8}|rgba?\()/i, "component colors belong in the theme registry");
    if (decl.prop === "opacity" && /disabled|inactive|archived|scheduled/.test(decl.parent.selector ?? "")) assert.ok(Number.parseFloat(decl.value) === 1, "disabled ancestors must not fade their otherwise-readable controls");
  });
  assert.doesNotMatch(css, /html\[data-theme="dark"\]\s+:where/);
  assert.doesNotMatch(css, /text-shadow/);
});

test("first paint preserves every saved theme and tolerates missing, invalid or blocked storage", () => {
  for (const saved of [...THEMES.map((theme) => theme.mode), null, "obsolete", "toString", "__proto__"]) {
    const root = { dataset: {}, style: {} };
    vm.runInNewContext(themeBootstrapScript, {
      document: { documentElement: root },
      window: { localStorage: { getItem: () => saved, setItem: () => assert.fail("first paint must not rewrite preferences") } },
    });
    assert.equal(root.dataset.theme, isThemeMode(saved) ? saved : DEFAULT_THEME);
    assert.equal(root.style.colorScheme, themeColorScheme(saved));
  }
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(themeBootstrapScript, { document: { documentElement: root }, window: { get localStorage() { throw new Error("blocked"); } } });
  assert.equal(root.dataset.theme, DEFAULT_THEME);
});
