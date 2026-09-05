import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrap, installApiMocks } from "./api-mocks";

const admin = {
  connected: true, teamName: "Slack", setupComplete: true,
  settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], reminderTime: "09:00", timezone: "Asia/Seoul", installStatus: "connected", onboardingCompletedAt: "2026-09-05", lastError: "" },
  delivery: { status: "ready", targetCount: 1, scheduledCount: 1, pendingCount: 0, failedCount: 0 }, channels: [], failedPublications: [],
  members: [
    { memberId: "member-1", displayName: "Alex Kim", linked: true, preference: { enabled: true }, reminder: { status: "scheduled", postAt: 1900000000, error: "" } },
    { memberId: "member-2", displayName: "Another member with a very long display name 123", linked: true, preference: { enabled: false }, reminder: null },
  ],
};

test("bulk send confirms recipients and exposes per-member results without duplicate clicks", async ({ page }) => {
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  const writes: Record<string, unknown>[] = [];
  let polls = 0;
  await page.route("**/api/slack/daily/settings*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") writes.push(route.request().postDataJSON());
    if (url.searchParams.has("runId")) polls++;
    if (route.request().method() === "GET" && !url.searchParams.has("runId")) return route.fulfill({ json: admin });
    const done = polls > 0;
    return route.fulfill({ json: { id: writes[0]?.requestId, total: 2, sent: done ? 1 : 0, failed: done ? 1 : 0, uncertain: 0, pending: done ? 0 : 2, status: done ? "complete" : "pending", members: admin.members.map((m, i) => ({ ...m, status: done ? i ? "failed" : "sent" : "pending", error: done && i ? "데일리 봇 DM을 보내지 못했습니다." : "" })) } });
  });
  await page.goto("/?settings=workspace&tab=integrations&bot=daily");
  const panel = page.locator(".slack-manual-send");
  const button = panel.getByRole("button", { name: "전체 보내기", exact: true });
  await button.click();
  const confirm = page.getByRole("dialog", { name: "데일리 전체 발송", exact: true });
  await expect(confirm).toContainText("2명");
  await expect(confirm).toContainText("기존 예약은 유지");
  await confirm.getByRole("button", { name: "취소", exact: true }).click();
  expect(writes).toEqual([]);
  await button.focus(); await page.keyboard.press("Enter");
  await confirm.getByRole("button", { name: "전체 보내기", exact: true }).click();
  await expect(panel.getByRole("button", { name: "발송 중", exact: true })).toBeDisabled();
  await expect(panel.getByRole("status")).toContainText("성공 1 · 실패 1");
  await expect(panel.locator(".slack-member-links > div").first()).toContainText("전송 성공");
  await expect(panel.locator(".slack-member-links > div").last()).toContainText("전송 실패");
  expect(writes).toHaveLength(1);
  expect(writes[0].action).toBe("send_all_now");
  expect(writes[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: /^데일리 봇 멤버별/ })).toContainText("09:00");
  await page.screenshot({ path: test.info().outputPath("bulk-results.png"), fullPage: true });
});

test("lost response reuses the same request ID instead of sending a second batch", async ({ page }) => {
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  const ids: string[] = [];
  await page.route("**/api/slack/daily/settings*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: admin });
    ids.push(route.request().postDataJSON().requestId);
    if (ids.length === 1) return route.abort();
    return route.fulfill({ json: { id: ids[0], status: "complete", total: 2, sent: 2, failed: 0, pending: 0, uncertain: 0, members: [] } });
  });
  await page.goto("/?settings=workspace&tab=integrations&bot=daily");
  await page.locator(".slack-manual-send").getByRole("button", { name: "전체 보내기", exact: true }).click();
  await page.getByRole("dialog", { name: "데일리 전체 발송", exact: true }).getByRole("button", { name: "전체 보내기", exact: true }).click();
  await page.getByRole("button", { name: "발송 결과 다시 확인", exact: true }).click();
  await expect(page.locator(".slack-bulk-result")).toContainText("성공 2");
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
});

test("reopening daily settings restores the active send without starting another batch", async ({ page }) => {
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  const receipt = { id: "existing-manual-send", createdAt: "2026-09-05T02:00:00Z", status: "pending", total: 2, sent: 0, failed: 0, pending: 2, uncertain: 0, members: [] };
  await page.route("**/api/slack/daily/settings*", async (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: new URL(route.request().url()).searchParams.has("runId") ? { ...receipt, status: "complete", pending: 0, sent: 2 } : { ...admin, manualRun: receipt } });
  });
  await page.goto("/?settings=workspace&tab=integrations&bot=daily");
  await expect(page.locator(".slack-bulk-result")).toContainText("최근 수동 발송");
  await expect(page.locator(".slack-bulk-result")).toContainText("성공 2");
});

test("all task changes requires a chosen channel and saves the supported rule", async ({ page }) => {
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/slack/automations", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON(); writes.push(payload);
      return route.fulfill({ json: { automation: { ...payload, id: "rule", supported: true, lastDeliveryStatus: "never" } } });
    }
    return route.fulfill({ json: { automations: [], deliveries: [], messageLanguage: "ko" } });
  });
  await page.goto("/?settings=workspace&tab=integrations&bot=automation");
  const rule = page.locator(".automation-recommendations article").filter({ hasText: "모든 Task 변동" });
  await rule.getByRole("button", { name: "추가", exact: true }).click();
  expect(writes).toEqual([]);
  await rule.getByRole("combobox").selectOption("C123");
  await rule.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.locator(".slack-automation-list")).toContainText("모든 Task 변동");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ triggerType: "task_changed", channelId: "C123", active: true, messageTemplateKind: "default" });
  expect(writes[0].messageTemplate).toContain("{{changes}}");
});

test("new controls support five languages, six themes, real fonts and enlarged text", async ({ page, context }, info) => {
  test.setTimeout(180_000);
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  let language = "ko";
  await page.route("**/api/bootstrap*", (route) => route.fulfill({ json: { ...bootstrap, workspaces: bootstrap.workspaces.map((workspace) => ({ ...workspace, kind: "team", personal: false })), team: { ...bootstrap.team, workspace: { ...bootstrap.team.workspace, kind: "team" } }, user: { ...bootstrap.user, preferences: { language, resolvedLanguage: language, revision: 1 } } } }));
  await page.route("**/api/slack/daily/settings*", (route) => { expect(route.request().method()).toBe("GET"); return route.fulfill({ json: admin }); });
  const copy = { ko: "전체 보내기", en: "Send to all", ja: "全員に送信", zh: "发送给所有人", es: "Enviar a todos" };
  for (const [id, label] of Object.entries(copy)) {
    language = id;
    await page.goto("/?settings=workspace&tab=integrations&bot=daily");
    const panel = page.locator(".slack-manual-send");
    await expect(panel.getByRole("button", { name: label, exact: true })).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
  if (info.project.name !== "desktop-chromium") return;
  language = "en";
  for (const theme of ["white", "dark", "beige", "gray", "neon", "cyberpunk"]) {
    await page.addInitScript((value) => localStorage.setItem("okri.theme", value), theme);
    await page.setViewportSize({ width: theme === "white" ? 3840 : 1440, height: 1200 });
    await page.goto("/?settings=workspace&tab=integrations&bot=daily");
    const panel = page.locator(".slack-manual-send");
    await expect(panel).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect((await new AxeBuilder({ page: page as never }).include(".slack-manual-send").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`bulk-${theme}-zoom.png`), fullPage: true });
  }
  const client = await context.newCDPSession(page);
  await client.send("DOM.enable"); await client.send("CSS.enable");
  const doc = await client.send("DOM.getDocument");
  const node = await client.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#slack-manual-send-title" });
  const fonts = await client.send("CSS.getPlatformFontsForNode", { nodeId: node.nodeId });
  expect(fonts.fonts.some((font) => font.glyphCount > 0 && /Pretendard/.test(font.familyName))).toBeTruthy();
  await client.detach();
});
