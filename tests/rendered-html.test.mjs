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

async function renderAsset(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("asset-test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`),
    {
      ASSETS: {
        fetch: async () => new Response("asset", { status: 200, headers: { "Content-Type": "text/javascript" } }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the OKRPTR application loading shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("cache-control") ?? "", /public, max-age=0, stale-while-revalidate=86400/);
  assert.match(response.headers.get("cloudflare-cdn-cache-control") ?? "", /public, max-age=31536000, stale-while-revalidate=86400/);

  const html = await response.text();
  assert.match(html, /<title>OKRPTR - 목표를 오늘의 실행으로<\/title>/);
  assert.match(html, /OKRPTR/);
  assert.match(html, /app-loading-shell/);
  assert.match(html, /목표와 실행을 준비하고 있습니다/);
  assert.match(html, /워크스페이스와 오늘의 할 일을 불러오는 중입니다/);
  assert.doesNotMatch(html, /워크스페이스 로그인|세션 확인 중/);
  assert.doesNotMatch(html, /셀프 서브 도입|신규 사용자의 첫 주 활성화율|온보딩 체크리스트/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("ships product metadata and removes starter assets", async () => {
  const [layout, page, bootstrapRoute, itemRoute, workspaceRoute, integrationRoute, okrOrganizeRoute, slackAuthRoute, slackDisconnectRoute, slackAutomationRoute, slackAutomationTestRoute, slackAutomation, paceData, googleSession, googleSignInRoute, googleCallbackRoute, logoutRoute, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integration-tokens/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/okr-organize/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/disconnect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/automations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/automations/test/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/slack-automation.ts", import.meta.url), "utf8"),
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
  assert.match(page, /label: "AI 대화"/);
  assert.match(page, /home: "AI 대화"/);
  assert.match(page, /더보기/);
  assert.match(page, /개인 연결/);
  assert.match(page, /워크스페이스 연결/);
  assert.match(page, /관리자만 연결/);
  assert.match(page, /자동화 봇/);
  assert.match(page, /업무가 생성될 때/);
  assert.match(page, /업무 상태가 바뀔 때/);
  assert.match(page, /테스트 전송/);
  assert.match(page, /최근 전송 기록/);
  assert.match(page, /30일 동안 복구/);
  assert.match(page, /삭제 예정/);
  assert.match(page, /workspaceDeletionLabel/);
  assert.match(workspaceRoute, /scheduleWorkspaceDeletionForUser/);
  assert.match(workspaceRoute, /restoreWorkspaceForUser/);
  assert.match(bootstrapRoute, /Cache-Control": "no-store"/);
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
  assert.match(page, /OKRPTR 대화/);
  assert.match(page, /가벼운 질문/);
  assert.match(page, /답변 중/);
  assert.match(page, /보내기/);
  assert.match(page, /OKR 만들기/);
  assert.match(page, /useState<View>\("okr"\)/);
  assert.match(page, /Objective 직접 만들기/);
  assert.match(page, /AI 대화로 같이 만들기/);
  assert.match(page, /createItemCycleId/);
  assert.match(page, /setCreateItemKind\(kind\)/);
  assert.match(page, /cycleId: targetCycleId/);
  assert.match(page, /context\?\.cycleId \?\? defaultCycleId/);
  assert.doesNotMatch(page, /첫 핵심 결과 정의|첫 실행 방향 정리/);
  assert.match(page, /planFieldsWithValues\(mergedPlan\)/);
  assert.match(page, /visibleFields\.has\("project"\)/);
  assert.match(page, /첫 Project를 만들어볼까요\?/);
  assert.match(page, /mode === "project"/);
  assert.match(page, /my_work: "내 업무"/);
  assert.match(page, /systemKey === "general"/);
  assert.doesNotMatch(page, /status: "inbox"|인박스에 저장|인박스에 추가/);
  assert.match(okrOrganizeRoute, /payload\.mode === "project"/);
  assert.match(okrOrganizeRoute, /initiative context is required for project mode/);
  assert.match(okrOrganizeRoute, /Always respond to the user's actual message first/);
  assert.match(okrOrganizeRoute, /leave every plan field empty/);
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
  assert.match(slackAutomationRoute, /canManageTeam/);
  assert.match(slackAutomationRoute, /listSlackAutomationDeliveries/);
  assert.match(slackAutomationTestRoute, /testSlackAutomation/);
  assert.match(slackAutomation, /chat\.postMessage/);
  assert.match(slackAutomation, /title\|status\|from_status\|priority\|kind\|workspace/);
  assert.match(slackAutomation, /replace\(\/&\/g, "&amp;"\)/);
  assert.match(paceData, /getSlackConnection\(ownerId: string\)/);
  assert.match(paceData, /dispatchSlackAutomationEvent/);
  assert.match(paceData, /scheduledDeletionAt/);
  assert.match(paceData, /purgeExpiredWorkspaces/);
  assert.match(paceData, /onConflictDoNothing/);
  assert.match(page, /트리거 포인트/);
  assert.match(page, /무엇을 어떻게/);
  assert.match(page, /연결 해제/);
  assert.match(page, /Objective → Key Result → Initiative → Project → Task \/ Routine → Task/);
  assert.match(page, /taskParent/);
  assert.match(page, /routineId: taskUsesRoutine \? routineItem\?\.id : undefined/);
  assert.match(okrOrganizeRoute, /Routine is a Project-like execution container but remains independent from the OKR hierarchy/);
  assert.match(okrOrganizeRoute, /independent execution: Routine > Task/);
  assert.doesNotMatch(paceData, /validateRoutineInitiative|idx_routines_owner_initiative/);
  assert.match(page, /OKR이 오늘의 일로 이어지도록/);
  assert.match(page, /Connect your OKRs to today's work/);
  assert.match(page, /目標を実行に変えるワークスペース/);
  assert.match(page, /把目标变成行动的工作空间/);
  assert.match(page, /convertir objetivos en acción/);
  assert.match(page, /Google 계정으로 계속/);
  assert.match(page, /Google로 이동 중/);
  assert.match(page, /AppLoadingScreen/);
  assert.match(page, /GOOGLE_BROWSER_SIGN_IN_STATE_PREFIX/);
  assert.match(page, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(page, /window\.location\.assign\(url\.toString\(\)\)/);
  assert.match(page, /\/api\/bootstrap/);
  assert.match(page, /__OKRPTR_BOOTSTRAP_REQUEST__/);
  assert.match(page, /fetchBootstrapPayload/);
  assert.doesNotMatch(page, /scope=shell|scope=data/);
  assert.match(page, /workspaceDataState/);
  assert.match(page, /워크스페이스 데이터를 불러오지 못했습니다/);
  assert.match(page, /visibleCount.*20/);
  assert.match(page, /더 보기/);
  assert.match(page, /aria-label="Project 필터" title="Project 필터"/);
  assert.match(page, /aria-label="Project 정렬" title="Project 정렬"/);
  assert.match(page, /aria-label="Project 속성 관리" title="Project 속성 관리"/);
  assert.match(page, /aria-label="내 설정 닫기" title="내 설정 닫기"/);
  assert.match(page, /workspaceNameCounts/);
  assert.match(page, /생성 \$\{formatDateTime\(workspace\.createdAt\)\}/);
  assert.match(page, /루틴을 불러오지 못했습니다/);
  assert.match(page, /데일리 스크럼을 불러오지 못했습니다/);
  assert.match(page, /추천을 계산하지 못했습니다/);
  assert.match(page, /휴지통을 불러오지 못했습니다/);
  assert.match(page, /다시 시도/);
  assert.match(page, /savingChecklist/);
  assert.match(page, /Promise\.all\(\(kind === "project"/);
  assert.match(page, /void restore\(record\)/);
  assert.match(page, /cycleId=\{createItemCycle\?\.id \?\? null\}/);
  assert.match(page, /cycleId: kind === "task"/);
  assert.doesNotMatch(page, /\/api\/auth\/session/);
  assert.match(bootstrapRoute, /Promise\.all/);
  assert.match(bootstrapRoute, /Object\.assign\(\{\}, \.\.\.await Promise\.all/);
  assert.match(bootstrapRoute, /getTeam/);
  assert.match(bootstrapRoute, /listItems/);
  assert.match(paceData, /createdAt: workspace\.createdAt/);
  assert.match(paceData, /restoreTrashRecord/);
  assert.match(paceData, /itemAssignments: itemAssignmentRows/);
  assert.doesNotMatch(bootstrapRoute, /scope ===|scope !==/);
  assert.match(itemRoute, /payload\.cycleId === undefined \? undefined : asNullableString/);
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

test("prerenders the startup shell and caches hashed assets", async () => {
  const [layout, viteConfig, assetHeaders, paceData, staticHtml, worker, publishScript, serviceWorker, generatedServiceWorker] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/_headers", import.meta.url), "utf8"),
    readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/index.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/publish-prerender.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/sw.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(layout, /next\/headers|await headers\(\)/);
  assert.match(layout, /__OKRPTR_BOOTSTRAP_REQUEST__/);
  assert.match(layout, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(viteConfig, /prerender:\s*\{\s*routes:\s*"\*"\s*\}/);
  assert.match(viteConfig, /run_worker_first:\s*\["\/", "\/_next\/static\/\*", "\/favicon\.svg", "\/sw\.js"\]/);
  assert.match(assetHeaders, /max-age=31536000, immutable/);
  assert.match(assetHeaders, /Cloudflare-CDN-Cache-Control: public, max-age=31536000, immutable/);
  assert.match(assetHeaders, /Cloudflare-CDN-Cache-Control: public, max-age=31536000, stale-while-revalidate=86400/);
  assert.doesNotMatch(layout, /Geist_Mono|font-geist-mono/);
  assert.doesNotMatch(paceData, /LEFT JOIN workspace_members AS member ON 1 = 0/);
  assert.match(paceData, /deletion_requested_by_user_id[\s\S]*FROM workspaces[\s\S]*LIMIT 0/);
  assert.match(staticHtml, /__OKRPTR_BOOTSTRAP_REQUEST__/);
  assert.match(staticHtml, /app-loading-shell/);
  assert.match(worker, /Cloudflare-CDN-Cache-Control/);
  assert.match(worker, /pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(worker, /HASHED_ASSET_CACHE/);
  assert.match(worker, /APP_SHELL_EDGE_CACHE = "public, max-age=31536000, stale-while-revalidate=86400"/);
  assert.match(staticHtml, /serviceWorker\.register/);
  assert.match(publishScript, /build:cache/);
  assert.match(publishScript, /build:precache/);
  assert.match(serviceWorker, /PRECACHE_URLS/);
  assert.match(serviceWorker, /staleWhileRevalidate/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /cacheFirst/);
  const indexAsset = staticHtml.match(/\/_next\/static\/chunks\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  assert.ok(indexAsset);
  assert.match(generatedServiceWorker, new RegExp(indexAsset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(generatedServiceWorker, /const CACHE_NAME = "okrptr-assets-[A-Za-z0-9_-]+"; \/\/ build:cache/);
});

test("serves hashed assets with immutable browser and edge caching", async () => {
  const staticHtml = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const assetPath = staticHtml.match(/\/_next\/static\/chunks\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  assert.ok(assetPath);
  const response = await renderAsset(assetPath);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "public, max-age=31536000, immutable");
});
