import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const now = "2026-08-29T09:00:00.000Z";
const baseItem = {
  cycleId: "cycle-1",
  routineId: null,
  description: "",
  status: "in_progress",
  priority: "high",
  cadence: "weekly",
  progress: 40,
  dueDate: "2026-09-03",
  source: "manual",
  archivedAt: null,
  archivedFromStatus: null,
  archiveRootId: null,
  assignments: [],
  createdAt: now,
  updatedAt: now,
};

const bootstrap = {
  user: { id: "user-1", email: "owner@example.com", displayName: "테스트 사용자", provider: "local" },
  workspaces: [{
    id: "workspace-1",
    name: "테스트 워크스페이스",
    createdAt: now,
    personal: true,
    role: "owner",
    current: true,
    deletionRequestedAt: null,
    scheduledDeletionAt: null,
  }],
  rules: {
    workspaceId: "workspace-1",
    captureInstruction: "",
    structureInstruction: "",
    routineInstruction: "",
    defaultPriority: "medium",
    defaultCadence: "weekly",
    reviewBeforeCreate: true,
    configured: true,
    updatedAt: now,
  },
  cycles: [{
    id: "cycle-1",
    name: "2026 하반기",
    department: "",
    version: 1,
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }],
  team: {
    workspace: { id: "workspace-1", name: "테스트 워크스페이스" },
    currentRole: "owner",
    canManage: true,
    members: [{
      id: "member-1",
      email: "owner@example.com",
      displayName: "테스트 사용자",
      role: "owner",
      status: "active",
      isCurrent: true,
      createdAt: now,
    }],
  },
  items: [
    { ...baseItem, id: "objective-1", parentId: null, kind: "objective", title: "고객 경험 개선", progress: 50 },
    { ...baseItem, id: "kr-1", parentId: "objective-1", kind: "key_result", title: "활성 사용자 20% 증가", progress: 45 },
    { ...baseItem, id: "initiative-1", parentId: "kr-1", kind: "initiative", title: "핵심 흐름 개편", progress: 40 },
    { ...baseItem, id: "project-1", parentId: "initiative-1", kind: "project", title: "모바일 사용성 개선", assignments: [{ id: "assignment-1", memberId: "member-1", displayName: "테스트 사용자", email: "owner@example.com", role: "project_dri" }] },
    { ...baseItem, id: "task-1", parentId: "project-1", kind: "task", title: "오버레이 동작 점검", status: "todo", progress: 0, assignments: [{ id: "assignment-2", memberId: "member-1", displayName: "테스트 사용자", email: "owner@example.com", role: "task_assignee" }] },
  ],
  properties: [],
  propertyValues: {},
  hiddenByProject: {},
  archivedProjects: [],
  routines: [],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApiMocks(page: Page, options: { failItemCreate?: boolean } = {}) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("okrptr.intro-language", "ko");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/bootstrap") return json(route, bootstrap);
    if (url.pathname === "/api/items" && request.method() === "POST" && options.failItemCreate) {
      return json(route, { error: "서버 저장 실패" }, 500);
    }
    if (url.pathname === "/api/project-documents") {
      return json(route, { document: { id: "document-1", projectId: "project-1", content: "[]", plainText: "", version: 1, updatedAt: now } });
    }
    if (url.pathname === "/api/project-templates") return json(route, { templates: [] });
    if (url.pathname === "/api/checklists") return json(route, { items: [] });
    if (url.pathname === "/api/recommendations") return json(route, { recommendations: [] });
    if (url.pathname === "/api/trash") return json(route, { items: [], cleanupRecords: [] });
    return json(route, {});
  });
}

test.describe("공통 오버레이", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.goto("/?view=work");
  });

  test("배경·Escape로 닫히고 포커스와 스크롤이 복원된다", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    const trigger = page.getByRole("button", { name: "서비스 안내" });
    await trigger.click();
    const dialog = page.locator("dialog.overlay-dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await dialog.click({ position: { x: 2, y: 2 } });
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");

    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("변경된 폼은 버리기 확인을 거친다", async ({ page }) => {
    await page.getByRole("button", { name: "Project 추가" }).click();
    const createDialog = page.getByRole("dialog", { name: "새 항목" });
    await createDialog.getByLabel("이름").fill("작성 중인 Project");
    await createDialog.getByRole("button", { name: "새 항목 닫기" }).click();

    const discardDialog = page.getByRole("alertdialog", { name: "변경사항을 버릴까요?" });
    await expect(discardDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(discardDialog).toBeHidden();
    await expect(createDialog.getByLabel("이름")).toHaveValue("작성 중인 Project");

    await createDialog.getByRole("button", { name: "새 항목 닫기" }).click();
    await discardDialog.getByRole("button", { name: "변경사항 버리기" }).click();
    await expect(createDialog).toBeHidden();
  });
});

test("상세 URL과 뒤로가기가 UI 상태를 복원한다", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/?view=work");
  await page.getByRole("button", { name: /모바일 사용성 개선/ }).first().click();
  await expect(page).toHaveURL(/view=work.*project=project-1/);
  await expect(page.getByRole("dialog", { name: /모바일 사용성 개선 Project 상세/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/view=work/);
  await expect(page).not.toHaveURL(/project=/);

  await page.goto("/?view=work&project=missing");
  await expect(page).not.toHaveURL(/project=missing/);
  await expect(page.getByRole("alert")).toContainText("찾을 수 없");
});

test("저장 실패 시 가짜 Task나 허위 성공 메시지를 만들지 않는다", async ({ page }) => {
  await installApiMocks(page, { failItemCreate: true });
  await page.goto("/?view=inbox");
  const capture = page.getByRole("textbox", { name: "미분류 Task에 할 일 추가" });
  await capture.fill("서버에 저장되지 않은 Task");
  await page.getByRole("button", { name: "추가" }).click();
  await expect(page.getByRole("alert")).toContainText("저장하지 못했습니다");
  await expect(capture).toHaveValue("서버에 저장되지 않은 Task");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("모바일 Project 기본 보기는 카드이며 페이지가 가로로 넘치지 않는다", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installApiMocks(page);
  await page.goto("/?view=work");
  await expect(page.getByRole("tab", { name: "카드" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("list", { name: "Project 카드 목록" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("핵심 화면은 axe 자동 접근성 검사에서 치명적 위반이 없다", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/?view=work");
  const results = await new AxeBuilder({ page: page as never }).disableRules(["color-contrast"]).analyze();
  expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
});
