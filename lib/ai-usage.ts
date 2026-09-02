export type AiUsagePercent = { usedPercent: number; remainingPercent: number };
export type AiUsage = {
  usedPercent?: number | null;
  remainingPercent?: number | null;
  usedWon?: number;
  limitWon?: number;
  resetsAt?: string;
};

// The allowance is weighted by model/action cost, not a fixed raw-token quota.
// Use unrounded metering units on the server; currency is never presentation data.
export function aiUsagePercent(used: unknown, limit: unknown): AiUsagePercent | null {
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0
    || typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return null;
  const usedPercent = Math.min(100, (used / limit) * 100);
  return { usedPercent, remainingPercent: 100 - usedPercent };
}

export function readAiUsagePercent(usage: AiUsage | null | undefined): AiUsagePercent | null {
  if (!usage) return null;
  // Older responses remain compatible during a rolling deployment.
  return usage.usedPercent === undefined
    ? aiUsagePercent(usage.usedWon, usage.limitWon)
    : aiUsagePercent(usage.usedPercent, 100);
}

export function formatAiPercent(value: number): string {
  if (value > 0 && value < 0.1) return "0.1% 미만";
  if (value > 99.9 && value < 100) return "99.9% 초과";
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function aiUsageLimitMessage(error: {
  code?: string;
  spentWon?: number;
  limitWon?: number;
  usage?: { spentWon?: number; budgetWon?: number };
}) {
  const preserved = "작성 중인 초안은 그대로 두었습니다.";
  if (error.code === "ai_rate_limited") return `AI 정리 요청이 너무 빠르게 반복되고 있습니다. ${preserved} 잠시 후 다시 시도해 주세요.`;
  if (error.code === "ai_daily_limit_reached") return `오늘의 AI 요청 횟수 한도에 도달했습니다. ${preserved} 내일 다시 이용해 주세요.`;
  const percentage = aiUsagePercent(error.usage?.spentWon ?? error.spentWon, error.usage?.budgetWon ?? error.limitWon);
  const detail = percentage ? ` 이번 달 AI 사용량 ${formatAiPercent(percentage.usedPercent)} · ${formatAiPercent(percentage.remainingPercent)} 남음.` : "";
  if (error.code === "ai_free_limit_reached") return `이번 답변을 만들기에는 남은 AI 사용량이 부족합니다.${detail} ${preserved}`;
  return `이번 달 AI 사용 한도에 도달했습니다.${detail} ${preserved}`;
}
