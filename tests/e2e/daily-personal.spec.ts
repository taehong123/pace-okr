import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiMocks } from "./api-mocks";

test("my assigned projects, tasks and routines can be selected and submitted without task creation", async ({ page }, testInfo) => {
  await installApiMocks(page, { teamWorkspace: true });
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const title = "고객 인터뷰와 서비스 개선을 위한 긴 프로젝트 이름";
  const work = [
    { id: "project-1", key: "project:project-1", kind: "project", title, parentTitle: "서비스 품질 개선", dueDate: null },
    { id: "task-1", key: "task:task-1", kind: "task", title: "고객 인터뷰 진행", parentTitle: title, dueDate: "2026-09-30" },
    { id: "routine-1", key: "routine:routine-1", kind: "routine", title: "고객 의견 점검", parentTitle: "Routine", dueDate: null },
  ];
  let draft = { id: null as string | null, date: "2026-09-04", yesterdayNote: "", todayNote: "", blockersNote: "", skipReason: null, skipNote: "", noPlannedTasks: false, selectedTaskIds: [] as string[], selectedWorkIds: [] as string[] };
  await page.route(/\/api\/daily-scrum(?:\/|\?|$)/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      const body = route.request().postDataJSON();
      writes.push({ path, body });
      if (path.endsWith("/submit")) return route.fulfill({ json: { submission: { id: "submitted" } } });
      expect(path).toBe("/api/daily-scrum"); draft = { ...draft, ...body, id: "draft" };
    }
    return route.fulfill({ json: { date: draft.date, draft, member: { id: "member-1", displayName: "테스트 사용자", role: "owner" }, candidates: { work, tasks: [], groups: [] }, createTargets: { projects: [], routines: [], allowGeneral: false }, team: [], latestSubmission: null, legacyWorkspaceNote: null } });
  });
  await page.goto("/?view=scrum");
  const picker = page.getByRole("region", { name: "오늘 할 업무" });
  await expect(picker).toBeVisible();
  const boxes = picker.locator('input[type="checkbox"]');
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();
  await page.getByRole("checkbox", { name: title + " 선택", exact: true }).focus();
  await page.keyboard.press("Space");
  await page.getByRole("checkbox", { name: "고객 의견 점검 선택", exact: true }).check();
  await expect(page.getByRole("textbox", { name: "새 Task 제목" })).toBeHidden();
  await page.getByRole("button", { name: "확정 및 공유", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0].body.selectedWorkIds).toEqual(["project:project-1", "routine:routine-1"]);
  expect(writes[0].body.selectedTaskIds).toEqual([]);
  expect(writes[1].path).toBe("/api/daily-scrum/submit");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("personal-daily.png"), fullPage: true });
});

test("Slack identity diagnostics require explicit account selection and keep failed linking visible", async ({ page }, testInfo) => {
  await installApiMocks(page, { slackState: "connected", teamWorkspace: true });
  let attempts = 0;
  await page.route("**/api/slack/members", async (route) => {
    if (route.request().method() === "POST") {
      attempts++;
      expect(route.request().postDataJSON()).toEqual({ action: "link", memberId: "member-2", slackUserId: "U2", confirmed: true });
      return route.fulfill({ status: 409, json: { error: "연결하지 못했습니다. 기존 연결은 유지됩니다." } });
    }
    return route.fulfill({ json: { members: [{ memberId: "member-2", displayName: "미연결 구성원", email: "member@example.test", reason: "email_not_found", message: "같은 이메일의 Slack 계정을 찾지 못했습니다." }], availableUsers: [{ id: "U2", displayName: "회사 Slack 구성원", email: "company@example.test" }] } });
  });
  await page.goto("/?settings=workspace&tab=integrations&bot=daily");
  await page.getByRole("button", { name: "Slack 멤버 연결 확인" }).click();
  await expect(page.getByText("같은 이메일의 Slack 계정을 찾지 못했습니다.")).toBeVisible();
  const select = page.getByRole("combobox", { name: "미연결 구성원 Slack 계정" });
  await expect(select).toHaveValue("");
  await expect(page.getByRole("button", { name: "계정 연결", exact: true })).toBeDisabled();
  await select.selectOption("U2");
  await page.getByRole("button", { name: "계정 연결", exact: true }).click();
  expect(attempts).toBe(0);
  await page.getByRole("button", { name: "확인 후 연결" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "연결하지 못했습니다." })).toBeVisible();
  await expect(select).toHaveValue("U2");
  expect(attempts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const contrast = await new AxeBuilder({ page: page as never }).include(".slack-member-repair").withRules(["color-contrast"]).analyze();
  expect(contrast.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("slack-member-repair.png"), fullPage: true });
  if (testInfo.project.name === "desktop-chromium") {
    await page.addInitScript(() => localStorage.setItem("okrptr.theme", "dark"));
    await page.goto("/?settings=workspace&tab=integrations&bot=daily");
    await page.getByRole("button", { name: "Slack 멤버 연결 확인" }).click();
    await expect(select).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect((await new AxeBuilder({ page: page as never }).include(".slack-member-repair").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("slack-member-dark-zoom.png"), fullPage: true });
  }
});

test("personal daily light/dark, wide layout and text zoom use rendered Pretendard and accessible contrast", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await installApiMocks(page, { teamWorkspace: true });
  for (const theme of ["white", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("okrptr.theme", value), theme);
    for (const width of [320, 768, 1920, 3840]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/?view=scrum");
      await expect(page.getByRole("region", { name: "오늘 할 업무" })).toBeVisible();
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    const client = await context.newCDPSession(page);
    await client.send("DOM.enable"); await client.send("CSS.enable");
    const doc = await client.send("DOM.getDocument");
    const node = await client.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: ".daily-task-picker b" });
    const fonts = await client.send("CSS.getPlatformFontsForNode", { nodeId: node.nodeId });
    expect(fonts.fonts.some((font) => font.glyphCount > 0 && /Pretendard/.test(font.familyName))).toBeTruthy();
    await client.detach();
    const result = await new AxeBuilder({ page: page as never }).include(".daily-task-picker").withRules(["color-contrast"]).analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("daily-" + theme + ".png"), fullPage: true });
  }
});
