import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { THEMES, THEME_STORAGE_KEY } from "../../lib/themes";
import { installApiMocks, json } from "./api-mocks";

function serverState(shown = false, granted = false) {
  return { shown, responded: shown, data: granted, email: granted, gets: 0, claims: 0, dismisses: 0, saves: [] as Record<string, unknown>[], failSave: false };
}
async function setup(page: Page, state: ReturnType<typeof serverState>) {
  await installApiMocks(page, { preserveStorage: true });
  await page.route("**/api/account/marketing-consent", async (route) => {
    const method = route.request().method();
    const consent = () => ({ marketingDataConsent: state.data, advertisingEmailConsent: state.email, needsReaffirmation: false,
      promptShownAt: state.shown ? "2026-09-02T00:00:00.000Z" : null, promptRespondedAt: state.responded ? "2026-09-02T00:00:00.000Z" : null });
    if (method === "GET") { state.gets += 1; return json(route, { consent: consent() }); }
    const body = route.request().postDataJSON();
    if (method === "POST") {
      if (body.action === "dismiss") { state.dismisses += 1; state.shown = true; state.responded = true; return json(route, { showPrompt: false }); }
      state.claims += 1;
      const showPrompt = !state.shown && !state.responded && !state.data && !state.email;
      state.shown = true;
      return json(route, { showPrompt });
    }
    if (method === "PATCH") {
      if (state.failSave) return route.abort("failed");
      state.saves.push(body); state.data = body.marketingDataConsent; state.email = body.advertisingEmailConsent; state.shown = true; state.responded = true;
      return json(route, { consent: consent() });
    }
    return json(route, { error: "Unexpected method" }, 405);
  });
}
async function openSettings(page: Page) {
  const profile = page.locator(".sidebar .profile-row");
  if (await profile.isVisible()) await profile.click();
  else { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.locator(".mobile-account-entry").click(); }
  return page.getByRole("dialog", { name: "내 설정", exact: true });
}
const prompt = (page: Page) => page.getByRole("dialog", { name: "이메일 안내 수신 선택", exact: true });

test("first prompt is optional; Escape skips and survives another device", async ({ page, browser }) => {
  const state = serverState();
  await setup(page, state);
  await page.goto("/?view=okr");
  await expect(prompt(page)).toBeVisible();
  const boxes = prompt(page).getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).not.toBeChecked(); await expect(boxes.nth(1)).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(prompt(page)).toHaveCount(0);
  await expect.poll(() => state.dismisses).toBe(1);
  expect(state.saves).toHaveLength(0); expect(state.data).toBe(false); expect(state.email).toBe(false);
  await page.reload(); await expect(page.locator(".workspace")).toBeVisible(); await expect(prompt(page)).toHaveCount(0);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage(); await setup(other, state);
    await other.goto(new URL("/?view=work", page.url()).href);
    await expect(other.locator(".workspace")).toBeVisible(); await expect(prompt(other)).toHaveCount(0);
  } finally { await otherContext.close(); }
});

test("only one concurrent tab displays the account prompt", async ({ page, context }) => {
  const state = serverState(); const other = await context.newPage();
  await setup(page, state); await setup(other, state);
  await Promise.all([page.goto("/?view=okr"), other.goto("/?view=work")]);
  await expect.poll(() => state.claims).toBe(2);
  await expect.poll(async () => await prompt(page).count() + await prompt(other).count()).toBe(1);
  expect(state.saves).toHaveLength(0);
  await other.close();
});

test("old browser dismissal is transferred without showing or granting consent", async ({ page }) => {
  const state = serverState(); await setup(page, state);
  await page.addInitScript(() => localStorage.setItem("okrptr:marketing-consent-nudge:user-1", "2026-08-31T00:00:00Z"));
  await page.goto("/?view=okr");
  await expect.poll(() => state.dismisses).toBe(1);
  await expect(prompt(page)).toHaveCount(0); expect(state.saves).toHaveLength(0); expect(state.data).toBe(false);
});

test("save failure preserves unchecked/checked choices without false success and close stays available", async ({ page }) => {
  const state = serverState(); state.failSave = true; await setup(page, state);
  await page.goto("/?view=okr"); await expect(prompt(page)).toBeVisible();
  await prompt(page).getByRole("checkbox").nth(0).check();
  await prompt(page).getByRole("button", { name: "선택 저장", exact: true }).click();
  await expect(prompt(page).getByRole("alert")).toContainText("저장 결과를 확인하지 못했습니다");
  await expect(prompt(page).getByRole("checkbox").nth(0)).toBeChecked();
  await expect(prompt(page).getByRole("checkbox").nth(1)).not.toBeChecked();
  expect(state.saves).toHaveLength(0);
  await prompt(page).getByRole("button", { name: "수신 안내 닫기" }).click();
  await expect(prompt(page)).toHaveCount(0);
});

test("an explicit selection saves once; settings start collapsed, load on demand and allow withdrawal", async ({ page }) => {
  const state = serverState(); await setup(page, state);
  await page.goto("/?view=okr"); await expect(prompt(page)).toBeVisible();
  await prompt(page).getByRole("checkbox").nth(0).check(); await prompt(page).getByRole("checkbox").nth(1).check();
  await prompt(page).getByRole("button", { name: "선택 저장", exact: true }).click();
  await expect(prompt(page)).toHaveCount(0);
  expect(state.saves).toEqual([{ marketingDataConsent: true, advertisingEmailConsent: true, source: "onboarding" }]);
  const settings = await openSettings(page);
  const toggle = settings.getByRole("button", { name: "이메일 수신 설정", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false"); expect(state.gets).toBe(0);
  await expect(settings.getByRole("checkbox")).toHaveCount(0);
  await toggle.click(); await expect.poll(() => state.gets).toBe(1);
  const boxes = settings.getByRole("checkbox"); await expect(boxes.nth(0)).toBeChecked(); await expect(boxes.nth(1)).toBeChecked();
  await boxes.nth(0).uncheck(); await boxes.nth(1).uncheck();
  await settings.getByRole("button", { name: "동의 설정 저장", exact: true }).click();
  await expect(settings.getByRole("status")).toContainText("동의 설정을 저장했습니다");
  expect(state.data).toBe(false); expect(state.email).toBe(false);
  await toggle.click(); await expect(settings.getByRole("checkbox")).toHaveCount(0);
  await page.keyboard.press("Escape"); await page.reload();
  await expect(page.locator(".workspace")).toBeVisible(); await expect(prompt(page)).toHaveCount(0);
});

for (const theme of THEMES) {
  test(`consent layout and contrast: ${theme.mode}`, async ({ page, context }, testInfo) => {
    test.setTimeout(60_000);
    const state = serverState(); await setup(page, state);
    await page.addInitScript(({ key, mode }) => localStorage.setItem(key, mode), { key: THEME_STORAGE_KEY, mode: theme.mode });
    await page.goto("/?view=okr"); await expect(prompt(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const violations = (await new AxeBuilder({ page: page as never }).include(".consent-prompt").withRules(["color-contrast"]).analyze()).violations;
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const controls = await prompt(page).getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    const minimumControlHeight = await page.evaluate(() => matchMedia("(max-width: 980px), (pointer: coarse)").matches ? 44 : 36);
    expect(controls.every((height) => height >= minimumControlHeight)).toBe(true);
    await prompt(page).locator("h2").evaluate((heading) => { heading.textContent = "이메일 안내 수신 선택 Marketing 123"; });
    await page.evaluate(() => document.fonts.ready);
    const cdp = await context.newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const domDocument = await cdp.send("DOM.getDocument");
    const node = await cdp.send("DOM.querySelector", { nodeId: domDocument.root.nodeId, selector: ".consent-prompt h2" });
    const fonts = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: node.nodeId });
    expect(fonts.fonts.length).toBeGreaterThan(0);
    expect(fonts.fonts.every((font) => font.isCustomFont && /Pretendard/i.test(font.familyName))).toBe(true);
    await cdp.detach();
    await page.screenshot({ path: testInfo.outputPath(`${theme.mode}-consent.png`), fullPage: false });
    await prompt(page).getByRole("button", { name: "동의 없이 계속", exact: true }).click();
    const settings = await openSettings(page); await settings.getByRole("button", { name: "이메일 수신 설정", exact: true }).click();
    await expect(settings.getByRole("checkbox")).toHaveCount(2);
    expect((await new AxeBuilder({ page: page as never }).include(".marketing-preferences").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(settings.getByRole("button", { name: "동의 설정 저장", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  });
}
