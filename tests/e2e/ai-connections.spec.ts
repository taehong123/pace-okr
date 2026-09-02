import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installApiMocks, json } from "./ai-connection-mocks";

async function openConnections(page: Page, mobile: boolean) {
  await page.goto("/");
  if (mobile) await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.getByRole("button", { name: "AI 연결", exact: true }).click();
  return page.getByRole("dialog", { name: "AI 연결", exact: true });
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
  await page.route("**/api/integration-tokens*", (route) => json(route, route.request().method() === "POST" ? { prompt: "EXISTING_CHATGPT_PROMPT" } : { connections: [] }));
  await page.addInitScript(() => {
    const state = window as unknown as { clipboardFails: boolean; copiedText: string };
    state.clipboardFails = false;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => {
      if (state.clipboardFails) throw new Error("Clipboard denied");
      state.copiedText = text;
    } } });
  });
});

test("ChatGPT paste location is persistent, failure is not success, and reopening resets feedback", async ({ page, isMobile }) => {
  const dialog = await openConnections(page, isMobile);
  await expect(dialog.getByRole("tab", { name: "ChatGPT", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("복사한 내용을 ChatGPT 대화창에 붙여넣어 주세요.")).toBeVisible();
  await page.evaluate(() => { (window as unknown as { clipboardFails: boolean }).clipboardFails = true; });
  await dialog.getByRole("button", { name: "ChatGPT 연결 문구 복사" }).click();
  await expect(dialog.getByRole("alert")).toContainText("복사하지 못했습니다");
  await expect(dialog.getByText("복사 완료! 이제 ChatGPT 대화창에 붙여넣고 전송하세요.")).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { clipboardFails: boolean }).clipboardFails = false; });
  await dialog.getByRole("button", { name: "ChatGPT 연결 문구 복사" }).click();
  await expect(dialog.getByText("복사 완료! 이제 ChatGPT 대화창에 붙여넣고 전송하세요.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedText: string }).copiedText)).toBe("EXISTING_CHATGPT_PROMPT");
  await expect(dialog.locator(".ai-connection-state")).toHaveText("연결 없음");
  await dialog.getByRole("tab", { name: "Claude", exact: true }).click();
  await dialog.getByRole("tab", { name: "ChatGPT", exact: true }).click();
  await expect(dialog.getByText("복사 완료! 이제 ChatGPT 대화창에 붙여넣고 전송하세요.")).toBeVisible();
  await dialog.getByRole("button", { name: "AI 연결 닫기" }).click();
  if (isMobile) await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.getByRole("button", { name: "AI 연결", exact: true }).click();
  await expect(dialog.getByText("복사한 내용을 ChatGPT 대화창에 붙여넣어 주세요.")).toBeVisible();
});

test("Claude official links, organization guidance, keyboard tabs and manual Code command", async ({ page, isMobile }) => {
  const dialog = await openConnections(page, isMobile);
  await dialog.getByRole("tab", { name: "ChatGPT", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "Claude", exact: true })).toBeFocused();
  await expect(dialog.getByRole("tab", { name: "Claude", exact: true })).toHaveAttribute("aria-selected", "true");
  const install = new URL((await dialog.getByRole("link", { name: "Claude에 연결", exact: true }).getAttribute("href"))!);
  expect(install.hostname).toBe("claude.ai");
  expect(install.searchParams.get("connectorName")).toBe("OKRPTR");
  expect(install.searchParams.get("connectorUrl")).toBe("https://okrptr.com/api/mcp");
  await dialog.locator("summary", { hasText: "직접 주소 입력" }).click();
  await expect(dialog.getByText(/OKRPTR 관리자 권한과는 별개/)).toBeVisible();
  expect(await dialog.getByRole("link", { name: "Claude 조직 관리자용 연결 열기" }).getAttribute("href")).toContain("/admin-settings/connectors?");
  await dialog.getByRole("tab", { name: "Claude", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(dialog.getByRole("tab", { name: "Claude Code", exact: true })).toBeFocused();
  await dialog.locator("summary", { hasText: "터미널에서 직접 연결" }).click();
  await dialog.getByRole("button", { name: "명령 복사" }).click();
  expect(await page.evaluate(() => (window as unknown as { copiedText: string }).copiedText)).toBe("claude mcp add --transport http --scope user okrptr https://okrptr.com/api/mcp");
  await expect(dialog.getByText(/자동 실행하거나 기존 연결을 삭제하지 않습니다/)).toBeVisible();
  await expect(dialog.locator(".ai-connection-state")).toHaveText("연결 없음");
});

test("provider revoke cannot revoke another AI and account reuse does not claim Code verification", async ({ page, isMobile }) => {
  const deleted: string[] = [];
  let connections = [
    { id: "gpt", name: "ChatGPT OAuth", provider: "chatgpt", lastUsedAt: "2026-09-02T00:00:00Z" },
    { id: "claude", name: "Claude OAuth", provider: "claude", lastUsedAt: null },
  ];
  await page.route("**/api/integration-tokens*", async (route) => {
    if (route.request().method() === "DELETE") {
      const provider = new URL(route.request().url()).searchParams.get("provider")!;
      deleted.push(provider); connections = connections.filter((c) => c.provider !== provider);
      return json(route, { revoked: 1 });
    }
    return json(route, { connections });
  });
  const dialog = await openConnections(page, isMobile);
  await expect(dialog.locator(".ai-connection-state")).toHaveText("연결됨");
  await dialog.getByRole("tab", { name: "Claude Code", exact: true }).click();
  await expect(dialog.getByText(/Claude 계정 연결은 있습니다/)).toBeVisible();
  await expect(dialog.locator(".ai-connection-state")).toHaveText("연결 없음");
  await dialog.getByRole("tab", { name: "Claude", exact: true }).click();
  await expect(dialog.locator(".ai-connection-state")).toHaveText("연결 대기 · 첫 사용 전");
  await dialog.getByRole("button", { name: "Claude 연결 해제" }).click();
  const confirmation = page.getByRole("dialog", { name: "Claude 연결 해제", exact: true });
  await confirmation.getByRole("button", { name: "연결 해제", exact: true }).click();
  expect(deleted).toEqual(["claude"]);
  await dialog.getByRole("tab", { name: "ChatGPT", exact: true }).click();
  await expect(dialog.locator(".ai-connection-state")).toHaveText("연결됨");
});

test("AI modal scrolls at narrow widths without clipping and meets accessible dialog/tab semantics", async ({ page, isMobile }, testInfo) => {
  const dialog = await openConnections(page, isMobile);
  for (const name of ["ChatGPT", "Claude", "Claude Code"]) {
    await dialog.getByRole("tab", { name, exact: true }).click();
    if (name === "Claude Code") await dialog.locator("summary", { hasText: "터미널에서 직접 연결" }).click();
    // Axe bundles its own Playwright Page type; both versions use the same browser protocol here.
    const violations = (await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).include(".ai-connections").analyze()).violations;
    expect(violations).toEqual([]);
    const dimensions = await dialog.locator(".ai-connections").evaluate((element) => ({ width: element.getBoundingClientRect().width, scroll: element.scrollWidth, viewport: window.innerWidth, body: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(Math.ceil(dimensions.width));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    const tabHeight = await dialog.getByRole("tab", { name, exact: true }).evaluate((element) => element.getBoundingClientRect().height);
    expect(tabHeight).toBeGreaterThanOrEqual(44);
    const closeSize = await dialog.getByRole("button", { name: "AI 연결 닫기" }).boundingBox();
    expect(closeSize!.width).toBeGreaterThanOrEqual(44);
    expect(closeSize!.height).toBeGreaterThanOrEqual(44);
    await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeInViewport();
    if (name === "ChatGPT") await page.screenshot({ path: testInfo.outputPath("ai-connections.png") });
  }
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("AI connection panels preserve contrast in all six themes", async ({ page, isMobile }) => {
  test.skip(isMobile);
  test.setTimeout(90_000);
  const dialog = await openConnections(page, false);
  for (const theme of ["white", "beige", "gray", "dark", "neon", "cyberpunk"]) {
    await page.evaluate((mode) => document.documentElement.setAttribute("data-theme", mode), theme);
    for (const name of ["ChatGPT", "Claude", "Claude Code"]) {
      await dialog.getByRole("tab", { name, exact: true }).click();
      const result = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).include(".ai-connections").withRules(["color-contrast"]).analyze();
      expect(result.violations, `${theme} / ${name}`).toEqual([]);
    }
  }
});
