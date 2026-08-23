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
    "OKRPTR를 이 Codex 대화에 연결해 주세요. 공식 플러그인 메뉴는 사용하지 않습니다.",
    "",
    `워크스페이스: ${workspaceName}`,
    `API 안내: ${origin}/api/codex-guide`,
    `API 기준 주소: ${origin}`,
    `OKRPTR_ACCESS_TOKEN: ${token}`,
    "",
    "다음 규칙을 지켜 주세요.",
    "1. 먼저 API 안내를 읽고, Authorization: Bearer <OKRPTR_ACCESS_TOKEN> 헤더로 워크스페이스 규칙과 현재 항목을 조회해 연결을 확인합니다.",
    "2. 이 토큰은 답변, 코드, 파일, 커밋, 로그에 다시 출력하지 말고 현재 대화의 OKRPTR 호출에만 사용합니다.",
    "3. 사용자가 OKR, Project, Task, Routine에 관한 조회나 변경을 요청하면 OKRPTR API를 실제로 호출하고 결과를 짧게 보고합니다. 플러그인이 없다는 이유로 설명만 하지 않습니다.",
    "4. 조회는 바로 실행합니다. 생성과 일반 수정은 사용자의 요청이 명확하면 실행합니다. 삭제, 전체 정리, 멤버 변경처럼 되돌리기 어렵거나 다른 사람에게 영향을 주는 작업은 실행 직전에 대상과 영향을 확인합니다.",
    "5. 계층은 Objective > Key Result > Initiative > Project > Task입니다. Routine은 별도이며 Task를 연결할 수 있습니다. 애매한 메모는 먼저 inbox Task로 저장하고, 구조가 명확할 때만 상위 항목에 연결합니다.",
    "6. API 원문 JSON을 길게 보여주지 말고 무엇을 조회하거나 바꿨는지 한국어로 요약합니다.",
    "",
    "지금 바로 연결을 확인한 뒤 워크스페이스 이름과 현재 Objective, Project, Task, Routine 개수만 알려 주세요.",
  ].join("\n");
}
