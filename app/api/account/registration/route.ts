const retired = () => Response.json({
  error: "가입은 인증된 Google 이메일로 즉시 완료됩니다. 마케팅 동의는 /api/account/marketing-consent에서 관리합니다.",
  code: "account_registration_retired",
}, { status: 410, headers: { "Cache-Control": "no-store" } });

export async function GET() { return retired(); }
export async function PATCH() { return retired(); }
