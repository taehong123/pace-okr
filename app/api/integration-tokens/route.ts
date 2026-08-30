import {
  authorizeRequest,
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

  const team = await getTeam(authorization.ownerId, authorization.userId);
  const origin = new URL(request.url).origin;
  return Response.json({
    prompt: buildChatGptPrompt(origin, team.workspace.name),
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const id = new URL(request.url).searchParams.get("id")?.trim() || undefined;
  return Response.json(await revokeIntegrationTokens(authorization, id));
}

function buildChatGptPrompt(origin: string, workspaceName: string) {
  return [
    "아래 OKRPTR MCP를 현재 로그인된 ChatGPT 계정에 지금 연결해 주세요. 이 메시지를 보낸 것은 다음 연결 작업을 확인하고 명시적으로 승인한 것입니다: ChatGPT 개발자 모드 활성화, 아래 MCP 서버 등록, OKRPTR OAuth 로그인, 워크스페이스 조회·수정 연결 저장.",
    "설정 방법이나 주의사항만 설명하지 말고 브라우저 컨트롤로 ChatGPT 설정 화면을 직접 열어, 이미 승인된 단계는 추가 확인 없이 끝까지 실행해 주세요.",
    "",
    `워크스페이스: ${workspaceName}`,
    `MCP 서버 주소: ${origin}/api/mcp`,
    "",
    "다음 순서로 처리해 주세요.",
    "1. 브라우저 컨트롤로 ChatGPT 설정을 열고, 필요한 경우 개발자 모드를 바로 켠 뒤 플러그인 또는 커스텀 MCP 연결 추가 화면으로 이동합니다.",
    "2. 연결 이름은 OKRPTR, 설명은 'OKR, Project, Task, Routine을 관리하는 워크스페이스 도구'로 설정하고 위 MCP 서버 주소를 등록합니다.",
    "3. 고정 Authorization 헤더나 API 토큰을 직접 입력하지 않습니다. MCP 서버가 제공하는 OAuth 2.1 메타데이터와 DCR, S256 PKCE 흐름을 사용하고, 표시되는 OKRPTR 로그인 화면에서 현재 계정으로 인증합니다.",
    "4. 개발자 모드 활성화, MCP 주소 등록, OAuth 로그인, 조회·수정 연결 저장은 이 메시지에서 이미 승인했습니다. 같은 권한 설명을 반복하거나 다시 승인받지 말고 바로 진행합니다. ChatGPT 화면이 사람의 확인 없이는 진행되지 않는 단계에서만 'OKRPTR 연결을 계속할까요?'라고 한 문장으로 한 번만 묻습니다.",
    "5. 연결을 저장한 뒤 새 대화에서 OKRPTR 연결을 활성화하고 MCP 도구 목록을 조회합니다. 워크스페이스 규칙과 현재 항목을 실제로 조회해 연결을 확인합니다.",
    "6. 브라우저 컨트롤이나 계정 권한 때문에 직접 설정할 수 없다면 연결된 것처럼 말하지 말고, 사용자가 직접 해야 하는 마지막 한 단계만 짧고 정확하게 알려 주세요.",
    "7. 이후 사용자가 OKR, Project, Task, Routine에 관한 조회나 변경을 요청하면 OKRPTR MCP 도구를 실제로 호출합니다. 조회는 바로 실행하고, 삭제·전체 정리·멤버 변경은 실행 직전에 대상과 영향을 확인합니다.",
    "8. OKR 계층은 Objective > Key Result > Initiative > Project > Task입니다. Routine은 Initiative 연결이 필요 없는 독립 실행 컨테이너이며 Task를 가질 수 있습니다. Project나 개별 Routine이 없는 Task는 미분류 Task 저장소에 저장합니다.",
    "",
    "지금 바로 브라우저 컨트롤로 설정과 연결 확인을 완료한 뒤, 워크스페이스 이름과 현재 Objective, Project, Task, Routine 개수만 알려 주세요.",
  ].join("\n");
}
