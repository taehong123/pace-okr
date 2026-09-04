import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installApiMocks } from "./api-mocks";

// Playwright 1.55 needs this flag to apply setOffline to service-worker fetches too.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

declare global {
  interface Window {
    __installPromptCalls: number;
  }
}

test.describe("download route and installation controls", () => {
  test.use({ serviceWorkers: "block" });

  test("app entry points open guidance without starting installation", async ({ page }, info) => {
    await installApiMocks(page);
    await page.goto("/?view=my_work");
    await page.evaluate(() => {
      window.__installPromptCalls = 0;
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => { window.__installPromptCalls += 1; return { outcome: "accepted" }; },
      });
      window.dispatchEvent(event);
    });
    if (info.project.name.startsWith("mobile")) await page.getByRole("button", { name: "더보기", exact: true }).click();
    const entry = page.locator(".app-install-button:visible");
    await expect(entry).toHaveAttribute("href", "/download");
    await entry.click();
    await expect(page).toHaveURL(/\/download$/);
    expect(await page.evaluate(() => window.__installPromptCalls)).toBe(0);
    await expect(page.getByRole("heading", { name: "OKRI 데스크톱 앱" })).toBeVisible();
  });

  test("only the final download-page action consumes the browser prompt", async ({ page }) => {
    await page.goto("/download");
    await page.evaluate(() => {
      window.__installPromptCalls = 0;
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => { window.__installPromptCalls += 1; return { outcome: "accepted" }; },
      });
      window.dispatchEvent(event);
    });
    expect(await page.evaluate(() => window.__installPromptCalls)).toBe(0);
    const install = page.getByRole("button", { name: "Windows에 OKRI 설치" });
    await expect(install).toBeEnabled();
    await install.click();
    expect(await page.evaluate(() => window.__installPromptCalls)).toBe(1);
    expect(await page.evaluate(() => window.__OKRI_INSTALL__?.status)).toBe("accepted");

    const windows = page.getByRole("tab", { name: /Windows/ });
    await windows.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Mac", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "OKRI for Mac" })).toBeVisible();
  });

  test("download guidance supports themes, narrow layouts, and 200% text", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-chromium");
    await page.goto("/download");
    for (const theme of ["white", "beige", "gray", "dark", "neon", "cyberpunk"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const results = await new AxeBuilder({ page: page as never }).withRules(["color-contrast"]).analyze();
      expect(results.violations).toEqual([]);
    }
    for (const width of [320, 390, 1440, 3840]) {
      await page.setViewportSize({ width, height: 1200 });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.getByRole("heading", { name: "OKRI 데스크톱 앱" })).toBeVisible();
    }
  });

  test("standalone application reports installation without another install action", async ({ page }) => {
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => matchMedia(query === "(display-mode: standalone)" ? "(min-width: 0px)" : query);
    });
    await page.goto("/download");
    await expect(page.getByText("이 기기에 이미 설치되어 있습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: /OKRI 설치/ })).toHaveCount(0);
  });
});


test.describe("real installed-app resources", () => {
  test("Chromium accepts the manifest and icon pixels, without installing OS software", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop-chromium");
    await installApiMocks(page);
    await page.goto("/?view=okr");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const session = await context.newCDPSession(page);
    await session.send("Page.enable");
    let manifest = await session.send("Page.getAppManifest");
    await expect(page.locator('head > link[rel="manifest"]')).toHaveCount(1);
    await expect.poll(async () => {
      manifest = await session.send("Page.getAppManifest");
      return manifest.data;
    }).not.toBe("");
    expect(manifest.errors).toEqual([]);
    expect(JSON.parse(manifest.data!)).toMatchObject({ name: "OKRI", display: "standalone", start_url: "/", scope: "/" });
    await expect.poll(async () => (await session.send("Page.getInstallabilityErrors")).installabilityErrors).toEqual([]);
    const icon = await page.evaluate(async () => {
      const image = new Image();
      image.src = "/icons/okri-512.png";
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return { width: image.naturalWidth, height: image.naturalHeight, colors: new Set(ctx.getImageData(0, 0, 512, 512).data).size };
    });
    expect(icon.width).toBe(512);
    expect(icon.height).toBe(512);
    expect(icon.colors).toBeGreaterThan(30);
  });

  test("offline reload shows no cached workspace; retry returns to the original view", async ({ page, context }, info) => {
    await installApiMocks(page, { preserveStorage: true });
    await page.goto("/?view=my_work");
    await expect(page.locator(".page-header h1")).toHaveText("내 업무");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "인터넷 연결을 확인해 주세요" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("테스트 워크스페이스");
    await expect(page.locator("body")).not.toContainText("오버레이 동작 점검");
    const cachedUrls = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const entry of await (await caches.open(name)).keys()) urls.push(entry.url);
      return urls;
    });
    expect(cachedUrls.every(url => !new URL(url).pathname.startsWith("/api/") && new URL(url).pathname !== "/")).toBe(true);
    await page.screenshot({ path: info.outputPath("offline.png") });
    await context.setOffline(false);
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.locator(".page-header h1")).toHaveText("내 업무");
    expect(new URL(page.url()).searchParams.get("view")).toBe("my_work");
  });

  test("offline document uses Pretendard glyphs and all six palettes at narrow and wide sizes", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop-chromium");
    await page.goto("/offline.html");
    await page.evaluate(() => document.fonts.ready);
    const session = await context.newCDPSession(page);
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    for (const selector of ["h1", "header strong", "button"]) {
      const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
      expect(fonts.filter(font => font.glyphCount > 0).every(font => font.isCustomFont && font.familyName.includes("Pretendard"))).toBe(true);
      expect(fonts.some(font => font.glyphCount > 0)).toBe(true);
    }
    for (const theme of ["white", "beige", "gray", "dark", "neon", "cyberpunk"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const result = await new AxeBuilder({ page: page as never }).withRules(["color-contrast"]).analyze();
      expect(result.violations).toEqual([]);
      for (const width of [320, 390, 768, 1440, 1920, 2560, 3840]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath("offline-dark-zoom.png") });
  });
});
