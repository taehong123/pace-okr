import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installApiMocks, json } from "./api-mocks";

const retired = ["주기", "스프린트", "예상 시간", "예상 기간", "시기"];
const projectProperties = [
  ...retired.map((name, index) => ({ id: `retired-${index}`, name, type: "text", systemKey: index === 0 ? "cadence" : null, active: false, options: [], defaultValue: null, sortOrder: index })),
  { id: "dri", name: "책임자", type: "member", systemKey: "project_dri", active: true, options: [], defaultValue: null, sortOrder: 10 },
  { id: "contribution", name: "KR 기여 예상치", type: "number", systemKey: null, active: true, options: [], defaultValue: null, sortOrder: 20 },
];

test("removed project properties are absent from default settings, with a separate recovery view", async ({ page }) => {
  await installApiMocks(page, { projectProperties, teamWorkspace: true });
  await page.goto("/?settings=workspace&tab=projects");
  const manager = page.locator(".project-property-manager");
  for (const name of retired) await expect(manager.locator(".project-property-select").filter({ hasText: name })).toHaveCount(0);
  await expect(manager.locator(".project-property-select").filter({ hasText: "책임자" })).toBeVisible();
  await manager.getByRole("button", { name: "제거한 속성 (5)", exact: true }).click();
  for (const name of retired) await expect(manager.locator(".project-property-select").filter({ hasText: name })).toBeVisible();
  await manager.getByRole("button", { name: "사용 중인 속성 보기", exact: true }).click();
  for (const name of retired) await expect(manager.locator(".project-property-select").filter({ hasText: name })).toHaveCount(0);
  await expect(manager.getByRole("button", { name: "복원", exact: true })).toHaveCount(0);
});

test("Project create and detail show deadline/owner, never retired fields, and preserve values", async ({ page }) => {
  await installApiMocks(page, { projectProperties, withRoutine: true });
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/items", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    writes.push(body);
    return json(route, { item: { ...body, id: "created-mock", assignments: [], archivedAt: null, progress: 0 } });
  });
  await page.goto("/?view=work&project=project-1");
  const detail = page.getByRole("dialog", { name: /Project 상세/ });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("책임자", { exact: true })).toBeVisible();
  await expect(detail.getByLabel("기한", { exact: true })).toHaveValue("2026-09-03");
  await expect(detail).toContainText("테스트 사용자");
  for (const name of retired) await expect(detail.getByText(name, { exact: true })).toHaveCount(0);
  await expect(detail.getByText("KR 기여 예상치", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  const create = page.getByRole("dialog", { name: "새 항목", exact: true });
  for (const name of retired) await expect(create.getByText(name, { exact: true })).toHaveCount(0);
  await expect(create.getByText("책임자", { exact: true })).toBeVisible();
  await create.getByLabel("이름", { exact: true }).fill("기한과 책임자를 확인한 프로젝트");
  await create.getByRole("combobox", { name: "상위 Initiative", exact: true }).selectOption("initiative-1");
  const due = create.getByLabel("기한", { exact: true });
  await due.fill("2026-10-15");
  await create.getByRole("button", { name: "만들기", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ kind: "project", dueDate: "2026-10-15", driMemberId: "member-1", parentId: "initiative-1" });
  expect(writes[0]).not.toHaveProperty("cadence");
  await page.goto("/?view=routines");
  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  await expect(page.getByLabel("반복 주기", { exact: true })).toBeVisible();
});

test("core Project fields retain fonts, contrast and wrapping at narrow/wide sizes and 200% text", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium");
  test.setTimeout(120_000);
  await installApiMocks(page, { projectProperties, preserveStorage: true });
  for (const theme of ["white", "dark"]) {
    await page.goto("/?view=work");
    await page.getByRole("button", { name: "직접 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "새 항목", exact: true });
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      document.documentElement.style.colorScheme = value === "dark" ? "dark" : "light";
    }, theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await page.locator("html").evaluate((root) => getComputedStyle(root).colorScheme)).toBe(theme === "dark" ? "dark" : "light");
    await dialog.getByLabel("이름", { exact: true }).fill("고객 온보딩과 실제 활성화 지표를 개선하는 긴 프로젝트 제목 2026");
    for (const width of [320, 390, 768, 1440, 1920, 2560, 3840]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(dialog.getByLabel("기한", { exact: true })).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page: page as never }).include(".create-project-fields").withRules(["color-contrast"]).analyze();
    expect(axe.violations).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    for (const selector of [".create-project-fields > header > b", ".create-project-fields .project-field-grid label > span"]) {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      expect(fonts.length).toBeGreaterThan(0);
      expect(fonts.every((font) => font.isCustomFont && /Pretendard/.test(font.familyName))).toBe(true);
    }
    await cdp.detach();
    await dialog.getByText("책임자", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`project-core-${theme}.png`), fullPage: false });
  }
});
