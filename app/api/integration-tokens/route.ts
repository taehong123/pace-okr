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

  const { token, connection } = await createIntegrationToken(authorization, "ChatGPT MCP connection");
  const team = await getTeam(authorization.ownerId, authorization.userId);
  const origin = new URL(request.url).origin;
  return Response.json({
    connection,
    prompt: buildChatGptPrompt(origin, team.workspace.name, token),
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const id = new URL(request.url).searchParams.get("id")?.trim() || undefined;
  return Response.json(await revokeIntegrationTokens(authorization, id));
}

function buildChatGptPrompt(origin: string, workspaceName: string, token: string) {
  return [
    "아래 OKRPTR MCP를 현재 로그인된 ChatGPT 계정에 연결해 주세요. 설정 방법만 설명하지 말고, 브라우저 컨트롤을 사용해 ChatGPT 설정 화면을 직접 열고 가능한 단계는 끝까지 실행해 주세요.",
    "",
    `워크스페이스: ${workspaceName}`,
    `MCP 서버 주소: ${origin}/mcp`,
    `OKRPTR_ACCESS_TOKEN: ${token}`,
    "",
    "다음 순서로 처리해 주세요.",
    "1. 브라우저 컨트롤로 ChatGPT 설정을 열고, 필요한 경우 개발자 모드를 켠 뒤 플러그인 또는 커스텀 MCP 연결 추가 화면으로 이동합니다.",
    "2. 연결 이름은 OKRPTR, 설명은 'OKR, Project, Task, Routine을 관리하는 워크스페이스 도구'로 설정하고 위 MCP 서버 주소를 등록합니다.",
    "3. 인증 입력란이 있으면 Authorization: Bearer <OKRPTR_ACCESS_TOKEN>으로 설정합니다. 토큰은 인증 입력란에만 넣고 답변, 화면 설명, 파일, 코드, 커밋, 로그에 다시 출력하지 않습니다.",
    "4. 로그인, 2단계 인증, 브라우저 권한, 되돌리기 어려운 최종 승인처럼 사용자가 직접 해야 하는 단계에서만 한 번 요청합니다. 그 외에는 중간마다 승인 여부를 반복해서 묻지 말고 계속 진행합니다.",
    "5. 연결을 저장한 뒤 새 대화에서 OKRPTR 연결을 활성화하고 MCP 도구 목록을 조회합니다. 워크스페이스 규칙과 현재 항목을 실제로 조회해 연결을 확인합니다.",
    "6. 브라우저 컨트롤이나 계정 권한 때문에 직접 설정할 수 없다면 연결된 것처럼 말하지 말고, 사용자가 직접 해야 하는 마지막 한 단계만 짧고 정확하게 알려 주세요.",
    "7. 이후 사용자가 OKR, Project, Task, Routine에 관한 조회나 변경을 요청하면 OKRPTR MCP 도구를 실제로 호출합니다. 조회는 바로 실행하고, 삭제·전체 정리·멤버 변경은 실행 직전에 대상과 영향을 확인합니다.",
    "8. OKR 계층은 Objective > Key Result > Initiative > Project > Task입니다. Routine은 Initiative 연결이 필요 없는 독립 실행 컨테이너이며 Task를 가질 수 있습니다. Project나 개별 Routine이 없는 Task는 미분류 Task 저장소에 저장합니다.",
    "",
    "지금 바로 브라우저 컨트롤로 설정과 연결 확인을 완료한 뒤, 워크스페이스 이름과 현재 Objective, Project, Task, Routine 개수만 알려 주세요.",
  ].join("\n");
}
