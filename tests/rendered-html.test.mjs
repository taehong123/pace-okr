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

test("serves ChatGPT OAuth discovery metadata from well-known URLs", async () => {
  const protectedResourceResponse = await render("/.well-known/oauth-protected-resource");
  assert.equal(protectedResourceResponse.status, 200);
  assert.match(protectedResourceResponse.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.deepEqual(await protectedResourceResponse.json(), {
    resource: "http://localhost/api/mcp",
    authorization_servers: ["http://localhost"],
    scopes_supported: ["okrptr:read", "okrptr:write"],
    bearer_methods_supported: ["header"],
    resource_documentation: "http://localhost/#integrations",
  });

  const authorizationServerResponse = await render("/.well-known/oauth-authorization-server");
  assert.equal(authorizationServerResponse.status, 200);
  const authorizationServer = await authorizationServerResponse.json();
  assert.equal(authorizationServer.issuer, "http://localhost");
  assert.equal(authorizationServer.registration_endpoint, "http://localhost/oauth/register");
  assert.deepEqual(authorizationServer.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(authorizationServer.token_endpoint_auth_methods_supported, ["none"]);
});

test("ships product metadata and removes starter assets", async () => {
  const [layout, page, globals, bootstrapRoute, itemRoute, workspaceRoute, integrationRoute, okrOrganizeRoute, okrPlanRoute, slackAuthRoute, slackDisconnectRoute, slackAutomationRoute, slackAutomationTestRoute, slackAutomation, paceData, googleSession, googleSignInRoute, googleCallbackRoute, logoutRoute, packageJson, avatarRoute, schema, hosting, mcpRoute, mcpOAuth, protectedResourceRoute, authorizationServerRoute, oauthRegisterRoute, oauthAuthorizeRoute, oauthTokenRoute] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integration-tokens/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/okr-organize/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/okr-plan/route.ts", import.meta.url), "utf8"),
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
    readFile(new URL("../app/api/workspaces/avatar/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/mcp-oauth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[wellKnown]/oauth-protected-resource/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/[wellKnown]/oauth-authorization-server/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/oauth/register/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/oauth/authorize/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/oauth/token/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /openGraph/);
  assert.doesNotMatch(layout, /\/og\.png/);
  assert.match(page, /ChatGPT 연결 문구 복사/);
  assert.match(page, /앱 연동/);
  assert.match(page, /mobile-navigation/);
  assert.match(page, /workspace-mobile-home/);
  assert.match(page, /goToMobileHome/);
  assert.match(page, /aria-label="홈으로 이동"/);
  assert.match(page, /home: "AI 대화"/);
  assert.match(page, /assistant-sidebar-tab/);
  assert.match(page, /OKR 도우미/);
  assert.match(page, /aria-label="AI 대화 열기"/);
  assert.match(page, /currentWorkspace\.role !== "owner"/);
  assert.match(page, /freshWorkspaceDataReady/);
  assert.match(page, /Project DRI/);
  assert.match(page, /지금은 건너뛰기/);
  assert.match(page, /더보기/);
  assert.match(page, /개인 연결/);
  assert.match(page, /워크스페이스 연결/);
  assert.match(page, /내 Slack 워크스페이스에 연결/);
  assert.match(page, /view=integrations/);
  assert.match(page, /기술 설정이나 훅 URL을 입력할 필요 없이/);
  assert.match(page, /자동화 봇/);
  assert.match(page, /업무가 생성될 때/);
  assert.match(page, /업무 상태가 바뀔 때/);
  assert.match(page, /테스트 전송/);
  assert.match(page, /최근 전송 기록/);
  assert.match(page, /30일 동안 복구/);
  assert.match(page, /function WorkspaceAvatarDialog/);
  assert.match(page, /워크스페이스 이미지/);
  assert.match(page, /AI로 만들기/);
  assert.match(page, /생성하고 바로 적용/);
  assert.match(page, /prepareWorkspaceAvatar/);
  assert.match(page, /currentWorkspace\.role === "owner" \|\| currentWorkspace\.role === "admin"/);
  assert.match(globals, /workspace-avatar-preview/);
  assert.match(avatarRoute, /WORKSPACE_AVATARS\?: R2Bucket/);
  assert.match(avatarRoute, /"gpt-image-2"/);
  assert.match(avatarRoute, /quality: "low"/);
  assert.match(avatarRoute, /output_format: "webp"/);
  assert.match(avatarRoute, /verifiedImageType/);
  assert.match(avatarRoute, /OKRPTR_AI_MAX_IMAGE_REQUESTS_PER_DAY/);
  assert.match(schema, /avatarKey: text\("avatar_key"\)/);
  assert.match(hosting, /"r2": "WORKSPACE_AVATARS"/);
  assert.match(page, /삭제 예정/);
  assert.match(page, /workspaceDeletionLabel/);
  assert.match(workspaceRoute, /scheduleWorkspaceDeletionForUser/);
  assert.match(workspaceRoute, /restoreWorkspaceForUser/);
  assert.match(workspaceRoute, /permanentlyDeleteWorkspaceForUser/);
  assert.match(workspaceRoute, /payload\.confirmed !== true/);
  assert.match(workspaceRoute, /Test workspace names cannot be created in production/);
  assert.match(page, /permanentlyDeleteWorkspace/);
  assert.match(bootstrapRoute, /Cache-Control": "no-store"/);
  assert.match(bootstrapRoute, /okrptr_workspace_id/);
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
  assert.match(page, /현재 OKR과 실행 상황을 읽고/);
  assert.match(page, /필요한 다음 질문부터 이어갑니다/);
  assert.match(page, /답변 중/);
  assert.match(page, /보내기/);
  assert.match(page, /Objective 1개.*KR/);
  assert.match(page, /useState<View>\(\(\) => navigationFromLocation\(\)\.view\)/);
  assert.match(page, /Objective 직접 만들기/);
  assert.match(page, /AI 대화로 같이 만들기/);
  assert.match(page, /createItemCycleId/);
  assert.match(page, /setCreateItemKind\(kind\)/);
  assert.match(page, /cycleId: targetCycleId/);
  assert.match(page, /context\?\.cycleId \?\? defaultCycleId/);
  assert.doesNotMatch(page, /첫 핵심 결과 정의|첫 실행 방향 정리/);
  assert.match(page, /planStringFieldsWithValues\(data\.organized\.plan\)/);
  assert.match(page, /OKR 트리 초안/);
  assert.match(page, /KR 미지정 Initiative/);
  assert.match(page, /onMoveInitiative/);
  assert.match(page, /function OkrItemEditPanel/);
  assert.match(page, /상위 KR:/);
  assert.match(page, /for \(const child of byParent\.get\(entry\.id\) \?\? \[\]\) visit\(child\)/);
  assert.match(page, /cycleNodes\.filter\(\(entry\) => entry\.kind === "objective"\)\.forEach\(visit\)/);
  assert.doesNotMatch(page, /organizeLocally/);
  assert.match(page, /visibleFields\.has\("project"\)/);
  assert.match(page, /첫 Project를 만들어볼까요\?/);
  assert.match(page, /mode === "project"/);
  assert.match(page, /my_work: "내 업무"/);
  assert.match(layout, /okrptr\.theme/);
  assert.match(page, /type ThemeMode = "beige" \| "gray" \| "dark"/);
  assert.match(page, /베이지.*그레이.*다크/s);
  assert.match(page, /theme-picker/);
  assert.match(page, /chat-send-button/);
  assert.match(page, /메시지 보내기/);
  assert.match(globals, /--paper: #f3f2ee/);
  assert.match(globals, /html\[data-theme="gray"\]/);
  assert.match(globals, /html\[data-theme="dark"\]/);
  const myWorkView = page.match(/function MyWorkView[\s\S]*?function MyWorkSection/)?.[0] ?? "";
  assert.ok(
    myWorkView.indexOf('title="Task"') < myWorkView.indexOf('title="Project"')
      && myWorkView.indexOf('title="Project"') < myWorkView.indexOf('title="Routine"'),
    "My Work sections must be ordered Task, Project, Routine",
  );
  assert.match(page, /systemKey === "general"/);
  assert.doesNotMatch(page, /status: "inbox"|인박스에 저장|인박스에 추가/);
  assert.match(okrOrganizeRoute, /"onboarding".*"coach"/);
  assert.doesNotMatch(okrOrganizeRoute, /initiative context is required for project mode/);
  assert.match(okrOrganizeRoute, /UI will require the user to choose an existing Initiative before saving/);
  assert.match(okrOrganizeRoute, /Always answer in the user's language/);
  assert.match(okrOrganizeRoute, /leave every plan field empty/);
  assert.match(page, /팀 OKR/);
  assert.match(page, /개인 OKR/);
  assert.doesNotMatch(page, /루틴부터/);
  assert.match(page, /Routine 도우미/);
  assert.match(page, /브라우저 제어가 가능한 ChatGPT 대화/);
  assert.match(integrationRoute, /이 메시지를 보낸 것은 다음 연결 작업을 확인하고 명시적으로 승인한 것입니다/);
  assert.match(integrationRoute, /이미 승인된 단계는 추가 확인 없이 끝까지 실행해 주세요/);
  assert.match(integrationRoute, /OAuth 2\.1 메타데이터와 DCR, S256 PKCE 흐름/);
  assert.doesNotMatch(integrationRoute, /OKRPTR_ACCESS_TOKEN|Authorization: Bearer <OKRPTR_ACCESS_TOKEN>/);
  assert.match(integrationRoute, /같은 권한 설명을 반복하거나 다시 승인받지 말고/);
  assert.match(integrationRoute, /OKRPTR 연결을 계속할까요\?/);
  assert.match(integrationRoute, /사용자가 직접 해야 하는 마지막 한 단계만/);
  assert.match(protectedResourceRoute, /authorization_servers/);
  assert.match(authorizationServerRoute, /registration_endpoint/);
  assert.match(authorizationServerRoute, /code_challenge_methods_supported/);
  assert.match(oauthRegisterRoute, /token_endpoint_auth_method: "none"/);
  assert.match(oauthAuthorizeRoute, /code_challenge_method/);
  assert.match(oauthAuthorizeRoute, /callback\.searchParams\.set\("iss"/);
  assert.match(oauthTokenRoute, /exchangeMcpOAuthAuthorizationCode/);
  assert.match(mcpOAuth, /mcp_oauth_clients/);
  assert.match(mcpOAuth, /mcp_oauth_codes/);
  assert.match(mcpOAuth, /sha256Base64Url/);
  assert.match(mcpRoute, /resource_metadata/);
  assert.match(googleSession, /slice\(0, 4000\)/);
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
  assert.match(page, /parentId: projectItem\.id/);
  assert.match(page, /routineId: routine\.id/);
  assert.match(okrOrganizeRoute, /Routine is independent and may contain Task/);
  assert.match(okrOrganizeRoute, /Routine > Task is independent/);
  assert.match(okrOrganizeRoute, /Never concatenate separate Key Results or Initiatives/);
  assert.match(okrOrganizeRoute, /Polish every supported title while preserving its meaning, numbers, dates, and proper nouns/);
  assert.match(okrOrganizeRoute, /unassignedInitiatives/);
  assert.match(okrOrganizeRoute, /uniqueTitleMatch/);
  assert.match(okrOrganizeRoute, /if \(known && usedIds\.has\(known\.clientId\)\) return \[\]/);
  assert.match(okrOrganizeRoute, /recentConversation/);
  assert.match(okrOrganizeRoute, /workspaceContext/);
  assert.match(okrPlanRoute, /createOkrPlan/);
  assert.match(okrPlanRoute, /asTree\(payload\.tree\)/);
  assert.match(okrPlanRoute, /authorization\.userId/);
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
  assert.doesNotMatch(page, /visibleCount.*20/);
  assert.doesNotMatch(page, /더 보기/);
  assert.match(page, /aria-label="Project 필터"/);
  assert.match(page, /aria-label="Project 정렬"/);
  assert.match(page, /aria-label="Project 속성 관리" title="Project 속성 관리"/);
  assert.match(page, /aria-label="내 설정 닫기" title="내 설정 닫기"/);
  assert.match(page, /workspaceNameCounts/);
  assert.match(page, /생성 \$\{formatDateTime\(workspace\.createdAt\)\}/);
  assert.match(page, /Routine을 불러오지 못했습니다/);
  assert.match(page, /데일리 스크럼을 불러오지 못했습니다/);
  assert.match(page, /추천을 계산하지 못했습니다/);
  assert.match(page, /휴지통을 불러오지 못했습니다/);
  assert.match(page, /다시 시도/);
  assert.match(page, /savingChecklist/);
  assert.match(page, /Promise\.all\(\(kind === "project"/);
  assert.match(page, /void restoreRecord\(record\)/);
  assert.match(page, /void restoreItem\(entry\)/);
  assert.match(page, /cycleId=\{createItemCycle\?\.id \?\? null\}/);
  assert.match(page, /cycleId: kind === "task"/);
  assert.doesNotMatch(page, /\/api\/auth\/session/);
  assert.match(bootstrapRoute, /Promise\.all/);
  assert.match(bootstrapRoute, /Object\.assign\(\{\}, \.\.\.await Promise\.all/);
  assert.match(bootstrapRoute, /getTeam/);
  assert.match(bootstrapRoute, /listItems/);
  assert.match(bootstrapRoute, /Server-Timing/);
  assert.match(bootstrapRoute, /auth;dur=/);
  assert.match(bootstrapRoute, /workspace;dur=/);
  assert.match(bootstrapRoute, /data;dur=/);
  assert.match(paceData, /createdAt: workspace\.createdAt/);
  assert.match(paceData, /restoreTrashRecord/);
  assert.match(paceData, /itemAssignments: itemAssignmentRows/);
  assert.doesNotMatch(bootstrapRoute, /scope ===|scope !==/);
  assert.match(itemRoute, /payload\.cycleId === undefined \? undefined : asNullableString/);
  assert.match(paceData, /workspaceReady/);
  assert.match(paceData, /activatedWorkspaceIds/);
  assert.match(paceData, /createOkrPlan/);
  assert.match(paceData, /await d1\.batch\(statements\)/);
  assert.match(paceData, /Objective and at least one Key Result are required/);
  assert.match(paceData, /keyResultIds/);
  assert.match(paceData, /initiativeIds/);
  assert.match(paceData, /sortOrder: item\.sortOrder/);
  assert.match(paceData, /Parent and child must belong to the same OKR cycle/);
  assert.ok(
    paceData.indexOf("ALTER TABLE routines ADD COLUMN system_key") < paceData.indexOf("idx_routines_owner_system_key"),
    "routine compatibility columns must be added before dependent indexes",
  );
  assert.match(paceData, /schemaIsCurrent/);
  assert.match(paceData, /Validate every runtime compatibility sentinel in one D1 round trip/);
  assert.match(paceData, /LEFT JOIN project_documents AS project_document ON 1 = 0/);
  assert.match(paceData, /workspaceInitializationIsCurrent/);
  assert.match(paceData, /Keep the cold-path initialization audit to one D1 round trip/);
  assert.match(paceData, /AS legacy_hierarchy_exists/);
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
  assert.match(viteConfig, /idle Worker does not add a cold start before the first paint/);
  assert.match(viteConfig, /run_worker_first:\s*\["\/_vinext\/image"\]/);
  assert.doesNotMatch(viteConfig, /run_worker_first:\s*\["\/"/);
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

test("ships Project property, Task table, document, template, trash, and MCP surfaces", async () => {
  const [page, editor, propertiesRoute, documentsRoute, templatesRoute, itemTrashRoute, mcpRoute, paceData] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/project-block-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/properties/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/project-documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/project-templates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/item-trash/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /목록.*속성 관리.*템플릿 관리/s);
  assert.doesNotMatch(page, /setProjectTab\("archive"\)/);
  assert.doesNotMatch(page, /모든 Project·Task 선택|Project·Task 선택/);
  const treeView = page.match(/function TreeView[\s\S]*?function OkrEmptyState/)?.[0] ?? "";
  assert.doesNotMatch(treeView, /DeleteSelectCheckbox|onSelectItems|selectedItemIds/);
  assert.match(treeView, /expandedInitiatives/);
  assert.doesNotMatch(treeView, /okr-execution-disclosure|Project·Task.*?보기/);
  assert.match(treeView, /initiative-disclosure-hit/);
  assert.match(treeView, /aria-expanded=\{expanded\}/);
  assert.match(treeView, /aria-controls=\{`initiative-execution-\$\{entry\.id\}`\}/);
  assert.match(treeView, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(treeView, /executionItems\.length \|\| !expanded/);
  const myWorkView = page.match(/function MyWorkView[\s\S]*?function MyWorkSection/)?.[0] ?? "";
  assert.doesNotMatch(myWorkView, /DeleteSelectCheckbox|onSelectItems|selectedItemIds/);
  assert.match(page, /items=\{executionItems\}/);
  assert.match(page, /<TaskListView items=\{taskItems\}/);
  assert.match(page, /전체 선택/);
  assert.match(page, /연결 끊긴 Task/);
  assert.match(page, /bulk-delete-bar/);
  assert.match(page, /DeleteSelectCheckbox/);
  assert.match(page, /삭제한 Project·Task와 전체 데이터 정리 기록/);
  assert.match(page, /전체 OKR 클린업 기록/);
  assert.match(page, /confirmationText: "영구 삭제"/);
  assert.match(page, /연결된 Task/);
  assert.match(page, /템플릿 불러오기/);
  assert.doesNotMatch(page, /window\.(prompt|confirm)/);
  assert.match(page, /저장 중.*저장됨.*저장 실패/s);
  assert.match(page, /expectedVersion/);
  assert.match(editor, /BlockNoteSchema\.create/);
  assert.match(editor, /defaultBlockSpecs\.table/);
  assert.doesNotMatch(editor, /defaultBlockSpecs\.(image|video|audio|file)/);
  assert.match(propertiesRoute, /payload\.preview === true/);
  assert.match(propertiesRoute, /includeInactive/);
  assert.match(documentsRoute, /version conflict/i);
  assert.match(documentsRoute, /applyProjectTemplate/);
  assert.match(templatesRoute, /createProjectTemplate/);
  assert.match(templatesRoute, /deleteProjectTemplate/);
  assert.match(itemTrashRoute, /listTrashedItems/);
  assert.match(itemTrashRoute, /scope === "all_project_task"/);
  assert.match(itemTrashRoute, /restoreTrashedItems/);
  assert.match(itemTrashRoute, /permanentlyDeleteTrashedItems/);
  assert.match(mcpRoute, /list_project_templates/);
  assert.match(mcpRoute, /get_project_document/);
  assert.match(mcpRoute, /update_project_document/);
  assert.match(mcpRoute, /apply_project_template/);
  assert.ok(
    paceData.indexOf('ADD COLUMN system_key') < paceData.indexOf('idx_property_definitions_owner_system'),
    "property compatibility columns must be added before dependent indexes",
  );
  assert.match(paceData, /legacyValue: row\.value/);
  assert.match(paceData, /\.\.\.templateBlocks, \.\.\.existingBlocks/);
  assert.match(paceData, /export async function trashItems/);
  assert.match(paceData, /export async function restoreTrashedItems/);
  assert.match(paceData, /export async function permanentlyDeleteTrashedItems/);
  assert.match(paceData, /taskIdsByArchivedParent/);
  assert.match(paceData, /archiveProject[\s\S]*trashItems/);
  const legacyMigration = paceData.match(/async function migrateLegacyHierarchy[\s\S]*?\n}/)?.[0] ?? "";
  assert.doesNotMatch(legacyMigration, /INSERT[^\n]*legacy-project-/);
  assert.match(legacyMigration, /DELETE FROM items[\s\S]*legacy-project-/);
  assert.match(paceData, /workspaceInitializationIsCurrent\(ownerId\)\) return;[\s\S]*removeLegacySeedWorkspaceData\(ownerId\)/);
  assert.match(paceData, /Workspace name confirmation does not match/);
});

test("keeps the Task page as stable one-line rows with details in the side panel", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /aria-label="Task 목록"/);
  assert.match(page, /task-list-inline-meta/);
  assert.doesNotMatch(page, /task-list-status/);
  assert.match(page, /aria-label="Task 정보"/);
  assert.match(page, /onPatch\(\{ status:/);
  assert.match(page, /onPatch\(\{ priority:/);
  assert.match(styles, /\.task-list-open[^}]*grid-template-columns:[^}]*minmax\(260px, \.85fr\)/s);
  assert.match(styles, /\.task-list-open b, \.task-list-inline-meta[^}]*white-space: nowrap/s);
  assert.match(styles, /\.task-detail-panel \{ width: min\(520px, 100vw\); \}/);
});

test("defaults unlinked web Tasks to General and exposes direct bulk deletion", async () => {
  const [page, styles, paceData, itemsRoute, organizeRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/okr-organize/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /AI 대화로 추가/);
  assert.match(page, /연결 대상 · 선택 사항/);
  assert.match(page, /선택 안 함 — General에 저장/);
  assert.match(page, /연결할 Project·Routine이 없어 General\(기본\)에 저장됩니다/);
  assert.match(page, /Project·Routine에 연결하지 않은 Task가 모이는 기본 목록/);
  assert.doesNotMatch(page, /부모가 없는 Task/);
  assert.match(page, /initialRoutines=\{routines\}/);
  assert.match(page, /dailyScrumMemoryCache/);
  assert.match(page, /recommendationMemoryCache/);
  assert.match(page, /trashMemoryCache/);
  assert.match(page, /연결 끊긴 Task \{orphanedIds\.length\}개 선택/);
  assert.match(page, /task-selection-delete/);
  assert.doesNotMatch(page, /할 일을 입력하면 미분류 Task에 저장됩니다/);
  assert.match(styles, /\.task-selection-bar/);
  assert.match(styles, /\.page-create-actions/);
  assert.match(paceData, /if \(!projectId && !routineId\) routineId = \(await ensureGeneralRoutine\(ownerId\)\)\.id/);
  assert.match(paceData, /kind === "task" && !parentId && !routineId[\s\S]*?ensureGeneralRoutine\(ownerId\)/);
  assert.match(paceData, /export async function createLinkedTasks[\s\S]*?await d1\.batch/);
  assert.match(itemsRoute, /payload\.titles !== undefined/);
  assert.match(itemsRoute, /createLinkedTasks/);
  assert.match(organizeRoute, /mode === "task"/);
  assert.match(organizeRoute, /one or more short, actionable Task titles/);
});

test("uses distinct Project and Routine AI creation flows", async () => {
  const [page, styles, organizeRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/okr-organize/route.ts", import.meta.url), "utf8"),
  ]);

  assert.ok((page.match(/AI 대화로 추가/g) ?? []).length >= 3);
  assert.match(page, /Project 도우미/);
  assert.match(page, /Routine 도우미/);
  assert.match(page, /상위 Initiative/);
  assert.match(page, /Initiative 연결 없음/);
  assert.match(page, /createOpen=\{routineCreateOpen\}/);
  assert.match(styles, /\.page-create-actions > button[^}]*min-height: 36px/);
  assert.match(styles, /\.page-create-actions > button \{ min-height: 44px/);
  assert.match(organizeRoute, /"okr" \| "project" \| "routine" \| "task"/);
  assert.match(organizeRoute, /if \(mode === "routine"\)/);
  assert.match(organizeRoute, /Never connect the Routine to an Initiative or Project/);
  assert.match(organizeRoute, /routineCadence/);
});

test("limits Project and Task deletion to creators and accountable assignees", async () => {
  const [page, paceData, itemTrashRoute, projectArchiveRoute, cleanupRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/item-trash/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/project-archives/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace-cleanup/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(paceData, /class ItemDeletePermissionError/);
  assert.match(paceData, /item\?\.kind === "project" && assignment\.role === "project_dri"/);
  assert.match(paceData, /item\?\.kind === "task" && assignment\.role === "task_assignee"/);
  assert.match(paceData, /createdByUserId: input\.createdByUserId/);
  assert.match(paceData, /await assertItemDeletePermission\(ownerId, userId, deletionRoots\)/);
  assert.match(paceData, /await assertItemDeletePermission\(ownerId, userId, roots\)/);
  assert.match(itemTrashRoute, /status: 403/);
  assert.match(itemTrashRoute, /canDelete: deletePermissions/);
  assert.match(projectArchiveRoute, /authorization\.userId, projectId/);
  assert.match(page, /function canUserDeleteItem/);
  assert.match(page, /삭제 가능 항목 선택/);
  assert.match(page, /entry\.canDelete && <button className="danger"/);
  assert.match(cleanupRoute, /authorization\.role !== "owner" && authorization\.role !== "admin"/);
});

test("connects API data independently to Key Results and Projects", async () => {
  const [page, view, route, syncRoute, legacyRoute, legacySyncRoute, paceData, syncEngine, schema, worker, viteConfig, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/kr-data-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/data-connections/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/data-connections/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/kr-data-connections/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/kr-data-connections/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/kr-data-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0025_kr_data_connections.sql", import.meta.url), "utf8"),
  ]);
  assert.match(page, /id: "data", label: "데이터"/);
  assert.match(page, /rawView === "kr_data" \? "data"/);
  assert.match(page, /function ProjectDataSection/);
  assert.match(page, /tracksProgress = item\.kind === "key_result"/);
  assert.doesNotMatch(page, /objective\.progress\}%/);
  assert.match(page, /entry\.kind === "key_result" \|\| entry\.kind === "project" \|\| entry\.kind === "task"/);
  assert.match(view, /API URL/);
  assert.match(view, /connectionMemoryCache\.get\(cacheKey\)/);
  assert.match(view, /\["project", "Project"\]/);
  assert.match(view, /이 \{targetLabels\[item\.kind\]\}에 API 연결/);
  assert.match(view, /숫자 값 경로/);
  assert.match(view, /자동 갱신 주기/);
  assert.match(route, /createDataConnection/);
  assert.match(route, /itemId/);
  assert.match(syncRoute, /syncDataConnection/);
  assert.match(legacyRoute, /createKrDataConnection/);
  assert.match(legacySyncRoute, /syncKrDataConnection/);
  assert.match(paceData, /Private or local API addresses are not supported/);
  assert.match(paceData, /DATA_CONNECTION_TARGET_KINDS/);
  assert.match(syncEngine, /AbortSignal\.timeout\(10_000\)/);
  assert.match(syncEngine, /kind IN \('key_result', 'project'\)/);
  assert.match(syncEngine, /UPDATE items SET progress = \?, updated_at = \?.*kind = \?/);
  assert.match(schema, /kr_data_connections/);
  assert.match(schema, /itemId: text\("kr_item_id"\)/);
  assert.match(worker, /scheduled\(_controller/);
  assert.match(viteConfig, /crons: \["0 \* \* \* \*"\]/);
  assert.match(migration, /UPDATE `items` SET `progress` = 0 WHERE `kind` IN \('objective', 'initiative'\)/);
});

test("implements personal daily drafts and the managed Slack daily bot contract", async () => {
  const [page, styles, dailyDomain, schema, migration, skipMigration, isolationMigration, oauth, interactions, events, slackDaily, manifest, slackStatus, slackCallback, operationsGuide, customerGuide] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/daily-bot.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0026_slack_daily_bot.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0028_daily_skip.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0029_slack_workspace_isolation.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/slack-oauth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/interactions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/slack-daily.ts", import.meta.url), "utf8"),
    readFile(new URL("../slack-app-manifest.yml", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/slack/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/slack-production-setup.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/slack-customer-connect.md", import.meta.url), "utf8"),
  ]);
  assert.match(page, /내 데일리/);
  assert.match(page, /확정 및 공유/);
  assert.match(page, /작성 중인 초안은 상태만 표시/);
  assert.match(page, /DRI이지만 미완료 Task가 없는 Project/);
  assert.match(page, /오늘은 데일리를 스킵합니다/);
  assert.match(page, /본업 과중/);
  assert.match(page, /확정된 스킵 사유만 공개/);
  assert.match(page, /SlackDailySettingsPanel/);
  assert.match(styles, /\.daily-layout/);
  assert.match(styles, /\.integrations-page/);
  assert.match(styles, /\.integration-step/);
  assert.match(dailyDomain, /task\.status NOT IN \('done', 'development_done', 'archived'\)/);
  assert.match(dailyDomain, /assignment\.role = 'task_assignee'/);
  assert.match(dailyDomain, /source: "daily"/);
  assert.match(dailyDomain, /dueDate: date/);
  assert.match(dailyDomain, /daily_task_snapshots/);
  assert.match(schema, /slackDailyReminders/);
  assert.match(schema, /slackDailyPublications/);
  assert.match(migration, /idx_daily_scrums_legacy_owner_date/);
  assert.match(skipMigration, /skip_reason/);
  assert.match(skipMigration, /skip_note/);
  assert.match(isolationMigration, /CREATE UNIQUE INDEX `idx_slack_connections_owner`/);
  for (const scope of ["im:write", "im:history", "users:read.email", "channels:read", "groups:read"]) assert.match(oauth, new RegExp(scope.replace(".", "\\.")));
  assert.match(interactions, /view_submission/);
  assert.match(interactions, /skip_reason/);
  assert.match(slackDaily, /오늘 데일리 스킵/);
  assert.match(interactions, /block_suggestion/);
  assert.match(events, /slack_event_receipts/);
  assert.match(manifest, /https:\/\/okrptr\.com\/api\/slack\/interactions/);
  assert.match(manifest, /message\.im/);
  assert.doesNotMatch(manifest, /incoming-webhook/);
  for (const state of ["platform_unavailable", "workspace_disconnected", "reauthorization_required", "connected"]) assert.match(slackStatus, new RegExp(state));
  for (const field of ["connectionScope", "distributionMode", "connectedTeam"]) assert.match(slackStatus, new RegExp(field));
  for (const code of ["slack_admin_approval_required", "workspace_already_connected", "authorization_cancelled", "missing_scope", "oauth_exchange_failed"]) assert.match(`${oauth}\n${slackCallback}`, new RegExp(code));
  assert.match(operationsGuide, /일반 고객은 이 절차를 수행하지 않으며/);
  assert.doesNotMatch(operationsGuide, /AllVibe/i);
  assert.match(operationsGuide, /테스트 DM/);
  assert.match(customerGuide, /훅 URL, Client ID, Client Secret을 입력할 필요는 없다/);
  assert.match(customerGuide, /다른 고객의 Slack이나 운영자의 테스트 Slack과 연결되지 않는다/);
});

test("uses warm-neutral KR and Initiative hierarchy surfaces", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /--okr-card-bg: #fdfdfc/);
  assert.match(styles, /--okr-card-border: #dad9d6/);
  assert.match(styles, /--kr-badge-bg: #f6edea/);
  assert.match(styles, /--kr-badge-text: #7d5e54/);
  assert.match(styles, /--kr-rail: #a18072/);
  assert.match(styles, /--initiative-badge-bg: #eff1ef/);
  assert.match(styles, /--initiative-badge-text: #60655f/);
  assert.match(styles, /--initiative-rail: #898e87/);
  assert.match(styles, /\.hierarchy-kind-key_result \{[^}]*border-left: 2px solid var\(--kr-rail\)[^}]*box-shadow: none/);
  assert.match(styles, /\.hierarchy-kind-initiative \{[^}]*border-left: 2px solid var\(--initiative-rail\)[^}]*box-shadow: none/);
  assert.match(styles, /\.hierarchy-kind-initiative \.initiative-execution-summary \{ color: var\(--muted\); \}/);
  assert.match(styles, /--kr-badge-bg: #43302b/);
  assert.match(styles, /--initiative-badge-bg: #30322e/);
  assert.doesNotMatch(styles, /--kr-soft|--initiative-soft|#42627a|#426653|#e8eff4|#e8f0eb/);
});

test("uses a restrained large-desktop density without scaling smaller viewports", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const largeDesktop = styles.match(/@media \(min-width: 1800px\) \{([\s\S]*)\}\s*$/)?.[1] ?? "";

  assert.ok(largeDesktop);
  assert.match(largeDesktop, /grid-template-columns: 246px minmax\(0, 1fr\)/);
  assert.match(largeDesktop, /width: min\(1600px, 100%\)/);
  assert.match(largeDesktop, /workspace-topbar, \.app-loading-topbar \{ height: 46px/);
  assert.match(largeDesktop, /page-header h1, \.app-loading-copy h1 \{ font-size: 28px/);
  assert.match(largeDesktop, /hierarchy-row \{ min-height: 56px/);
  assert.match(largeDesktop, /task-table-row \{ min-height: 42px/);
  assert.match(largeDesktop, /task-list-row \{ min-height: 54px/);
  assert.match(largeDesktop, /routine-card b \{ font-size: 13px/);
  assert.match(largeDesktop, /my-work-item \{ min-height: 56px/);
  assert.doesNotMatch(largeDesktop, /\bzoom\s*:|transform\s*:\s*scale/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /@media \(max-width: 980px\)/);
});
