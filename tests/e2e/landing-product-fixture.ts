import type { Page } from "@playwright/test";
import type { InitiativeChoice, ProjectReview } from "../../lib/project-review";
import { installApiMocks, json } from "./api-mocks";

const now = "2026-09-03T00:00:00.000Z";
const base = { cycleId: "cycle-1", routineId: null, description: "", status: "in_progress", priority: "medium", cadence: "weekly", progress: 0, dueDate: "2026-09-07", source: "manual", archivedAt: null, archivedFromStatus: null, archiveRootId: null, assignments: [], createdAt: now, updatedAt: now };
const member = { id: "member-1", email: "minji@example.com", displayName: "김민지", role: "owner", status: "active", isCurrent: true, createdAt: now };
const assignment = (role: string) => [{ id: `assignment-${role}`, memberId: member.id, email: member.email, displayName: member.displayName, role }];
const items = [
  { ...base, id: "objective-1", parentId: null, kind: "objective", title: "첫 사용부터 가치를 경험하는 제품", progress: 30 },
  { ...base, id: "kr-1", parentId: "objective-1", kind: "key_result", title: "첫 핵심행동 완료율 30% → 45%", progress: 40 },
  { ...base, id: "kr-2", parentId: "objective-1", kind: "key_result", title: "신규 고객 7일 유지율 35% → 50%", progress: 20 },
  { ...base, id: "initiative-1", parentId: "kr-1", kind: "initiative", title: "첫 경험의 마찰 줄이기", progress: 35 },
  { ...base, id: "project-1", parentId: "initiative-1", kind: "project", title: "온보딩 흐름 개선", progress: 50, assignments: assignment("project_dri") },
  { ...base, id: "task-1", parentId: "project-1", kind: "task", title: "가입 안내 문구 정리", progress: 0, assignments: assignment("task_assignee") },
  { ...base, id: "task-2", parentId: "project-1", kind: "task", title: "첫 사용 흐름 검토", status: "todo", progress: 0, dueDate: "2026-09-08", assignments: assignment("task_assignee") },
];
const cycle = { id: "cycle-1", name: "3분기 고객 경험", department: "제품 팀", version: 1, startDate: "2026-07-01", endDate: "2026-09-30", status: "active", createdAt: now, updatedAt: now };
const workspace = { id: "workspace-1", name: "제품 팀", kind: "team", personal: false, role: "owner", current: true, deletionRequestedAt: null, scheduledDeletionAt: null, createdAt: now };
const routine = { id: "routine-1", title: "고객 피드백 확인", description: "고객의 목소리를 매일 확인합니다.", cadence: "daily", triggerPoint: "업무 시작 후", actionPlace: "고객 피드백 목록", actionSteps: "피드백 확인 후 개선 항목을 기록합니다.", systemKey: null, assigneeMemberId: member.id, active: true, completed: false, createdAt: now, updatedAt: now };

export async function installLandingProductFixture(page: Page) {
  await installApiMocks(page, { teamWorkspace: true, slackState: "connected" });
  const draft = {
    version: 1, message: "", mode: "project", guideQuestions: [], visibleFields: ["project"], okrTarget: null, targetCandidates: [],
    projectTarget: { initiativeId: "initiative-1", initiativeTitle: "첫 경험의 마찰 줄이기", cycleId: cycle.id, cycleName: cycle.name, keyResultTitle: items[1].title, objectiveTitle: items[0].title },
    projectDriMemberId: member.id, routineAssigneeMemberId: "", taskContainer: "", taskAssigneeMemberId: "",
    plan: { objectiveTitle: "", keyResults: [], targetInitiatives: [], unassignedInitiatives: [], project: "온보딩 흐름 개선", tasks: "가입 안내 문구 정리\n첫 사용 흐름 검토", taskParent: "", routineTitle: "", routineTrigger: "", routinePlace: "", routineSteps: "", routineCadence: "daily" },
    conversationHistory: [
      { id: "sample-user", role: "user", content: "첫 사용 중에 이탈하는 고객을 줄이고 싶어요. 가입 안내와 첫 사용 흐름을 개선하는 프로젝트로 정리해 주세요." },
      { id: "sample-assistant", role: "assistant", content: "‘온보딩 흐름 개선’으로 정리했습니다. ‘첫 경험의 마찰 줄이기’ Initiative에 연결하고, 가입 안내 문구와 첫 사용 흐름을 검토하는 두 가지 할 일로 나눴어요. 내용을 확인한 뒤 생성해 주세요." },
    ],
  };
  const initiative: InitiativeChoice = {
    id: "initiative-1", title: items[3].title, cycleId: cycle.id, cycleName: cycle.name,
    path: [items[0].title, items[1].title, items[3].title], description: "가입 후 첫 핵심행동까지의 흐름을 개선합니다.",
    keyResultDescription: items[1].title, objectiveDescription: items[0].title, fingerprint: "a".repeat(64),
    revision: { initiative: "1", keyResult: "1", objective: "1", cycleStatus: "active" },
  };
  const review: ProjectReview = {
    id: "10000000-0000-4000-8000-000000000001", version: "20000000-0000-4000-8000-000000000002", state: "pending", projectId: "project-draft",
    proposal: { title: items[4].title, description: "가입 안내 문구를 정리하고 첫 사용 흐름을 검토합니다. 변경된 화면의 QA까지 완료합니다.",
      status: "todo", priority: "high", cadence: "weekly", progress: 0, dueDate: "2026-09-15", driMemberId: member.id,
      workerMemberIds: [], properties: {}, templateId: null, requestedCycleId: null },
    recommendations: [{ initiativeId: initiative.id, reason: "가입과 첫 사용 흐름의 개선 범위가 이 Initiative와 맞는지 확인해 주세요." }],
    fieldLabels: { dri: member.displayName, workers: [], template: null, cycle: null }, templateVersion: null, templatePreview: null,
    requestHash: "fictional", propertyVersions: {}, createdAt: now, expiresAt: "2099-09-03T00:30:00Z", selectedParent: null,
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") return json(route, { draft: { payload: draft }, mocked: true });
    if (url.pathname === "/api/slack/status") return json(route, { slack: {
      connected: true, state: "connected", missingScopes: [], connectionScope: "workspace", distributionMode: "direct_oauth",
      teamName: workspace.name, teamId: "T-SAMPLE", connectedTeam: { id: "T-SAMPLE", name: workspace.name },
      connectedAt: now, updatedAt: now,
    } });
    if (url.pathname === "/api/slack/daily/settings") return json(route, {
      connected: true, teamName: workspace.name, needsReauthorization: false, setupComplete: true,
      settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], reminderTime: "09:00", timezone: "Asia/Seoul", installStatus: "connected", onboardingCompletedAt: now, lastSyncedAt: now, lastError: "" },
      channels: [{ id: "C-SAMPLE", name: "daily", isPrivate: false, isMember: true }],
      members: [{ memberId: member.id, displayName: member.displayName, email: member.email, linked: true, slackDisplayName: "minji", preference: { enabled: true, reminderTime: null, timezone: null }, reminder: { status: "scheduled", postAt: 4_092_796_800, error: "" } }],
      failedPublications: [],
    });
    if (url.pathname === "/api/workspace-management-bot") return json(route, {
      settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], reportTime: "09:30", timezone: "Asia/Seoul", channelId: "C-SAMPLE", channelName: "daily", signals: ["missing_due_date", "missing_owner", "overdue"], lastSentDate: null, lastSentAt: null, lastError: "", updatedAt: now },
      snapshot: { date: "2026-09-03", totalCount: 0, groups: [] }, slackConnected: true,
      channels: [{ id: "C-SAMPLE", name: "daily", isPrivate: false, isMember: true }],
    });
    if (url.pathname === "/api/slack/automations") return json(route, {
      automations: [{ id: "sample-changes", name: "Task updates", triggerType: "task_changed", active: true, channelId: "C-SAMPLE", channelName: "daily", statusFilter: "", messageTemplateKind: "default", messageTemplate: "", lastDeliveryStatus: "sent", lastError: "", createdAt: now, updatedAt: now }], deliveries: [],
    });
    if (url.pathname === "/api/project-reviews") return json(route, {
      review, workspaceName: workspace.name, existingProjectId: null, canApprove: true,
      recommendations: [{ ...review.recommendations[0], initiative }], candidates: { choices: [initiative], truncated: false },
      editor: { revision: "b".repeat(64), properties: [], members: [member], templates: [], cycles: [{ id: cycle.id, name: cycle.name }] },
    });
    if (url.pathname === "/api/bootstrap") return json(route, {
      user: { id: "user-1", email: member.email, displayName: member.displayName, provider: "local" },
      workspaces: [workspace], cycles: [cycle], items, routines: [routine], properties: [], propertyValues: {}, hiddenByProject: {}, archivedProjects: [],
      rules: { workspaceId: workspace.id, captureInstruction: "", structureInstruction: "", routineInstruction: "", defaultPriority: "medium", defaultCadence: "weekly", reviewBeforeCreate: true, configured: true, updatedAt: now },
      team: { workspace, currentRole: "owner", canManage: true, invitations: [], invitationEmailConfigured: false, members: [member] },
    });
    if (url.pathname === "/api/assistant-drafts") return json(route, { draft: { payload: draft } });
    if (url.pathname === "/api/routines") return json(route, { routines: [routine] });
    if (url.pathname === "/api/okr-files/cycle-1") return json(route, { file: {
      cycle, revision: "fictional-sample", objectiveCount: 1, needsSplit: false, initiativeOptions: [],
      objective: { ...items[0], clientId: "objective-1", keyResults: items.filter((item) => item.kind === "key_result").map((kr) => ({
        ...kr, clientId: kr.id, initiatives: kr.id === "kr-1" ? [{ ...items[3], clientId: "initiative-1", linkedProjects: [{ ...items[4], taskCount: 2, canTrash: false }] }] : [],
      })) },
    } });
    return route.fallback();
  });
}
