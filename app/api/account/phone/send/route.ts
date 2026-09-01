import { env } from "cloudflare:workers";
import { createPhoneVerification, type AccountRegistrationRuntimeEnv } from "@/lib/account-registration";
import { authorizeRequest } from "@/lib/pace-data";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, { allowIncompleteRegistration: true });
  if (authorization instanceof Response) return authorization;
  const body = await request.json().catch(() => ({})) as { phone?: unknown; requiredPrivacyConsent?: unknown; age14Confirmed?: unknown };
  if (body.requiredPrivacyConsent !== true || body.age14Confirmed !== true) {
    return Response.json({ error: "필수 개인정보 처리와 만 14세 이상 여부를 확인해 주세요." }, { status: 400 });
  }
  if (typeof body.phone !== "string") return Response.json({ error: "휴대전화 번호를 입력해 주세요." }, { status: 400 });
  const hostname = new URL(request.url).hostname;
  const localDevelopment = hostname === "localhost" || hostname === "127.0.0.1";
  try {
    const verification = await createPhoneVerification(env as AccountRegistrationRuntimeEnv, authorization.userId, body.phone, localDevelopment);
    return Response.json({ verification }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "인증번호를 보내지 못했습니다.";
    const unavailable = /설정되지 않았/.test(message);
    return Response.json({ error: message, code: unavailable ? "phone_verification_unavailable" : "verification_failed" }, { status: unavailable ? 503 : 400 });
  }
}
