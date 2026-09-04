import { guestLanguage, requestLanguage } from "@/lib/language";
export function GET(request: Request) {
  return Response.json({ language: guestLanguage(request) ?? requestLanguage(request) }, { headers: { "Cache-Control": "private, no-store" } });
}
