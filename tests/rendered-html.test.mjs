import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the OKRPTR workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>OKRPTR - 목표를 오늘의 실행으로<\/title>/);
  assert.match(html, /OKRPTR/);
  assert.match(html, /개인 워크스페이스/);
  assert.match(html, /그룹 관리/);
  assert.match(html, /OKR 대화/);
  assert.match(html, /팀 OKR/);
  assert.match(html, /개인 OKR/);
  assert.match(html, /루틴부터/);
  assert.match(html, /처음이면 아래 버튼으로 시작해도 됩니다/);
  assert.match(html, /목표, 고민, 지표, 해야 할 일을 편하게 적어 주세요/);
  assert.doesNotMatch(html, /할 일을 입력하면 인박스에 저장됩니다/);
  assert.match(html, /데일리/);
  assert.match(html, /추천/);
  assert.match(html, /루틴/);
  assert.doesNotMatch(html, /셀프 서브 도입|신규 사용자의 첫 주 활성화율|온보딩 체크리스트/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("ships product metadata and removes starter assets", async () => {
  const [layout, page, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /openGraph/);
  assert.doesNotMatch(layout, /\/og\.png/);
  assert.match(page, /capture_item/);
  assert.match(page, /get_workspace_rules/);
  assert.match(page, /update_workspace_rules/);
  assert.match(page, /OKR 대화/);
  assert.match(page, /정리하기/);
  assert.match(page, /OKR 만들기/);
  assert.match(page, /팀 OKR/);
  assert.match(page, /개인 OKR/);
  assert.match(page, /루틴부터/);
  assert.match(page, /create_property/);
  assert.match(page, /set_property_value/);
  assert.match(page, /get_daily_scrum/);
  assert.match(page, /get_recommendations/);
  assert.match(page, /list_routines/);
  assert.match(page, /트리거 포인트/);
  assert.match(page, /무엇을 어떻게/);
  assert.match(page, /list_team_members/);
  assert.match(page, /create_group/);
  assert.match(page, /list_group_members/);
  assert.match(page, /Objective → Key Result → Initiative → Project → Task/);
  assert.match(page, /OKR이 오늘의 일로 이어지도록/);
  assert.match(page, /Connect your OKRs to today's work/);
  assert.match(page, /目標を実行に変えるワークスペース/);
  assert.match(page, /把目标变成行动的工作空间/);
  assert.match(page, /convertir objetivos en acción/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", projectRoot)));
});
