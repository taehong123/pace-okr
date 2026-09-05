import { env } from "cloudflare:workers";
import { currentDailyMember, normalizeDailySkipReason, saveDailyDraft, submitDailyDraft } from "@/lib/daily-bot";
import { DAILY_CHECKLIST_PAGE_SIZE, dailyChecklistForm, orderDailyChecklist, type DailyChecklist } from "@/lib/slack-daily-form";
import type { RequestAuthorization } from "@/lib/pace-data";
import type { Translator } from "@/lib/server-language";

type ModalState = Record<string, Record<string, Record<string, unknown>>>;
type StoredChecklist = { payload_json: string; revision: number };
const metadataFor = (id: string, revision: number) => JSON.stringify({ id, revision });

export async function createDailyChecklist(ownerId: string, memberId: string, input: DailyChecklist, t: Translator) {
  const id = crypto.randomUUID();
  const value = { ...input, work: orderDailyChecklist(input.work), page: 0 };
  const now = new Date().toISOString();
  await env.DB.prepare("DELETE FROM slack_daily_checklists WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("INSERT INTO slack_daily_checklists (id, owner_id, member_id, payload_json, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, ownerId, memberId, JSON.stringify(value), new Date(Date.now() + 24 * 60 * 60_000).toISOString()).run();
  return dailyChecklistForm(value, metadataFor(id, 0), t);
}

export function mergeDailyChecklist(input: DailyChecklist, state: ModalState, t: Translator) {
  const next: DailyChecklist = { ...input, choices: { ...input.choices } };
  const errors: Record<string, string> = {};
  const start = input.page * DAILY_CHECKLIST_PAGE_SIZE;
  input.work.slice(start, start + DAILY_CHECKLIST_PAGE_SIZE).forEach((entry, offset) => {
    const block = `daily_choice_${start + offset}`;
    const field = state[block]?.choice;
    if (!field) return;
    const choices = field.selected_options;
    // Old open modals may still send "exclude"; never reinterpret it as deletion.
    if (!Array.isArray(choices) || choices.some((option) => !["today", "done", "delete", "exclude"].includes(option?.value)) || choices.length > 1) {
      errors[block] = t("업무마다 한 가지 상태만 선택해 주세요."); return;
    }
    if (choices.some((option) => option.value === "delete") && entry.kind !== "task") {
      errors[block] = t("데일리에서는 개별 Task만 삭제할 수 있습니다."); return;
    }
    delete next.choices[entry.key];
    if (choices.length) next.choices[entry.key] = choices[0].value;
  });
  for (const [block, key] of [["today_note", "todayNote"], ["yesterday_note", "yesterdayNote"], ["blockers_note", "blockersNote"], ["skip_note", "skipNote"]] as const) {
    if (state[block]?.value) next[key] = String(state[block].value.value ?? "");
  }
  if (state.no_planned?.value) next.noPlannedTasks = Array.isArray(state.no_planned.value.selected_options) && state.no_planned.value.selected_options.some((option) => option?.value === "yes");
  if (state.skip_reason?.value) {
    const selected = state.skip_reason.value.selected_option as { value?: string } | null;
    next.skipReason = selected?.value === "none" ? null : selected?.value ?? null;
  }
  return { next, errors };
}

export async function handleDailyChecklist(authorization: RequestAuthorization, metadata: string, state: ModalState, previous: boolean, t: Translator): Promise<{
  errors?: Record<string, string>; view?: ReturnType<typeof dailyChecklistForm>; submission?: Awaited<ReturnType<typeof submitDailyDraft>>;
}> {
  if (authorization.role === "viewer") throw new Error("읽기 전용 멤버는 데일리를 제출할 수 없습니다.");
  const member = await currentDailyMember(authorization);
  const parsed = JSON.parse(metadata) as { id: string; revision: number };
  if (!parsed || typeof parsed.id !== "string" || !Number.isSafeInteger(parsed.revision)) throw new Error("데일리를 다시 열어 주세요.");
  const stored = await env.DB.prepare("SELECT payload_json, revision FROM slack_daily_checklists WHERE id = ? AND owner_id = ? AND member_id = ? AND expires_at > ?")
    .bind(parsed.id, authorization.ownerId, member.id, new Date().toISOString()).first<StoredChecklist>();
  if (!stored) throw new Error("데일리를 다시 열어 주세요.");
  const input = JSON.parse(stored.payload_json) as DailyChecklist;
  if (stored.revision !== parsed.revision) return { view: dailyChecklistForm(input, metadataFor(parsed.id, stored.revision), t, t("다른 요청에서 목록이 변경되었습니다. 현재 선택을 확인해 주세요.")) };
  const { next, errors } = mergeDailyChecklist(input, state, t);
  const problem = (errors: Record<string, string>) => ({ errors, view: dailyChecklistForm(next, metadata, t, [...new Set(Object.values(errors))].join("\n")) });
  if (Object.keys(errors).length) return problem(errors);
  const pages = Math.max(1, Math.ceil(input.work.length / DAILY_CHECKLIST_PAGE_SIZE));
  const selected = (choice: string) => Object.entries(next.choices).filter(([, value]) => value === choice).map(([key]) => key);
  const today = selected("today"), done = selected("done"), deleted = selected("delete");
  if (today.length + done.length + deleted.length > 50) return problem({ no_planned: t("오늘 할 업무는 최대 50개까지 선택할 수 있습니다.") });
  if (previous || input.page + 1 < pages) {
    next.page = Math.max(0, Math.min(pages - 1, input.page + (previous ? -1 : 1)));
    const result = await env.DB.prepare("UPDATE slack_daily_checklists SET payload_json = ?, revision = revision + 1 WHERE id = ? AND owner_id = ? AND member_id = ? AND revision = ?")
      .bind(JSON.stringify(next), parsed.id, authorization.ownerId, member.id, parsed.revision).run();
    if (!result.meta.changes) throw new Error("다른 요청에서 목록이 변경되었습니다. 현재 선택을 확인해 주세요.");
    return { view: dailyChecklistForm(next, metadataFor(parsed.id, parsed.revision + 1), t) };
  }
  const skipReason = normalizeDailySkipReason(next.skipReason);
  if (skipReason && (today.length || done.length || deleted.length)) return problem({ skip_reason: t("스킵하려면 선택한 업무 상태를 먼저 해제해 주세요.") });
  if (next.noPlannedTasks && today.length) return problem({ no_planned: t("오늘 예정 없음과 오늘 할 일을 함께 선택할 수 없습니다.") });
  if (!skipReason && !next.noPlannedTasks && !today.length && !done.length && !deleted.length && !next.todayNote.trim()) return problem({ no_planned: t("오늘 할 업무 또는 ‘오늘 예정 없음’을 선택해 주세요.") });
  if (skipReason === "other" && !next.skipNote.trim()) return problem({ skip_note: t("기타 스킵 사유를 입력해 주세요.") });
  // Replays return the durable submission before revalidating already-completed work.
  const receipt = await env.DB.prepare("SELECT id FROM daily_submissions WHERE owner_id = ? AND member_id = ? AND request_id = ?")
    .bind(authorization.ownerId, member.id, parsed.id).first();
  if (!receipt) {
    await saveDailyDraft(authorization, { date: next.date, todayNote: next.todayNote, yesterdayNote: next.yesterdayNote, blockersNote: next.blockersNote,
      selectedWorkIds: today, selectedYesterdayWorkIds: next.selectedYesterday.filter((key) => !today.includes(key) && !done.includes(key) && !deleted.includes(key)),
      noPlannedTasks: next.noPlannedTasks || (!today.length && done.length + deleted.length > 0), skipReason, skipNote: next.skipNote, source: "slack" }, false);
  }
  return { submission: await submitDailyDraft(authorization, next.date, "slack", parsed.id, done, deleted) };
}

export async function retryDailyChecklist(authorization: RequestAuthorization, metadata: string, state: ModalState, message: string, t: Translator) {
  const member = await currentDailyMember(authorization);
  const parsed = JSON.parse(metadata) as { id: string };
  const stored = await env.DB.prepare("SELECT payload_json, revision FROM slack_daily_checklists WHERE id = ? AND owner_id = ? AND member_id = ? AND expires_at > ?")
    .bind(parsed.id, authorization.ownerId, member.id, new Date().toISOString()).first<StoredChecklist>();
  if (!stored) return null;
  const input = JSON.parse(stored.payload_json) as DailyChecklist;
  return dailyChecklistForm(mergeDailyChecklist(input, state, t).next, metadataFor(parsed.id, stored.revision), t, message);
}
