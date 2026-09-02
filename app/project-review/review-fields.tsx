"use client";

import type { ReactNode } from "react";
import type { ProjectProposal, ProjectReview, InitiativeChoice } from "@/lib/project-review";
import type { ProjectReviewEditor } from "@/lib/project-review-editor";
import { PropertyValueInput, type EditablePropertyValue } from "@/app/property-value-input";

const priorityNames = { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" };
const statusNames = { backlog: "대기", todo: "할 일", policy_discussion: "정책 논의", in_progress: "진행 중", developing: "개발 중", development_done: "개발 완료", done: "완료", blocked: "막힘" };
const cadenceNames = { daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };
const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);
const memberName = (editor: ProjectReviewEditor | null, id: string) => editor?.members.find((m) => m.id === id)?.displayName ?? "사용할 수 없는 멤버";
const label = (editor: ProjectReviewEditor | null, key: string, fallback: string) => editor?.properties.find((p) => p.systemKey === key)?.name ?? fallback;

export function withVisibleProperties(proposal: ProjectProposal, editor: ProjectReviewEditor | null): ProjectProposal {
  return { ...proposal, properties: { ...Object.fromEntries((editor?.properties ?? []).filter((p) => !p.systemKey).map((p) => [p.name, null])), ...proposal.properties } };
}
function propertyText(editor: ProjectReviewEditor | null, name: string, value: EditablePropertyValue) {
  const type = editor?.properties.find((p) => p.name === name)?.type;
  return empty(value) ? "미지정" : type === "member" ? memberName(editor, String(value))
    : type === "members" && Array.isArray(value) ? value.map((id) => memberName(editor, id)).join(", ")
    : typeof value === "boolean" ? value ? "체크됨" : "체크 안 됨" : String(value);
}

export function ReviewFields({ review, proposal: p, editor, errors, disabled, onChange }: {
  review: ProjectReview; proposal: ProjectProposal; editor: ProjectReviewEditor; errors: Record<string, string>; disabled: boolean;
  onChange: (proposal: ProjectProposal, field: string) => void;
}) {
  const update = <K extends keyof ProjectProposal>(key: K, value: ProjectProposal[K]) => onChange({ ...p, [key]: value }, key);
  const custom = editor.properties.filter((property) => !property.systemKey);
  const origin = (key: string, value: unknown) => {
    const initial = key.startsWith("properties.") ? review.proposal.properties[key.slice(11)] ?? null : review.proposal[key as keyof ProjectProposal];
    return JSON.stringify(initial) !== JSON.stringify(value) ? "수정됨" : empty(value) ? "미지정" : review.fieldOrigins?.[key] === "default" ? "기본값" : "대화 초안";
  };
  const props = (key: string) => ({ id: `review-${key}`, disabled, "aria-invalid": Boolean(errors[key]) || undefined, "aria-describedby": `review-${key}-hint` });
  const field = (key: keyof ProjectProposal, title: string, control: ReactNode) => <Field id={`review-${key}`} title={title} hint={origin(key, p[key])} error={errors[key]}>{control}</Field>;
  const selectedTemplate = editor.templates.find((t) => t.id === p.templateId);
  function systemSelect(key: "status" | "priority" | "cadence", names: Record<string, string>) {
    const definition = editor.properties.find((property) => property.systemKey === key);
    const options = definition ? definition.options.filter((value) => Object.hasOwn(names, value)) : Object.keys(names);
    return <select {...props(key)} value={p[key]} onChange={(e) => update(key, e.target.value as ProjectProposal[typeof key])}>
      {!options.includes(p[key]) && <option value={p[key]}>현재 사용할 수 없는 값 · 다시 선택</option>}
      {options.map((value) => <option value={value} key={value}>{names[value]}</option>)}
    </select>;
  }
  return <section aria-labelledby="review-edit-heading">
    <h2 id="review-edit-heading">Project 내용 수정</h2>
    <p className="review-help">대화 초안·기본값·수정됨으로 구분합니다. DRI와 마감일은 미지정이어도 생성할 수 있습니다.</p>
    <div className="review-fields">
      {field("title", "Project 제목 (필수)", <input {...props("title")} value={p.title} maxLength={500} onChange={(e) => update("title", e.target.value)} />)}
      {field("description", "설명 · 범위와 완료 기준", <textarea {...props("description")} value={p.description} maxLength={20000} rows={4} onChange={(e) => update("description", e.target.value)} />)}
      {field("driMemberId", label(editor, "project_dri", "담당 DRI"), <PropertyValueInput id="review-driMemberId" disabled={disabled} invalid={Boolean(errors.driMemberId)} describedBy="review-driMemberId-hint" type="member" options={[]} members={editor.members} value={p.driMemberId} onChange={(v) => update("driMemberId", v as string | null)} />)}
      {field("workerMemberIds", label(editor, "project_workers", "참여자"), <PropertyValueInput id="review-workerMemberIds" disabled={disabled} invalid={Boolean(errors.workerMemberIds)} describedBy="review-workerMemberIds-hint" type="members" options={[]} members={editor.members} value={p.workerMemberIds} onChange={(v) => update("workerMemberIds", v as string[])} />)}
      {field("dueDate", label(editor, "due_date", "마감일"), <input {...props("dueDate")} type="date" value={p.dueDate ?? ""} onChange={(e) => update("dueDate", e.target.value || null)} />)}
      {([ ["status", "상태", statusNames], ["priority", "우선순위", priorityNames], ["cadence", "검토 주기", cadenceNames] ] as const).map(([key, title, names]) => <div key={key}>{field(key, label(editor, key, title), systemSelect(key, names))}</div>)}
      {field("progress", label(editor, "progress", "진행률 (%)"), <input {...props("progress")} type="number" min={0} max={100} step="any" value={p.progress} onChange={(e) => update("progress", e.target.value === "" ? 0 : Number(e.target.value))} />)}
      {field("templateId", "본문 템플릿", <select {...props("templateId")} value={p.templateId ?? ""} onChange={(e) => update("templateId", e.target.value || null)}><option value="">미지정</option>{p.templateId && !selectedTemplate && <option value={p.templateId}>사용할 수 없는 템플릿 · 다시 선택</option>}{editor.templates.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select>)}
      {custom.map((property) => {
        const key = `properties.${property.name}`, id = `review-property-${property.id}`, value = p.properties[property.name] ?? null;
        const provenance = origin(key, value), display = propertyText(editor, property.name, value);
        return <div key={property.id}><Field id={id} title={property.name} hint={provenance === display ? display : `${provenance} · ${display}`} error={errors[key]}>
          <PropertyValueInput id={id} disabled={disabled} invalid={Boolean(errors[key])} describedBy={`${id}-hint`} type={property.type} options={property.options} members={editor.members} value={value}
            onChange={(v) => onChange({ ...p, properties: { ...p.properties, [property.name]: empty(v) ? null : property.type === "number" ? Number(v) : v } }, key)} />
        </Field>{!empty(value) && <button className="review-clear" type="button" disabled={disabled} onClick={() => onChange({ ...p, properties: { ...p.properties, [property.name]: null } }, key)} aria-label={`${property.name} 미지정으로 변경`}>미지정으로 변경</button>}</div>;
      })}
    </div>
    {Object.keys(p.properties).filter((name) => !custom.some((property) => property.name === name)).map((name) => <div className="review-error" key={name}><p>{name}: {review.propertyLabels?.[name] ?? "기존 값 있음"} — 현재 사용하지 않는 속성입니다.</p><button disabled={disabled} type="button" onClick={() => { const next = { ...p.properties }; delete next[name]; onChange({ ...p, properties: next }, `properties.${name}`); }}>{name} 값 제외</button></div>)}
  </section>;
}

export function ReviewSummary({ review, proposal: p, editor, selection }: { review: ProjectReview; proposal: ProjectProposal; editor: ProjectReviewEditor | null; selection: InitiativeChoice | null }) {
  const pending = review.state === "pending";
  const template = editor?.templates.find((t) => t.id === p.templateId);
  const preview = pending ? template?.preview : review.templatePreview;
  const rows: [string, string][] = [
    [label(editor, "project_dri", "담당 DRI"), pending ? p.driMemberId ? memberName(editor, p.driMemberId) : "미지정" : review.fieldLabels.dri || "미지정"],
    [label(editor, "project_workers", "참여자"), (pending ? p.workerMemberIds.map((id) => memberName(editor, id)) : review.fieldLabels.workers).join(", ") || "미지정"],
    [label(editor, "due_date", "마감일"), p.dueDate || "미지정"], [label(editor, "priority", "우선순위"), priorityNames[p.priority]],
    [`${label(editor, "status", "상태")} · ${label(editor, "progress", "진행률")}`, `${statusNames[p.status]} · ${p.progress}%`],
    [label(editor, "cadence", "검토 주기"), cadenceNames[p.cadence]], ["본문 템플릿", pending ? template?.name || "미지정" : review.fieldLabels.template || "미지정"],
    ["연결 OKR 파일", selection ? selection.cycleName ?? "파일 없음" : "Initiative 선택 후 결정"],
    ...Object.entries(p.properties).map(([name, value]): [string, string] => [name, !pending && review.propertyLabels?.[name] ? review.propertyLabels[name] : propertyText(editor, name, value)]),
  ];
  return <section className="review-summary" aria-labelledby="project-summary-heading">
    <h2 id="project-summary-heading">{pending ? "최종 생성 내용" : "확인한 Project 내용"}</h2><h3>{p.title || "제목 미입력"}</h3>
    <p className="review-description">{p.description || "범위·완료 기준 미입력"}</p><p>{selection?.path.join(" → ") ?? "아직 Initiative를 선택하지 않았습니다."}</p>
    <dl>{rows.map(([name, value], index) => <div key={`${name}-${index}`}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    {preview != null && <details><summary>적용할 템플릿 본문 미리보기</summary><p className="review-help">템플릿 뒤에 위의 범위·완료 기준이 이어서 저장됩니다.</p><p className="review-description">{preview || "빈 본문"}</p>{preview.length === 4000 && <p className="review-help">앞 4,000자만 표시했습니다.</p>}</details>}
  </section>;
}

function Field({ id, title, hint, error, children }: { id: string; title: string; hint: string; error?: string; children: ReactNode }) {
  return <div className="review-field"><label htmlFor={id}>{title}</label>{children}<small id={`${id}-hint`} className={error ? "review-field-error" : "review-help"}>{error || hint}</small></div>;
}
