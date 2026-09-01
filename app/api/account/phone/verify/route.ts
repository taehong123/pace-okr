import { env } from "cloudflare:workers";
import { completeAccountRegistration, type AccountRegistrationRuntimeEnv } from "@/lib/account-registration";
import { authorizeRequest } from "@/lib/pace-data";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, { allowIncompleteRegistration: true });
  if (authorization instanceof Response) return authorization;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.phone !== "string" || typeof body.code !== "string") {
    return Response.json({ error: "전화번호와 인증번호를 입력해 주세요." }, { status: 400 });
  }
  const hostname = new URL(request.url).hostname;
  try {
    const registration = await completeAccountRegistration(env as AccountRegistrationRuntimeEnv, {
      userId: authorization.userId,
      phoneInput: body.phone,
      code: body.code,
      requiredPrivacyConsent: body.requiredPrivacyConsent === true,
      age14Confirmed: body.age14Confirmed === true,
      marketingDataConsent: body.marketingDataConsent === true,
      electronicMarketingConsent: body.electronicMarketingConsent === true,
      localDevelopment: hostname === "localhost" || hostname === "127.0.0.1",
    });
    return Response.json({ registration }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "가입 확인을 완료하지 못했습니다." }, { status: 400 });
  }
}
