export type PhoneVerificationRuntimeEnv = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
};

type TwilioVerificationResponse = { sid?: string; status?: string; message?: string; code?: number };

export function phoneVerificationConfigured(runtime: PhoneVerificationRuntimeEnv) {
  return Boolean(runtime.TWILIO_ACCOUNT_SID && runtime.TWILIO_AUTH_TOKEN && runtime.TWILIO_VERIFY_SERVICE_SID);
}

export async function startPhoneVerification(runtime: PhoneVerificationRuntimeEnv, phone: string, localDevelopment = false) {
  if (localDevelopment && !phoneVerificationConfigured(runtime)) {
    return { sid: `local-${crypto.randomUUID()}`, status: "pending" };
  }
  const response = await twilioVerifyRequest(runtime, "Verifications", { To: phone, Channel: "sms", Locale: "ko" });
  if (!response.sid) throw new Error("인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { sid: response.sid, status: response.status ?? "pending" };
}

export async function checkPhoneVerification(runtime: PhoneVerificationRuntimeEnv, phone: string, code: string, localDevelopment = false) {
  if (localDevelopment && !phoneVerificationConfigured(runtime)) return code === "000000";
  const response = await twilioVerifyRequest(runtime, "VerificationCheck", { To: phone, Code: code });
  return response.status === "approved";
}

async function twilioVerifyRequest(runtime: PhoneVerificationRuntimeEnv, endpoint: string, body: Record<string, string>) {
  const accountSid = runtime.TWILIO_ACCOUNT_SID;
  const authToken = runtime.TWILIO_AUTH_TOKEN;
  const serviceSid = runtime.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) throw new Error("휴대전화 인증 서비스가 아직 설정되지 않았습니다.");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = await response.json().catch(() => ({})) as TwilioVerificationResponse;
  if (!response.ok) {
    const invalidInput = response.status === 400 || response.status === 404;
    throw new Error(invalidInput ? "인증번호 또는 전화번호를 확인해 주세요." : "휴대전화 인증 서비스에 연결하지 못했습니다.");
  }
  return data;
}
