import { clearGoogleSessionCookie } from "@/lib/google-session";

export async function GET(request: Request) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/?signedOut=1", request.url).toString(),
      "Set-Cookie": clearGoogleSessionCookie(),
    },
  });
}
