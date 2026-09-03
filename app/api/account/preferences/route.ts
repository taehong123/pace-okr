import { env, waitUntil } from "cloudflare:workers";
import { authorizeRequest } from "@/lib/pace-data";
import { languageForBootstrap, LanguagePreferenceError, saveLanguagePreferences } from "@/lib/language-preferences";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const auth = await authorizeRequest(request, { allowViewerWrite: true });
  if (auth instanceof Response) return auth;
  if (auth.apiToken) return Response.json({ code: "account_session_required", error: "개인 설정에서 변경해 주세요." }, { status: 403, headers });
  return Response.json({ preferences: await languageForBootstrap(env.DB, auth.userId, request) }, { headers });
}

export async function PATCH(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ code: "same_origin_required", error: "이 사이트에서 다시 시도해 주세요." }, { status: 403, headers });
  }
  const auth = await authorizeRequest(request, { allowViewerWrite: true });
  if (auth instanceof Response) return auth;
  if (auth.apiToken) return Response.json({ code: "account_session_required", error: "개인 설정에서 변경해 주세요." }, { status: 403, headers });
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new LanguagePreferenceError("invalid_language");
    const preferences = await saveLanguagePreferences(env.DB, auth.userId, input as Record<string, unknown>, request);
    waitUntil(import("@/lib/slack-daily").then(({ refreshUserReminderLanguages }) => refreshUserReminderLanguages(auth.userId))
      .catch((error: unknown) => console.error("reminder_language_refresh_failed", error instanceof Error ? error.message : "Unknown failure")));
    return Response.json({ preferences }, { headers });
  } catch (error) {
    const code = error instanceof LanguagePreferenceError ? error.code : error instanceof SyntaxError ? "invalid_language" : "preferences_save_failed";
    return Response.json({ code, error: code === "preference_conflict" ? "다른 기기에서 언어가 변경되었습니다. 다시 확인해 주세요." : "언어를 저장하지 못했습니다. 다시 시도해 주세요." },
      { status: error instanceof LanguagePreferenceError ? error.status : error instanceof SyntaxError ? 400 : 500, headers });
  }
}
