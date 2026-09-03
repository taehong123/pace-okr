import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { landingLanguages } from "../../lib/landing-copy";
import { THEMES } from "../../lib/themes";
import { installApiMocks } from "./api-mocks";

async function guest(page: Page, language = "ko") {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((locale) => {
    try { if (!localStorage.getItem("okrptr.intro-language")) localStorage.setItem("okrptr.intro-language", locale); } catch { /* Blocked-storage coverage. */ }
  }, language);
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ status: 401, json: { error: "unauthenticated" } });
  });
  return { writes, errors };
}

async function goToSlide(page: Page, index: number) {
  await page.locator(".landing-dots button").nth(index).click();
  await expect(page.locator(".landing-dots button").nth(index)).toHaveAttribute("aria-current", "step");
}

async function assertLayout(page: Page) {
  const geometry = await page.evaluate(() => {
    const active = document.querySelector<HTMLElement>(".landing-slide[aria-hidden='false']")!;
    const footer = document.querySelector(".landing-login")!.getBoundingClientRect();
    const viewport = document.querySelector(".landing-viewport")!.getBoundingClientRect();
    const button = document.querySelector(".landing-login-button")!.getBoundingClientRect();
    const navigation = document.querySelector(".landing-navigation")!.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      slideOverflow: active.scrollWidth > active.clientWidth + 1,
      footerVisible: footer.top >= 0 && footer.bottom <= innerHeight + 1,
      separated: viewport.bottom <= footer.top,
      readingArea: viewport.height >= 44 && navigation.bottom <= footer.top,
      controlsVisible: [...document.querySelectorAll(".landing-navigation button, .landing-language select")].every((node) => {
        const box = node.getBoundingClientRect();
        return box.x >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= footer.top && box.width >= 44 && box.height >= 44;
      }),
      buttonVisible: button.top >= footer.top && button.bottom <= footer.bottom && button.width >= 44 && button.height >= 44,
      escapedText: [...document.querySelectorAll<HTMLElement>(".landing-header h1, .landing-copy h2, .landing-copy > p, .landing-login-copy > p")].filter((node) => !node.closest("[aria-hidden='true']")).some((node) => node.scrollWidth > node.clientWidth + 1),
    };
  });
  expect(geometry).toEqual({ pageOverflow: false, slideOverflow: false, footerVisible: true, separated: true, readingArea: true, controlsVisible: true, buttonVisible: true, escapedText: false });
}

test("four manual slides, keyboard navigation, language persistence and an always-available sign-in", async ({ page }) => {
  const state = await guest(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".landing-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: "이전 슬라이드", exact: true })).toBeDisabled();
  await page.locator(".landing-viewport").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".landing-dots button").nth(1)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "다음 슬라이드", exact: true })).toBeDisabled();
  await page.keyboard.press("Home");
  await expect(page.locator(".landing-dots button").first()).toHaveAttribute("aria-current", "step");
  for (let i = 0; i < 4; i++) {
    await goToSlide(page, i);
    await expect(page.locator(".landing-login-button")).toBeEnabled();
    await assertLayout(page);
  }
  await page.getByLabel("안내 언어").selectOption("es");
  await expect(page.locator(".landing-shell")).toHaveAttribute("lang", "es");
  await expect(page.locator(".landing-login-button")).toHaveText("Continuar con Google");
  await page.reload();
  await expect(page.locator(".landing-shell")).toHaveAttribute("lang", "es");
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("native touch swiping changes slides without making vertical reading a navigation action", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await guest(page);
    await page.goto("/");
    await expect(page.locator(".landing-shell")).toBeVisible();
    const client = await context.newCDPSession(page);
    const box = (await page.locator(".landing-viewport").boundingBox())!;
    const y = box.y + Math.min(150, box.height / 2);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y }] });
    for (const x of [290, 240, 180, 100, 50]) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(".landing-dots button").nth(1)).toHaveAttribute("aria-current", "step");
    const active = page.locator(".landing-slide[aria-hidden='false']");
    await active.evaluate((node) => { node.scrollTop = 150; });
    await expect(page.locator(".landing-dots button").nth(1)).toHaveAttribute("aria-current", "step");
    await assertLayout(page);
    await client.detach();
  } finally { await context.close(); }
});

test("every slide can sign in immediately and preserves deep links and invitation tokens", async ({ page }) => {
  test.setTimeout(60_000);
  const state = await guest(page);
  const authRequests: string[] = [];
  await page.route("**/api/auth/google?**", (route) => {
    authRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Mock Google entry</h1>" });
  });
  const destination = `/?view=work&project=example#invite=${"a".repeat(64)}`;
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (let index = 0; index < 4; index++) {
    await page.goto(destination);
    await goToSlide(page, index);
    await page.locator(".landing-login-button").click();
    await expect(page.getByRole("heading", { name: "Mock Google entry" })).toBeVisible();
    expect(new URL(authRequests[index]).searchParams.get("returnTo")).toBe(destination);
  }
  expect(authRequests).toHaveLength(4);
  expect(state.writes).toEqual([]);
});

test("failure and missing configuration retain the independent login area", async ({ page }) => {
  await guest(page);
  await page.goto("/?auth=failed");
  await expect(page.getByRole("alert")).toContainText("로그인을 완료하지 못했습니다");
  await expect(page.locator(".landing-login-button")).toBeEnabled();
  await page.goto("/?auth=missing_config");
  await expect(page.getByRole("alert")).toContainText("설정을 완료하는 중");
  await expect(page.locator(".landing-login-button")).toBeDisabled();
  await assertLayout(page);
});

test("browser language fallback and blocked preference storage do not prevent reading or sign-in", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "fr-FR" });
  try {
    const page = await context.newPage();
    const state = await guest(page, "invalid");
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked for test", "SecurityError"); } });
    });
    await page.goto("/");
    await expect(page.locator(".landing-shell")).toHaveAttribute("lang", "en");
    await page.locator(".landing-language select").selectOption("ja");
    await expect(page.locator(".landing-login-button")).toHaveText("Googleで始める");
    await expect(page.locator(".landing-login-button")).toBeEnabled();
    expect(state.errors).toEqual([]);
    expect(state.writes).toEqual([]);
  } finally { await context.close(); }
});

test("existing sessions and invitations still enter the application without landing", async ({ page }) => {
  await installApiMocks(page, { teamWorkspace: true });
  await page.goto("/?view=my_work");
  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".landing-shell")).toHaveCount(0);
  await page.goto(`/#invite=${"a".repeat(64)}`);
  await expect(page.getByRole("dialog", { name: "워크스페이스 초대", exact: true })).toBeVisible();
});

test("signing out clears the cached session and returns to landing", async ({ page }) => {
  await installApiMocks(page, { teamWorkspace: true });
  let loggedOut = false;
  await page.route("**/api/bootstrap**", (route) => loggedOut ? route.fulfill({ status: 401, json: {} }) : route.fallback());
  await page.route("**/api/auth/logout", (route) => {
    loggedOut = true;
    return route.fulfill({ status: 302, headers: { location: "/" } });
  });
  await page.goto("/?view=my_work");
  await page.locator(".profile-row").click();
  await page.getByRole("button", { name: "Google 계정 로그아웃" }).click();
  await expect(page.locator(".landing-shell")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("okrptr.bootstrap.v1"))).toBeNull();
  await expect(page.locator(".landing-login-button")).toBeEnabled();
});

test("all languages and themes retain keyboard-readable content at 200 percent text", async ({ page }, info) => {
  test.setTimeout(180_000);
  await guest(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  for (const { mode } of THEMES) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, mode);
    for (const { id } of landingLanguages) {
      await page.locator(".landing-language select").selectOption(id);
      for (let index = 0; index < 4; index++) {
        await goToSlide(page, index);
        await assertLayout(page);
        const active = page.locator(".landing-slide[aria-hidden='false']");
        await active.evaluate((node) => { node.scrollTop = 0; });
        await active.focus();
        await page.keyboard.press("PageDown");
        await expect.poll(() => active.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      }
    }
  }
  await page.screenshot({ path: info.outputPath("landing-zoom-controls.png") });
});

test("five languages and six themes remain legible with native images on narrow and wide screens", async ({ page }, info) => {
  test.setTimeout(240_000);
  const state = await guest(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const { mode } of THEMES) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, mode);
    for (const { id } of landingLanguages) {
      await page.locator(".landing-language select").selectOption(id);
      for (const width of [320, 390, 1440, 3840]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (let index = 0; index < 4; index++) {
          await goToSlide(page, index);
          await assertLayout(page);
          const img = page.locator(".landing-slide[aria-hidden='false'] img");
          await img.scrollIntoViewIfNeeded();
          await expect.poll(() => img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0 && node.currentSrc.includes(`/${document.documentElement.dataset.theme}/`))).toBe(true);
          const distortion = await img.evaluate((node: HTMLImageElement) => {
            const box = node.getBoundingClientRect();
            return Math.abs(box.width / box.height - node.naturalWidth / node.naturalHeight);
          });
          expect(distortion).toBeLessThan(0.01);
        }
        if ((width === 320 || width === 1440) && id === "ko") {
          const violations = (await new AxeBuilder({ page: page as never }).include(".landing-shell").analyze()).violations;
          expect(violations, `${mode}/${id}/${width}`).toEqual([]);
        }
      }
    }
    await goToSlide(page, 0);
    await page.screenshot({ path: info.outputPath(`landing-${mode}.png`) });
  }
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});

test("actual Korean, Latin and numeral fonts are local; large text and long titles stay usable", async ({ page, context }, info) => {
  test.setTimeout(90_000);
  const fontRequests = new Set<string>();
  page.on("request", (request) => { if (request.resourceType() === "font") fontRequests.add(request.url()); });
  await guest(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const heading = page.locator(".landing-slide h2").first();
  await expect(heading).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath("landing-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("landing-mobile.png") });
  await heading.evaluate((node) => { node.textContent = "목표와 성과를 연결하는 OKRPTR 2026"; });
  await page.evaluate(() => document.fonts.ready);
  const client = await context.newCDPSession(page);
  await client.send("DOM.enable"); await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument");
  const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".landing-slide h2" });
  const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(fonts.length).toBeGreaterThan(0);
  for (const font of fonts) { expect(font.isCustomFont).toBe(true); expect(font.familyName).toContain("Pretendard"); }
  expect(fontRequests.size).toBeGreaterThan(0);
  expect(fontRequests.size).toBeLessThan(92);
  for (const url of fontRequests) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
  const size = await heading.evaluate((node) => getComputedStyle(node).fontSize);
  for (const width of [320, 390, 768, 1440, 1920, 2560, 3840]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
    expect(await heading.evaluate((node) => getComputedStyle(node).fontSize)).toBe(size);
    await assertLayout(page);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  for (let index = 0; index < 4; index++) { await goToSlide(page, index); await assertLayout(page); }
  await goToSlide(page, 0);
  await heading.evaluate((node) => { node.textContent = "목표와 성과를 연결하는 긴 제목 ".repeat(10); });
  await assertLayout(page);
  await page.screenshot({ path: info.outputPath("landing-text-zoom.png") });
  await client.detach();
});
