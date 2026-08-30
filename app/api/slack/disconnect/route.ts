import { env } from "cloudflare:workers";
import { authorizeRequest, canManageTeam, deleteSlackConnection, ensureWorkspace } from "@/lib/pace-data";
import { decryptSlackSecret, revokeSlackToken, slackConfigured, type SlackRuntimeEnv } from "@/lib/slack-oauth";
import { disconnectSlackDaily } from "@/lib/slack-daily";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (!canManageTeam(authorization)) return Response.json({ error: "Workspace admin access is required" }, { status: 403 });
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as SlackRuntimeEnv;
  const connection = await deleteSlackConnection(authorization.ownerId);
  if (connection && slackConfigured(runtime)) {
    try {
      await disconnectSlackDaily(authorization.ownerId, connection);
      const token = await decryptSlackSecret(connection.encryptedBotToken, runtime.SLACK_TOKEN_ENCRYPTION_KEY!);
      await revokeSlackToken(token);
    } catch {
      // Local disconnect must still succeed even when Slack revocation fails.
    }
  }

  return Response.json({ disconnected: true });
}
