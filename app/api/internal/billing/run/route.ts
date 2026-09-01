import { runBillingBatch, verifyInternalBillingRequest } from "@/lib/billing";

export async function POST(request: Request) {
  if (!(await verifyInternalBillingRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runBillingBatch());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Billing run failed" }, { status: 500 });
  }
}
