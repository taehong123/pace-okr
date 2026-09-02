import { readAiUsagePercent, type AiUsage } from "./ai-usage";

export type AiUsageScope = { workspaceId: string; userId: string };
type Entry = { promise: Promise<AiUsage>; expiresAt: number };
const entries = new Map<string, Entry>();
const cacheMs = 30_000;

export function invalidateAiUsage() {
  // Free workspaces belonging to one owner share an allowance.
  entries.clear();
}

export function loadAiUsage(scope: AiUsageScope): Promise<AiUsage> {
  const key = JSON.stringify([scope.userId, scope.workspaceId]);
  const cached = entries.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const entry: Entry = { promise: Promise.resolve({}), expiresAt: Infinity };
  entry.promise = (async () => {
    const response = await fetch("/api/billing/ai-usage", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("AI 사용량을 확인하지 못했습니다.");
    const data = await response.json() as { workspaceId: string; userId: string; ai: AiUsage };
    // A workspace switch can change the auth cookie while a request is in flight.
    if (data.workspaceId !== scope.workspaceId || data.userId !== scope.userId || !readAiUsagePercent(data.ai)) {
      throw new Error("AI 사용량을 확인하지 못했습니다.");
    }
    const resetsAt = data.ai.resetsAt ? Date.parse(data.ai.resetsAt) : NaN;
    entry.expiresAt = Math.min(Date.now() + cacheMs, Number.isFinite(resetsAt) ? resetsAt : Infinity);
    return data.ai;
  })().catch((error: unknown) => {
    if (entries.get(key) === entry) entries.delete(key);
    throw error;
  });
  // Bound memory without persisting account data in browser storage.
  if (entries.size >= 20) entries.delete(entries.keys().next().value!);
  entries.set(key, entry);
  return entry.promise;
}
