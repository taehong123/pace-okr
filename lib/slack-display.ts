// Customer-facing copy only. Keep the original errors in server delivery records.
export function slackErrorMessage(error: unknown, fallback = "메시지를 보내지 못했습니다. 잠시 후 발송 상태를 다시 확인해 주세요.") {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/전송 결과를 확인하지 못|발송 여부를 확인하지 못|uncertain/i.test(message)) {
    return "발송 여부를 확인하지 못했습니다. 중복 발송을 막기 위해 재발송을 보류했습니다.";
  }
  if (/missing_scope|invalid_auth|token_revoked|token_expired|not_authed|권한.*갱신|재인증/i.test(message)) {
    return "Slack 연결 권한을 갱신해 주세요. 워크스페이스 관리자가 Slack 연결 관리에서 갱신할 수 있습니다.";
  }
  if (/not_in_channel|channel_not_found|is_archived|공개 채널 또는 봇이 참여한/i.test(message)) {
    return "발송 채널에 봇을 초대하거나 다른 채널을 선택해 주세요.";
  }
  if (/ratelimited|rate_limited/i.test(message)) {
    return "Slack 요청이 많아 처리가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/Owner.*Admin|관리자 권한|Slack 권한 확인/i.test(message)) {
    return "워크스페이스 관리자에게 Slack 연결과 발송 권한 확인을 요청해 주세요.";
  }
  if (/채널을 선택/.test(message)) return "메시지를 받을 Slack 채널을 선택해 주세요.";
  if (/Slack을 먼저 연결/.test(message)) return "워크스페이스 Slack을 먼저 연결해 주세요.";
  if (/요일을 하나 이상/.test(message)) return "발송 요일을 하나 이상 선택해 주세요.";
  if (/관리 항목을 하나 이상/.test(message)) return "관리 항목을 하나 이상 선택해 주세요.";
  if (/HH:mm/.test(message)) return "올바른 발송 시간을 입력해 주세요.";
  if (/올바른 시간대/.test(message)) return "올바른 시간대를 선택해 주세요.";
  return fallback;
}

export function slackReminderLabel(status: string) {
  return ({ scheduled: "예약됨", scheduling: "예약 중", sent: "발송 완료", failed: "예약 확인 필요", cancelled: "예약 취소됨" } as Record<string, string>)[status] ?? "예약 확인 필요";
}
