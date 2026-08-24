import { env } from "cloudflare:workers";
import { authorizeRequest } from "@/lib/pace-data";
import { readGoogleSession } from "@/lib/google-session";
import type { GoogleRuntimeEnv } from "@/lib/google-oauth";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  const googleSession = await readGoogleSession(request, (env as GoogleRuntimeEnv).GOOGLE_TOKEN_ENCRYPTION_KEY);
  const hostname = new URL(request.url).hostname;
  return Response.json({
    user: {
      id: authorization.userId,
      email: authorization.email,
      displayName: authorization.displayName,
      provider: googleSession ? "google" : hostname === "localhost" || hostname === "127.0.0.1" ? "local" : "openai",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
