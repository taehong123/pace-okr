import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.OKRI_E2E_BASE_URL;
const requestedWorkers = Number(process.env.OKRI_E2E_WORKERS ?? "1");
const workers = Number.isInteger(requestedWorkers) && requestedWorkers > 0 ? requestedWorkers : 1;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-390", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "mobile-320", use: { ...devices["iPhone SE"], browserName: "chromium", viewport: { width: 320, height: 568 } } },
    { name: "desktop-4k-themes", testMatch: "**/themes.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 3840, height: 2160 } } },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
