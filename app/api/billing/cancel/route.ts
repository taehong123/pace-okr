import { cancelSubscription } from "@/lib/billing";
import { authorizeRequest } from "@/lib/pace-data";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;
  if (authorization.role !== "owner") return Response.json({ error: "구독은 Owner만 해지할 수 있습니다." }, { status: 403 });
  return Response.json(await cancelSubscription(authorization.ownerId));
}
