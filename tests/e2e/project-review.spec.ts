import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { InitiativeChoice, ProjectReview } from "../../lib/project-review";

const id = "10000000-0000-4000-8000-000000000001";
const path = `/project-review?id=${id}&workspaceId=review-test`;
const choice = (id: string, title: string): InitiativeChoice => ({
  id, title, cycleId: "cycle", cycleName: "3분기 제품 개선", path: ["고객 경험", "가입 활성화 40%", title],
  description: "처음 사용하는 고객의 완료 경험을 개선합니다.", keyResultDescription: "첫 핵심행동 완료율", objectiveDescription: "고객의 첫 성공을 돕는다",
  fingerprint: "a".repeat(64), revision: { initiative: "1", keyResult: "1", objective: "1", cycleStatus: "active" },
});
const recommended = choice("recommendation", "첫 경험 단순화");
const alternative = choice("alternative", "결제 실패 감소");

async function mockReview(page: Page, options: { single?: boolean; getStatus?: number; failSave?: boolean } = {}) {
  const review: ProjectReview = {
    id, version: "20000000-0000-4000-8000-000000000002", state: "pending", projectId: "test-project",
    proposal: { title: "결제 화면 개편", description: "결제 오류를 줄이고 QA를 완료합니다.", status: "todo", priority: "high", cadence: "weekly", progress: 0,
      dueDate: "2026-09-15", driMemberId: "me", workerMemberIds: ["peer"], properties: { 예산: 7 }, templateId: "template", requestedCycleId: null },
    recommendations: [{ initiativeId: recommended.id, reason: "고객 이탈 개선과 관련이 있을 수 있어 검토가 필요합니다." }],
    fieldLabels: { dri: "태홍", workers: ["민지"], template: "개발 계획", cycle: null }, templateVersion: "version", templatePreview: "목표 / 완료 기준 / 검증 방법",
    requestHash: "test", propertyVersions: {}, createdAt: "2026-09-02T00:00:00Z", expiresAt: "2099-09-02T00:30:00Z", selectedParent: null,
  };
  const state = { review, posts: [] as Record<string, unknown>[], queries: [] as string[] };
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
      await new Promise((resolve) => setTimeout(resolve, 250));
      state.review = { ...state.review, state: body.decision === "cancel" ? "cancelled" : "created", selectedParent: body.initiativeId === alternative.id ? alternative : recommended };
      return route.fulfill({ json: { review: state.review } });
    }
    if (options.getStatus) return route.fulfill({ status: options.getStatus, json: { error: options.getStatus === 410 ? "확인 요청이 만료됐습니다." : "이 계정에서 확인할 요청이 없습니다." } });
    const query = new URL(request.url()).searchParams.get("q") ?? "";
    state.queries.push(query);
    return route.fulfill({ json: { review: state.review, workspaceName: "검증 워크스페이스", existingProjectId: null,
      recommendations: [{ ...review.recommendations[0], initiative: recommended }],
      candidates: { choices: options.single ? [recommended] : query === "없음" ? [] : query ? [alternative] : [recommended, alternative], truncated: false } } });
  });
  await page.goto(path);
  return state;
}

test("a single recommendation is never preselected and defer creates nothing", async ({ page }) => {
  const state = await mockReview(page, { single: true });
  await expect(page.getByRole("radio")).toHaveCount(1);
  await expect(page.getByRole("radio")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "확인한 연결로 Project 생성" })).toBeDisabled();
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
  const create = page.getByRole("button", { name: "확인한 연결로 Project 생성" });
  await expect(create).toBeDisabled();
  await expect(page.locator(".review-summary")).toContainText("태홍");
  await expect(page.locator(".review-summary")).toContainText("2026-09-15");
  await page.getByText("적용할 템플릿 본문 미리보기", { exact: true }).click();
  await expect(page.getByText("목표 / 완료 기준 / 검증 방법", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await create.click({ clickCount: 2 });
  await expect(page.getByRole("heading", { name: "확인한 내용으로 생성했습니다" })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({ decision: "approve", initiativeId: "alternative", confirmed: true, id });
  expect(state.queries).toContain("결제");
});

test("changing choice resets final consent and cancel is not creation", async ({ page }) => {
  const state = await mockReview(page);
  await page.getByRole("radio", { name: /첫 경험 단순화/ }).check();
  await page.getByRole("checkbox").check();
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "확인한 연결로 Project 생성" })).toBeDisabled();
  await page.getByRole("button", { name: "요청 취소" }).click();
  await expect(page.getByRole("heading", { name: "생성을 취소했습니다" })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.posts[0].decision).toBe("cancel");
});

test("a failed save stays failed and cannot be resubmitted from the page", async ({ page }) => {
  const state = await mockReview(page, { failSave: true });
  await page.getByRole("radio", { name: /결제 실패 감소/ }).check();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "확인한 연결로 Project 생성" }).click();
  await expect(page.getByRole("alert")).toContainText("전체 생성을 취소");
  await expect(page.getByRole("heading", { name: "저장 결과 확인이 필요합니다" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인한 연결로 Project 생성" })).toHaveCount(0);
  await page.getByRole("button", { name: "처리 결과 확인" }).click();
  expect(state.posts).toHaveLength(1);
});

for (const status of [401, 403, 410]) test(`HTTP ${status} has a safe login/error state without a creation form`, async ({ page }) => {
  const state = await mockReview(page, { getStatus: status });
  if (status === 401) await expect(page.getByRole("link", { name: "Google로 로그인하고 계속" })).toHaveAttribute("href", /returnTo=/);
  else await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "확인한 연결로 Project 생성" })).toHaveCount(0);
  expect(state.posts).toEqual([]);
});

test("review form remains readable in all themes and has accessible controls", async ({ page }) => {
  await mockReview(page);
  await expect(page.getByRole("heading", { name: "생성 전에 연결을 확인해 주세요" })).toBeVisible();
  for (const theme of ["white", "beige", "gray", "dark", "neon", "cyberpunk"]) {
    await page.evaluate((name) => document.documentElement.setAttribute("data-theme", name), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const violations = (await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).include(".project-review-page").analyze()).violations;
    expect(violations, theme).toEqual([]);
  }
});
