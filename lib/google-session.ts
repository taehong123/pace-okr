import type { GoogleProfile } from "@/lib/google-oauth";

export const GOOGLE_SIGN_IN_STATE_OWNER = "__google_signin__";
export const GOOGLE_SIGN_IN_STATE_USER = "__google_signin__";
const SESSION_COOKIE_NAME = "__Host-okrptr_session";
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

export type GoogleSession = {
  provider: "google";
  sub: string;
  email: string;
  name: string;
  expiresAt: number;
};

export async function createGoogleSessionCookie(profile: GoogleProfile, secret: string) {
  if (!profile.sub || !profile.email || !profile.emailVerified) throw new Error("A verified Google email is required");
  const session: GoogleSession = {
    provider: "google",
    sub: profile.sub,
    email: profile.email.trim().toLocaleLowerCase(),
    name: profile.name.trim() || profile.email.split("@")[0],
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  const signature = await sign(payload, secret);
  return `${SESSION_COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}`;
}

export function clearGoogleSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function readGoogleSession(request: Request, secret: string | undefined): Promise<GoogleSession | null> {
  if (!secret) return null;
  const cookie = request.headers.get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  if (!cookie) return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || !(await verify(payload, signature, secret))) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as Partial<GoogleSession>;
    if (session.provider !== "google" || !session.sub || !session.email || !session.name || !session.expiresAt) return null;
    if (session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return session as GoogleSession;
  } catch {
    return null;
  }
}

async function sign(payload: string, secret: string) {
  if (!secret) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured");
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verify(payload: string, signature: string, secret: string) {
  try {
    return crypto.subtle.verify("HMAC", await signingKey(secret), base64UrlToBytes(signature), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
