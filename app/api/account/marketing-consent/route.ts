import { authorizeRequest } from "@/lib/pace-data";
import { claimEmailMarketingPrompt, dismissEmailMarketingPrompt, getEmailMarketingConsent, saveEmailMarketingConsent } from "@/lib/marketing-consent";

function checkOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return origin && origin !== new URL(request.url).origin
    ? Response.json({ error: "다른 사이트에서 동의 설정을 변경할 수 없습니다." }, { status: 403 }) : null;
}

export async function POST(request: Request) {
  const denied = checkOrigin(request);
  if (denied) return denied;
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (payload?.action !== "claim" && payload?.action !== "dismiss") {
    return Response.json({ error: "지원하지 않는 안내 요청입니다." }, { status: 400 });
  }
  try {
    const result = payload.action === "claim"
      ? await claimEmailMarketingPrompt(authorization.userId)
      : await dismissEmailMarketingPrompt(authorization.userId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "안내 상태를 저장하지 못했습니다." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  return Response.json({ consent: await getEmailMarketingConsent(authorization.userId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const denied = checkOrigin(request);
  if (denied) return denied;
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload.marketingDataConsent !== "boolean" || typeof payload.advertisingEmailConsent !== "boolean") {
    return Response.json({ error: "두 이메일 마케팅 동의 값을 모두 전달해 주세요." }, { status: 400 });
  }
  if (payload.source !== undefined && payload.source !== "settings" && payload.source !== "onboarding") {
    return Response.json({ error: "지원하지 않는 동의 요청입니다." }, { status: 400 });
  }
  try {
    return Response.json({ consent: await saveEmailMarketingConsent(authorization.userId, {
      marketingDataConsent: payload.marketingDataConsent,
      advertisingEmailConsent: payload.advertisingEmailConsent,
      source: payload.source === "onboarding" ? "onboarding" : "settings",
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "동의 설정을 저장하지 못했습니다." }, { status: 503 });
  }
}
