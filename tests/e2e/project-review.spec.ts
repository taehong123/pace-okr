import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { InitiativeChoice, ProjectReview } from "../../lib/project-review";
import type { ProjectReviewEditor } from "../../lib/project-review-editor";

const id = "10000000-0000-4000-8000-000000000001";
const path = `/project-review?id=${id}&workspaceId=review-test`;
const choice = (id: string, title: string): InitiativeChoice => ({
  id, title, cycleId: "cycle", cycleName: "3분기 제품 개선", path: ["고객 경험", "가입 활성화 40%", title],
  description: "처음 사용하는 고객의 완료 경험을 개선합니다.", keyResultDescription: "첫 핵심행동 완료율", objectiveDescription: "고객의 첫 성공을 돕는다",
  fingerprint: "a".repeat(64), revision: { initiative: "1", keyResult: "1", objective: "1", cycleStatus: "active" },
});
const recommended = choice("recommendation", "첫 경험 단순화");
const alternative = choice("alternative", "결제 실패 감소");
const crossFile = { ...choice("cross-file", "재방문 개선"), cycleId: "next", cycleName: "4분기 성장" };
const editor: ProjectReviewEditor = {
  revision: "b".repeat(64),
  properties: ([
    ["budget", "예산", "number"], ["note", "메모", "text"], ["category", "분류", "select"], ["date", "출시일", "date"],
    ["check", "검토됨", "checkbox"], ["member", "검토자", "member"], ["members", "협업자", "members"],
  ] as const).map(([id, name, type], index) => ({ id, name, type, options: type === "select" ? ["제품", "운영"] : [], systemKey: null, sortOrder: index, version: "1" })),
  members: [{ id: "me", displayName: "태홍" }, { id: "peer", displayName: "민지" }],
  templates: [{ id: "template", name: "개발 계획", preview: "목표 / 완료 기준 / 검증 방법", version: "1" }, { id: "other-template", name: "운영 계획", preview: "운영 체크", version: "1" }],
  cycles: [{ id: "cycle", name: "3분기 제품 개선" }, { id: "next", name: "4분기 성장" }],
};
const consent = (page: Page) => page.getByRole("checkbox", { name: "위 내용과 선택한 Initiative 연결을 확인했습니다." });
const createButton = (page: Page) => page.getByRole("button", { name: "확인한 내용으로 Project 생성" });

async function mockReview(page: Page, options: { single?: boolean; getStatus?: number; failSave?: boolean; invalidSave?: boolean; loseResponse?: boolean; searchError?: boolean; readOnly?: boolean } = {}) {
  const review: ProjectReview = {
    id, version: "20000000-0000-4000-8000-000000000002", state: "pending", projectId: "test-project",
    proposal: { title: "결제 화면 개편", description: "결제 오류를 줄이고 QA를 완료합니다.", status: "todo", priority: "high", cadence: "weekly", progress: 0,
      dueDate: "2026-09-15", driMemberId: "me", workerMemberIds: ["peer"], properties: { 예산: 7 }, templateId: "template", requestedCycleId: null },
    recommendations: [{ initiativeId: recommended.id, reason: "고객 이탈 개선과 관련이 있을 수 있어 검토가 필요합니다." }],
    fieldLabels: { dri: "태홍", workers: ["민지"], template: "개발 계획", cycle: null }, templateVersion: "version", templatePreview: "목표 / 완료 기준 / 검증 방법",
    requestHash: "test", propertyVersions: {}, createdAt: "2026-09-02T00:00:00Z", expiresAt: "2099-09-02T00:30:00Z", selectedParent: null,
  };
  const state = { review, posts: [] as Record<string, unknown>[], queries: [] as string[], modes: [] as string[], errors: [] as string[] };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/project-reviews**", async (route) => {
    const request = route.request();
    expect(request.headers()["x-okrptr-workspace-id"]).toBe("review-test");
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.posts.push(body);
      if (options.failSave) {
        state.review = { ...state.review, state: "failed" };
        return route.fulfill({ status: 409, json: { error: "전체 생성을 취소했습니다.", code: "creation_rolled_back" } });
      }
      if (options.invalidSave) return route.fulfill({ status: 409, json: { error: "선택지가 변경됐습니다.", code: "editor_changed", editor: { ...editor, revision: "c".repeat(64) }, fieldErrors: { "properties.분류": "최신 선택지를 확인해 주세요." } } });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const proposal = (body.proposal ?? state.review.proposal) as ProjectReview["proposal"];
      state.review = { ...state.review, proposal, fieldLabels: { dri: editor.members.find((m) => m.id === proposal.driMemberId)?.displayName ?? null, workers: proposal.workerMemberIds.map((id) => editor.members.find((m) => m.id === id)!.displayName), template: editor.templates.find((t) => t.id === proposal.templateId)?.name ?? null, cycle: null },
        state: body.decision === "cancel" ? "cancelled" : "created", selectedParent: body.initiativeId === crossFile.id ? crossFile : body.initiativeId === alternative.id ? alternative : recommended };
      if (options.loseResponse) return route.abort("failed");
      return route.fulfill({ json: { review: state.review } });
    }
    if (options.getStatus) return route.fulfill({ status: options.getStatus, json: { error: options.getStatus === 410 ? "확인 요청이 만료됐습니다." : "이 계정에서 확인할 요청이 없습니다." } });
    const query = new URL(request.url()).searchParams.get("q") ?? "";
    const mode = new URL(request.url()).searchParams.get("mode") ?? "";
    state.modes.push(mode);
    state.queries.push(query);
    if (mode === "candidates" && options.searchError) return route.fulfill({ status: 500, json: { error: "후보 검색 실패" } });
    const candidates = { choices: options.single ? [recommended] : new URL(request.url()).searchParams.get("cycleId") === "next" ? [crossFile] : query === "없음" ? [] : query ? [alternative] : [recommended, alternative], truncated: false };
    if (mode === "candidates") return route.fulfill({ json: { candidates } });
    return route.fulfill({ json: { review: state.review, workspaceName: "검증 워크스페이스", existingProjectId: null,
      recommendations: [{ ...review.recommendations[0], initiative: recommended }],
      editor, candidates, canApprove: !options.readOnly } });
  });
  await page.goto(path);
  return state;
}

test("a single recommendation is never preselected and defer creates nothing", async ({ page }) => {
  const state = await mockReview(page, { single: true });
  await expect(page.getByRole("radio")).toHaveCount(1);
  await expect(page.getByRole("radio")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "확인한 내용으로 Project 생성" })).toBeDisabled();
  await page.getByRole("button", { name: "맞는 후보 없음 · 생성 보류" }).click();
  await expect(page.getByRole("status")).toContainText("생성하지 않았습니다");
  expect(state.posts).toEqual([]);
});

test("search and choose another Initiative, review fields, then create only once", async ({ page }) => {
  const state = await mockReview(page);
  await page.getByLabel("다른 Initiative 검색").fill("결제");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("radio", { name: /결제 실패 감소/ })).toBeVisible();
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  const create = page.getByRole("button", { name: "확인한 내용으로 Project 생성" });
  await expect(create).toBeDisabled();
  await expect(page.locator(".review-summary")).toContainText("태홍");
  await expect(page.locator(".review-summary")).toContainText("2026-09-15");
  await page.getByText("적용할 템플릿 본문 미리보기", { exact: true }).click();
  await expect(page.getByText("목표 / 완료 기준 / 검증 방법", { exact: true })).toBeVisible();
  await consent(page).check();
  await create.click({ clickCount: 2 });
  await expect(page.getByRole("heading", { name: "확인한 내용으로 생성했습니다" })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({ decision: "approve", initiativeId: "alternative", confirmed: true, id });
  expect(state.queries).toContain("결제");
});

test("changing choice resets final consent and cancel is not creation", async ({ page }) => {
  const state = await mockReview(page);
  await page.getByRole("radio", { name: /첫 경험 단순화/ }).check();
  await consent(page).check();
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  await expect(consent(page)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "확인한 내용으로 Project 생성" })).toBeDisabled();
  await page.getByRole("button", { name: "요청 취소" }).click();
  await expect(page.getByRole("heading", { name: "생성을 취소했습니다" })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.posts[0].decision).toBe("cancel");
});

test("a failed save stays failed and cannot be resubmitted from the page", async ({ page }) => {
  const state = await mockReview(page, { failSave: true });
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  await consent(page).check();
  await page.getByRole("button", { name: "확인한 내용으로 Project 생성" }).click();
  await expect(page.getByRole("alert")).toContainText("전체 생성을 취소");
  await expect(page.getByRole("heading", { name: "저장 결과 확인이 필요합니다" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인한 내용으로 Project 생성" })).toHaveCount(0);
  await page.getByRole("button", { name: "처리 결과 확인" }).click();
  expect(state.posts).toHaveLength(1);
});

for (const status of [401, 403, 410]) test(`HTTP ${status} has a safe login/error state without a creation form`, async ({ page }) => {
  const state = await mockReview(page, { getStatus: status });
  if (status === 401) await expect(page.getByRole("link", { name: "Google로 로그인하고 계속" })).toHaveAttribute("href", /returnTo=/);
  else await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "확인한 내용으로 Project 생성" })).toHaveCount(0);
  expect(state.posts).toEqual([]);
});

test("review form remains readable in all themes and has accessible controls", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const state = await mockReview(page);
  await expect(page.getByRole("heading", { name: "생성 전에 연결과 내용을 확인해 주세요" })).toBeVisible();
  for (const theme of ["white", "beige", "gray", "dark", "neon", "cyberpunk"]) {
    await page.evaluate((name) => document.documentElement.setAttribute("data-theme", name), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const violations = (await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).include(".project-review-page").analyze()).violations;
    expect(violations, theme).toEqual([]);
    expect(await page.getByLabel("다른 Initiative 검색").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.getByRole("button", { name: "확인한 내용으로 Project 생성" }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    if (theme === "beige" || theme === "dark") await page.screenshot({ path: testInfo.outputPath(`project-review-${theme}.png`), fullPage: true });
  }
  expect(state.errors).toEqual([]);
});

test("edits all fields and seven property types before explicitly choosing another OKR file", async ({ page }) => {
  const state = await mockReview(page);
  await page.getByLabel("Project 제목 (필수)").fill("수정된 결제 Project");
  await page.getByLabel("설명 · 범위와 완료 기준").fill("수정한 완료 기준");
  await page.getByLabel("책임자", { exact: true }).selectOption("peer");
  await page.getByLabel("참여자", { exact: true }).selectOption(["me"]);
  await page.getByLabel("기한", { exact: true }).fill("2026-10-15");
  await page.getByLabel("상태", { exact: true }).selectOption("in_progress");
  await page.getByLabel("우선순위", { exact: true }).selectOption("urgent");
  await expect(page.getByLabel(/검토 주기|스프린트|예상 시간|예상 기간|^시기$/)).toHaveCount(0);
  await expect(page.locator(".review-summary")).not.toContainText("검토 주기");
  await page.getByLabel("진행률 (%)", { exact: true }).fill("25");
  await page.getByLabel("본문 템플릿", { exact: true }).selectOption("other-template");
  await page.getByLabel("예산", { exact: true }).fill("0");
  await page.getByLabel("메모", { exact: true }).fill("유지할 메모");
  await page.getByLabel("분류", { exact: true }).selectOption("운영");
  await page.getByLabel("출시일", { exact: true }).fill("2026-10-01");
  await page.getByLabel("검토됨", { exact: true }).check();
  await page.getByLabel("검토됨", { exact: true }).uncheck();
  await page.getByLabel("검토자", { exact: true }).selectOption("peer");
  await page.getByLabel("협업자", { exact: true }).selectOption(["me", "peer"]);
  await page.getByLabel("OKR 파일 필터").selectOption("next");
  await expect(page.getByRole("radio", { name: /재방문 개선/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /첫 경험 단순화/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /재방문 개선/ }).check();
  await expect(page.locator(".review-summary")).toContainText("민지");
  await expect(page.locator(".review-summary")).toContainText("체크 안 됨");
  await expect(page.locator(".review-summary")).toContainText("4분기 성장");
  expect(state.posts).toHaveLength(0);
  await consent(page).check();
  await createButton(page).click();
  await expect(page.getByRole("heading", { name: "확인한 내용으로 생성했습니다" })).toBeVisible();
  expect(state.posts[0]).toMatchObject({ editorRevision: editor.revision, initiativeId: "cross-file", proposal: {
    title: "수정된 결제 Project", description: "수정한 완료 기준", driMemberId: "peer", workerMemberIds: ["me"], dueDate: "2026-10-15",
    status: "in_progress", priority: "urgent", cadence: "weekly", progress: 25, templateId: "other-template", requestedCycleId: "next",
    properties: { 예산: 0, 메모: "유지할 메모", 분류: "운영", 출시일: "2026-10-01", 검토됨: false, 검토자: "peer", 협업자: ["me", "peer"] },
  } });
  expect(state.posts).toHaveLength(1);
});

test("search does not reset the proposal, and every changed field clears consent", async ({ page }) => {
  const state = await mockReview(page);
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  for (const change of [
    () => page.getByLabel("Project 제목 (필수)").fill("새 제목"),
    () => page.getByLabel("기한", { exact: true }).fill(""),
    () => page.getByLabel("예산", { exact: true }).fill("0"),
    () => page.getByLabel("검토됨", { exact: true }).check(),
    () => page.getByLabel("책임자", { exact: true }).selectOption(""),
  ]) {
    await consent(page).check(); await change(); await expect(consent(page)).not.toBeChecked();
    await expect(createButton(page)).toBeDisabled();
  }
  await page.getByLabel("다른 Initiative 검색").fill("결제");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByLabel("Project 제목 (필수)")).toHaveValue("새 제목");
  await expect(page.getByLabel("예산", { exact: true })).toHaveValue("0");
  await expect(page.getByRole("radio", { name: /결제 실패 감소/ })).toBeChecked();
  await page.getByRole("button", { name: "검토됨 미지정으로 변경" }).click();
  await expect(page.locator(".review-summary")).toContainText("미지정");
  expect(state.modes.filter((mode) => mode === "")).toHaveLength(1);
  expect(state.posts).toHaveLength(0);
});

test("field errors refresh choices without losing edits or retaining consent", async ({ page }) => {
  const state = await mockReview(page, { invalidSave: true });
  await page.getByLabel("Project 제목 (필수)").fill("오류에도 보존");
  await page.getByLabel("분류", { exact: true }).selectOption("운영");
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  await consent(page).check(); await createButton(page).click();
  await expect(page.getByRole("alert")).toContainText("선택지가 변경");
  await expect(page.getByLabel("Project 제목 (필수)")).toHaveValue("오류에도 보존");
  await expect(page.getByLabel("분류", { exact: true })).toHaveValue("운영");
  await expect(page.getByLabel("분류", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(consent(page)).not.toBeChecked();
  expect(state.posts).toHaveLength(1);
});

test("a lost creation response reads the saved receipt without a second write", async ({ page }) => {
  const state = await mockReview(page, { loseResponse: true });
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  await consent(page).check(); await createButton(page).click();
  await expect(page.getByRole("heading", { name: "확인한 내용으로 생성했습니다" })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.modes.filter((mode) => mode === "")).toHaveLength(2);
});

test("read-only members cannot edit or approve a pending Project", async ({ page }) => {
  const state = await mockReview(page, { readOnly: true });
  await expect(page.getByText("현재 계정은 읽기 전용입니다.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Project 제목 (필수)")).toBeDisabled();
  await expect(page.getByRole("radio", { name: /결제 실패 감소/ })).toBeDisabled();
  await expect(consent(page)).toBeDisabled();
  await expect(createButton(page)).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});

test("search failure and leaving the page preserve the user's edited draft", async ({ page }) => {
  const state = await mockReview(page, { searchError: true });
  await page.getByLabel("Project 제목 (필수)").fill("떠나기 전 수정");
  await page.getByLabel("다른 Initiative 검색").fill("결제");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("후보 검색 실패");
  await expect(page.getByLabel("Project 제목 (필수)")).toHaveValue("떠나기 전 수정");
  const dialog = new Promise<string>((resolve) => page.once("dialog", async (warning) => { const type = warning.type(); await warning.dismiss(); resolve(type); }));
  await page.getByRole("link", { name: "OKRPTR", exact: true }).click({ noWaitAfter: true });
  expect(await dialog).toBe("beforeunload");
  await expect(page.getByLabel("Project 제목 (필수)")).toHaveValue("떠나기 전 수정");
  expect(state.posts).toHaveLength(0);
});

test("wide screen, long Korean titles, keyboard and increased text size stay usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "one-worker desktop viewport matrix");
  const state = await mockReview(page);
  for (const width of [768, 1440, 3840]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByLabel("Project 제목 (필수)").fill("아주 긴 한글 제목과 숫자 123, 영문 Project를 함께 검토합니다 ".repeat(5));
    await page.evaluate(() => document.documentElement.style.fontSize = "200%");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByLabel("Project 제목 (필수)")).toBeVisible();
    await page.evaluate(() => document.documentElement.style.fontSize = "");
  }
  const radio = page.getByRole("radio", { name: /결제 실패 감소/ });
  await radio.focus(); await page.keyboard.press("Space"); await expect(radio).toBeChecked();
  await consent(page).focus(); await page.keyboard.press("Space"); await expect(createButton(page)).toBeEnabled();
  expect(await page.getByLabel("예산", { exact: true }).evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Pretendard");
  expect(await page.getByLabel("검토됨", { exact: true }).evaluate((el) => el.getBoundingClientRect().width)).toBe(18);
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".review-summary h3" });
  const rendered = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(rendered.fonts.length).toBeGreaterThan(0);
  expect(rendered.fonts.every((font) => font.isCustomFont && font.familyName.includes("Pretendard"))).toBe(true);
  await cdp.detach();
  await page.screenshot({ path: testInfo.outputPath("review-edit-4k.png"), fullPage: true });
  expect(state.errors).toEqual([]);
});
