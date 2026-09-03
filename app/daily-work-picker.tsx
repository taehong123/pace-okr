"use client";
import { ChevronRight } from "lucide-react";
import type { DailyWork } from "@/lib/daily-work";
import "./daily-work-picker.css";

export function DailyWorkPicker({ work, selected, disabled, noPlanned, onChange, onNoPlanned, onOpen }: {
  work: DailyWork[]; selected: string[]; disabled: boolean; noPlanned: boolean;
  onChange: (keys: string[]) => void; onNoPlanned: (value: boolean) => void; onOpen: (work: DailyWork) => void;
}) {
  return <section className="daily-task-picker" aria-label="오늘 할 업무">
    <header><div><b>오늘 할 업무</b></div><strong>{selected.length}/50</strong></header>
    <div className="daily-task-groups">{(["project", "task", "routine"] as const).map((kind) => {
      const entries = work.filter((entry) => entry.kind === kind);
      return entries.length ? <section key={kind}><h3>{{ project: "Project", task: "Task", routine: "Routine" }[kind]}</h3>{entries.map((entry) => {
        const checked = selected.includes(entry.key);
        return <div className="daily-task-option" data-kind={entry.kind} key={entry.key}><label><input type="checkbox" aria-label={`${entry.title} 선택`} checked={checked} disabled={disabled || noPlanned || (!checked && selected.length >= 50)} onChange={() => onChange(checked ? selected.filter((key) => key !== entry.key) : [...selected, entry.key])} /><span><b>{entry.title}</b><small>{entry.parentTitle}{entry.dueDate ? ` · ${entry.dueDate}` : ""}</small></span></label><button type="button" aria-label={`${entry.title} 열기`} title={`${entry.title} 열기`} onClick={() => onOpen(entry)}><ChevronRight size={16} /></button></div>;
      })}</section> : null;
    })}</div>
    {!work.length && <p className="daily-empty">배정된 미완료 업무가 없습니다.</p>}
    <label className="daily-none"><input type="checkbox" checked={noPlanned} disabled={disabled} onChange={(event) => onNoPlanned(event.target.checked)} />오늘 예정 없음</label>
  </section>;
}
