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
  const [layout, page, bootstrapRoute, integrationRoute, slackAuthRoute, slackDisconnectRoute, paceData, googleSession, googleSignInRoute, googleCallbackRoute, logoutRoute, packageJson] = await Promise.all([
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
    readFile(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /openGraph/);
  assert.doesNotMatch(layout, /\/og\.png/);
  assert.match(page, /ChatGPT 연결 문구 복사/);
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
  assert.match(page, /브라우저 제어가 가능한 ChatGPT 대화/);
  assert.match(integrationRoute, /브라우저 컨트롤을 사용해 ChatGPT 설정 화면을 직접 열고/);
  assert.match(integrationRoute, /Authorization: Bearer <OKRPTR_ACCESS_TOKEN>/);
  assert.match(integrationRoute, /중간마다 승인 여부를 반복해서 묻지 말고/);
  assert.match(integrationRoute, /사용자가 직접 해야 하는 마지막 한 단계만/);
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
  assert.match(page, /Google로 이동 중/);
  assert.match(page, /GOOGLE_BROWSER_SIGN_IN_STATE_PREFIX/);
  assert.match(page, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(page, /window\.location\.assign\(url\.toString\(\)\)/);
  assert.match(page, /\/api\/bootstrap/);
  assert.doesNotMatch(page, /\/api\/auth\/session/);
  assert.match(bootstrapRoute, /Promise\.all/);
  assert.match(bootstrapRoute, /getTeam/);
  assert.match(bootstrapRoute, /listItems/);
  assert.match(paceData, /workspaceReady/);
  assert.match(paceData, /schemaIsCurrent/);
  assert.match(paceData, /workspaceInitializationIsCurrent/);
  assert.match(paceData, /DELETE FROM google_oauth_states WHERE expires_at <=/);
  assert.match(paceData, /delete\(googleOAuthStates\).*returning/);
  assert.match(page, /Google 계정 로그아웃/);
  assert.match(googleSession, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(googleSession, /crypto\.subtle\.verify\("HMAC"/);
  assert.match(googleSession, /createGoogleSignInState/);
  assert.match(googleSession, /readGoogleSignInState/);
  assert.match(googleSession, /readGoogleBrowserSignInState/);
  assert.match(googleSignInRoute, /googleSignInAuthorizationUrl/);
  assert.match(googleSignInRoute, /createGoogleSignInState/);
  assert.doesNotMatch(googleSignInRoute, /createGoogleOAuthState/);
  assert.match(googleSignInRoute, /"Set-Cookie": signIn\.cookie/);
  assert.match(googleCallbackRoute, /createGoogleSessionCookie/);
  assert.match(googleCallbackRoute, /readGoogleSignInState/);
  assert.match(googleCallbackRoute, /readGoogleBrowserSignInState/);
  assert.match(googleCallbackRoute, /await import\("@\/lib\/pace-data"\)/);
  assert.match(googleCallbackRoute, /"Set-Cookie": await createGoogleSessionCookie/);
  assert.match(googleCallbackRoute, /const headers = new Headers/);
  assert.match(googleCallbackRoute, /return new Response\(null, \{ status: 303, headers \}\)/);
  assert.match(logoutRoute, /"Set-Cookie": clearGoogleSessionCookie/);
  assert.match(paceData, /canonicalUserIdForGoogle/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", projectRoot)));
});
