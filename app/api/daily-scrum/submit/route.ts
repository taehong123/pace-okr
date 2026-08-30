import { waitUntil } from "cloudflare:workers";
import { submitDailyDraft } from "@/lib/daily-bot";
import { authorizeRequest } from "@/lib/pace-data";
import { publishDailySubmission } from "@/lib/slack-daily";
import { dailyRouteError } from "../route";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = await request.json() as { date?: string };
    const submission = await submitDailyDraft(authorization, payload.date ?? new Date().toISOString().slice(0, 10));
    waitUntil(publishDailySubmission(authorization.ownerId, submission.id));
    return Response.json({ submission }, { status: 201 });
  } catch (error) {
    return dailyRouteError(error);
  }
}
