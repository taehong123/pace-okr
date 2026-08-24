import {
  authorizeRequest,
  createIntegrationToken,
  getTeam,
  listIntegrationTokens,
  revokeIntegrationTokens,
} from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  return Response.json({ connections: await listIntegrationTokens(authorization) });
}

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;

  const { token, connection } = await createIntegrationToken(authorization, "Codex conversation");
  const team = await getTeam(authorization.ownerId, authorization.userId);
  const origin = new URL(request.url).origin;
  return Response.json({
    connection,
    prompt: buildCodexPrompt(origin, team.workspace.name, token),
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const id = new URL(request.url).searchParams.get("id")?.trim() || undefined;
  return Response.json(await revokeIntegrationTokens(authorization, id));
}

function buildCodexPrompt(origin: string, workspaceName: string, token: string) {
  return [
    "OKRPTR 공식 플러그인은 현재 지원하지 않으므로, 아래 정보로 OKRPTR MCP 서버를 이 Codex에 직접 등록해 주세요.",
    "",
    `워크스페이스: ${workspaceName}`,
    `MCP 서버 주소: ${origin}/mcp`,
    `OKRPTR_ACCESS_TOKEN: ${token}`,
    "",
    "다음 순서로 설정해 주세요.",
    "1. 현재 사용자의 Codex 설정 파일(~/.codex/config.toml 또는 CODEX_HOME/config.toml)을 찾습니다. 다른 설정은 절대 덮어쓰지 않습니다.",
    "2. 기존 mcp_servers.okrptr 항목만 새 값으로 교체하거나, 없으면 아래 설정을 추가합니다.",
    "",
    "[mcp_servers.okrptr]",
    `url = "${origin}/mcp"`,
    `http_headers = { Authorization = "Bearer ${token}" }`,
    "enabled = true",
    "default_tools_approval_mode = \"writes\"",
    "",
    "3. 토큰은 사용자 Codex 설정에만 저장합니다. 답변, 프로젝트 파일, 소스 코드, 커밋, 일반 로그에는 다시 출력하지 않습니다.",
    "4. Authorization: Bearer <OKRPTR_ACCESS_TOKEN>으로 MCP 서버에 연결해 도구 목록을 조회하고, 워크스페이스 규칙과 현재 항목을 실제로 조회해 연결을 확인합니다.",
    "5. 설정이 끝나면 Codex를 재시작해야 한다고 안내합니다. 이 설정은 같은 Codex 호스트의 데스크톱 앱, CLI, IDE 확장에서 공유되며 새 대화에도 유지됩니다.",
    "6. 사용자가 OKR, Project, Task, Routine에 관한 조회나 변경을 요청하면 OKRPTR MCP 도구를 실제로 호출합니다. 조회는 바로 실행하고, 삭제·전체 정리·멤버 변경은 실행 직전에 대상과 영향을 확인합니다.",
    "7. 계층은 Objective > Key Result > Initiative > Project > Task입니다. Routine은 별도이며 Task를 연결할 수 있습니다. 애매한 메모는 먼저 inbox Task로 저장합니다.",
    "",
    "지금 바로 설정과 연결 확인을 완료한 뒤, 워크스페이스 이름과 현재 Objective, Project, Task, Routine 개수만 알려 주세요.",
  ].join("\n");
}
