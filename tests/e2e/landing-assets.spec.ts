import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { THEMES } from "../../lib/themes";
import { installLandingProductFixture } from "./landing-product-fixture";

test("capture real product examples using only fictional local API responses", async ({ page, baseURL }) => {
  test.skip(process.env.OKRI_CAPTURE_LANDING !== "1", "Asset capture is an explicit local authoring step.");
  test.setTimeout(180_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await installLandingProductFixture(page);
  await page.route("https://**/*", (route) => route.abort());
  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 920 } : { width: 1440, height: 1000 });
    await page.goto("/?view=okr");
    await expect(page.locator(".okr-file-read-tree")).toBeVisible();
    await capture(page, ".okr-file-read-tree", 1, mobile);
    for (const selector of [".okr-tree-kr-row", ".okr-tree-initiative-row", ".okr-tree-project-main"]) {
      const row = page.locator(`${selector}[aria-expanded='false']`).first();
      if (await row.count()) await row.click();
    }
    await expect(page.locator(".okr-tree-task")).toHaveCount(2);
    await capture(page, ".okr-file-read-tree", 2, mobile);
    await page.goto("/project-review?id=10000000-0000-4000-8000-000000000001&workspaceId=workspace-1");
    await page.getByRole("radio").check();
    await expect(page.locator(".review-summary")).toContainText("온보딩 흐름 개선");
    await capture(page, ".review-summary", 3, mobile);
    await page.goto("/?view=my_work");
    await expect(page.locator(".my-work-view")).toContainText("고객 피드백 확인");
    await capture(page, ".my-work-view", 4, mobile);
  }
});

async function capture(page: Page, selector: string, slide: number, mobile: boolean) {
  await page.evaluate(() => document.fonts.ready);
  for (const { mode } of THEMES) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, mode);
    const directory = resolve(process.env.OKRI_LANDING_ASSET_DIR ?? "test-results/landing-media", mode);
    await mkdir(directory, { recursive: true });
    await page.locator(selector).screenshot({ path: resolve(directory, `slide-${slide}${mobile ? "-mobile" : ""}.png`), animations: "disabled" });
  }
}
