type DailyMember = {
  linked: boolean;
  preference: { enabled: boolean; configured?: boolean };
  reminder: { status: string; postAt: number; error: string } | null;
};

export function dailyDeliveryHealth(settings: { enabled: boolean; onboardingCompletedAt: string | null; installStatus: string }, members: DailyMember[], now = Date.now()) {
  // An unlinked member with no saved preference has never been a delivery
  // target. Keep explicitly selected or previously scheduled lost links visible.
  const targets = members.filter((member) => member.preference.enabled &&
    (member.linked || member.preference.configured !== false || member.reminder !== null));
  const scheduled = targets.filter((member) => member.linked && member.reminder?.status === "scheduled" && member.reminder.postAt > now / 1000).length;
  const pending = targets.filter((member) => member.linked && member.reminder?.status === "scheduling").length;
  const failed = targets.length - scheduled - pending;
  const status = !settings.onboardingCompletedAt ? "needs_setup"
    : !settings.enabled ? "paused"
      : settings.installStatus !== "connected" ? "connection_required"
        : targets.length === 0 || failed > 0 ? "failed"
          : pending > 0 ? "pending" : "ready";
  return { status, targetCount: targets.length, scheduledCount: scheduled, pendingCount: pending, failedCount: failed };
}

export function dailyDeliveryLabel(status: string) {
  return ({ ready: "사용 중", paused: "중지", needs_setup: "설정 필요", connection_required: "연결 확인 필요", pending: "예약 중", failed: "예약 실패" } as Record<string, string>)[status] ?? "예약 확인 필요";
}
