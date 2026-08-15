"use client";

import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Columns3,
  Copy,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  ListTree,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Target,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type View = "home" | "inbox" | "work" | "okr" | "reviews";
type Cadence = "daily" | "weekly" | "monthly" | "quarterly";
type ItemStatus = "inbox" | "todo" | "in_progress" | "done" | "blocked";
type ItemKind = "objective" | "key_result" | "initiative" | "task" | "action";

type PaceItem = {
  id: string;
  parentId: string | null;
  kind: ItemKind;
  title: string;
  description: string;
  status: ItemStatus;
  priority: "low" | "medium" | "high" | "urgent";
  cadence: Cadence;
  progress: number;
  dueDate: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

const fallbackItems: PaceItem[] = [
  item("obj", null, "objective", "셀프 서브 도입으로 팀의 성장 속도를 높인다", "in_progress", "quarterly", 68),
  item("kr", "obj", "key_result", "신규 사용자의 첫 주 활성화율 32% → 48%", "in_progress", "monthly", 61),
  item("ini", "kr", "initiative", "가입 후 10분 안에 첫 가치 경험 만들기", "in_progress", "monthly", 54),
  item("task-1", "ini", "task", "온보딩 체크리스트 실험", "in_progress", "weekly", 75, "2026-08-20", "web", "high"),
  item("action-1", "task-1", "action", "A/B 테스트 이벤트 정의", "done", "daily", 100, "2026-08-14"),
  item("task-2", "ini", "task", "결제 화면 카피 확정", "in_progress", "weekly", 40, "2026-08-15", "web", "high"),
  item("task-3", "ini", "task", "활성화 이벤트 QA", "todo", "weekly", 0, "2026-08-17"),
  item("task-4", "ini", "task", "신규 사용자 5명 인터뷰", "todo", "weekly", 0, "2026-08-19"),
  item("capture-1", null, "task", "가격 정책 페이지 개선 아이디어", "inbox", "weekly", 0, null, "mcp"),
  item("capture-2", null, "task", "모바일 가입 이탈 구간 확인", "inbox", "weekly", 0, null, "slack"),
];

const navItems = [
  { id: "home" as const, label: "홈", icon: LayoutDashboard },
  { id: "inbox" as const, label: "인박스", icon: Inbox },
  { id: "work" as const, label: "내 작업", icon: ListChecks },
  { id: "okr" as const, label: "OKR", icon: Target },
  { id: "reviews" as const, label: "리뷰", icon: Activity },
];

const cadenceLabels: Record<Cadence, string> = {
  daily: "데일리",
  weekly: "위클리",
  monthly: "먼슬리",
  quarterly: "분기",
};

const viewTitles: Record<View, { eyebrow: string; title: string }> = {
  home: { eyebrow: "2026년 3분기", title: "오늘의 흐름" },
  inbox: { eyebrow: "Capture first", title: "인박스" },
  work: { eyebrow: "집중할 일", title: "내 작업" },
  okr: { eyebrow: "Outcome map", title: "목표와 실행" },
  reviews: { eyebrow: "Review rhythm", title: "리뷰" },
};

export default function Home() {
  const [items, setItems] = useState<PaceItem[]>(fallbackItems);
  const [activeView, setActiveView] = useState<View>("home");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [display, setDisplay] = useState<"tree" | "board">("tree");
  const [capture, setCapture] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/items")
      .then((response) => {
        if (!response.ok) throw new Error("offline");
        return response.json() as Promise<{ items: PaceItem[] }>;
      })
      .then((data) => {
        if (active && data.items.length) {
          setItems(data.items);
          setConnected(true);
        }
      })
      .catch(() => setConnected(false));
    return () => {
      active = false;
    };
  }, []);

  const inboxItems = items.filter((entry) => entry.status === "inbox");
  const structuredItems = items.filter((entry) => entry.status !== "inbox");
  const periodItems = items.filter(
    (entry) =>
      entry.status !== "inbox" &&
      (cadence === "quarterly" || entry.cadence === cadence || entry.kind === "objective"),
  );
  const weekItems = items
    .filter((entry) => ["task", "action"].includes(entry.kind) && entry.status !== "inbox")
    .slice(0, 5);
  const initiatives = items.filter((entry) => entry.kind === "initiative");
  const objective = items.find((entry) => entry.kind === "objective");
  const completed = periodItems.filter((entry) => entry.status === "done").length;
  const blocked = periodItems.filter((entry) => entry.status === "blocked").length;
  const averageProgress = periodItems.length
    ? Math.round(periodItems.reduce((sum, entry) => sum + entry.progress, 0) / periodItems.length)
    : 0;
  const depths = useMemo(() => buildDepths(structuredItems), [structuredItems]);

  async function submitCapture(event: React.FormEvent) {
    event.preventDefault();
    const title = capture.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, source: "web" }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { item: PaceItem };
      setItems((current) => [...current, data.item]);
      setConnected(true);
    } catch {
      setItems((current) => [
        ...current,
        item(crypto.randomUUID(), null, "task", title, "inbox", "weekly", 0),
      ]);
    } finally {
      setCapture("");
      setSaving(false);
      showNotice("인박스에 담았습니다. 연결은 나중에 해도 됩니다.");
    }
  }

  async function patchItem(id: string, patch: Partial<PaceItem>) {
    const previous = items;
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    try {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!response.ok) throw new Error("update failed");
      const data = (await response.json()) as { item: PaceItem };
      setItems((current) => current.map((entry) => (entry.id === id ? data.item : entry)));
    } catch {
      setItems(previous);
      showNotice("업데이트하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  function connectInbox(entry: PaceItem) {
    const parent = initiatives[0];
    if (!parent) {
      showNotice("먼저 연결할 Initiative를 만들어 주세요.");
      return;
    }
    void patchItem(entry.id, { parentId: parent.id, status: "todo" });
    showNotice("Task로 정리하고 Initiative에 연결했습니다.");
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function copyValue(value: string) {
    void navigator.clipboard.writeText(value);
    showNotice("주소를 복사했습니다.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="brand-mark">P</span>
          <div>
            <strong>Pace</strong>
            <span>Product Lab</span>
          </div>
        </div>

        <nav aria-label="주요 메뉴">
          {navItems.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                className={`nav-item ${activeView === entry.id ? "active" : ""}`}
                key={entry.id}
                onClick={() => setActiveView(entry.id)}
              >
                <Icon size={18} />
                <span>{entry.label}</span>
                {entry.id === "inbox" && inboxItems.length > 0 && <b>{inboxItems.length}</b>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setIntegrationOpen(true)}>
            <Zap size={18} />
            <span>연동</span>
            <i className={connected ? "connection-live" : "connection-local"} />
          </button>
          <button className="nav-item">
            <CircleHelp size={18} />
            <span>도움말</span>
          </button>
          <button className="profile-row">
            <span className="avatar">TH</span>
            <span>태홍</span>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{viewTitles[activeView].eyebrow}</p>
            <h1>{viewTitles[activeView].title}</h1>
          </div>
          <div className="top-actions">
            <div className="cadence-switch" aria-label="업무 주기">
              {(Object.keys(cadenceLabels) as Cadence[]).map((key) => (
                <button
                  className={cadence === key ? "selected" : ""}
                  key={key}
                  onClick={() => setCadence(key)}
                >
                  {cadenceLabels[key]}
                </button>
              ))}
            </div>
            <button className="icon-button" aria-label="검색" title="검색"><Search size={18} /></button>
            <button className="icon-button" aria-label="알림" title="알림"><Bell size={18} /></button>
          </div>
        </header>

        <form className="capture-bar" onSubmit={submitCapture}>
          <span className="capture-plus"><Plus size={18} /></span>
          <input
            aria-label="새 작업 빠르게 등록"
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === "Enter") event.currentTarget.form?.requestSubmit();
            }}
            placeholder="해야 할 일을 자연스럽게 입력하세요"
          />
          <span className="capture-hint">Ctrl + Enter</span>
          <button type="submit" disabled={saving}>
            {saving ? <Clock3 size={16} /> : <Send size={16} />}
            <span>등록</span>
          </button>
        </form>
        {notice && <div className="toast" role="status">{notice}</div>}

        <div className={`content-grid view-${activeView}`}>
          <section className="main-column">
            <PanelHeader
              activeView={activeView}
              display={display}
              setDisplay={setDisplay}
              cadence={cadence}
              count={activeView === "inbox" ? inboxItems.length : periodItems.length}
            />

            {(activeView === "home" || activeView === "okr") && display === "tree" && (
              <TreeView
                objective={objective}
                items={structuredItems}
                depths={depths}
                onComplete={(id) => void patchItem(id, { status: "done", progress: 100 })}
              />
            )}
            {(activeView === "home" || activeView === "okr") && display === "board" && (
              <BoardView items={structuredItems.filter((entry) => ["task", "action"].includes(entry.kind))} />
            )}
            {activeView === "inbox" && (
              <InboxView items={inboxItems} onConnect={connectInbox} />
            )}
            {activeView === "work" && (
              <WorkView
                items={periodItems.filter((entry) => ["task", "action"].includes(entry.kind))}
                cadence={cadence}
                onComplete={(id) => void patchItem(id, { status: "done", progress: 100 })}
              />
            )}
            {activeView === "reviews" && (
              <ReviewView
                items={periodItems}
                cadence={cadence}
                completed={completed}
                blocked={blocked}
                averageProgress={averageProgress}
              />
            )}
          </section>

          <aside className="right-column">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">{formatKoreanDate(new Date())}</span>
                <h2>{activeView === "inbox" ? "등록 경로" : "이번 주"}</h2>
              </div>
              <button className="text-button" onClick={() => setActiveView("work")}>전체 보기</button>
            </div>

            {activeView === "inbox" ? (
              <div className="source-list">
                <SourceRow icon={MessageSquareText} label="대화 / MCP" count={inboxItems.filter((entry) => entry.source === "mcp").length} color="blue" />
                <SourceRow icon={Bot} label="봇 웹훅" count={inboxItems.filter((entry) => entry.source !== "mcp" && entry.source !== "web").length} color="coral" />
                <SourceRow icon={Plus} label="웹 직접 등록" count={inboxItems.filter((entry) => entry.source === "web").length} color="green" />
              </div>
            ) : (
              <div className="week-list">
                {weekItems.map((entry) => (
                  <button className="week-item" key={entry.id} onClick={() => setActiveView("work")}>
                    <span className={`status-dot status-${entry.status}`} />
                    <span>
                      <b>{entry.title}</b>
                      <small>{dueLabel(entry.dueDate)} · {kindLabel(entry.kind)}</small>
                    </span>
                    <em>{statusLabel(entry.status)}</em>
                  </button>
                ))}
              </div>
            )}

            <div className="integration-strip">
              <div className="integration-icon"><Zap size={17} /></div>
              <div>
                <span className="eyebrow">MCP ready</span>
                <h3>대화에서 바로 등록</h3>
              </div>
              <button aria-label="연동 설정 열기" title="연동 설정" onClick={() => setIntegrationOpen(true)}>
                <ArrowRight size={16} />
              </button>
            </div>
          </aside>
        </div>
      </section>

      {integrationOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIntegrationOpen(false);
          }}
        >
          <section className="integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-title">
            <header>
              <div>
                <span className="eyebrow">Connect Pace</span>
                <h2 id="integration-title">대화와 봇 연결</h2>
              </div>
              <button className="icon-button" aria-label="닫기" title="닫기" onClick={() => setIntegrationOpen(false)}><X size={18} /></button>
            </header>
            <div className="endpoint-row">
              <span className="endpoint-icon"><MessageSquareText size={18} /></span>
              <div><b>MCP endpoint</b><code>{typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp"}</code></div>
              <button className="icon-button" aria-label="MCP 주소 복사" title="주소 복사" onClick={() => copyValue(`${window.location.origin}/mcp`)}><Copy size={16} /></button>
            </div>
            <div className="endpoint-row">
              <span className="endpoint-icon coral"><Bot size={18} /></span>
              <div><b>Bot webhook</b><code>{typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/capture` : "/api/webhooks/capture"}</code></div>
              <button className="icon-button" aria-label="웹훅 주소 복사" title="주소 복사" onClick={() => copyValue(`${window.location.origin}/api/webhooks/capture`)}><Copy size={16} /></button>
            </div>
            <div className="tool-list">
              {["capture_item", "create_item", "list_items", "update_item", "link_item", "review_period"].map((tool) => (
                <code key={tool}>{tool}</code>
              ))}
            </div>
            <footer>
              <span><CheckCircle2 size={16} /> Objective → Key Result → Initiative → Task → Action</span>
              <button onClick={() => setIntegrationOpen(false)}>완료</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function PanelHeader({
  activeView,
  display,
  setDisplay,
  cadence,
  count,
}: {
  activeView: View;
  display: "tree" | "board";
  setDisplay: (display: "tree" | "board") => void;
  cadence: Cadence;
  count: number;
}) {
  const heading =
    activeView === "inbox"
      ? { eyebrow: "분류 전", title: `새로 들어온 항목 ${count}개` }
      : activeView === "work"
        ? { eyebrow: cadenceLabels[cadence], title: "실행 목록" }
        : activeView === "reviews"
          ? { eyebrow: cadenceLabels[cadence], title: "성과 리듬" }
          : { eyebrow: "현재 집중", title: "분기 목표" };

  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{heading.eyebrow}</span>
        <h2>{heading.title}</h2>
      </div>
      {(activeView === "home" || activeView === "okr") && (
        <div className="view-switch" aria-label="보기 전환">
          <button className={display === "tree" ? "selected" : ""} onClick={() => setDisplay("tree")}>
            <ListTree size={15} />트리
          </button>
          <button className={display === "board" ? "selected" : ""} onClick={() => setDisplay("board")}>
            <Columns3 size={15} />보드
          </button>
        </div>
      )}
    </div>
  );
}

function TreeView({
  objective,
  items,
  depths,
  onComplete,
}: {
  objective?: PaceItem;
  items: PaceItem[];
  depths: Record<string, number>;
  onComplete: (id: string) => void;
}) {
  if (!objective) return <EmptyState icon={Target} title="첫 Objective를 만들어 주세요" />;
  return (
    <>
      <div className="objective-summary">
        <div>
          <span className="type-pill">Objective</span>
          <h3>{objective.title}</h3>
          <p>Owner 태홍 · 분기 목표</p>
        </div>
        <strong>{objective.progress}%</strong>
      </div>
      <div className="hierarchy" aria-label="OKR 작업 구조">
        {items.filter((entry) => entry.id !== objective.id).map((entry) => (
          <div
            className="hierarchy-row"
            key={entry.id}
            style={{ "--depth": Math.min(depths[entry.id] ?? 1, 4) } as React.CSSProperties}
          >
            <span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span>
            <span className="hierarchy-copy">
              <small>{kindLabel(entry.kind)} · {statusLabel(entry.status)}</small>
              <b>{entry.title}</b>
            </span>
            <span className="mini-progress"><i style={{ width: `${entry.progress}%` }} /></span>
            <em>{entry.progress}%</em>
            {entry.status !== "done" && ["task", "action"].includes(entry.kind) ? (
              <button
                type="button"
                className="row-action"
                aria-label="완료 처리"
                title="완료 처리"
                onClick={(event) => {
                  event.stopPropagation();
                  onComplete(entry.id);
                }}
              >
                <Check size={14} />
              </button>
            ) : <ChevronRight className="row-chevron" size={15} />}
          </div>
        ))}
      </div>
    </>
  );
}

function BoardView({ items }: { items: PaceItem[] }) {
  const columns: { status: ItemStatus; label: string }[] = [
    { status: "todo", label: "할 일" },
    { status: "in_progress", label: "진행 중" },
    { status: "done", label: "완료" },
  ];
  return (
    <div className="board">
      {columns.map((column) => {
        const rows = items.filter((entry) => entry.status === column.status);
        return (
          <section className="board-column" key={column.status}>
            <header><span className={`status-dot status-${column.status}`} /><b>{column.label}</b><em>{rows.length}</em></header>
            <div>
              {rows.map((entry) => (
                <button className="board-item" key={entry.id}>
                  <small>{kindLabel(entry.kind)}</small>
                  <b>{entry.title}</b>
                  <span><CalendarDays size={13} />{dueLabel(entry.dueDate)}</span>
                </button>
              ))}
              {!rows.length && <span className="empty-column">항목 없음</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function InboxView({ items, onConnect }: { items: PaceItem[]; onConnect: (item: PaceItem) => void }) {
  if (!items.length) return <EmptyState icon={Inbox} title="인박스를 모두 정리했습니다" />;
  return (
    <div className="inbox-list">
      {items.map((entry) => (
        <article className="inbox-item" key={entry.id}>
          <span className={`source-badge source-${entry.source}`}>{sourceLabel(entry.source)}</span>
          <div>
            <h3>{entry.title}</h3>
            <p>방금 등록됨 · Task 후보</p>
          </div>
          <button onClick={() => onConnect(entry)}><Link2 size={15} />연결</button>
        </article>
      ))}
    </div>
  );
}

function WorkView({ items, cadence, onComplete }: { items: PaceItem[]; cadence: Cadence; onComplete: (id: string) => void }) {
  if (!items.length) return <EmptyState icon={ListChecks} title={`${cadenceLabels[cadence]} 작업이 없습니다`} />;
  return (
    <div className="work-list">
      {items.map((entry) => (
        <article className="work-row" key={entry.id}>
          <button
            className={`check-button ${entry.status === "done" ? "checked" : ""}`}
            aria-label={entry.status === "done" ? "완료됨" : "완료 처리"}
            title={entry.status === "done" ? "완료됨" : "완료 처리"}
            onClick={() => entry.status !== "done" && onComplete(entry.id)}
          >
            {entry.status === "done" && <Check size={14} />}
          </button>
          <div>
            <b>{entry.title}</b>
            <span>{kindLabel(entry.kind)} · {dueLabel(entry.dueDate)}</span>
          </div>
          <span className={`priority priority-${entry.priority}`}>{priorityLabel(entry.priority)}</span>
          <em>{entry.progress}%</em>
        </article>
      ))}
    </div>
  );
}

function ReviewView({
  items,
  cadence,
  completed,
  blocked,
  averageProgress,
}: {
  items: PaceItem[];
  cadence: Cadence;
  completed: number;
  blocked: number;
  averageProgress: number;
}) {
  return (
    <div className="review-content">
      <div className="metrics-row">
        <div><span>완료</span><strong>{completed}<small> / {items.length}</small></strong></div>
        <div><span>평균 진척</span><strong>{averageProgress}<small>%</small></strong></div>
        <div><span>막힘</span><strong>{blocked}</strong></div>
      </div>
      <div className="review-progress">
        <div><b>{cadenceLabels[cadence]} 진척도</b><span>{averageProgress}%</span></div>
        <span><i style={{ width: `${averageProgress}%` }} /></span>
      </div>
      <div className="review-list">
        <span className="eyebrow">다음 리뷰에서 볼 항목</span>
        {items.slice(0, 6).map((entry) => (
          <div key={entry.id}>
            <span className={`status-dot status-${entry.status}`} />
            <b>{entry.title}</b>
            <em>{entry.progress}%</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceRow({ icon: Icon, label, count, color }: { icon: typeof Bot; label: string; count: number; color: string }) {
  return (
    <div className="source-row">
      <span className={`source-row-icon ${color}`}><Icon size={17} /></span>
      <b>{label}</b>
      <em>{count}</em>
    </div>
  );
}

function EmptyState({ icon: Icon, title }: { icon: typeof Target; title: string }) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <b>{title}</b>
    </div>
  );
}

function item(
  id: string,
  parentId: string | null,
  kind: ItemKind,
  title: string,
  status: ItemStatus,
  cadence: Cadence,
  progress: number,
  dueDate: string | null = null,
  source = "web",
  priority: PaceItem["priority"] = "medium",
): PaceItem {
  return {
    id,
    parentId,
    kind,
    title,
    description: "",
    status,
    priority,
    cadence,
    progress,
    dueDate,
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildDepths(items: PaceItem[]) {
  const byId = new Map(items.map((entry) => [entry.id, entry]));
  const result: Record<string, number> = {};
  for (const entry of items) {
    let depth = 0;
    let current = entry;
    while (current.parentId && depth < 5) {
      depth += 1;
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    result[entry.id] = depth;
  }
  return result;
}

function kindAbbr(kind: ItemKind) {
  return { objective: "O", key_result: "KR", initiative: "I", task: "T", action: "A" }[kind];
}

function kindLabel(kind: ItemKind) {
  return { objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task", action: "Action" }[kind];
}

function statusLabel(status: ItemStatus) {
  return { inbox: "인박스", todo: "할 일", in_progress: "진행 중", done: "완료", blocked: "막힘" }[status];
}

function priorityLabel(priority: PaceItem["priority"]) {
  return { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" }[priority];
}

function sourceLabel(source: string) {
  return { mcp: "MCP", slack: "Slack", discord: "Discord", telegram: "Telegram", web: "Web" }[source] ?? "Bot";
}

function dueLabel(value: string | null) {
  if (!value) return "날짜 없음";
  const today = new Date();
  const due = new Date(`${value}T00:00:00`);
  const diff = Math.round((due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  return `${due.getMonth() + 1}월 ${due.getDate()}일`;
}

function formatKoreanDate(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
