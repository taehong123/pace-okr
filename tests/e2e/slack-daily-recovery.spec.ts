import { expect, test } from "@playwright/test";
import { installApiMocks } from "./api-mocks";
import AxeBuilder from "@axe-core/playwright";

test("failed reservation is visible and repair preserves settings without an immediate message", async ({ page }) => {
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  const writes: unknown[] = [];
  let repaired = false;
  const settings = { enabled: true, weekdays: [1, 2, 3, 4, 5], reminderTime: "09:00", timezone: "Asia/Seoul", installStatus: "connected", onboardingCompletedAt: "2026-09-02T00:00:00Z", lastSyncedAt: "2026-09-02T00:00:00Z", lastError: "Slack chat.scheduleMessage 요청에 실패했습니다 (invalid_blocks)." };
  await page.route("**/api/slack/daily/settings", async (route) => {
    if (route.request().method() === "PATCH") {
      writes.push(route.request().postDataJSON());
      repaired = true;
    }
    return route.fulfill({ json: {
      connected: true, teamName: "팀 Slack", setupComplete: true, needsReauthorization: false,
      settings: { ...settings, lastError: repaired ? "" : settings.lastError },
      delivery: { status: repaired ? "ready" : "failed", targetCount: 1, scheduledCount: repaired ? 1 : 0, pendingCount: 0, failedCount: repaired ? 0 : 1 },
      channels: [], failedPublications: [],
      members: [{ memberId: "member-1", displayName: "긴 한글 이름의 테스트 구성원", email: "owner@example.com", linked: true, slackDisplayName: "멤버", preference: { enabled: true, reminderTime: null, timezone: null }, reminder: repaired ? { status: "scheduled", postAt: Math.floor(Date.now() / 1000) + 86_400, error: "" } : null }],
    } });
  });
  await page.goto("/?view=work&settings=workspace&tab=integrations&bot=daily");
  await expect(page.getByRole("alert").filter({ hasText: "데일리 발송 예약에 문제가 있습니다" })).toBeVisible();
  await expect(page.locator(".slack-connected-title")).toContainText("예약 실패");
  await expect(page.locator(".slack-connected-title")).not.toContainText("사용 중");
  await expect(page.getByRole("button", { name: "예약 복구", exact: true })).toBeEnabled();
  const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, font: getComputedStyle(document.querySelector(".slack-connected-title b")!).fontFamily }));
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.font).toMatch(/Pretendard/);
  await page.getByRole("button", { name: "예약 복구", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".slack-connected-title")).toContainText("사용 중");
  await expect(page.getByText("데일리 발송 예약에 문제가 있습니다")).toHaveCount(0);
  expect(writes).toEqual([{ action: "repair" }]);
});

test("viewer cannot invoke reservation repair", async ({ page }) => {
  await installApiMocks(page, { slackState: "connected", workspaceRole: "viewer", teamWorkspace: true });
  await page.goto("/?view=work&settings=workspace&tab=integrations&bot=daily");
  await expect(page.getByRole("dialog", { name: "워크스페이스 설정" })).toBeVisible();
  await expect(page.getByRole("button", { name: "예약 복구", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "지금 보내기", exact: true })).toHaveCount(0);
});

test("wide light/dark settings retain real fonts, contrast and 200% text", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "one sequential wide-screen check");
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  await page.setViewportSize({ width: 3840, height: 2160 });
  for (const theme of ["white", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("okrptr.theme", value), theme);
    await page.goto("/?view=work&settings=workspace&tab=integrations&bot=daily");
    await expect(page.locator(".slack-connected-title")).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(() => document.fonts.ready);
    const client = await context.newCDPSession(page);
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const documentNode = await client.send("DOM.getDocument");
    const node = await client.send("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: ".slack-connected-title b" });
    const fonts = await client.send("CSS.getPlatformFontsForNode", { nodeId: node.nodeId });
    expect(fonts.fonts.some((font) => font.glyphCount > 0 && /Pretendard/.test(font.familyName))).toBeTruthy();
    await client.detach();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const result = await new AxeBuilder({ page: page as never }).include(".slack-one-button-flow").withRules(["color-contrast"]).analyze();
    expect(result.violations).toEqual([]);
  }
});
