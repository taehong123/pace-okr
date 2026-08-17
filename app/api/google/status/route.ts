import { env } from "cloudflare:workers";
import { authorizeRequest, ensureWorkspace, getGoogleConnection, serializeGoogleConnection } from "@/lib/pace-data";
import { googleConfigured, type GoogleRuntimeEnv } from "@/lib/google-oauth";

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, { allowViewerWrite: true });
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);
  const runtime = env as GoogleRuntimeEnv;
  const connection = await getGoogleConnection(authorization.ownerId, authorization.userId);
  return Response.json({ google: serializeGoogleConnection(connection, googleConfigured(runtime)) });
}
