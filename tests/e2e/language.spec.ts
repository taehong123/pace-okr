import { expect, test, type Page } from "@playwright/test";
import { bootstrap, installApiMocks, json } from "./api-mocks";
import type { Language, LanguagePreferences } from "../../lib/language";

async function fixture(page: Page, state: { preferences: LanguagePreferences; fail?: boolean }) {
  await installApiMocks(page);
  const requests: string[] = [], writes: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${path}`);
    if (path === "/api/bootstrap") return json(route, { ...bootstrap, user: { ...bootstrap.user, preferences: state.preferences } });
    if (path === "/api/account/preferences") {
      if (request.method() === "PATCH") {
        const input = request.postDataJSON(); writes.push(input);
        if (state.fail) return json(route, { code: "preferences_save_failed", error: "mock write rejected" }, 500);
        state.preferences = { language: input.language, resolvedLanguage: input.language === "auto" ? "en" : input.language, revision: state.preferences.revision + 1 };
      }
      return json(route, { preferences: state.preferences });
    }
    // Existing consent-prompt bookkeeping is mocked by the shared fixture.
    if (request.method() !== "GET" && path !== "/api/account/marketing-consent" && path !== "/api/project-documents") throw new Error(`Unexpected write in language test: ${path}`);
    return route.fallback();
  });
  return { requests, writes };
}

async function openPreferences(page: Page) {
  if (page.viewportSize()!.width <= 700) {
    await page.locator(".mobile-navigation button").last().click();
    await page.locator(".mobile-account-entry").click();
  } else await page.locator(".sidebar .profile-row").click();
  await expect(page.locator(".language-settings select")).toBeVisible();
}

for (const id of ["ko", "en", "ja", "zh", "es"] as const) {
  test(`bootstrap language ${id} preserves user content and requires no preference preflight`, async ({ page }, info) => {
    const { requests } = await fixture(page, { preferences: { language: id, resolvedLanguage: id, revision: 1 } });
    await page.goto("/?view=my_work");
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", id === "zh" ? "zh-Hans" : id);
    await expect(page.locator(".my-work-item").filter({ hasText: "오버레이 동작 점검" })).toBeVisible();
    expect(requests.filter((value) => value.includes("/api/account/preferences"))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`language-${id}.png`) });
  });
}

test("changing language saves only preferences without reloading workspace data", async ({ page }) => {
  const state = { preferences: { language: "ko", resolvedLanguage: "ko", revision: 0 } as LanguagePreferences };
  const { requests, writes } = await fixture(page, state);
  await page.goto("/?view=work");
  await expect(page.locator(".workspace")).toBeVisible();
  await openPreferences(page);
  const before = requests.filter((entry) => entry.includes("/api/bootstrap")).length;
  for (const id of ["en", "ja", "zh", "es", "ko"] as Language[]) {
    await page.locator(".language-settings select").selectOption(id);
    await expect(page.locator("html")).toHaveAttribute("lang", id === "zh" ? "zh-Hans" : id);
    await page.locator(".language-settings button.primary-action").click();
    await expect(page.locator(".language-settings button.primary-action")).toBeDisabled();
    expect(state.preferences.language).toBe(id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  expect(writes).toHaveLength(5);
  expect(requests.filter((entry) => entry.includes("/api/bootstrap"))).toHaveLength(before);
  expect(new URL(page.url()).searchParams.get("view")).toBe("work");
});

test("failed preference save keeps the preview and offers retry without changing the account", async ({ page }) => {
  const state = { preferences: { language: "ko", resolvedLanguage: "ko", revision: 0 } as LanguagePreferences, fail: true };
  await fixture(page, state);
  await page.goto("/?view=work");
  await openPreferences(page);
  await page.locator(".language-settings select").selectOption("en");
  await page.locator(".language-settings button.primary-action").click();
  await expect(page.locator(".language-settings [role=alert]")).toBeVisible();
  await expect(page.locator(".language-settings select")).toHaveValue("en");
  expect(state.preferences.language).toBe("ko");
  state.fail = false;
  await page.locator(".language-settings button.primary-action").click();
  await expect(page.locator(".language-settings button.primary-action")).toBeDisabled();
  expect(state.preferences.language).toBe("en");
});

test("a language change in another tab preserves the open form and its draft", async ({ page, context }) => {
  const state = { preferences: { language: "ko", resolvedLanguage: "ko", revision: 0 } as LanguagePreferences };
  const { requests } = await fixture(page, state);
  await page.goto("/?view=work");
  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  const title = page.locator(".create-item-form input").first();
  await title.fill("사용자 작성 초안 / Customer draft 123");
  const before = requests.filter((entry) => entry.includes("/api/bootstrap")).length;
  const second = await context.newPage();
  await fixture(second, state);
  await second.goto("/?view=work");
  await openPreferences(second);
  await second.locator(".language-settings select").selectOption("en");
  await second.locator(".language-settings button.primary-action").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(title).toHaveValue("사용자 작성 초안 / Customer draft 123");
  await expect(page.locator(".create-item-form")).toBeVisible();
  expect(requests.filter((entry) => entry.includes("/api/bootstrap"))).toHaveLength(before);
  await second.close();
});

test("editor language changes preserve the editor node, content and undo history", async ({ page, context }) => {
  const state = { preferences: { language: "ko", resolvedLanguage: "ko", revision: 0 } as LanguagePreferences };
  const { requests } = await fixture(page, state);
  await page.goto("/?view=work&project=project-1");
  const editor = page.locator(".project-block-editor .bn-editor");
  await expect(editor).toBeVisible();
  const node = await editor.elementHandle();
  await editor.click();
  await page.keyboard.type("Customer draft preserved 123");
  await expect(editor).toContainText("Customer draft preserved 123");
  const before = requests.filter((entry) => entry.startsWith("GET ")).length;
  const second = await context.newPage();
  await fixture(second, state);
  await second.goto("/?view=work");
  await openPreferences(second);
  await second.locator(".language-settings select").selectOption("en");
  await second.locator(".language-settings button.primary-action").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(editor).toContainText("Customer draft preserved 123");
  expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
  // The only new application GET is the account preference read from BroadcastChannel.
  expect(requests.filter((entry) => entry.startsWith("GET ")).slice(before)).toEqual(["GET /api/account/preferences"]);
  await page.bringToFront();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("Customer draft preserved 123");
  await page.keyboard.type("/");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("listbox")).toContainText("Heading");
  await second.close();
});

test("cancelling an unsaved language preview restores the saved account choice", async ({ page }) => {
  const state = { preferences: { language: "ko", resolvedLanguage: "ko", revision: 0 } as LanguagePreferences };
  const { writes } = await fixture(page, state);
  await page.goto("/?view=work");
  await openPreferences(page);
  await page.locator(".language-settings select").selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.locator(".language-settings > button.secondary").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator(".language-settings button.primary-action")).toBeDisabled();
  expect(writes).toHaveLength(0);
});
