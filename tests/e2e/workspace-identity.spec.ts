import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installApiMocks, json } from "./api-mocks";
import { THEME_STORAGE_KEY } from "../../lib/themes";

async function setup(page: Page, canManage = true) {
  await installApiMocks(page, { teamWorkspace: true, workspaceRole: canManage ? "owner" : "viewer" });
  const state = {
    profile: { id: "workspace-1", name: "테스트 워크스페이스", address: null as string | null, revision: 0, canManage, subdomainsEnabled: false, url: null as string | null },
    reads: 0, writes: [] as Record<string, unknown>[], failure: false,
  };
  await page.route("**/api/workspaces/profile", async (route) => {
    expect(route.request().headers()["x-okrptr-workspace-id"]).toBe("workspace-1");
    if (route.request().method() === "GET") { state.reads++; return json(route, { profile: state.profile }); }
    const input = route.request().postDataJSON() as Record<string, unknown>;
    state.writes.push(input);
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (state.failure) return json(route, { error: "다른 곳에서 변경되었습니다. 다시 불러와 주세요." }, 409);
    state.profile = { ...state.profile, ...input, revision: state.profile.revision + 1 };
    if (state.profile.address) state.profile.url = state.profile.subdomainsEnabled ? `https://${state.profile.address}.okrptr.com/` : `/api/workspaces/open?address=${state.profile.address}`;
    return json(route, { profile: state.profile });
  });
  return state;
}

test("general settings rename immediately, keep the chosen address, and confirm address changes", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/?view=work");
  await expect(page.locator(".workspace")).toBeVisible();
  expect(state.reads).toBe(0);
  await page.goto("/?settings=workspace&tab=general");
  await expect(page.getByLabel("워크스페이스 이름", { exact: true })).toHaveValue(state.profile.name);
  await page.getByLabel("워크스페이스 이름", { exact: true }).fill("변경한 팀 Workspace");
  await page.getByRole("button", { name: "이름 저장", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "이름을 저장했습니다." })).toBeVisible();
  await expect(page.locator(".workspace-settings-header")).toContainText("변경한 팀 Workspace");
  expect(state.writes).toHaveLength(1);
  await page.getByLabel("워크스페이스 주소", { exact: true }).fill("our-team");
  await page.getByRole("button", { name: "주소 저장", exact: true }).click();
  await expect(page.getByRole("link", { name: "워크스페이스 열기" })).toHaveAttribute("href", "/api/workspaces/open?address=our-team");
  await expect(page.getByText(/하위도메인은 아직 사용할 수 없습니다/)).toBeVisible();
  await page.getByLabel("워크스페이스 주소", { exact: true }).fill("new-team");
  await page.getByRole("button", { name: "주소 저장", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "워크스페이스 주소 변경" })).toBeVisible();
  await page.getByRole("button", { name: "주소 변경", exact: true }).click();
  await expect(page.getByRole("link", { name: "워크스페이스 열기" })).toHaveAttribute("href", "/api/workspaces/open?address=new-team");
  expect(state.profile.name).toBe("변경한 팀 Workspace");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "워크스페이스 설정" })).toHaveCount(0);
  await page.goto("/?settings=workspace&tab=general");
  await expect(page.getByLabel("워크스페이스 이름", { exact: true })).toHaveValue("변경한 팀 Workspace");
});

test("failed save preserves edits and does not claim success; read-only members cannot change fields", async ({ page }) => {
  const state = await setup(page);
  state.failure = true;
  await page.goto("/?settings=workspace&tab=general");
  await page.getByLabel("워크스페이스 이름", { exact: true }).fill("저장할 입력");
  await page.getByRole("button", { name: "이름 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("다른 곳에서 변경");
  await expect(page.getByLabel("워크스페이스 이름", { exact: true })).toHaveValue("저장할 입력");
  await expect(page.getByText("이름을 저장했습니다.")).toHaveCount(0);
  state.profile.canManage = false;
  await page.reload();
  await expect(page.getByLabel("워크스페이스 이름", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("워크스페이스 주소", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "이름 저장", exact: true })).toHaveCount(0);
});

test("workspace identity fits narrow/wide screens, long names, real fonts, light/dark and 200 percent text", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Sequential viewport matrix in one worker");
  test.setTimeout(120_000);
  const state = await setup(page);
  state.profile.name = "길고 긴 워크스페이스 이름과 한글 영문 Workspace 123 테스트";
  state.profile.address = "a-very-long-team-workspace-address-for-testing";
  state.profile.subdomainsEnabled = true;
  state.profile.url = `https://${state.profile.address}.okrptr.com/`;
  for (const mode of ["white", "dark"]) {
    await page.addInitScript(({ key, theme }) => localStorage.setItem(key, theme), { key: THEME_STORAGE_KEY, theme: mode });
    for (const width of [320, 390, 1440, 3840]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/?settings=workspace&tab=general");
      const panel = page.getByRole("region", { name: "워크스페이스 이름과 주소" });
      await expect(panel.getByLabel("워크스페이스 이름", { exact: true })).toHaveValue(state.profile.name);
      await page.evaluate(() => document.fonts.ready);
      expect((await new AxeBuilder({ page: page as never }).include(".workspace-identity").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await panel.getByLabel("워크스페이스 이름", { exact: true }).fill(state.profile.name + " 변경");
      const save = panel.getByRole("button", { name: "이름 저장", exact: true });
      await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
      expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`${mode}-${width}-workspace-identity.png`) });
      if (width === 1440) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
        const { root } = await cdp.send("DOM.getDocument");
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".workspace-identity label" });
        const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
        expect(fonts.length).toBeGreaterThan(0);
        expect(fonts.every((font) => font.isCustomFont && font.familyName.includes("Pretendard"))).toBe(true);
        await cdp.detach();
      }
    }
  }
});
