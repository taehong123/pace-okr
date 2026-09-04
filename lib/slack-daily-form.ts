import type { DailyWork } from "@/lib/daily-work";
import type { Translator } from "@/lib/server-language";

const names = { project: "Project", task: "Task", routine: "Routine" };
const identityTranslator: Translator = (key) => key;

export function dailyWorkOption(work: DailyWork, t: Translator = identityTranslator, mode: "today" | "yesterday" = "today") {
  const detail = mode === "yesterday" && work.willCompleteOnSubmit
    ? `${work.parentTitle} · ${t("제출 시 완료 처리")}`
    : `${work.parentTitle}${work.dueDate ? ` · ${work.dueDate}` : ""}`;
  return { text: { type: "plain_text", text: `${t(names[work.kind])} · ${work.title}`.slice(0, 75) }, value: work.key,
    description: { type: "plain_text", text: detail.slice(0, 75) } };
}

export function dailyWorkBlocks(work: DailyWork[], selected: string[], t: Translator = identityTranslator) {
  const visible = work.slice(0, 60);
  const blocks: Record<string, unknown>[] = [];
  for (const kind of ["project", "task", "routine"] as const) {
    const rows = visible.filter((entry) => entry.kind === kind);
    for (let offset = 0; offset < rows.length; offset += 10) {
      const options = rows.slice(offset, offset + 10).map((entry) => dailyWorkOption(entry, t));
      const initial = options.filter((option) => selected.includes(option.value));
      blocks.push({ type: "input", block_id: `daily_work_${kind}_${offset}`, optional: true,
        label: { type: "plain_text", text: offset ? t("{kind} (계속)", { kind: t(names[kind]) }) : t(names[kind]) },
        element: { type: "checkboxes", action_id: "selected_work", options, ...(initial.length ? { initial_options: initial } : {}) } });
    }
  }
  if (!work.length) blocks.push({ type: "section", text: { type: "plain_text", text: t("현재 배정된 미완료 업무가 없습니다.") } });
  if (work.length > visible.length) {
    const initial = work.slice(visible.length).filter((entry) => selected.includes(entry.key)).map((entry) => dailyWorkOption(entry, t));
    blocks.push({ type: "input", block_id: "daily_work_more", optional: true, label: { type: "plain_text", text: t("나머지 업무 {count}개", { count: work.length - visible.length }) },
      element: { type: "multi_external_select", action_id: "selected_more_work", min_query_length: 0, max_selected_items: 50,
        placeholder: { type: "plain_text", text: t("나머지 내 업무 검색") }, ...(initial.length ? { initial_options: initial } : {}) } });
  }
  return blocks;
}

function dailyWorkSelect(work: DailyWork[], selected: string[], mode: "today" | "yesterday", t: Translator) {
  const initial = work.filter((entry) => selected.includes(entry.key)).slice(0, 50).map((entry) => dailyWorkOption(entry, t, mode));
  return { type: "input", block_id: mode === "yesterday" ? "yesterday_work" : "today_work", optional: true,
    label: { type: "plain_text", text: t(mode === "yesterday" ? "어제 완료한 일" : "오늘 할 일") },
    element: { type: "multi_external_select", action_id: mode === "yesterday" ? "selected_yesterday_work" : "selected_today_work",
      min_query_length: 0, max_selected_items: 50,
      placeholder: { type: "plain_text", text: t(mode === "yesterday" ? "완료했거나 완료할 업무 검색" : "오늘 할 업무 검색") },
      ...(initial.length ? { initial_options: initial } : {}) } };
}

export function dailyForm(input: { work: DailyWork[]; yesterdayWork: DailyWork[]; memberName: string; date: string; selected: string[]; selectedYesterday: string[]; yesterdayNote: string; todayNote: string; blockersNote: string; noPlannedTasks: boolean; skipReason: string | null; skipNote: string; metadata: string }, t: Translator = identityTranslator) {
  const skipOptions = [["none", "스킵하지 않음"], ["workload", "본업 과중"], ["vacation", "휴가"], ["personal", "개인 일정"], ["other", "기타"]]
    .map(([value, text]) => ({ text: { type: "plain_text", text: t(text) }, value }));
  const none = { text: { type: "plain_text", text: t("오늘 예정 없음") }, value: "yes" };
  return { type: "modal", callback_id: "daily_submit", private_metadata: input.metadata,
    title: { type: "plain_text", text: t("데일리") }, submit: { type: "plain_text", text: t("선택한 업무 제출") }, close: { type: "plain_text", text: t("취소") }, blocks: [
      { type: "section", text: { type: "plain_text", text: t("{member} · {date}\n어제 완료한 일과 오늘 할 일을 선택하세요.", { member: input.memberName, date: input.date }) } },
      dailyWorkSelect(input.yesterdayWork, input.selectedYesterday, "yesterday", t),
      { type: "input", block_id: "yesterday_note", optional: true, label: { type: "plain_text", text: t("어제 메모") }, element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 3000, ...(input.yesterdayNote ? { initial_value: input.yesterdayNote } : {}) } },
      dailyWorkSelect(input.work, input.selected, "today", t),
      { type: "input", block_id: "no_planned", optional: true, label: { type: "plain_text", text: t("오늘 예정") }, element: { type: "checkboxes", action_id: "value", options: [none], ...(input.noPlannedTasks ? { initial_options: [none] } : {}) } },
      { type: "input", block_id: "today_note", optional: true, label: { type: "plain_text", text: t("오늘 메모") }, element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 3000, ...(input.todayNote ? { initial_value: input.todayNote } : {}) } },
      { type: "input", block_id: "blockers_note", optional: true, label: { type: "plain_text", text: t("도움이 필요한 일") }, element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 3000, ...(input.blockersNote ? { initial_value: input.blockersNote } : {}) } },
      { type: "input", block_id: "skip_reason", optional: true, label: { type: "plain_text", text: t("데일리 스킵") }, element: { type: "static_select", action_id: "value", options: skipOptions, initial_option: skipOptions.find((o) => o.value === (input.skipReason || "none")) } },
      { type: "input", block_id: "skip_note", optional: true, label: { type: "plain_text", text: t("스킵 상세 사유") }, element: { type: "plain_text_input", action_id: "value", max_length: 500, ...(input.skipNote ? { initial_value: input.skipNote } : {}) } },
    ] };
}
