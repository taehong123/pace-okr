import { expect, test } from "@playwright/test";
import { installApiMocks } from "./api-mocks";

test("!테스크생성 opens the existing Task creation flow without an AI request", async ({ page }) => {
  let organizeRequestCount = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/okr-organize") organizeRequestCount += 1;
  });

  await installApiMocks(page, { withRoutine: true });
  await page.goto("/?view=okr");
  await page.getByRole("button", { name: "AI 대화", exact: true }).first().click();

  const assistant = page.getByRole("region", { name: "AI 대화", exact: true });
  const message = assistant.getByRole("textbox", { name: "메시지", exact: true });
  await message.fill("!테스크생성");
  await assistant.getByRole("button", { name: "메시지 보내기" }).click();

  await expect(message).toHaveAttribute("placeholder", "해야 할 일을 편하게 설명해 주세요");
  expect(organizeRequestCount).toBe(0);

  await message.fill("고객 인터뷰 결과 보고서 초안 작성");
  await assistant.getByRole("button", { name: "메시지 보내기" }).click();

  await expect(assistant.getByRole("textbox", { name: "Task 초안", exact: true })).toHaveValue("AI로 정리된 Task");
  await expect(assistant.getByLabel("연결 대상 · 선택 사항")).toBeVisible();
  await expect(assistant.getByLabel("담당자")).toBeVisible();
  await expect(assistant.getByRole("button", { name: "Task 1개 만들기" })).toBeVisible();
  expect(organizeRequestCount).toBe(1);
});
