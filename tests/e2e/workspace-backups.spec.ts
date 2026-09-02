import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { THEMES, THEME_STORAGE_KEY } from "../../lib/themes";
import { installApiMocks, json } from "./api-mocks";

const url = "/?settings=workspace&tab=backups";
const summary = { cycles: 1, objectives: 2, keyResults: 4, initiatives: 6, projects: 5, tasks: 12, routines: 2, documents: 5, dailyReports: 10 };
const entry = { id: "backup-1", reason: "daily", createdAt: "2026-09-01T15:00:00.000Z", expiresAt: "2026-10-01T15:00:00.000Z", byteSize: 1024, summary };

async function setup(page: Page, role: "owner" | "admin" | "member" | "viewer" = "owner") {
  await installApiMocks(page, { workspaceRole: role, teamWorkspace: true, preserveStorage: true });
  const errors: string[] = [];
  const writes: Array<{ method: string; payload: Record<string, unknown> }> = [];
  let failList = false;
  let failRestore = false;
  let empty = false;
  let stallReads = false;
  let reads = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/workspace-backups*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    expect(request.headers()["x-okrptr-workspace-id"]).toBe("workspace-1");
    if (request.method() !== "GET") {
      writes.push({ method: request.method(), payload: request.postDataJSON() });
      if (request.method() === "PATCH") return json(route, failRestore ? { error: "다른 사용자가 데이터를 변경했습니다." } : { restored: true, rollbackBackupId: "rollback-1" }, failRestore ? 409 : 200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      empty = false;
      return json(route, { backup: { ...entry, reason: "manual" } });
    }
    reads++;
    if (stallReads) return;
    if (failList) return json(route, { error: "백업 목록을 불러오지 못했습니다." }, 503);
    if (target.searchParams.has("id")) return json(route, {
      ...entry, current: { ...summary, tasks: 20 },
      cycles: [{ id: "cycle-1", name: "분기별 업무 계획", version: 1, startDate: "2026-07-01", endDate: "2026-09-30" }],
      projects: [{ id: "project-1", title: "아주 긴 Project 제목도 좁은 화면의 미리보기 안에서 안전하게 줄바꿈됩니다", status: "in_progress" }],
    });
    return json(route, {
      backups: empty ? [] : [{ ...entry, id: target.searchParams.has("before") ? "backup-older" : entry.id }],
      nextCursor: empty || target.searchParams.has("before") ? null : entry.createdAt,
      state: { last_success_at: entry.createdAt, last_daily_date: "2026-09-02", last_attempt_at: entry.createdAt, last_error: null },
    });
  });
  return { errors, writes, reads: () => reads, failList: (value: boolean) => { failList = value; }, failRestore: (value: boolean) => { failRestore = value; }, stallReads: (value: boolean) => { stallReads = value; }, empty: () => { empty = true; } };
}

test("backup preview preserves cancellation and can retry a failed restore", async ({ page }) => {
  const state = await setup(page);
  await page.goto(url);
  await expect(page.locator(".backup-list li")).toHaveCount(1);
  await page.getByRole("button", { name: "이전 백업 더 보기" }).click();
  await expect(page.locator(".backup-list li")).toHaveCount(2);
  await page.locator(".backup-list button").first().click();
  await expect(page.getByRole("table")).toContainText("Routine");
  await expect(page.getByRole("row", { name: "Task 20 12" })).toBeVisible();
  await page.getByRole("button", { name: "이 날짜로 복원", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "이 날짜로 복원할까요?" });
  await expect(confirmation).toContainText("테스트 워크스페이스");
  await confirmation.getByRole("button", { name: "취소", exact: true }).click();
  expect(state.writes).toHaveLength(0);
  state.failRestore(true);
  await page.getByRole("button", { name: "이 날짜로 복원", exact: true }).click();
  await confirmation.getByRole("button", { name: "백업 후 복원" }).click();
  await expect(page.locator(".backup-error[role=alert]")).toContainText("다른 사용자가 데이터를 변경했습니다.");
  await expect(page.locator(".backup-preview")).toBeVisible();
  expect(state.writes).toEqual([{ method: "PATCH", payload: { action: "restore", id: entry.id, confirmation: "RESTORE WORKSPACE" } }]);
  state.failRestore(false);
  await page.getByRole("button", { name: "이 날짜로 복원", exact: true }).click();
  await confirmation.getByRole("button", { name: "백업 후 복원" }).click();
  await expect(page.locator(".backup-list li")).toHaveCount(1);
  await expect(page.locator(".backup-preview")).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

test("manual backup starts from empty state and suppresses duplicate clicks", async ({ page }) => {
  const state = await setup(page);
  state.empty();
  await page.goto(url);
  await expect(page.locator(".backup-empty")).toBeVisible();
  await page.getByRole("button", { name: "지금 백업", exact: true }).dblclick();
  await expect(page.locator(".backup-list li")).toHaveCount(1);
  expect(state.writes).toEqual([{ method: "POST", payload: { action: "create" } }]);
  expect(state.errors).toEqual([]);
});

test("backup loading errors remain recoverable", async ({ page }) => {
  const state = await setup(page);
  state.failList(true);
  await page.goto(url);
  await expect(page.locator(".backup-error[role=alert]")).toBeVisible();
  state.failList(false);
  await page.getByRole("button", { name: "백업 목록 새로고침" }).click();
  await expect(page.locator(".backup-list li")).toHaveCount(1);
  await expect(page.locator(".backup-error[role=alert]")).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("a stalled backup preview times out and remains retryable without writes", async ({ page }) => {
  const state = await setup(page);
  await page.goto(url);
  await expect(page.locator(".backup-list li")).toHaveCount(1);
  await page.clock.install();
  state.stallReads(true);
  await page.locator(".backup-list button").first().click();
  await expect(page.locator(".backup-progress")).toBeVisible();
  await page.clock.fastForward(15_001);
  await expect(page.locator(".backup-error[role=alert]")).toContainText("백업 조회가 지연되고 있습니다.");
  await expect(page.locator(".backup-progress")).toHaveCount(0);
  state.stallReads(false);
  await page.locator(".backup-list button").first().click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator(".backup-error[role=alert]")).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

for (const role of ["admin", "member", "viewer"] as const) {
  test(`${role} sees only permitted backup controls`, async ({ page }) => {
    const state = await setup(page, role);
    await page.goto(url);
    await expect(page.getByRole("dialog", { name: "워크스페이스 설정" })).toBeVisible();
    if (role === "admin") await expect(page.getByRole("button", { name: "지금 백업" })).toBeVisible();
    else {
      await expect(page.getByRole("button", { name: "백업 및 복원", exact: true })).toHaveCount(0);
      await expect(page.locator(".workspace-backups")).toHaveCount(0);
      expect(state.reads()).toBe(0);
    }
    expect(state.writes).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });
}

test("backup list and preview fit every theme and viewport", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const state = await setup(page);
  await page.goto(url);
  for (const theme of THEMES) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: THEME_STORAGE_KEY, value: theme.mode });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.mode);
    await expect(page.locator(".backup-list li")).toHaveCount(1);
    await page.locator(".backup-list button").first().click();
    await page.locator(".backup-preview summary").click();
    const contrast = await new AxeBuilder({ page: page as never }).include(".workspace-backups").withRules(["color-contrast"]).analyze();
    expect(contrast.violations, theme.mode).toEqual([]);
    expect(await page.locator(".workspace-backups").evaluate((element) => element.scrollWidth <= element.clientWidth), theme.mode).toBe(true);
    expect(await page.locator(".workspace-backups button").evaluateAll((buttons) => buttons.every((button) => button.getBoundingClientRect().height >= 44)), theme.mode).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), theme.mode).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`backups-${theme.mode}.png`), fullPage: true });
  }
  expect(state.errors).toEqual([]);
});
