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

const generalRoutine = {
  id: "routine-general",
  title: "General",
  description: "",
  cadence: "daily",
  triggerPoint: "",
  actionPlace: "",
  actionSteps: "",
  systemKey: "general",
  assigneeMemberId: null,
  active: true,
  completed: false,
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
  routines: [generalRoutine],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installApiMocks(page: Page, options: { failItemCreate?: boolean; withoutTaskContainers?: boolean; slowRoutineRefresh?: boolean } = {}) {
  const bootstrapResponse = options.withoutTaskContainers
    ? { ...bootstrap, items: bootstrap.items.filter((entry) => entry.kind !== "project" && entry.kind !== "task") }
    : bootstrap;
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("okrptr.intro-language", "ko");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/bootstrap") return json(route, bootstrapResponse);
    if (url.pathname === "/api/okr-organize" && request.method() === "POST") {
      return json(route, {
        organized: {
          assistantMessage: "말씀하신 Task를 정리했습니다.",
          questions: [],
          plan: {
            objectiveTitle: "",
            keyResults: [],
            targetInitiatives: [],
            unassignedInitiatives: [],
            project: "",
            tasks: "AI로 정리된 Task",
            taskParent: "",
            routineTitle: "",
            routineTrigger: "",
            routinePlace: "",
            routineSteps: "",
            routineCadence: "daily",
          },
        },
      });
    }
    if (url.pathname === "/api/items" && request.method() === "POST" && options.failItemCreate) {
      return json(route, { error: "서버 저장 실패" }, 500);
    }
    if (url.pathname === "/api/project-documents") {
      return json(route, { document: { id: "document-1", projectId: "project-1", content: "[]", plainText: "", version: 1, updatedAt: now } });
    }
    if (url.pathname === "/api/project-templates") return json(route, { templates: [] });
    if (url.pathname === "/api/checklists") return json(route, { items: [] });
    if (url.pathname === "/api/recommendations") return json(route, { recommendations: [] });
    if (url.pathname === "/api/routines" && request.method() === "GET") {
      if (options.slowRoutineRefresh) await new Promise((resolve) => setTimeout(resolve, 800));
      return json(route, { routines: bootstrapResponse.routines });
    }
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
    await page.getByRole("button", { name: "직접 추가", exact: true }).click();
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
  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "새 항목" });
  const title = dialog.getByLabel("이름");
  const container = dialog.getByLabel("연결 대상 · 선택 사항");
  await expect(container).toHaveValue("");
  await expect(container.locator("option:checked")).toHaveText("선택 안 함 — General에 저장");
  await title.fill("서버에 저장되지 않은 Task");
  await dialog.getByRole("button", { name: "만들기" }).click();
  await expect(dialog.getByRole("alert")).toContainText("서버 저장 실패");
  await expect(title).toHaveValue("서버에 저장되지 않은 Task");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("연결할 Project·Routine이 없으면 직접 추가와 AI 추가 모두 General 안내를 표시한다", async ({ page }) => {
  await installApiMocks(page, { withoutTaskContainers: true, slowRoutineRefresh: true });
  await page.goto("/?view=inbox");

  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "새 항목" });
  await expect(dialog.getByLabel("연결 대상 · 선택 사항")).toHaveCount(0);
  await expect(dialog.getByText("연결할 Project·Routine이 없어 General(기본)에 저장됩니다.", { exact: true })).toBeVisible();
  await dialog.getByLabel("이름").fill("General 저장 확인");
  await expect(dialog.getByRole("button", { name: "만들기" })).toBeEnabled();
  await dialog.getByRole("button", { name: "새 항목 닫기" }).click();
  await page.getByRole("alertdialog", { name: "변경사항을 버릴까요?" }).getByRole("button", { name: "변경사항 버리기" }).click();

  await page.getByRole("button", { name: "AI 대화로 추가", exact: true }).click();
  await page.getByRole("textbox", { name: "메시지" }).fill("AI로 Task를 정리해 주세요");
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  await expect(page.getByLabel("Task 초안")).toHaveValue("AI로 정리된 Task");
  await expect(page.getByLabel("연결 대상 · 선택 사항")).toHaveCount(0);
  await expect(page.getByText("연결할 Project·Routine이 없어 General(기본)에 저장됩니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Task 1개 만들기" })).toBeEnabled();

  await page.goto("/?view=routines");
  await expect(page.getByText("루틴을 불러오는 중입니다", { exact: true })).toHaveCount(0);
  const generalCard = page.getByRole("article").filter({ hasText: "General" });
  await expect(generalCard).toContainText("General");
  await expect(generalCard.getByText("기본", { exact: true })).toBeVisible();
  await expect(generalCard).toContainText("Project·Routine에 연결하지 않은 Task가 모이는 기본 목록");
});

test("Project·Task·Routine 추가 진입과 AI 도우미를 같은 구조로 제공한다", async ({ page, isMobile }) => {
  await installApiMocks(page);
  const flows = [
    { view: "work", helper: "Project 도우미" },
    { view: "inbox", helper: "Task 도우미" },
    { view: "routines", helper: "Routine 도우미" },
  ];

  for (const flow of flows) {
    await page.goto(`/?view=${flow.view}`);
    const aiButton = page.getByRole("button", { name: "AI 대화로 추가", exact: true });
    const directButton = page.getByRole("button", { name: "직접 추가", exact: true });
    await expect(aiButton).toBeVisible();
    await expect(directButton).toBeVisible();
    if (isMobile) {
      expect((await aiButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((await directButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await aiButton.click();
    await expect(page.getByRole("region", { name: flow.helper })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }

  await page.goto("/?view=routines");
  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  const routineDialog = page.getByRole("dialog", { name: "새 Routine" });
  await expect(routineDialog.getByLabel("반복 주기")).toHaveValue("daily");
  await expect(routineDialog.getByLabel("루틴 담당자")).toHaveValue("");
  await expect(routineDialog.getByText("Initiative", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(routineDialog).toBeHidden();
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
