/** Stable, non-sensitive error information, alongside legacy API response fields. */
export const publicErrorMessages = {
  authentication_required: "로그인이 필요합니다.",
  access_denied: "이 작업을 수행할 권한이 없습니다.",
  invalid_input: "입력한 내용을 확인해 주세요.",
  not_found: "요청한 항목을 찾을 수 없습니다.",
  conflict: "다른 변경사항이 있습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
  expired: "요청이 만료되었습니다. 다시 시작해 주세요.",
  rate_limited: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  unavailable: "일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  request_failed: "요청을 완료하지 못했습니다. 다시 시도해 주세요.",
} as const;

export async function withPublicErrorDetails(response: Response) {
  if (response.ok || !response.headers.get("content-type")?.includes("application/json")) return response;
  try {
    const body: unknown = await response.clone().json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return response;
    const code = ({ 400: "invalid_input", 401: "authentication_required", 403: "access_denied", 404: "not_found", 409: "conflict", 410: "expired", 422: "invalid_input", 429: "rate_limited", 503: "unavailable" } as Record<number, keyof typeof publicErrorMessages>)[response.status] ?? "request_failed";
    const headers = new Headers(response.headers);
    // The body is regenerated, so representation metadata from the original
    // response must not describe the new JSON bytes.
    headers.delete("Content-Length");
    headers.delete("Content-Encoding");
    headers.delete("Content-Range");
    headers.delete("ETag");
    headers.set("Cache-Control", "private, no-store");
    return Response.json({ ...body, messageCode: code, messageValues: {} }, { status: response.status, headers });
  } catch { return response; }
}
