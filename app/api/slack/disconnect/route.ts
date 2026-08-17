import { env } from "cloudflare:workers";
import { authorizeRequest, deleteSlackConnection, ensureWorkspace } from "@/lib/pace-data";
import { decryptSlackSecret, revokeSlackToken, slackConfigured, type SlackRuntimeEnv } from "@/lib/slack-oauth";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  await ensureWorkspace(authorization.ownerId);

  const runtime = env as SlackRuntimeEnv;
  const connection = await deleteSlackConnection(authorization.ownerId, authorization.userId);
  if (connection && slackConfigured(runtime)) {
    try {
      const token = await decryptSlackSecret(connection.encryptedBotToken, runtime.SLACK_TOKEN_ENCRYPTION_KEY!);
      await revokeSlackToken(token);
    } catch {
      // Local disconnect must still succeed even when Slack revocation fails.
    }
  }

  return Response.json({ disconnected: true });
}
