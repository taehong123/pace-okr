"use client";

export type EditablePropertyValue = string | number | boolean | string[] | null;
type Props = {
  type: "text" | "number" | "select" | "date" | "checkbox" | "member" | "members";
  value: EditablePropertyValue; options: string[];
  members: { id: string; displayName: string; status?: string }[];
  onChange: (value: EditablePropertyValue) => void;
  id?: string; disabled?: boolean; invalid?: boolean; describedBy?: string;
};

/** Shared native control for unsaved Project fields; it never writes to the server. */
export function PropertyValueInput({ type, value, options, members, onChange, id, disabled, invalid, describedBy }: Props) {
  const common = { id, disabled, "aria-invalid": invalid || undefined, "aria-describedby": describedBy };
  const active = members.filter((m) => !m.status || m.status === "active");
  if (type === "checkbox") return <input {...common} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
  if (type === "select" || type === "member") {
    const choices = type === "select" ? options.map((option) => ({ id: option, displayName: option })) : active;
    const selected = typeof value === "string" ? value : "";
    return <select {...common} value={selected} onChange={(e) => onChange(type === "member" ? e.target.value || null : e.target.value)}>
      <option value="">선택 안 함</option>
      {selected && !choices.some((c) => c.id === selected) && <option value={selected}>현재 사용할 수 없는 값 · 다시 선택</option>}
      {choices.map((c) => <option value={c.id} key={c.id}>{c.displayName}</option>)}
    </select>;
  }
  if (type === "members") return <select {...common} multiple value={Array.isArray(value) ? value : []}
    onChange={(e) => onChange(Array.from(e.target.selectedOptions, (option) => option.value))}>
    {(Array.isArray(value) ? value : []).filter((id) => !active.some((m) => m.id === id)).map((id) => <option value={id} key={id}>현재 사용할 수 없는 멤버 · 선택 해제 필요</option>)}
    {active.map((m) => <option value={m.id} key={m.id}>{m.displayName}</option>)}
  </select>;
  return <input {...common} type={type === "number" ? "number" : type === "date" ? "date" : "text"}
    step={type === "number" ? "any" : undefined} value={value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />;
}
