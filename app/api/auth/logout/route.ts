import { clearGoogleSessionCookies } from "@/lib/google-session";

export async function GET(request: Request) {
  const headers = new Headers({ Location: new URL("/?signedOut=1", request.url).toString() });
  for (const cookie of clearGoogleSessionCookies()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}
