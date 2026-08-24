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

test("server-renders the OKRPTR authentication shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>OKRPTR - 목표를 오늘의 실행으로<\/title>/);
  assert.match(html, /OKRPTR/);
  assert.match(html, /워크스페이스 로그인/);
  assert.match(html, /세션 확인 중/);
  assert.doesNotMatch(html, /셀프 서브 도입|신규 사용자의 첫 주 활성화율|온보딩 체크리스트/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("ships product metadata and removes starter assets", async () => {
  const [layout, page, bootstrapRoute, integrationRoute, slackAuthRoute, slackDisconnectRoute, paceData, googleSession, googleSignInRoute, googleCallbackRoute, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integration-tokens/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/disconnect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/google/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/google/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /openGraph/);
  assert.doesNotMatch(layout, /\/og\.png/);
  assert.match(page, /MCP 연결 설정 복사/);
  assert.match(page, /앱 연동/);
  assert.match(page, /mobile-navigation/);
  assert.match(page, /더보기/);
  assert.match(page, /개인 연결/);
  assert.match(page, /워크스페이스 연결/);
  assert.match(page, /관리자만 설치/);
  assert.doesNotMatch(page, /OAuth Redirect URL|Slash Command URL/);
  assert.match(page, /연결 관리/);
  assert.match(page, /연결됨/);
  assert.match(page, /연결 대기/);
  assert.match(page, /연결 없음/);
  assert.match(page, /발급된 연결 키/);
  assert.match(page, /lastUsedAt/);
  assert.doesNotMatch(page, /<span>ChatGPT 연동<\/span><i/);
  assert.doesNotMatch(page, /revoke-link/);
  assert.match(page, /\/api\/integration-tokens/);
  assert.match(page, /\/api\/okr-organize/);
  assert.match(page, /OKR 대화/);
  assert.match(page, /정리하기/);
  assert.match(page, /OKR 만들기/);
  assert.match(page, /팀 OKR/);
  assert.match(page, /개인 OKR/);
  assert.match(page, /루틴부터/);
  assert.match(page, /이 기기의 새 대화에서도 계속 사용할 수 있습니다/);
  assert.match(integrationRoute, /공식 플러그인은 현재 지원하지 않으므로/);
  assert.match(integrationRoute, /\[mcp_servers\.okrptr\]/);
  assert.match(integrationRoute, /http_headers/);
  assert.match(integrationRoute, /Codex를 재시작/);
  assert.match(slackAuthRoute, /canManageTeam/);
  assert.match(slackDisconnectRoute, /canManageTeam/);
  assert.match(paceData, /getSlackConnection\(ownerId: string\)/);
  assert.match(page, /트리거 포인트/);
  assert.match(page, /무엇을 어떻게/);
  assert.match(page, /연결 해제/);
  assert.match(page, /Objective → Key Result → Initiative → Project → Task/);
  assert.match(page, /OKR이 오늘의 일로 이어지도록/);
  assert.match(page, /Connect your OKRs to today's work/);
  assert.match(page, /目標を実行に変えるワークスペース/);
  assert.match(page, /把目标变成行动的工作空间/);
  assert.match(page, /convertir objetivos en acción/);
  assert.match(page, /Google 계정으로 계속/);
  assert.match(page, /\/api\/bootstrap/);
  assert.doesNotMatch(page, /\/api\/auth\/session/);
  assert.match(bootstrapRoute, /Promise\.all/);
  assert.match(bootstrapRoute, /getTeam/);
  assert.match(bootstrapRoute, /listItems/);
  assert.match(paceData, /workspaceReady/);
  assert.match(page, /Google 계정 로그아웃/);
  assert.match(googleSession, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(googleSession, /crypto\.subtle\.verify\("HMAC"/);
  assert.match(googleSignInRoute, /googleSignInAuthorizationUrl/);
  assert.match(googleCallbackRoute, /createGoogleSessionCookie/);
  assert.match(paceData, /canonicalUserIdForGoogle/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", projectRoot)));
});
