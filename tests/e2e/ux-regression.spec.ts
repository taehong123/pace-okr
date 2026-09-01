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
    kind: "personal",
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
    workspace: { id: "workspace-1", name: "테스트 워크스페이스", kind: "personal" },
    currentRole: "owner",
    canManage: true,
    invitations: [],
    invitationEmailConfigured: false,
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
    { ...baseItem, id: "initiative-2", parentId: "kr-1", kind: "initiative", title: "후속 실행 방향", progress: 0 },
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

async function installApiMocks(page: Page, options: { failItemCreate?: boolean; withoutTaskContainers?: boolean; slowRoutineRefresh?: boolean; skippedTeam?: boolean; slackState?: "platform_unavailable" | "workspace_disconnected" | "connected" | "reauthorization_required"; workspaceRole?: "owner" | "member" | "viewer" } = {}) {
  let krDataConnections: Array<Record<string, unknown>> = [];
  const assistantDrafts = new Map<string, unknown>();
  const baseBootstrapResponse = options.withoutTaskContainers
    ? { ...bootstrap, items: bootstrap.items.filter((entry) => entry.kind !== "project" && entry.kind !== "task") }
    : bootstrap;
  const workspaceRole = options.workspaceRole ?? "owner";
  const bootstrapResponse = {
    ...baseBootstrapResponse,
    workspaces: baseBootstrapResponse.workspaces.map((workspace) => ({ ...workspace, role: workspaceRole })),
    team: { ...baseBootstrapResponse.team, currentRole: workspaceRole, canManage: workspaceRole === "owner", members: baseBootstrapResponse.team.members.map((member) => ({ ...member, role: workspaceRole })) },
  };
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("okrptr.intro-language", "ko");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/bootstrap") return json(route, bootstrapResponse);
    if (url.pathname === "/api/assistant-drafts") {
      const key = url.searchParams.get("key") ?? "";
      if (request.method() === "GET") return json(route, { draft: assistantDrafts.has(key) ? { payload: assistantDrafts.get(key), updatedAt: now } : null });
      if (request.method() === "PUT") {
        assistantDrafts.set(key, (request.postDataJSON() as { payload: unknown }).payload);
        return json(route, { updatedAt: now });
      }
      assistantDrafts.delete(key);
      return json(route, { deleted: true });
    }
    if (url.pathname === "/api/okr-files/cycle-1" || url.pathname === "/api/okr-files" && request.method() === "POST") {
      const objective = bootstrapResponse.items.find((entry) => entry.id === "objective-1")!;
      const keyResult = bootstrapResponse.items.find((entry) => entry.id === "kr-1")!;
      const initiatives = bootstrapResponse.items.filter((entry) => entry.kind === "initiative");
      const project = bootstrapResponse.items.find((entry) => entry.id === "project-1")!;
      return json(route, { file: {
        cycle: url.pathname === "/api/okr-files" ? { ...bootstrapResponse.cycles[0], id: "cycle-new", name: "새 통합 OKR" } : bootstrapResponse.cycles[0],
        revision: request.method() === "GET" ? "test-revision" : "saved-revision",
        objectiveCount: 1,
        needsSplit: false,
        initiativeOptions: [],
        objective: {
          id: objective.id,
          clientId: objective.id,
          title: objective.title,
          status: objective.status,
          keyResults: [{
            id: keyResult.id,
            clientId: keyResult.id,
            title: keyResult.title,
            status: keyResult.status,
            progress: keyResult.progress,
            initiatives: initiatives.map((initiative) => ({
              id: initiative.id,
              clientId: initiative.id,
              title: initiative.title,
              status: initiative.status,
              linkedProjects: initiative.id === "initiative-1" ? [{
                id: project.id,
                title: project.title,
                parentId: initiative.id,
                cycleId: project.cycleId,
                taskCount: 1,
                canTrash: true,
                updatedAt: project.updatedAt,
              }] : [],
            })),
          }],
        },
      } });
    }
    if (url.pathname === "/api/invitations/preview") return json(route, { invitation: {
      workspace: { id: "workspace-invited", name: "초대받은 워크스페이스" },
      role: "member",
      inviterName: "관리자",
      emailHint: "ow***@example.com",
      status: "pending",
      expiresAt: "2026-09-30T00:00:00.000Z",
    } });
    if (url.pathname === "/api/invitations/accept") return json(route, { accepted: true, workspaceId: "workspace-invited", workspaceName: "초대받은 워크스페이스" });
    if (url.pathname === "/api/google/status") return json(route, { google: { configured: true, connected: false, email: null, displayName: null, scope: "", connectedAt: null, updatedAt: null } });
    if (url.pathname === "/api/slack/status") {
      const state = options.slackState ?? "workspace_disconnected";
      const connected = state === "connected" || state === "reauthorization_required";
      return json(route, { slack: {
        configured: state !== "platform_unavailable", connected, state,
        statusMessage: state === "platform_unavailable" ? "Slack 연결 설정이 아직 완료되지 않았습니다. 현재 이용자가 입력할 기술 설정은 없습니다." : state === "workspace_disconnected" ? "Owner 또는 Admin이 이 OKRPTR 워크스페이스에 사용할 Slack을 직접 선택하고 승인할 수 있습니다." : state === "reauthorization_required" ? "새 데일리 기능에 필요한 Slack 권한을 다시 승인해 주세요." : "고객 Slack A와 연결되어 데일리 알림을 설정할 수 있습니다.",
        missingScopes: state === "reauthorization_required" ? ["im:write"] : [], teamName: connected ? "테스트 Slack" : null, teamId: connected ? "T123" : null, botUserId: connected ? "U-BOT" : null, scope: connected ? "commands,chat:write,im:write,im:history,users:read,users:read.email,channels:read,groups:read" : "", connectedAt: connected ? now : null, updatedAt: connected ? now : null,
        connectionScope: "workspace", distributionMode: "direct_oauth", connectedTeam: connected ? { id: "T123", name: "고객 Slack A" } : null,
        redirectUrl: "https://okrptr.com/api/slack/callback", commandUrl: "https://okrptr.com/api/slack/commands", interactionUrl: "https://okrptr.com/api/slack/interactions", eventsUrl: "https://okrptr.com/api/slack/events",
      } });
    }
    if (url.pathname === "/api/slack/daily/preferences") return json(route, { linked: true, enabled: true, reminderTime: "09:00", timezone: "Asia/Seoul", usesWorkspaceTime: true, usesWorkspaceTimezone: true });
    if (url.pathname === "/api/slack/daily/settings") return json(route, {
      connected: true, teamName: "테스트 Slack", needsReauthorization: false,
      settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], reminderTime: "09:00", timezone: "Asia/Seoul", installStatus: "connected", lastSyncedAt: now, lastError: "" },
      channels: [{ id: "C123", name: "daily", isPrivate: false }],
      members: [{ memberId: "member-1", displayName: "테스트 사용자", email: "owner@example.com", linked: true, slackDisplayName: "test-owner", reminder: { status: "scheduled", postAt: 1788120000, error: "" } }],
      failedPublications: [],
    });
    if (url.pathname === "/api/slack/channels") return json(route, { channels: [{ id: "C123", name: "daily", isPrivate: false }] });
    if (url.pathname === "/api/slack/automations") return json(route, { automations: [], deliveries: [] });
    if (url.pathname === "/api/data-connections/sync" && request.method() === "POST") {
      const payload = request.postDataJSON() as { id: string };
      const connection = krDataConnections.find((entry) => entry.id === payload.id);
      if (!connection) return json(route, { error: "not found" }, 400);
      const progress = connection.targetKind === "project" ? 35 : 60;
      const updated = { ...connection, lastValue: progress, lastSyncStatus: "success", lastSyncedAt: now, nextSyncAt: now };
      krDataConnections = krDataConnections.map((entry) => entry.id === payload.id ? updated : entry);
      return json(route, { connection: updated, progress, value: progress });
    }
    if (url.pathname === "/api/data-connections") {
      if (request.method() === "GET") {
        const itemId = url.searchParams.get("itemId");
        return json(route, { connections: itemId ? krDataConnections.filter((entry) => entry.itemId === itemId) : krDataConnections });
      }
      if (request.method() === "POST") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        const connection = { id: `connection-${String(payload.itemId)}`, ...payload, lastValue: null, lastSyncStatus: "never", lastError: "", lastSyncedAt: null, nextSyncAt: now, createdAt: now, updatedAt: now };
        krDataConnections.push(connection);
        return json(route, { connection }, 201);
      }
      if (request.method() === "DELETE") {
        krDataConnections = krDataConnections.filter((entry) => entry.id !== url.searchParams.get("id"));
        return json(route, { deleted: true });
      }
    }
    if (url.pathname === "/api/okr-organize" && request.method() === "POST") {
      const requestPayload = request.postDataJSON() as { mode?: string };
      const projectMode = requestPayload.mode === "project";
      return json(route, {
        organized: {
          assistantMessage: projectMode ? "말씀하신 Project를 정리했습니다." : "말씀하신 Task를 정리했습니다.",
          questions: [],
          plan: {
            objectiveTitle: "",
            keyResults: [],
            targetInitiatives: [],
            unassignedInitiatives: [],
            project: projectMode ? "셀러 쇼핑몰 전체 오더 플로우 안정화 개발" : "",
            tasks: projectMode ? "" : "AI로 정리된 Task",
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
    if (url.pathname === "/api/daily-scrum" && request.method() === "GET") return json(route, {
      date: "2026-08-30",
      member: { id: "member-1", displayName: "테스트 사용자", email: "owner@example.com", role: "owner" },
      draft: { id: "draft-1", date: "2026-08-30", yesterdayNote: "", todayNote: "", blockersNote: "", noPlannedTasks: false, skipReason: null, skipNote: "", selectedTaskIds: [], source: "web", updatedAt: now },
      latestSubmission: null,
      candidates: { tasks: [{ id: "task-1", title: "오버레이 동작 점검", status: "todo", dueDate: "2026-09-03", parentKind: "project", parentId: "project-1", parentTitle: "모바일 사용성 개선" }], groups: [{ key: "project:project-1", kind: "project", id: "project-1", title: "모바일 사용성 개선", tasks: [{ id: "task-1", title: "오버레이 동작 점검", status: "todo", dueDate: "2026-09-03", parentKind: "project", parentId: "project-1", parentTitle: "모바일 사용성 개선" }] }] },
      createTargets: { projects: [{ id: "project-empty", title: "실행 항목 없는 Project", needsTask: true }], routines: [], allowGeneral: false },
      team: [
        { memberId: "member-1", displayName: "테스트 사용자", email: "owner@example.com", role: "owner", status: "missing", slackConnected: true, submission: null },
        options.skippedTeam
          ? { memberId: "member-2", displayName: "휴가 멤버", email: "leave@example.com", role: "member", status: "skipped", slackConnected: true, submission: { id: "submission-skip", memberId: "member-2", memberName: "휴가 멤버", memberEmail: "leave@example.com", date: "2026-08-30", version: 1, yesterdayNote: "", todayNote: "", blockersNote: "", noPlannedTasks: false, skipReason: "personal", skipNote: "병원 일정", source: "web", submittedAt: now, tasks: [] } }
          : { memberId: "member-2", displayName: "초안 멤버", email: "draft@example.com", role: "member", status: "writing", slackConnected: false, submission: null },
      ],
      legacyWorkspaceNote: { yesterdayNote: "", todayNote: "기존 공용 메모", blockersNote: "", updatedAt: now },
    });
    if (url.pathname === "/api/daily-scrum" && request.method() === "PUT") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      return json(route, {
        date: payload.date,
        member: { id: "member-1", displayName: "테스트 사용자", email: "owner@example.com", role: "owner" },
        draft: { id: "draft-1", date: payload.date, yesterdayNote: payload.yesterdayNote, todayNote: payload.todayNote, blockersNote: payload.blockersNote, noPlannedTasks: payload.noPlannedTasks, skipReason: payload.skipReason, skipNote: payload.skipNote, selectedTaskIds: payload.selectedTaskIds, source: "web", updatedAt: now },
        latestSubmission: null, candidates: { tasks: [], groups: [] }, createTargets: { projects: [], routines: [], allowGeneral: true }, team: [], legacyWorkspaceNote: null,
      });
    }
    if (url.pathname === "/api/daily-scrum/submit") return json(route, { submission: { id: "submission-1" } }, 201);
    if (url.pathname === "/api/daily-scrum/tasks") return json(route, { task: { ...baseItem, id: "new-task", parentId: "project-empty", kind: "task", title: "새 실행 Task" } }, 201);
    if (url.pathname === "/api/routines" && request.method() === "GET") {
      if (options.slowRoutineRefresh) await new Promise((resolve) => setTimeout(resolve, 800));
      return json(route, { routines: bootstrapResponse.routines });
    }
    if (url.pathname === "/api/trash") return json(route, { items: [], cleanupRecords: [] });
    return json(route, {});
  });
}

test.describe("개인 데일리와 팀 롤업", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.goto("/?view=scrum");
    await expect(page.locator(".daily-workspace")).toBeVisible({ timeout: 20_000 });
  });

  test("할당 Task 선택과 초안 저장은 Item API를 호출하지 않는다", async ({ page }) => {
    const itemMutations: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/items" && request.method() !== "GET") itemMutations.push(request.method());
    });
    await page.getByRole("checkbox", { name: "오버레이 동작 점검 선택", exact: true }).check();
    const saveRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/daily-scrum" && request.method() === "PUT");
    await page.getByRole("button", { name: "초안 저장" }).click();
    const payload = (await saveRequest).postDataJSON() as { selectedTaskIds: string[]; noPlannedTasks: boolean };
    expect(payload.selectedTaskIds).toEqual(["task-1"]);
    expect(payload.noPlannedTasks).toBe(false);
    expect(itemMutations).toEqual([]);
  });

  test("작성 중 초안은 내용 대신 상태만 공개한다", async ({ page }) => {
    const card = page.locator(".daily-member-card", { hasText: "초안 멤버" });
    await expect(card).toContainText("작성 중");
    await expect(card).toContainText("내용은 제출 후 공개됩니다");
    await expect(page.getByText("기존 공용 메모")).toBeHidden();
  });

  test("데일리 스킵 사유를 저장하고 공유 확정할 수 있다", async ({ page }) => {
    await page.getByRole("checkbox", { name: "오늘은 데일리를 스킵합니다" }).check();
    await page.getByLabel("데일리 스킵 사유").selectOption("other");
    await expect(page.getByLabel("데일리 스킵 상세 사유")).toHaveAttribute("required", "");
    await page.getByLabel("데일리 스킵 사유").selectOption("vacation");
    await page.getByLabel("데일리 스킵 상세 사유").fill("오후까지 휴가입니다.");
    await expect(page.getByRole("checkbox", { name: "오버레이 동작 점검 선택", exact: true })).toBeDisabled();
    const saveRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/daily-scrum" && request.method() === "PUT");
    await page.getByRole("button", { name: "초안 저장" }).click();
    const payload = (await saveRequest).postDataJSON() as { selectedTaskIds: string[]; noPlannedTasks: boolean; skipReason: string; skipNote: string };
    expect(payload).toMatchObject({ selectedTaskIds: [], noPlannedTasks: false, skipReason: "vacation", skipNote: "오후까지 휴가입니다." });
    const submitRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/daily-scrum/submit" && request.method() === "POST");
    await page.getByRole("button", { name: "스킵 확정 및 공유" }).click();
    await submitRequest;
  });

  test("확정된 스킵 사유만 팀 롤업에 공유한다", async ({ page }) => {
    await page.unroute("**/api/**");
    await installApiMocks(page, { skippedTeam: true });
    await page.reload();
    const card = page.locator(".daily-member-card", { hasText: "휴가 멤버" });
    await expect(card).toContainText("스킵");
    await expect(card).toContainText("개인 일정");
    await expect(card).toContainText("병원 일정");
  });

  test("DRI 무Task Project에서 명시적 Task 생성으로 진입한다", async ({ page }) => {
    await page.getByRole("button", { name: /실행 항목 없는 Project/ }).click();
    await expect(page.getByLabel("새 Task 상위 항목")).toHaveValue("project:project-empty");
    await page.getByLabel("새 Task 제목").fill("새 실행 Task");
    const createRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/daily-scrum/tasks");
    await page.getByRole("button", { name: "Task 생성" }).click();
    expect((await createRequest).postDataJSON()).toMatchObject({ title: "새 실행 Task", parentKind: "project", parentId: "project-empty" });
  });

  test("390px에서 가로 넘침이 없고 핵심 컨트롤이 접근 가능하다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const results = await new AxeBuilder({ page: page as never }).include(".daily-workspace").analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("독립 앱 연동 화면", () => {
  test("연결 전에는 이해 가능한 단일 Slack CTA를 제공한다", async ({ page }) => {
    await installApiMocks(page, { slackState: "workspace_disconnected" });
    await page.goto("/?view=integrations");
    await expect(page).toHaveURL(/view=integrations/);
    await expect(page.getByRole("heading", { name: "앱 연동" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Slack 데일리 봇" })).toBeVisible();
    await expect(page.getByRole("button", { name: "내 Slack 워크스페이스에 연결" })).toBeVisible();
    await expect(page.getByText("고객 워크스페이스를 직접 선택합니다.")).toBeVisible();
    await expect(page.getByText("준비 중", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "앱 연동" })).toHaveCount(0);
  });

  test("서비스 설정 오류에는 죽은 버튼 대신 설명과 재확인을 제공한다", async ({ page }) => {
    await installApiMocks(page, { slackState: "platform_unavailable" });
    await page.goto("/?view=integrations");
    await expect(page.getByText("서비스 설정 확인 필요", { exact: true })).toBeVisible();
    await expect(page.getByText(/현재 이용자가 입력할 기술 설정은 없습니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 확인" })).toBeVisible();
    await expect(page.getByRole("button", { name: "내 Slack 워크스페이스에 연결" })).toHaveCount(0);
  });

  test("Slack 관리자 승인과 중복 연결 오류를 구체적으로 안내한다", async ({ page }) => {
    await installApiMocks(page, { slackState: "workspace_disconnected" });
    await page.goto("/?view=integrations&slack=slack_admin_approval_required");
    const oauthAlert = page.locator(".slack-service-card .integration-state-message[role='alert']");
    await expect(oauthAlert).toContainText("Slack 관리자 승인이 필요합니다");
    await expect(oauthAlert).toContainText("앱 설치 정책");
    await page.goto("/?view=integrations&slack=workspace_already_connected");
    await expect(oauthAlert).toContainText("이미 다른 OKRPTR 워크스페이스에 연결된 Slack입니다");
  });

  test("일반 멤버는 공용 연결 대신 개인 Slack 설정만 사용한다", async ({ page }) => {
    await installApiMocks(page, { slackState: "connected", workspaceRole: "member" });
    await page.goto("/?view=integrations");
    await expect(page.getByText("고객 Slack A 워크스페이스가 연결되어 있습니다.")).toBeVisible();
    await expect(page.getByText("내 Slack 계정이 연결되었습니다")).toBeVisible();
    await expect(page.getByRole("button", { name: "연결 해제" })).toHaveCount(0);
  });

  test("연결 후 5단계 설정이 페이지 스크롤로 모두 접근 가능하다", async ({ page, isMobile }) => {
    await installApiMocks(page, { slackState: "connected" });
    await page.goto("/?view=integrations");
    for (const heading of ["Slack 워크스페이스 연결", "사용자 이메일 연결 상태", "개인 데일리 알림 시간", "팀 공유 채널", "테스트 DM과 작동 확인"]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "테스트 DM" })).toBeVisible();
    await expect(page.getByText("고객 Slack A 워크스페이스가 연결되어 있습니다.")).toBeVisible();
    const metrics = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    if (isMobile) expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    const results = await new AxeBuilder({ page: page as never }).include(".integrations-page").analyze();
    expect(results.violations).toEqual([]);
  });
});

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
  await expect(page.getByText("Routine을 불러오는 중입니다", { exact: true })).toHaveCount(0);
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
  await expect(routineDialog.getByLabel("Routine 담당자")).toHaveValue("");
  await expect(routineDialog.getByText("Initiative", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(routineDialog).toBeHidden();
});

test("Project 생성창 닫기는 현재 화면을 유지하고 AI 대화 초안은 다시 열린다", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/?view=work");

  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "새 항목" });
  await createDialog.getByRole("button", { name: "새 항목 닫기" }).click();
  await expect(createDialog).toBeHidden();
  await expect(page).toHaveURL(/view=work/);

  await page.getByRole("button", { name: "AI 대화로 추가", exact: true }).click();
  const assistant = page.getByRole("region", { name: "Project 도우미" });
  await assistant.getByLabel("메시지", { exact: true }).fill("셀러 쇼핑몰 전체 오더 플로우 안정화 개발");
  await assistant.getByRole("button", { name: "메시지 보내기" }).click();
  await expect(assistant.getByLabel("Project", { exact: true })).toHaveValue("셀러 쇼핑몰 전체 오더 플로우 안정화 개발");
  await expect(assistant.getByText("임시저장됨")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const fieldsFit = await assistant.locator(".home-draft-fields input, .home-draft-fields select, .home-draft-fields textarea").evaluateAll((fields) => fields.every((field) => {
    const fieldBox = field.getBoundingClientRect();
    const panelBox = field.closest(".home-draft-fields")?.getBoundingClientRect();
    return Boolean(panelBox && fieldBox.left >= panelBox.left - 1 && fieldBox.right <= panelBox.right + 1);
  }));
  expect(fieldsFit).toBe(true);

  await page.getByRole("button", { name: "Project", exact: true }).first().click();
  await page.getByRole("button", { name: "AI 대화로 추가", exact: true }).click();
  const restoredAssistant = page.getByRole("region", { name: "Project 도우미" });
  await expect(restoredAssistant.getByLabel("Project", { exact: true })).toHaveValue("셀러 쇼핑몰 전체 오더 플로우 안정화 개발");
  await expect(restoredAssistant.getByText("임시저장됨")).toBeVisible();
});

test("OKR 파일 요청 실패는 무한 로딩 대신 다시 시도를 제공한다", async ({ page }) => {
  await installApiMocks(page);
  let attempts = 0;
  await page.route("**/api/okr-files/cycle-1**", async (route) => {
    attempts += 1;
    await json(route, { error: "일시적인 연결 오류" }, 503);
  });
  await page.goto("/?view=okr");
  await expect(page.getByText("파일을 열지 못했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => attempts).toBe(2);
});

test("OKR 파일은 30초 안에 다시 열면 캐시를 즉시 사용한다", async ({ page }) => {
  await installApiMocks(page);
  let readRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/okr-files/cycle-1" && url.searchParams.get("mode") === "read" && request.method() === "GET") readRequests += 1;
  });
  await page.goto("/?view=okr");
  await expect(page.getByRole("heading", { name: "2026 하반기" })).toBeVisible();
  expect(readRequests).toBe(1);
  await page.getByRole("button", { name: "Project", exact: true }).first().click();
  await page.getByRole("button", { name: "OKR", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "2026 하반기" })).toBeVisible();
  await expect(page.getByText("OKR 파일을 불러오는 중")).toHaveCount(0);
  expect(readRequests).toBe(1);
});

test("모바일 Project 기본 보기는 카드이며 페이지가 가로로 넘치지 않는다", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installApiMocks(page);
  await page.goto("/?view=work");
  await expect(page.getByRole("tab", { name: "카드" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("list", { name: "Project 카드 목록" })).toBeVisible();
  await expect(page.locator(".project-card .type-icon")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Project 필터" })).toContainText("필터");
  await expect(page.getByRole("button", { name: "Project 정렬" })).toContainText("정렬");
  await expect(page.getByRole("button", { name: "Project 속성 관리" })).toContainText("속성");
  await expect(page.getByRole("checkbox", { name: /Project .* 삭제 선택/ })).toHaveCount(0);
  await page.getByRole("button", { name: "선택", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Project .* 삭제 선택/ })).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("모바일 Task 완료 체크는 작게 보이고 삭제 선택은 선택 모드에서만 나타난다", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installApiMocks(page);
  await page.goto("/?view=inbox");
  const completion = page.getByRole("button", { name: "오버레이 동작 점검 완료" });
  await expect(completion).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Task .* 삭제 선택/ })).toHaveCount(0);
  const visualSize = await completion.evaluate((element) => getComputedStyle(element, "::before").width);
  expect(visualSize).toBe("17px");
  await page.getByRole("button", { name: "선택", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Task .* 삭제 선택/ })).toHaveCount(1);
});

test("OKR 파일 정보와 O·KR·Initiative를 저장 한 번으로 수정한다", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/?view=okr");
  await page.getByRole("button", { name: "파일 수정" }).click();
  await page.getByLabel("파일명").fill("2026 통합 OKR");
  await page.getByPlaceholder("이번 주기에 달성할 하나의 목표").fill("고객이 첫날 핵심 가치를 경험한다");
  await page.getByPlaceholder("측정 가능한 핵심 결과").fill("첫날 활성화율을 60%로 높인다");
  const saveRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/okr-files/cycle-1" && request.method() === "PUT");
  await page.getByRole("button", { name: "전체 저장" }).click();
  const payload = (await saveRequest).postDataJSON() as { expectedRevision: string; metadata: { name: string }; objective: { title: string; keyResults: Array<{ title: string }> } };
  expect(payload.expectedRevision).toBe("test-revision");
  expect(payload.metadata.name).toBe("2026 통합 OKR");
  expect(payload.objective.title).toBe("고객이 첫날 핵심 가치를 경험한다");
  expect(payload.objective.keyResults[0].title).toBe("첫날 활성화율을 60%로 높인다");
});

test("새 OKR 파일은 저장 전에는 서버에 생성하지 않는다", async ({ page }) => {
  await installApiMocks(page);
  const creates: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/okr-files" && request.method() === "POST") creates.push(request.method());
  });
  await page.goto("/?view=okr");
  await page.getByRole("button", { name: "목록보기" }).click();
  await page.getByRole("button", { name: "새로 만들기" }).click();
  await page.getByLabel("파일명").fill("새 통합 OKR");
  await page.getByPlaceholder("이번 주기에 달성할 하나의 목표").fill("신규 목표");
  await page.getByPlaceholder("측정 가능한 핵심 결과").fill("신규 핵심 결과");
  expect(creates).toEqual([]);
  const createRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/okr-files" && request.method() === "POST");
  await page.getByRole("button", { name: "전체 저장" }).click();
  const payload = (await createRequest).postDataJSON() as { expectedRevision: null; objective: { keyResults: unknown[] } };
  expect(payload.expectedRevision).toBeNull();
  expect(payload.objective.keyResults).toHaveLength(1);
  expect(creates).toEqual(["POST"]);
});

test("Initiative 삭제 저장 전에 연결 Project 처리 결정을 요구한다", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/?view=okr");
  await page.getByRole("button", { name: "파일 수정" }).click();
  const initiative = page.locator(".okr-file-initiative-editor").filter({ hasText: "핵심 흐름 개편" });
  await initiative.getByRole("button", { name: "Initiative 삭제" }).click();
  await expect(page.getByText("연결 Project 정리 필요")).toBeVisible();
  await page.getByRole("button", { name: "전체 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("이동 또는 휴지통 처리를 선택");
  await page.locator(".okr-project-resolutions label").filter({ hasText: "모바일 사용성 개선" }).locator("select").selectOption("move:initiative-2");
  const saveRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/okr-files/cycle-1" && request.method() === "PUT");
  await page.getByRole("button", { name: "전체 저장" }).click();
  await page.getByRole("dialog", { name: "OKR 파일 변경사항 저장" }).getByRole("button", { name: "전체 변경 저장" }).click();
  const payload = (await saveRequest).postDataJSON() as { projectResolutions: Array<{ projectId: string; action: string; targetInitiativeRef: string }> };
  expect(payload.projectResolutions).toEqual([{ projectId: "project-1", action: "move", targetInitiativeRef: "initiative-2" }]);
});

test("Viewer는 OKR 파일 전체 편집을 열 수 없다", async ({ page }) => {
  await installApiMocks(page, { workspaceRole: "viewer" });
  await page.goto("/?view=okr");
  await expect(page.getByRole("button", { name: "파일 수정" })).toHaveCount(0);
  await expect(page.getByRole("article")).toBeVisible();
});

test("KR과 Project 데이터는 각 대상 진행률만 갱신한다", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/?view=okr");
  const objectiveSurface = page.locator(".okr-file-read-objective");
  const keyResultSurface = page.locator(".okr-file-read-kr").first();
  await expect(objectiveSurface).not.toContainText("50%");
  await expect(keyResultSurface.locator(".okr-tree-progress")).toHaveText("45%");
  await expect(page.locator(".okr-file-read-initiative")).toHaveCount(0);
  await expect(page.locator(".okr-file-read-surface")).not.toContainText("할 일");
  await page.getByRole("button", { name: /활성 사용자 20% 증가/ }).click();
  await expect(page.locator(".okr-file-read-initiative")).toHaveCount(2);
  await page.getByRole("button", { name: /핵심 흐름 개편/ }).click();
  await expect(page.getByText("모바일 사용성 개선", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /모바일 사용성 개선.*Task 1개/ }).click();
  const taskDisclosure = page.getByRole("button", { name: /오버레이 동작 점검/ });
  await expect(taskDisclosure).toBeVisible();
  expect(await taskDisclosure.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator(".okr-file-read-surface")).not.toContainText("40%");

  await page.goto("/?view=data");
  await expect(page.getByRole("heading", { name: "데이터" })).toBeVisible();
  const krCard = page.locator(".kr-data-card").filter({ hasText: "활성 사용자 20% 증가" });
  const projectCard = page.locator(".kr-data-card").filter({ hasText: "모바일 사용성 개선" });
  await expect(krCard).toContainText("아직 연결된 데이터가 없습니다.");
  await krCard.getByRole("button", { name: "이 KR에 API 연결" }).click();
  let panel = page.getByRole("dialog", { name: "API 연결" });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await krCard.getByRole("button", { name: "이 KR에 API 연결" }).click();
  panel = page.getByRole("dialog", { name: "API 연결" });
  await panel.getByLabel("데이터 소스 이름").fill("활성 사용자 API");
  await panel.getByLabel("API URL").fill("https://api.example.com/metrics/active-users");
  await panel.getByLabel("숫자 값 경로").fill("data.value");
  await panel.getByLabel("목표값").fill("1000");
  await panel.getByRole("button", { name: "연결 저장" }).click();
  await expect(krCard).toContainText("활성 사용자 API");
  await krCard.getByRole("button", { name: "지금 업데이트" }).click();
  await expect(krCard).toContainText("60%");
  await expect(projectCard).toContainText("0%");

  await projectCard.getByRole("button", { name: "이 Project에 API 연결" }).click();
  panel = page.getByRole("dialog", { name: "API 연결" });
  await panel.getByLabel("데이터 소스 이름").fill("Project 품질 API");
  await panel.getByLabel("API URL").fill("https://api.example.com/metrics/project-quality");
  await panel.getByLabel("목표값").fill("100");
  await panel.getByRole("button", { name: "연결 저장" }).click();
  await projectCard.getByRole("button", { name: "지금 업데이트" }).click();
  await expect(projectCard).toContainText("35%");
  await expect(krCard).toContainText("60%");

  await page.goto("/?view=work");
  await page.getByRole("button", { name: /모바일 사용성 개선/ }).first().click();
  await expect(page.locator(".project-linked-data")).toContainText("Project 품질 API");
});

test("핵심 화면은 axe 자동 접근성 검사에서 치명적 위반이 없다", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/?view=work");
  const results = await new AxeBuilder({ page: page as never }).disableRules(["color-contrast"]).analyze();
  expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
});

test("초대 링크에서 워크스페이스를 확인한 뒤 명시적으로 가입한다", async ({ page }) => {
  await installApiMocks(page);
  const token = "a".repeat(64);
  await page.goto(`/#invite=${token}`);
  const dialog = page.getByRole("dialog", { name: "워크스페이스 초대" });
  await expect(dialog).toContainText("초대받은 워크스페이스");
  await expect(dialog).toContainText("ow***@example.com");
  const acceptRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/invitations/accept");
  await dialog.getByRole("button", { name: "이 워크스페이스에 가입" }).click();
  expect((await acceptRequest).postDataJSON()).toEqual({ token });
});
