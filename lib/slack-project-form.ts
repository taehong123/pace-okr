import type { PropertyValue } from "@/lib/pace-data";

export type ProjectFormField = {
  key: string;
  name: string;
  type: "text" | "number" | "select" | "date" | "checkbox" | "member" | "members" | "parent";
  value: PropertyValue;
  required?: boolean;
  options?: string[];
  initialOptions?: SlackFormOption[];
  propertyId?: string;
  updatedAt?: string;
};
export type ProjectForm = { fields: ProjectFormField[] };
export type SlackFormOption = { text: { type: "plain_text"; text: string }; value: string };
export type SlackFormState = Record<string, Record<string, { value?: string | null; selected_date?: string | null; selected_option?: { value?: string } | null; selected_options?: Array<{ value?: string }> | null }>>;
export const PROJECT_MODAL_CALLBACK = "summon_project_create";
export const PROJECT_OPEN_ACTION = "summon_project_open";
export const projectFieldAction = (key: string) => `summon_project_field_${key}`;
export const projectFieldBlock = (key: string) => `project_${key}`;
export const plainText = (text: string) => ({ type: "plain_text" as const, text });
export const formOption = (label: string, value: string): SlackFormOption => ({ text: plainText([...label].slice(0, 75).join("") || "이름 없음"), value });
const systemOptionLabels: Record<string, Record<string, string>> = {
  status: { backlog: "대기", todo: "할 일", policy_discussion: "정책 논의", in_progress: "진행 중", developing: "개발 중", development_done: "개발 완료", done: "완료", blocked: "차단됨" },
  priority: { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" },
  cadence: { daily: "매일", weekly: "매주", monthly: "매월", quarterly: "분기" },
};

export function projectStatusView(message: string) {
  return { type: "modal", title: plainText("프로젝트 만들기"), close: plainText("닫기"), blocks: [{ type: "section", text: plainText(message) }] };
}

export function buildProjectModal(draftId: string, form: ProjectForm, error = "") {
  if (form.fields.length > 90) throw new Error("Slack 입력창에 표시할 수 있는 속성 수를 초과했습니다. 웹에서 프로젝트를 만들어 주세요.");
  const blocks: Record<string, unknown>[] = error ? [{ type: "section", text: plainText(error) }] : [];
  for (const field of form.fields) {
    const action_id = projectFieldAction(field.key);
    let element: Record<string, unknown>;
    if (field.type === "parent" || field.type === "member" || field.type === "members") {
      element = { type: field.type === "members" ? "multi_external_select" : "external_select", action_id, min_query_length: 0, placeholder: plainText(field.type === "parent" ? "Initiative 검색" : "멤버 검색") };
      if (field.type === "members") {
        element.max_selected_items = 100;
        if (field.initialOptions?.length) element.initial_options = field.initialOptions;
      } else if (field.initialOptions?.[0]) element.initial_option = field.initialOptions[0];
    } else if (field.type === "select") {
      const options = field.options ?? [];
      const selected = options.indexOf(String(field.value ?? ""));
      element = options.length > 100 || options.length === 0
        ? { type: "external_select", action_id, min_query_length: 0, placeholder: plainText("값 검색") }
        : { type: "static_select", action_id, options: options.map((option, index) => formOption(systemOptionLabels[field.key]?.[option] ?? option, String(index))) };
      if (selected >= 0) element.initial_option = formOption(systemOptionLabels[field.key]?.[options[selected]] ?? options[selected], String(selected));
    } else if (field.type === "checkbox") {
      const option = formOption("선택", "true");
      element = { type: "checkboxes", action_id, options: [option], ...(field.value === true ? { initial_options: [option] } : {}) };
    } else if (field.type === "date") {
      element = { type: "datepicker", action_id, ...(validFormDate(field.value) ? { initial_date: field.value } : {}) };
    } else if (field.type === "number") {
      element = { type: "number_input", action_id, is_decimal_allowed: true, ...(typeof field.value === "number" ? { initial_value: String(field.value) } : {}) };
    } else {
      const max = field.key === "title" ? 240 : 3000;
      if (typeof field.value === "string" && [...field.value].length > max) throw new Error(`${field.name} 기본값이 Slack 입력 길이를 초과했습니다. 웹에서 확인해 주세요.`);
      element = { type: "plain_text_input", action_id, max_length: max, multiline: field.key === "description", ...(typeof field.value === "string" && field.value ? { initial_value: field.value } : {}) };
    }
    blocks.push({ type: "input", block_id: projectFieldBlock(field.key), label: plainText(field.name.slice(0, 200)), optional: !field.required, element });
  }
  return { type: "modal", callback_id: PROJECT_MODAL_CALLBACK, private_metadata: draftId, title: plainText("프로젝트 만들기"), submit: plainText("생성"), close: plainText("취소"), blocks };
}

export function validFormDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function parseProjectForm(form: ProjectForm, state: SlackFormState) {
  const values: Record<string, PropertyValue> = {};
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    const block = projectFieldBlock(field.key);
    const entry = state[block]?.[projectFieldAction(field.key)];
    let value: PropertyValue = null;
    if (field.type === "members") value = [...new Set((entry?.selected_options ?? []).map((option) => option.value ?? "").filter(Boolean))];
    else if (field.type === "checkbox") value = Boolean(entry?.selected_options?.some((option) => option.value === "true"));
    else if (field.type === "parent" || field.type === "member") value = entry?.selected_option?.value || null;
    else if (field.type === "select") {
      const raw = entry?.selected_option?.value;
      if (raw !== undefined) {
        const index = /^(0|[1-9]\d*)$/.test(raw) ? Number(raw) : -1;
        value = field.options?.[index] ?? null;
        if (value === null) errors[block] = "목록에서 값을 다시 선택해 주세요.";
      }
    } else if (field.type === "date") {
      value = entry?.selected_date || null;
      if (value && !validFormDate(value)) errors[block] = "올바른 날짜를 선택해 주세요.";
    } else if (field.type === "number") {
      const raw = entry?.value?.trim();
      value = raw ? Number(raw) : null;
      if (typeof value === "number" && !Number.isFinite(value)) errors[block] = "올바른 숫자를 입력해 주세요.";
    } else {
      value = entry?.value?.trim() || null;
      if (typeof value === "string") {
        const max = field.key === "title" ? 240 : 3000;
        if ([...value].length > max) errors[block] = `${max}자 이내로 입력해 주세요.`;
        if ([...value].some((char) => char.charCodeAt(0) < 32 && !["\t", "\n", "\r"].includes(char))) errors[block] = "사용할 수 없는 문자가 있습니다.";
      }
    }
    if (field.type === "members" && Array.isArray(value) && value.length > 100) errors[block] = "멤버는 100명까지 선택할 수 있습니다.";
    if (field.required && (value === null || value === "")) errors[block] = `${field.name} 값을 입력해 주세요.`;
    values[field.key] = value;
  }
  return { values, errors };
}
