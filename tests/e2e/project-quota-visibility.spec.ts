import { expect, test } from "@playwright/test";
import { installApiMocks } from "./api-mocks";

test("project quota is absent from work and creation views but remains in billing", async ({ page }, info) => {
  await installApiMocks(page);
  await page.goto("/?view=work");
  const actions = page.locator(".page-create-actions");
  await expect(actions.getByRole("button")).toHaveCount(2);
  await expect(page.locator(".project-quota-badge")).toHaveCount(0);
  await expect(page.getByText("이번 달 Project", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("project-actions.png") });

  await actions.getByRole("button", { name: "직접 추가", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".project-quota-badge")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await actions.getByRole("button", { name: "AI 대화로 추가", exact: true }).click();
  await expect(page.locator(".home-okr-chat")).toBeVisible();
  await expect(page.locator(".project-quota-badge")).toHaveCount(0);

  await page.goto("/?view=billing");
  await expect(page.getByRole("region", { name: "요금제 및 결제" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project 생성 사용량" })).toBeVisible();
});
