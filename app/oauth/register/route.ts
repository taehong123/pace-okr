import { isAllowedChatGptRedirectUri, registerMcpOAuthClient } from "@/lib/mcp-oauth";

type RegistrationPayload = {
  redirect_uris?: unknown;
  client_name?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
};

export async function POST(request: Request) {
  let payload: RegistrationPayload;
  try {
    payload = await request.json() as RegistrationPayload;
  } catch {
    return registrationError("invalid_client_metadata", "Registration metadata must be valid JSON.");
  }

  const redirectUris = Array.isArray(payload.redirect_uris)
    ? [...new Set(payload.redirect_uris.filter((entry): entry is string => typeof entry === "string"))]
    : [];
  if (!redirectUris.length || !redirectUris.every(isAllowedChatGptRedirectUri)) {
    return registrationError("invalid_redirect_uri", "Only current ChatGPT OAuth callback URLs are allowed.");
  }
  if (payload.token_endpoint_auth_method != null && payload.token_endpoint_auth_method !== "none") {
    return registrationError("invalid_client_metadata", "OKRPTR supports public OAuth clients with token_endpoint_auth_method=none.");
  }
  if (Array.isArray(payload.grant_types) && !payload.grant_types.includes("authorization_code")) {
    return registrationError("invalid_client_metadata", "The authorization_code grant is required.");
  }
  if (Array.isArray(payload.response_types) && !payload.response_types.includes("code")) {
    return registrationError("invalid_client_metadata", "The code response type is required.");
  }

  const client = await registerMcpOAuthClient({
    redirectUris,
    clientName: typeof payload.client_name === "string" ? payload.client_name : "ChatGPT",
  });
  return Response.json({
    client_id: client.clientId,
    client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}

function registrationError(error: string, description: string) {
  return Response.json({ error, error_description: description }, {
    status: 400,
    headers: { "Cache-Control": "no-store" },
  });
}
