import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installApiMocks, json } from "./api-mocks";

// Playwright 1.55 needs this flag to apply setOffline to service-worker fetches too.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

async function offerInstall(page: Page, outcome: "accepted" | "dismissed" | "error" = "accepted") {
  await page.evaluate((result) => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        if (result === "error") throw new Error("Install unavailable");
        return { outcome: result };
      },
    });
    window.dispatchEvent(event);
  }, outcome);
}

test.describe("installation controls", () => {
  test.use({ serviceWorkers: "block" });

  test("menu install, cancellation, retry offer and installed state preserve the workspace", async ({ page }, info) => {
    await installApiMocks(page);
    await page.goto("/?view=my_work");
    await expect(page.locator(".page-header h1")).toHaveText("내 업무");
    await offerInstall(page, "dismissed");
    if (info.project.name.startsWith("mobile")) await page.getByRole("button", { name: "더보기", exact: true }).click();
    const install = page.getByRole("button", { name: "OKRPTR 앱 설치", exact: true }).filter({ visible: true });
    await expect(install).toBeVisible();
    await install.focus();
    await page.keyboard.press("Enter");
    await expect(install).toHaveCount(0);
    await offerInstall(page);
    await expect(install).toBeVisible();
    await install.click();
    await expect(install).toHaveCount(0);
    expect(await page.evaluate(() => window.__OKRPTR_INSTALL__?.status)).toBe("accepted");
    expect(new URL(page.url()).searchParams.get("view")).toBe("my_work");
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await offerInstall(page);
    await expect(install).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("install-complete.png") });
  });

  test("login install retains Google authentication URL; failures stay visible", async ({ page }) => {
    await installApiMocks(page);
    await page.route("**/api/bootstrap?*", route => json(route, { error: "unauthenticated" }, 401));
    await page.goto("/?signedOut=1");
    await offerInstall(page, "error");
    const button = page.getByRole("button", { name: "OKRPTR 앱 설치", exact: true });
    await button.click();
    await expect(page.getByRole("alert")).toContainText("설치 창을 열지 못했습니다");
    await page.route("**/api/auth/google?*", route => route.fulfill({ status: 200, contentType: "text/html", body: "<p>Mock Google redirect</p>" }));
    await page.locator(".landing-login-button").click();
    await expect(page).toHaveURL(/\/api\/auth\/google\?returnTo=/);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/?signedOut=1");
  });

  test("standalone application hides install actions", async ({ page }) => {
    await installApiMocks(page);
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => matchMedia(query === "(display-mode: standalone)" ? "(min-width: 0px)" : query);
    });
    await page.goto("/?view=okr");
    await expect(page.locator(".app-shell")).toBeVisible();
    await offerInstall(page);
    await expect(page.getByRole("button", { name: "OKRPTR 앱 설치", exact: true })).toHaveCount(0);
  });

  test("menu installation fits enlarged text without covering neighboring controls", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-chromium");
    await installApiMocks(page);
    for (const width of [320, 1440, 3840]) {
      await page.setViewportSize({ width, height: 1200 });
      await page.goto("/?view=my_work");
      await expect(page.locator(".app-shell")).toBeVisible();
      await offerInstall(page);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      if (width === 320) await page.getByRole("button", { name: "더보기", exact: true }).click();
      const button = page.getByRole("button", { name: "OKRPTR 앱 설치", exact: true }).filter({ visible: true });
      await expect(button).toBeVisible();
      expect(await button.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        const label = el.querySelector("span")!.getBoundingClientRect();
        const next = el.nextElementSibling?.getBoundingClientRect();
        return label.left >= bounds.left && label.right <= bounds.right + 1 && label.bottom <= bounds.bottom + 1
          && (!next || next.top >= bounds.bottom - 1 || next.left >= bounds.right - 1);
      })).toBe(true);
    }
  });

  test("login installation respects themes, responsive widths, text enlargement and contrast", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-chromium");
    await installApiMocks(page);
    await page.route("**/api/bootstrap?*", route => json(route, { error: "unauthenticated" }, 401));
    await page.goto("/");
    await offerInstall(page);
    await expect(page.locator(".app-install-button")).toBeVisible();
    for (const theme of ["white", "beige", "gray", "dark", "neon", "cyberpunk"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const results = await new AxeBuilder({ page: page as never }).include(".app-install-button").withRules(["color-contrast"]).analyze();
      expect(results.violations).toEqual([]);
    }
    for (const width of [320, 390, 768, 1440, 1920, 2560, 3840]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const button = page.getByRole("button", { name: "OKRPTR 앱 설치", exact: true });
      expect(await button.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await expect(button).toBeVisible();
    }
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
    expect(JSON.parse(manifest.data!)).toMatchObject({ name: "OKRPTR", display: "standalone", start_url: "/", scope: "/" });
    await expect.poll(async () => (await session.send("Page.getInstallabilityErrors")).installabilityErrors).toEqual([]);
    const icon = await page.evaluate(async () => {
      const image = new Image();
      image.src = "/icons/okrptr-512.png";
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
