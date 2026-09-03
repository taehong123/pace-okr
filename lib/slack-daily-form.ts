import type { DailyWork } from "@/lib/daily-work";
import type { Translator } from "@/lib/server-language";

const names = { project: "Project", task: "Task", routine: "Routine" };
const identityTranslator: Translator = (key) => key;

export function dailyWorkOption(work: DailyWork, t: Translator = identityTranslator) {
  return { text: { type: "plain_text", text: `${t(names[work.kind])} · ${work.title}`.slice(0, 75) }, value: work.key,
    description: { type: "plain_text", text: `${work.parentTitle}${work.dueDate ? ` · ${work.dueDate}` : ""}`.slice(0, 75) } };
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

export function dailyForm(input: { work: DailyWork[]; memberName: string; date: string; selected: string[]; todayNote: string; blockersNote: string; noPlannedTasks: boolean; skipReason: string | null; skipNote: string; metadata: string }, t: Translator = identityTranslator) {
  const skipOptions = [["none", "스킵하지 않음"], ["workload", "본업 과중"], ["vacation", "휴가"], ["personal", "개인 일정"], ["other", "기타"]]
    .map(([value, text]) => ({ text: { type: "plain_text", text: t(text) }, value }));
  const none = { text: { type: "plain_text", text: t("오늘 예정 없음") }, value: "yes" };
  return { type: "modal", callback_id: "daily_submit", private_metadata: input.metadata,
    title: { type: "plain_text", text: t("오늘 할 업무") }, submit: { type: "plain_text", text: t("선택한 업무 제출") }, close: { type: "plain_text", text: t("취소") }, blocks: [
      { type: "section", text: { type: "plain_text", text: t("{member} · {date}\n오늘 진행할 업무를 선택하세요. 선택하지 않은 업무는 그대로 남습니다.", { member: input.memberName, date: input.date }) } },
      ...dailyWorkBlocks(input.work, input.selected, t),
      { type: "input", block_id: "no_planned", optional: true, label: { type: "plain_text", text: t("오늘 예정") }, element: { type: "checkboxes", action_id: "value", options: [none], ...(input.noPlannedTasks ? { initial_options: [none] } : {}) } },
      { type: "input", block_id: "today_note", optional: true, label: { type: "plain_text", text: t("오늘 메모") }, element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 3000, ...(input.todayNote ? { initial_value: input.todayNote } : {}) } },
      { type: "input", block_id: "blockers_note", optional: true, label: { type: "plain_text", text: t("도움이 필요한 일") }, element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 3000, ...(input.blockersNote ? { initial_value: input.blockersNote } : {}) } },
      { type: "input", block_id: "skip_reason", optional: true, label: { type: "plain_text", text: t("데일리 스킵") }, element: { type: "static_select", action_id: "value", options: skipOptions, initial_option: skipOptions.find((o) => o.value === (input.skipReason || "none")) } },
      { type: "input", block_id: "skip_note", optional: true, label: { type: "plain_text", text: t("스킵 상세 사유") }, element: { type: "plain_text_input", action_id: "value", max_length: 500, ...(input.skipNote ? { initial_value: input.skipNote } : {}) } },
    ] };
}
