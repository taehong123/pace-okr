import { env } from "cloudflare:workers";
import { authorizeRequest, deleteGoogleConnection, ensureWorkspace } from "@/lib/pace-data";
import { decryptSecret, googleConfigured, revokeGoogleToken, type GoogleRuntimeEnv } from "@/lib/google-oauth";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as GoogleRuntimeEnv;
  const connection = await deleteGoogleConnection(authorization.ownerId, authorization.userId);
  if (connection && googleConfigured(runtime)) {
    try {
      const refreshToken = await decryptSecret(connection.encryptedRefreshToken, runtime.GOOGLE_TOKEN_ENCRYPTION_KEY!);
      await revokeGoogleToken(refreshToken);
    } catch {
      // Local disconnect must still succeed even when Google revocation fails.
    }
  }

  return Response.json({ disconnected: true });
}
