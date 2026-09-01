import { consumeEmailUnsubscribeToken, saveEmailMarketingConsent } from "@/lib/marketing-consent";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const userId = await consumeEmailUnsubscribeToken(token);
  if (!userId) return new Response("수신거부 링크가 만료되었거나 올바르지 않습니다.", { status: 400 });
  await saveEmailMarketingConsent(userId, { marketingDataConsent: false, advertisingEmailConsent: false, source: "unsubscribe" });
  return new Response("광고성 이메일 수신 동의를 철회했습니다. 서비스 알림과 결제 메일은 계속 발송될 수 있습니다.", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
