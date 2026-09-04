import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installApiMocks } from "./api-mocks";

test("Routine starts collapsed and folding keeps edits without completion or network writes", async ({ page }, info) => {
  await installApiMocks(page, { withRoutine: true, teamWorkspace: true });
  const writes: string[] = [];
  page.on("request", (request) => { if (/\/api\/routine/.test(request.url()) && request.method() !== "GET") writes.push(request.method()); });
  await page.goto("/?view=routines");
  const row = page.locator(".routine-card").filter({ has: page.locator(".routine-expand") }).first();
  const toggle = row.locator(".routine-expand");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(row.locator(".routine-details")).toBeHidden();
  await expect(toggle).toContainText("테스트 사용자");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await row.getByRole("textbox", { name: "목적/메모" }).fill("접었다 펼쳐도 남아 있어야 하는 수정 내용");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(row.locator(".routine-details")).toBeHidden();
  await expect(toggle).toContainText("저장하지 않은 변경");
  await toggle.click();
  await expect(row.getByRole("textbox", { name: "목적/메모" })).toHaveValue("접었다 펼쳐도 남아 있어야 하는 수정 내용");
  await expect(row.locator(".task-check")).not.toHaveClass(/checked/);
  expect(writes).toEqual([]);
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if (info.project.name.startsWith("mobile")) {
    expect((await toggle.boundingBox())!.width).toBeGreaterThan(180);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("routine-collapsed.png"), fullPage: true });
});

test("Routine long headings stay legible in white/dark, wide layouts and enlarged text", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "one sequential wide-screen check");
  await installApiMocks(page, { withRoutine: true, teamWorkspace: true });
  for (const theme of ["white", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("okri.theme", value), theme);
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto("/?view=routines");
    const toggle = page.locator(".routine-expand").first();
    await expect(toggle).toBeVisible();
    await expect(toggle.locator("b")).toHaveCSS("font-size", "16px");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(toggle.locator("b")).toHaveCSS("font-size", "32px");
    await page.evaluate(() => document.fonts.ready);
    const client = await context.newCDPSession(page);
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const documentNode = await client.send("DOM.getDocument");
    const node = await client.send("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: ".routine-expand b" });
    const fonts = await client.send("CSS.getPlatformFontsForNode", { nodeId: node.nodeId });
    expect(fonts.fonts.some((font) => font.glyphCount > 0 && /Pretendard/.test(font.familyName))).toBeTruthy();
    await client.detach();
    const check = page.locator(".routine-card:has(.routine-expand) .task-check").first();
    const checkBox = (await check.boundingBox())!;
    expect((await toggle.boundingBox())!.x).toBeGreaterThanOrEqual(checkBox.x + checkBox.width);
    await toggle.click();
    const result = await new AxeBuilder({ page: page as never }).include(".routine-section").withRules(["color-contrast"]).analyze();
    expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`routine-${theme}-200-percent.png`), fullPage: true });
  }
});
