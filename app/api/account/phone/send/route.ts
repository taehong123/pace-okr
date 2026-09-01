export async function POST() {
  return Response.json({ error: "휴대전화 인증은 사용하지 않습니다. 인증된 Google 이메일로 바로 가입할 수 있습니다.", code: "phone_verification_retired" }, { status: 410 });
}
