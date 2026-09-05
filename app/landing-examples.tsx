import { ArrowDown, Bot, ClipboardCheck, FileSearch, ListChecks, MessageSquare, Target, UserRound, Zap } from "lucide-react";
import type { LandingExampleContent, LandingExampleKind } from "@/lib/landing-copy";

export function LandingExample({ kind, copy }: { kind: LandingExampleKind; copy: LandingExampleContent }) {
  if (kind === "okr") return <div className="landing-example landing-example-okr" data-example={kind}>
    <div className="landing-example-goal"><Target size={24} aria-hidden="true" /><div><span className="landing-example-label">{copy.objectiveLabel}</span><p>{copy.objective}</p></div></div>
    <div className="landing-example-result">
      <span className="landing-example-label">{copy.keyResultLabel}</span><p>{copy.keyResult}</p>
      <dl className="landing-example-metrics">
        <div><dt>{copy.current}</dt><dd>{copy.currentValue}</dd></div>
        <div><dt>{copy.target}</dt><dd>{copy.targetValue}</dd></div>
      </dl>
    </div>
  </div>;

  if (kind === "connection") {
    const rows = [
      { kind: "task", code: "T", label: copy.taskLabel, title: copy.task, detail: copy.inProgress },
      { kind: "project", code: "P", label: copy.projectLabel, title: copy.project },
      { kind: "initiative", code: "I", label: copy.initiativeLabel, title: copy.initiative },
      { kind: "key-result", code: "KR", label: copy.keyResultLabel, title: copy.keyResult, detail: `${copy.current} ${copy.currentValue} / ${copy.target} ${copy.targetValue}` },
      { kind: "objective", code: "O", label: copy.objectiveLabel, title: copy.objective },
    ];
    return <ol className="landing-example landing-example-path" data-example={kind}>{rows.map((row, index) => <li key={row.kind} data-kind={row.kind}>
      <div className="landing-path-rail"><abbr title={row.label}>{row.code}</abbr>{index < rows.length - 1 && <ArrowDown size={14} aria-hidden="true" />}</div>
      <div className="landing-path-content"><span className="landing-example-label">{row.label}</span><p>{row.title}</p>{row.detail && <span className="landing-example-label">{row.detail}</span>}</div>
    </li>)}</ol>;
  }

  if (kind === "conversation") return <div className="landing-example landing-example-conversation" data-example={kind}>
    <div className="landing-example-request"><UserRound size={18} aria-hidden="true" /><p>{copy.request}</p></div>
    <div className="landing-example-proposal">
      <span className="landing-example-label"><MessageSquare size={16} aria-hidden="true" />{copy.proposal}</span>
      <p>{copy.project}</p>
      <ul><li><ListChecks size={16} aria-hidden="true" />{copy.task}</li><li><ListChecks size={16} aria-hidden="true" />{copy.secondTask}</li></ul>
      <span className="landing-example-review"><FileSearch size={16} aria-hidden="true" />{copy.review}</span>
    </div>
  </div>;

  const bots = [
    { Icon: Bot, title: copy.daily, detail: copy.dailyDetail },
    { Icon: ClipboardCheck, title: copy.management, detail: copy.managementDetail },
    { Icon: MessageSquare, title: copy.work, detail: `!task ${copy.task}` },
    { Icon: Zap, title: copy.changes, detail: copy.changesDetail },
  ];
  return <ul className="landing-example landing-example-bots" data-example={kind}>{bots.map(({ Icon, title, detail }) => <li key={title}>
    <Icon size={20} aria-hidden="true" /><div><p>{title}</p><span className="landing-example-label">{detail}</span></div>
  </li>)}</ul>;
}
