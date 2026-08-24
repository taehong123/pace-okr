import { clearGoogleSessionCookie } from "@/lib/google-session";

export async function GET(request: Request) {
  const response = Response.redirect(new URL("/?signedOut=1", request.url), 303);
  response.headers.append("Set-Cookie", clearGoogleSessionCookie());
  return response;
}
