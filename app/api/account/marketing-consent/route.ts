import { authorizeRequest } from "@/lib/pace-data";
import { getEmailMarketingConsent, saveEmailMarketingConsent } from "@/lib/marketing-consent";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  return Response.json({ consent: await getEmailMarketingConsent(authorization.userId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload.marketingDataConsent !== "boolean" || typeof payload.advertisingEmailConsent !== "boolean") {
    return Response.json({ error: "두 이메일 마케팅 동의 값을 모두 전달해 주세요." }, { status: 400 });
  }
  return Response.json({ consent: await saveEmailMarketingConsent(authorization.userId, {
    marketingDataConsent: payload.marketingDataConsent,
    advertisingEmailConsent: payload.advertisingEmailConsent,
    source: "settings",
  }) });
}
