import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installApiMocks, json } from "./api-mocks";

const definitions = [
  { id: "text", name: "메모", type: "text", defaultValue: "", options: [] },
  { id: "number", name: "점검 수", type: "number", defaultValue: 1, options: [] },
  { id: "select", name: "분류", type: "select", defaultValue: null, options: ["업무", "개인"] },
  { id: "date", name: "점검일", type: "date", defaultValue: null, options: [] },
  { id: "checkbox", name: "재확인", type: "checkbox", defaultValue: false, options: [] },
  { id: "member", name: "검토자", type: "member", defaultValue: null, options: [] },
  { id: "members", name: "참여자", type: "members", defaultValue: null, options: [] },
].map((field, index) => ({ ...field, systemKey: null, active: true, sortOrder: index, valueCount: 0 }));

async function setup(page: Page, viewer = false) {
  await installApiMocks(page, { withRoutine: true, teamWorkspace: true, workspaceRole: viewer ? "viewer" : "owner" });
  const state = { values: {} as Record<string, unknown>, fields: structuredClone(definitions), writes: [] as Record<string, unknown>[], fail: false };
  await page.route("**/api/routine-properties*", async (route) => {
    if (route.request().method() === "GET") return json(route, { properties: state.fields });
    const body = route.request().postDataJSON();
    if (route.request().method() === "POST") { const field = { ...body, id: "new-field", active: true, systemKey: null, sortOrder: 100, valueCount: 0 }; state.fields.push(field); return json(route, { property: field }); }
    return json(route, { error: "Unexpected mocked mutation" }, 400);
  });
  await page.route("**/api/routines*", async (route) => {
    const routine = { id: "routine-1", title: "매주 고객 피드백을 모아 다음 실행을 정리하는 반복 업무", description: "메모", triggerPoint: "금요일", actionPlace: "작업 탭", actionSteps: "확인", cadence: "weekly", active: true, systemKey: null, assigneeMemberId: "member-1", properties: state.values };
    if (route.request().method() === "GET") return json(route, { routines: [routine] });
    const body = route.request().postDataJSON() as Record<string, unknown>; state.writes.push(body);
    if (state.fail) return json(route, { error: "저장 실패: 입력 내용은 유지됩니다." }, 503);
    Object.assign(state.values, body.properties);
    return json(route, { routine: { ...routine, ...body, properties: state.values } });
  });
  return state;
}

test("routine values support every type, save and reload, and remain on failure", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/?view=routines");
  await page.locator(".routine-expand").click();
  const values = page.locator(".routine-card .routine-property-values");
  await values.getByLabel("메모", { exact: true }).fill("재방문 시 확인할 내용");
  await values.getByLabel("점검 수", { exact: true }).fill("0");
  await values.getByLabel("분류", { exact: true }).selectOption("업무");
  await values.getByLabel("점검일", { exact: true }).fill("2026-09-03");
  await values.getByLabel("재확인", { exact: true }).check();
  await values.getByLabel("검토자", { exact: true }).selectOption("member-1");
  await values.getByLabel("참여자", { exact: true }).selectOption(["member-1"]);
  await page.locator(".routine-expand").click();
  await expect(values).toBeHidden();
  await page.locator(".routine-expand").click();
  await expect(values.getByLabel("메모", { exact: true })).toHaveValue("재방문 시 확인할 내용");
  await page.locator(".routine-card").getByRole("button", { name: "저장", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => state.values.number).toBe(0);
  expect(state.values).toEqual({ text: "재방문 시 확인할 내용", number: 0, select: "업무", date: "2026-09-03", checkbox: true, member: "member-1", members: ["member-1"] });
  await page.reload();
  await page.locator(".routine-expand").click();
  await expect(values.getByLabel("메모", { exact: true })).toHaveValue("재방문 시 확인할 내용");
  state.fail = true;
  await values.getByLabel("점검 수", { exact: true }).fill("12");
  await page.locator(".routine-card").getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장 실패: 입력 내용은 유지됩니다.")).toBeVisible();
  await expect(values.getByLabel("점검 수", { exact: true })).toHaveValue("12");
  await expect(page.locator(".routine-card").getByRole("button", { name: "저장", exact: true })).toBeEnabled();
});

test("routine property manager adds a field and new routine form accepts its value", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/?view=routines");
  await page.getByRole("button", { name: "루틴 속성 관리", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "루틴 속성 관리", exact: true });
  await dialog.getByRole("button", { name: "새 속성", exact: true }).click();
  await dialog.getByLabel("이름", { exact: true }).fill("확인 링크");
  await dialog.getByRole("button", { name: "속성 추가", exact: true }).click();
  await expect(dialog.getByText("확인 링크", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "루틴 속성 관리 닫기", exact: true }).click();
  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  const create = page.getByRole("dialog", { name: "새 Routine", exact: true });
  await create.getByLabel("Routine 이름", { exact: true }).fill("새 반복 업무");
  await create.getByLabel("확인 링크", { exact: true }).fill("https://example.com/review");
  await create.getByRole("button", { name: "Routine 추가", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ title: "새 반복 업무", properties: { "new-field": "https://example.com/review" } });
});

test("viewer cannot change values or definitions", async ({ page }) => {
  await setup(page, true); await page.goto("/?view=routines");
  await page.locator(".routine-expand").click();
  await expect(page.locator(".routine-card").getByLabel("점검 수", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "루틴 속성 관리", exact: true }).click();
  await expect(page.getByRole("button", { name: "새 속성", exact: true })).toBeDisabled();
});

test("routine fields wrap and retain contrast/fonts at mobile, wide and enlarged text", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium"); test.setTimeout(120000);
  await setup(page); await page.goto("/?view=routines");
  await page.locator(".routine-expand").click();
  await expect(page.getByLabel("점검 수", { exact: true })).toBeVisible();
  for (const theme of ["white", "dark"]) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light"; }, theme);
    for (const width of [320,390,768,1440,1920,2560,3840]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.locator(".routine-property-values").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.locator(".routine-property-values").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    expect((await new AxeBuilder({ page: page as never }).include(".routine-property-values").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument"); const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".routine-property-values h3" });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    expect(fonts.length).toBeGreaterThan(0); expect(fonts.every((font: { familyName: string; isCustomFont: boolean }) => font.isCustomFont && /Pretendard/i.test(font.familyName))).toBe(true);
    await cdp.detach(); await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
});
