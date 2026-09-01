import { env } from "cloudflare:workers";
import { getAccountRegistrationStatus, type AccountRegistrationRuntimeEnv } from "@/lib/account-registration";
import { authorizeRequest } from "@/lib/pace-data";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true, allowIncompleteRegistration: true });
  if (authorization instanceof Response) return authorization;
  const registration = await getAccountRegistrationStatus(env as AccountRegistrationRuntimeEnv, authorization.userId);
  return Response.json({ registration }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  const body = await request.json().catch(() => ({})) as { marketingDataConsent?: unknown; electronicMarketingConsent?: unknown };
  if (typeof body.marketingDataConsent !== "boolean" || typeof body.electronicMarketingConsent !== "boolean") {
    return Response.json({ error: "동의 값을 확인해 주세요." }, { status: 400 });
  }
  try {
    const { updateMarketingConsents } = await import("@/lib/account-registration");
    const registration = await updateMarketingConsents(
      env as AccountRegistrationRuntimeEnv,
      authorization.userId,
      body.marketingDataConsent,
      body.electronicMarketingConsent,
    );
    return Response.json({ registration }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "동의 설정을 저장하지 못했습니다." }, { status: 400 });
  }
}
