import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clientLanguage } from "./helpers/client-language-fixture.mjs";
import { language, serverLanguage } from "./helpers/language-fixture.mjs";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function compile(path, imports = {}) {
  const compiled = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const target = { exports: {} };
  new Function("require", "exports", "module", compiled)((id) => id.endsWith(".css") ? {} : id === "@/lib/client-language" ? clientLanguage : id === "./language" ? language : imports[id] ?? require(id), target.exports, target);
  return target.exports;
}
const translations = compile("lib/landing-copy.ts");
const themes = compile("lib/themes.ts");
const install = compile("lib/app-install.ts");
const installButton = compile("app/app-install-button.tsx", { "@/lib/app-install": install });
const { LandingScreen } = compile("app/landing.tsx", { "@/lib/landing-copy": translations, "@/lib/themes": themes, "./app-install-button": installButton });
const { getLandingCopy, landingLanguages, resolveLandingLanguage } = translations;
const landingCopy = Object.fromEntries(await Promise.all(landingLanguages.map(async ({ id }) => [id, getLandingCopy(await serverLanguage.serverTranslator(id))])));

test("language selection honors the saved five-language preference and browser fallback", () => {
  assert.equal(resolveLandingLanguage("ja", ["ko-KR"]), "ja");
  assert.equal(resolveLandingLanguage("invalid", ["de-DE", "es-MX"]), "es");
  assert.equal(resolveLandingLanguage(null, ["zh-Hant-TW"]), "zh");
  assert.equal(resolveLandingLanguage(null, ["EN_us"]), "en");
  assert.equal(resolveLandingLanguage(null, ["de-DE"]), "en");
  assert.equal(resolveLandingLanguage(null, []), "en");
});

for (const { id } of landingLanguages) test(`${id}: four complete independent stories and translated controls`, () => {
  const copy = landingCopy[id];
  assert.equal(copy.slides.length, 4);
  assert.equal(new Set(copy.slides.map((slide) => slide.title)).size, 4);
  for (const [key, value] of Object.entries(copy)) if (key !== "slides") assert.ok(typeof value === "string" && value.trim(), key);
  for (const slide of copy.slides) for (const value of Object.values(slide)) assert.ok(value.trim());
});

test("server rendering exposes the first story and an independent immediate Google sign-in", () => {
  const html = renderToStaticMarkup(React.createElement(LandingScreen, { reason: null, onSignIn() { throw new Error("render must never sign in"); } }));
  assert.match(html, /세계적인 기업들이 선택한 목표 관리 방식/);
  assert.match(html, /모든 일이 연결되고, 성과로 이어지는 과정/);
  assert.match(html, /Google로 시작하기/);
  assert.equal((html.match(/class="landing-slide"/g) ?? []).length, 4);
  assert.equal((html.match(/ inert=""/g) ?? []).length, 3);
  assert.match(html, /<footer class="landing-login">/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /loading="eager"/);
  assert.doesNotMatch(html, /!프로젝트생성|!테스크생성|AllVibe/);
});

test("the fourth story offers Slack connection and visibility into recorded work, not unsupported integrations", () => {
  for (const { id } of landingLanguages) {
    const story = landingCopy[id].slides[3];
    assert.match(story.description, /Slack/);
    assert.match(story.description, /OKRPTR/);
    assert.doesNotMatch(`${story.title} ${story.description}`, /Notion|노션|!테스크생성|!프로젝트생성/i);
  }
  assert.match(landingCopy.ko.slides[3].title, /데일리를 따로 모으지 않아도/);
  assert.match(landingCopy.ko.slides[3].description, /버튼 하나로 시작/);
  assert.match(landingCopy.ko.slides[3].description, /등록된 업무/);
});

test("authentication failures and unavailable configuration stay visible by the login control", () => {
  const failure = renderToStaticMarkup(React.createElement(LandingScreen, { reason: "failed", onSignIn() {} }));
  assert.match(failure, /role="alert"/);
  assert.match(failure, /Google 로그인을 완료하지 못했습니다/);
  const unavailable = renderToStaticMarkup(React.createElement(LandingScreen, { reason: "missing_config", onSignIn() {} }));
  assert.match(unavailable, /aria-describedby="landing-login-note" disabled=""/);
  assert.match(unavailable, /Google 로그인 설정을 완료하는 중/);
});

test("new styling uses registered roles and retains stable typography and motion choices", () => {
  const css = read("app/landing.css");
  const common = read("app/globals.css");
  const known = new Set([...Object.keys(themes.THEMES[0].tokens), ...Array.from(common.matchAll(/--([\w-]+)\s*:/g), ([, key]) => key)]);
  for (const [, token] of css.matchAll(/var\(--([\w-]+)/g)) assert.ok(known.has(token), `Unknown token ${token}`);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|linear-gradient|letter-spacing\s*:\s*[^0]|font-size\s*:[^;]*(?:vw|clamp)|\bzoom\s*:/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
});

test("only the signed-out branch changes and sign-in preserves path, search and invitation hash", () => {
  const page = read("app/page.tsx");
  assert.match(page, /authState.status === "unauthenticated"\) return <LandingScreen reason=\{authState.reason\} onSignIn=\{startGoogleSignIn\}/);
  assert.match(page, /window.location.pathname\}\$\{window.location.search\}\$\{window.location.hash/);
  assert.match(page, /api\/auth\/google\?returnTo=\$\{encodeURIComponent\(returnTo\)\}/);
  const landing = read("app/landing.tsx");
  assert.doesNotMatch(landing, /fetch\(|setInterval\(|setTimeout\(/);
  assert.match(landing, /signingInRef.current \|\| unavailable/);
});

test("six themes have complete native desktop and mobile product images", () => {
  for (const { mode } of themes.THEMES) for (let slide = 1; slide <= 4; slide++) for (const suffix of ["", "-mobile"]) {
    const png = readFileSync(new URL(`../public/landing/${mode}/slide-${slide}${suffix}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.ok(png.readUInt32BE(16) >= 250);
    assert.ok(png.readUInt32BE(20) >= 100);
    assert.ok(png.length > 2500);
  }
});
