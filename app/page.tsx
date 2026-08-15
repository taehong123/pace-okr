"use client";

import {
  Activity,
  ArrowDownUp,
  Bell,
  Bot,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Columns3,
  Copy,
  Filter,
  Hash,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Table2,
  Target,
  TextCursorInput,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

type View = "home" | "inbox" | "work" | "okr" | "scrum" | "recommendations" | "reviews";
type Cadence = "daily" | "weekly" | "monthly" | "quarterly";
type ItemStatus = "inbox" | "todo" | "in_progress" | "done" | "blocked";
type ItemKind = "objective" | "key_result" | "initiative" | "project" | "task";
type Priority = "low" | "medium" | "high" | "urgent";
type PropertyType = "text" | "number" | "select" | "date" | "checkbox";
type PropertyValue = string | number | boolean | null;

type OkitaItem = {
  id: string;
  parentId: string | null;
  kind: ItemKind;
  title: string;
  description: string;
  status: ItemStatus;
  priority: Priority;
  cadence: Cadence;
  progress: number;
  dueDate: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type PropertyDefinition = {
  id: string;
  name: string;
  type: PropertyType;
  options: string[];
  sortOrder: number;
};

type PropertyValueMap = Record<string, Record<string, PropertyValue>>;
type ChecklistItem = { id: string; taskId: string; title: string; completed: boolean; sortOrder: number };
type Scrum = {
  date: string;
  yesterdayNote: string;
  todayNote: string;
  blockersNote: string;
  yesterdayTasks: OkitaItem[];
  todayTasks: OkitaItem[];
  blockers: OkitaItem[];
  updatedAt: string | null;
};
type Recommendation = {
  id: string;
  kind: "blocked" | "overdue" | "unlinked" | "due_soon" | "empty_project";
  title: string;
  detail: string;
  itemIds: string[];
  score: number;
};

const fallbackItems: OkitaItem[] = [
  item("obj", null, "objective", "셀프 서브 도입으로 팀의 성장 속도를 높인다", "in_progress", "quarterly", 68),
  item("kr", "obj", "key_result", "신규 사용자의 첫 주 활성화율 32% → 48%", "in_progress", "monthly", 61),
  item("ini", "kr", "initiative", "가입 후 10분 안에 첫 가치 경험 만들기", "in_progress", "monthly", 54),
  item("project", "ini", "project", "온보딩 활성화 개선", "in_progress", "monthly", 52),
  item("task-1", "project", "task", "온보딩 체크리스트 실험", "in_progress", "weekly", 50, "2026-08-20", "web", "high"),
  item("task-2", "project", "task", "결제 화면 카피 확정", "in_progress", "weekly", 40, "2026-08-15", "web", "high"),
  item("task-3", "project", "task", "활성화 이벤트 QA", "todo", "weekly", 0, "2026-08-17"),
  item("task-4", "project", "task", "신규 사용자 5명 인터뷰", "todo", "weekly", 0, "2026-08-19"),
  item("capture-1", null, "task", "가격 정책 페이지 개선 아이디어", "inbox", "weekly", 0, null, "mcp"),
  item("capture-2", null, "task", "모바일 가입 이탈 구간 확인", "inbox", "weekly", 0, null, "slack"),
];

const fallbackProperties: PropertyDefinition[] = [
  { id: "owner", name: "담당", type: "text", options: [], sortOrder: 10 },
  { id: "sprint", name: "스프린트", type: "select", options: ["Sprint 18", "Sprint 19", "Backlog"], sortOrder: 20 },
  { id: "estimate", name: "예상 시간", type: "number", options: [], sortOrder: 30 },
];

const fallbackValues: PropertyValueMap = {
  "task-1": { owner: "태홍", sprint: "Sprint 18", estimate: 6 },
  "task-2": { owner: "민지", sprint: "Sprint 18", estimate: 3 },
  "task-3": { owner: "태홍", sprint: "Sprint 18", estimate: 4 },
  "task-4": { owner: "유진", sprint: "Sprint 19", estimate: 5 },
};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "홈", icon: LayoutDashboard },
  { id: "inbox", label: "인박스", icon: Inbox },
  { id: "work", label: "작업", icon: Table2 },
  { id: "okr", label: "OKR", icon: Target },
  { id: "scrum", label: "데일리", icon: CalendarCheck },
  { id: "recommendations", label: "추천", icon: Lightbulb },
  { id: "reviews", label: "리뷰", icon: Activity },
];

const cadenceLabels: Record<Cadence, string> = { daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };
const viewTitles: Record<View, string> = {
  home: "홈",
  inbox: "인박스",
  work: "작업",
  okr: "OKR",
  scrum: "데일리 스크럼",
  recommendations: "추천",
  reviews: "리뷰",
};

export default function Home() {
  const [items, setItems] = useState<OkitaItem[]>(fallbackItems);
  const [properties, setProperties] = useState<PropertyDefinition[]>(fallbackProperties);
  const [propertyValues, setPropertyValues] = useState<PropertyValueMap>(fallbackValues);
  const [activeView, setActiveView] = useState<View>("work");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [taskDisplay, setTaskDisplay] = useState<"table" | "board">("table");
  const [capture, setCapture] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/items"), fetch("/api/properties")])
      .then(async ([itemsResponse, propertiesResponse]) => {
        if (!itemsResponse.ok || !propertiesResponse.ok) throw new Error("offline");
        const itemData = (await itemsResponse.json()) as { items: OkitaItem[] };
        const propertyData = (await propertiesResponse.json()) as { properties: PropertyDefinition[]; values: PropertyValueMap };
        if (!active) return;
        if (itemData.items.length) setItems(itemData.items);
        setProperties(propertyData.properties);
        setPropertyValues(propertyData.values);
        setConnected(true);
      })
      .catch(() => setConnected(false));
    return () => { active = false; };
  }, []);

  const inboxItems = items.filter((entry) => entry.status === "inbox");
  const taskItems = items.filter((entry) => entry.kind === "task");
  const structuredItems = items.filter((entry) => entry.status !== "inbox");
  const periodItems = items.filter(
    (entry) => entry.status !== "inbox" && (cadence === "quarterly" || entry.cadence === cadence || entry.kind === "objective"),
  );
  const objective = items.find((entry) => entry.kind === "objective");
  const completed = periodItems.filter((entry) => entry.status === "done").length;
  const blocked = periodItems.filter((entry) => entry.status === "blocked").length;
  const averageProgress = periodItems.length
    ? Math.round(periodItems.reduce((sum, entry) => sum + entry.progress, 0) / periodItems.length)
    : 0;
  const depths = useMemo(() => buildDepths(structuredItems), [structuredItems]);
  const selectedTask = items.find((entry) => entry.id === selectedTaskId && entry.kind === "task");

  async function submitCapture(event: FormEvent) {
    event.preventDefault();
    const title = capture.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kind: "task", source: "web" }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { item: OkitaItem };
      setItems((current) => [...current, data.item]);
      setConnected(true);
    } catch {
      setItems((current) => [...current, item(crypto.randomUUID(), null, "task", title, "inbox", "weekly", 0)]);
    } finally {
      setCapture("");
      setSaving(false);
      showNotice("인박스에 추가했습니다.");
    }
  }

  async function patchItem(id: string, patch: Partial<OkitaItem>) {
    const previous = items;
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    try {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!response.ok) throw new Error("update failed");
      const data = (await response.json()) as { item: OkitaItem };
      setItems((current) => current.map((entry) => (entry.id === id ? data.item : entry)));
    } catch {
      setItems(previous);
      showNotice("변경사항을 저장하지 못했습니다.");
    }
  }

  async function setPropertyValue(itemId: string, propertyId: string, value: PropertyValue) {
    const previous = propertyValues;
    setPropertyValues((current) => ({ ...current, [itemId]: { ...current[itemId], [propertyId]: value } }));
    try {
      const response = await fetch("/api/property-values", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, propertyId, value }),
      });
      if (!response.ok) throw new Error("property save failed");
    } catch {
      setPropertyValues(previous);
      showNotice("속성값을 저장하지 못했습니다.");
    }
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function connectInbox(entry: OkitaItem) {
    const project = items.find((itemEntry) => itemEntry.kind === "project");
    if (!project) {
      setCreateItemOpen(true);
      showNotice("먼저 Project를 만들어 주세요.");
      return;
    }
    void patchItem(entry.id, { parentId: project.id, status: "todo" });
    showNotice(`‘${project.title}’에 연결했습니다.`);
  }

  function addCreatedItem(created: OkitaItem) {
    setItems((current) => [...current, created]);
    setCreateItemOpen(false);
    showNotice(`${kindLabel(created.kind)}를 만들었습니다.`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="workspace-switcher">
          <span className="brand-mark">O</span>
          <span><strong>OKITA</strong><small>Product Lab</small></span>
          <ChevronDown size={14} />
        </button>
        <nav>
          {navItems.map((entry) => {
            const Icon = entry.icon;
            return (
              <button className={`nav-item ${activeView === entry.id ? "active" : ""}`} key={entry.id} onClick={() => setActiveView(entry.id)}>
                <Icon size={16} /><span>{entry.label}</span>
                {entry.id === "inbox" && inboxItems.length > 0 && <b>{inboxItems.length}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-section">
          <span>주기</span>
          {(Object.keys(cadenceLabels) as Cadence[]).map((entry) => (
            <button className="nav-item" key={entry} onClick={() => { setCadence(entry); setActiveView("reviews"); }}>
              <CalendarDays size={15} /><span>{cadenceLabels[entry]}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setIntegrationOpen(true)}><Bot size={16} /><span>MCP 연결</span><i className={connected ? "connection-live" : "connection-local"} /></button>
          <button className="nav-item" onClick={() => setPropertyPanelOpen(true)}><Settings2 size={16} /><span>속성 관리</span></button>
          <button className="profile-row"><span className="avatar">T</span><span>태홍</span><MoreHorizontal size={15} /></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-topbar">
          <span>OKITA</span><ChevronRight size={13} /><b>{viewTitles[activeView]}</b>
          <div><button aria-label="알림" title="알림"><Bell size={15} /></button><button aria-label="도움말" title="도움말"><CircleHelp size={15} /></button></div>
        </header>
        <div className="page-body">
          <header className="page-header">
            <div><h1>{viewTitles[activeView]}</h1><p>{pageSubtitle(activeView)}</p></div>
            {activeView === "okr" ? (
              <button className="primary-action" onClick={() => setCreateItemOpen(true)}><Plus size={14} />새 항목</button>
            ) : !["scrum", "recommendations", "inbox"].includes(activeView) ? (
              <CadenceSwitch value={cadence} onChange={setCadence} />
            ) : null}
          </header>

          {(activeView === "home" || activeView === "inbox" || activeView === "work") && (
            <form className="quick-capture" onSubmit={submitCapture}>
              <Plus size={15} />
              <input value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="할 일을 입력하면 인박스에 저장됩니다" aria-label="인박스에 할 일 추가" />
              <button disabled={!capture.trim() || saving}>{saving ? "저장 중" : "추가"}</button>
            </form>
          )}

          {activeView === "home" && <HomeView objective={objective} items={taskItems} onGoToWork={() => setActiveView("work")} onOpenTask={setSelectedTaskId} />}
          {activeView === "inbox" && <InboxView items={inboxItems} onConnect={connectInbox} />}
          {activeView === "work" && (
            <TaskDatabase
              items={taskItems}
              allItems={items}
              properties={properties}
              values={propertyValues}
              display={taskDisplay}
              onDisplayChange={setTaskDisplay}
              onPatch={patchItem}
              onPropertyChange={setPropertyValue}
              onOpenProperties={() => setPropertyPanelOpen(true)}
              onOpenTask={setSelectedTaskId}
            />
          )}
          {activeView === "okr" && <TreeView objective={objective} items={structuredItems} depths={depths} onComplete={(id) => void patchItem(id, { status: "done", progress: 100 })} />}
          {activeView === "scrum" && <DailyScrumView onOpenTask={setSelectedTaskId} onNotice={showNotice} />}
          {activeView === "recommendations" && <RecommendationsView onNavigate={setActiveView} />}
          {activeView === "reviews" && <ReviewView items={periodItems} cadence={cadence} completed={completed} blocked={blocked} averageProgress={averageProgress} />}
        </div>
      </section>

      {notice && <div className="toast">{notice}</div>}
      {integrationOpen && <IntegrationModal onClose={() => setIntegrationOpen(false)} />}
      {propertyPanelOpen && (
        <PropertyPanel
          properties={properties}
          onClose={() => setPropertyPanelOpen(false)}
          onCreated={(property) => setProperties((current) => [...current, property])}
          onDeleted={(id) => setProperties((current) => current.filter((entry) => entry.id !== id))}
          onNotice={showNotice}
        />
      )}
      {createItemOpen && <CreateItemPanel items={items} onClose={() => setCreateItemOpen(false)} onCreated={addCreatedItem} />}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          project={items.find((entry) => entry.id === selectedTask.parentId)}
          onClose={() => setSelectedTaskId(null)}
          onProgress={(progress) => setItems((current) => current.map((entry) => entry.id === selectedTask.id ? { ...entry, progress } : entry))}
        />
      )}
    </main>
  );
}

function CadenceSwitch({ value, onChange }: { value: Cadence; onChange: (value: Cadence) => void }) {
  return <div className="cadence-switch">{(Object.keys(cadenceLabels) as Cadence[]).map((entry) => <button className={value === entry ? "selected" : ""} key={entry} onClick={() => onChange(entry)}>{cadenceLabels[entry]}</button>)}</div>;
}

function TaskDatabase({ items, allItems, properties, values, display, onDisplayChange, onPatch, onPropertyChange, onOpenProperties, onOpenTask }: {
  items: OkitaItem[];
  allItems: OkitaItem[];
  properties: PropertyDefinition[];
  values: PropertyValueMap;
  display: "table" | "board";
  onDisplayChange: (display: "table" | "board") => void;
  onPatch: (id: string, patch: Partial<OkitaItem>) => Promise<void>;
  onPropertyChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  onOpenProperties: () => void;
  onOpenTask: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = items.filter((entry) => entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));
  return (
    <section className="database-section">
      <div className="database-toolbar">
        <div className="view-tabs">
          <button className={display === "table" ? "active" : ""} onClick={() => onDisplayChange("table")}><Table2 size={13} />테이블</button>
          <button className={display === "board" ? "active" : ""} onClick={() => onDisplayChange("board")}><Columns3 size={13} />보드</button>
        </div>
        <div className="database-actions">
          <label className="table-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색" /></label>
          <button><Filter size={13} /><span>필터</span></button>
          <button><ArrowDownUp size={13} /><span>정렬</span></button>
          <button onClick={onOpenProperties}><Plus size={13} /><span>속성</span></button>
        </div>
      </div>
      {display === "board" ? <BoardView items={visible} onOpenTask={onOpenTask} /> : (
        <div className="database-scroll">
          <div className="task-table" style={{ "--custom-columns": properties.length } as CSSProperties}>
            <div className="task-table-row task-table-head">
              <span><ListChecks size={12} />이름</span><span><Activity size={12} />상태</span><span><Zap size={12} />우선순위</span><span><CalendarDays size={12} />기한</span><span><Link2 size={12} />Project</span>
              {properties.map((property) => <span key={property.id}>{property.type === "number" ? <Hash size={12} /> : <TextCursorInput size={12} />}{property.name}</span>)}
              <button aria-label="속성 추가" title="속성 추가" onClick={onOpenProperties}><Plus size={13} /></button>
            </div>
            {visible.map((entry) => (
              <div className="task-table-row" key={entry.id}>
                <div className="name-cell"><button className={`task-check ${entry.status === "done" ? "checked" : ""}`} onClick={() => void onPatch(entry.id, { status: entry.status === "done" ? "todo" : "done", progress: entry.status === "done" ? entry.progress : 100 })}><Check size={12} /></button><input defaultValue={entry.title} onBlur={(event) => event.target.value.trim() !== entry.title && void onPatch(entry.id, { title: event.target.value })} /></div>
                <select className={`status-select status-${entry.status}`} value={entry.status} onChange={(event) => void onPatch(entry.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <select className={`priority-${entry.priority}`} value={entry.priority} onChange={(event) => void onPatch(entry.id, { priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <input className="date-cell" type="date" value={entry.dueDate ?? ""} onChange={(event) => void onPatch(entry.id, { dueDate: event.target.value || null })} />
                <span className="relation-cell">{entry.parentId ? byId.get(entry.parentId)?.title ?? "연결 없음" : "인박스"}</span>
                {properties.map((property) => <PropertyCell key={property.id} itemId={entry.id} property={property} value={values[entry.id]?.[property.id] ?? null} onChange={onPropertyChange} />)}
                <button className="row-menu" aria-label="Task 상세" title="Task 상세" onClick={() => onOpenTask(entry.id)}><MoreHorizontal size={15} /></button>
              </div>
            ))}
            {!visible.length && <div className="table-empty">표시할 Task가 없습니다.</div>}
          </div>
        </div>
      )}
    </section>
  );
}

function PropertyCell({ itemId, property, value, onChange }: { itemId: string; property: PropertyDefinition; value: PropertyValue; onChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void> }) {
  if (property.type === "checkbox") return <label className="property-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => void onChange(itemId, property.id, event.target.checked)} /><span><Check size={11} /></span></label>;
  if (property.type === "select") return <select className="property-input" value={typeof value === "string" ? value : ""} onChange={(event) => void onChange(itemId, property.id, event.target.value || null)}><option value="">-</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select>;
  return <input className="property-input" type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} value={value === null ? "" : String(value)} onChange={(event) => { const raw = event.target.value; void onChange(itemId, property.id, property.type === "number" ? (raw ? Number(raw) : null) : raw || null); }} />;
}

function TaskDetailPanel({ task, project, onClose, onProgress }: { task: OkitaItem; project?: OkitaItem; onClose: () => void; onProgress: (progress: number) => void }) {
  const [rows, setRows] = useState<ChecklistItem[]>([]);
  const [title, setTitle] = useState("");
  useEffect(() => {
    fetch(`/api/checklists?taskId=${encodeURIComponent(task.id)}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ items: ChecklistItem[] }> : Promise.reject())
      .then((data) => setRows(data.items))
      .catch(() => setRows([]));
  }, [task.id]);

  function updateProgress(nextRows: ChecklistItem[]) {
    onProgress(nextRows.length ? Math.round((nextRows.filter((entry) => entry.completed).length / nextRows.length) * 100) : 0);
  }

  async function addRow(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const response = await fetch("/api/checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, title }) });
    if (!response.ok) return;
    const data = await response.json() as { item: ChecklistItem };
    const next = [...rows, data.item];
    setRows(next); setTitle(""); updateProgress(next);
  }

  async function toggleRow(row: ChecklistItem) {
    const completed = !row.completed;
    const next = rows.map((entry) => entry.id === row.id ? { ...entry, completed } : entry);
    setRows(next); updateProgress(next);
    await fetch("/api/checklists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, completed }) });
  }

  async function deleteRow(id: string) {
    const next = rows.filter((entry) => entry.id !== id);
    setRows(next); updateProgress(next);
    await fetch(`/api/checklists?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  return <div className="modal-backdrop align-right"><aside className="property-panel task-detail-panel"><header><div><p>{project?.title ?? "인박스"}</p><h2>{task.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={17} /></button></header><div className="task-meta"><span className={`status-tag status-${task.status}`}>{statusLabel(task.status)}</span><span><CalendarDays size={13} />{dueLabel(task.dueDate)}</span><b>{task.progress}%</b></div><section className="checklist-section"><header><b>체크리스트</b><span>{rows.filter((entry) => entry.completed).length}/{rows.length}</span></header><div>{rows.map((row) => <div className="checklist-row" key={row.id}><button className={`task-check ${row.completed ? "checked" : ""}`} onClick={() => void toggleRow(row)}><Check size={12} /></button><span className={row.completed ? "completed" : ""}>{row.title}</span><button className="icon-button" onClick={() => void deleteRow(row.id)} aria-label="삭제"><Trash2 size={13} /></button></div>)}</div><form className="checklist-form" onSubmit={addRow}><Plus size={14} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="항목 추가" /><button disabled={!title.trim()}>추가</button></form></section></aside></div>;
}

function CreateItemPanel({ items, onClose, onCreated }: { items: OkitaItem[]; onClose: () => void; onCreated: (item: OkitaItem) => void }) {
  const [kind, setKind] = useState<ItemKind>("task");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const requiredParent: Record<ItemKind, ItemKind | null> = { objective: null, key_result: "objective", initiative: "key_result", project: "initiative", task: "project" };
  const parentKind = requiredParent[kind];
  const parentOptions = parentKind ? items.filter((entry) => entry.kind === parentKind) : [];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving || (kind !== "objective" && kind !== "task" && !parentId)) return;
    setSaving(true);
    const response = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, kind, parentId: parentId || null, status: kind === "task" && !parentId ? "inbox" : "todo" }) });
    setSaving(false);
    if (!response.ok) return;
    const data = await response.json() as { item: OkitaItem };
    onCreated(data.item);
  }
  return <div className="modal-backdrop align-right"><aside className="property-panel"><header><div><h2>새 항목</h2><p>OKR 실행 구조에 추가</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header><form className="property-form create-item-form" onSubmit={submit}><label><span>유형</span><select value={kind} onChange={(event) => { setKind(event.target.value as ItemKind); setParentId(""); }}>{(["objective", "key_result", "initiative", "project", "task"] as ItemKind[]).map((entry) => <option value={entry} key={entry}>{kindLabel(entry)}</option>)}</select></label><label><span>이름</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>{parentKind && <label><span>상위 {kindLabel(parentKind)}</span><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">{kind === "task" ? "인박스에 저장" : "선택"}</option>{parentOptions.map((entry) => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>}<button disabled={!title.trim() || saving}>{saving ? "저장 중" : "만들기"}</button></form></aside></div>;
}

function DailyScrumView({ onOpenTask, onNotice }: { onOpenTask: (id: string) => void; onNotice: (message: string) => void }) {
  const [date, setDate] = useState(localDate());
  const [scrum, setScrum] = useState<Scrum | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch(`/api/daily-scrum?date=${date}`).then(async (response) => response.json() as Promise<{ scrum: Scrum }>).then((data) => setScrum(data.scrum));
  }, [date]);
  if (!scrum) return <EmptyState icon={CalendarCheck} title="데일리 스크럼을 불러오는 중입니다" />;
  async function save() {
    setSaving(true);
    const response = await fetch("/api/daily-scrum", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scrum) });
    setSaving(false);
    if (response.ok) onNotice("데일리 스크럼을 저장했습니다.");
  }
  const sections: { key: "yesterdayNote" | "todayNote" | "blockersNote"; title: string; tasks: OkitaItem[]; icon: LucideIcon }[] = [
    { key: "yesterdayNote", title: "어제 완료", tasks: scrum.yesterdayTasks, icon: CheckCircle2 },
    { key: "todayNote", title: "오늘 집중", tasks: scrum.todayTasks, icon: Target },
    { key: "blockersNote", title: "막힘", tasks: scrum.blockers, icon: CircleHelp },
  ];
  return <section className="scrum-section"><div className="scrum-toolbar"><label><CalendarDays size={14} /><input type="date" value={date} onChange={(event) => { setScrum(null); setDate(event.target.value); }} /></label><button className="primary-action" onClick={() => void save()} disabled={saving}><Check size={14} />{saving ? "저장 중" : "저장"}</button></div><div className="scrum-grid">{sections.map((section) => { const Icon = section.icon; return <section className="scrum-column" key={section.key}><header><Icon size={15} /><b>{section.title}</b><span>{section.tasks.length}</span></header><div className="scrum-task-list">{section.tasks.map((task) => <button key={task.id} onClick={() => onOpenTask(task.id)}><span className={`status-dot status-${task.status}`} /><b>{task.title}</b><small>{dueLabel(task.dueDate)}</small></button>)}{!section.tasks.length && <span className="empty-column">자동으로 모인 Task가 없습니다</span>}</div><textarea value={scrum[section.key]} onChange={(event) => setScrum({ ...scrum, [section.key]: event.target.value })} placeholder="메모" /></section>; })}</div></section>;
}

function RecommendationsView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [rows, setRows] = useState<Recommendation[] | null>(null);
  useEffect(() => { fetch(`/api/recommendations?date=${localDate()}`).then(async (response) => response.json() as Promise<{ recommendations: Recommendation[] }>).then((data) => setRows(data.recommendations)).catch(() => setRows([])); }, []);
  if (!rows) return <EmptyState icon={Lightbulb} title="추천을 계산하는 중입니다" />;
  if (!rows.length) return <EmptyState icon={CheckCircle2} title="지금 바로 정리할 항목이 없습니다" />;
  return <section className="recommendation-list">{rows.map((row) => <article className="recommendation-row" key={row.id}><span className={`recommendation-icon recommendation-${row.kind}`}>{recommendationIcon(row.kind)}</span><div><h3>{row.title}</h3><p>{row.detail}</p><small>{row.itemIds.length}개 항목 · 우선순위 {row.score}</small></div><button onClick={() => onNavigate(row.kind === "unlinked" ? "inbox" : row.kind === "empty_project" ? "okr" : "work")}><ChevronRight size={15} /></button></article>)}</section>;
}

function HomeView({ objective, items, onGoToWork, onOpenTask }: { objective?: OkitaItem; items: OkitaItem[]; onGoToWork: () => void; onOpenTask: (id: string) => void }) {
  return <div className="home-layout"><section className="home-focus"><header>현재 Objective<button onClick={onGoToWork}>작업 보기<ChevronRight size={13} /></button></header>{objective ? <div className="home-objective"><Target size={20} /><div><h2>{objective.title}</h2><span><i style={{ width: `${objective.progress}%` }} /></span><small>{objective.progress}% 진행</small></div></div> : <EmptyState icon={Target} title="Objective가 없습니다" />}</section><section className="home-tasks"><header>진행 중 Task<b>{items.filter((entry) => entry.status === "in_progress").length}</b></header>{items.filter((entry) => entry.status === "in_progress").slice(0, 6).map((entry) => <button key={entry.id} onClick={() => onOpenTask(entry.id)}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><small>{dueLabel(entry.dueDate)}</small></button>)}</section></div>;
}

function TreeView({ objective, items, depths, onComplete }: { objective?: OkitaItem; items: OkitaItem[]; depths: Record<string, number>; onComplete: (id: string) => void }) {
  if (!objective) return <EmptyState icon={Target} title="Objective가 없습니다" />;
  return <section className="outline-section"><div className="objective-row"><Target size={18} /><div><span>Objective</span><h2>{objective.title}</h2></div><b>{objective.progress}%</b></div><div className="hierarchy">{items.filter((entry) => entry.id !== objective.id).map((entry) => <div className="hierarchy-row" key={entry.id} style={{ "--depth": Math.min(depths[entry.id] ?? 1, 4) } as CSSProperties}><span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span><span className="hierarchy-copy"><small>{kindLabel(entry.kind)}</small><b>{entry.title}</b></span><span className={`status-tag status-${entry.status}`}>{statusLabel(entry.status)}</span><em>{entry.progress}%</em>{entry.status !== "done" && ["project", "task"].includes(entry.kind) ? <button className="row-action" aria-label="완료 처리" title="완료 처리" onClick={() => onComplete(entry.id)}><Check size={13} /></button> : <ChevronRight className="row-chevron" size={15} />}</div>)}</div></section>;
}

function BoardView({ items, onOpenTask }: { items: OkitaItem[]; onOpenTask: (id: string) => void }) {
  const columns: { status: ItemStatus; label: string }[] = [{ status: "todo", label: "할 일" }, { status: "in_progress", label: "진행 중" }, { status: "done", label: "완료" }];
  return <div className="board">{columns.map((column) => { const rows = items.filter((entry) => entry.status === column.status); return <section className="board-column" key={column.status}><header><span className={`status-dot status-${column.status}`} /><b>{column.label}</b><em>{rows.length}</em></header><div>{rows.map((entry) => <button className="board-item" key={entry.id} onClick={() => onOpenTask(entry.id)}><b>{entry.title}</b><span><CalendarDays size={13} />{dueLabel(entry.dueDate)}</span></button>)}{!rows.length && <span className="empty-column">작업 없음</span>}</div></section>; })}</div>;
}

function InboxView({ items, onConnect }: { items: OkitaItem[]; onConnect: (item: OkitaItem) => void }) {
  if (!items.length) return <EmptyState icon={Inbox} title="인박스가 비어 있습니다" />;
  return <section className="inbox-list"><div className="list-head"><span>이름</span><span>등록 경로</span><span /></div>{items.map((entry) => <article className="inbox-item" key={entry.id}><div><span className="page-icon"><ListChecks size={15} /></span><h3>{entry.title}</h3></div><span className={`source-badge source-${entry.source}`}>{sourceLabel(entry.source)}</span><button onClick={() => onConnect(entry)}><Link2 size={14} />연결</button></article>)}</section>;
}

function ReviewView({ items, cadence, completed, blocked, averageProgress }: { items: OkitaItem[]; cadence: Cadence; completed: number; blocked: number; averageProgress: number }) {
  return <section className="review-content"><div className="metrics-row"><div><span>완료</span><strong>{completed}<small> / {items.length}</small></strong></div><div><span>평균 진행</span><strong>{averageProgress}<small>%</small></strong></div><div><span>막힘</span><strong>{blocked}</strong></div></div><div className="review-progress"><div><b>{cadenceLabels[cadence]} 진행률</b><span>{averageProgress}%</span></div><span><i style={{ width: `${averageProgress}%` }} /></span></div><div className="review-list"><span>검토할 항목</span>{items.slice(0, 7).map((entry) => <div key={entry.id}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><em>{entry.progress}%</em></div>)}</div></section>;
}

function PropertyPanel({ properties, onClose, onCreated, onDeleted, onNotice }: { properties: PropertyDefinition[]; onClose: () => void; onCreated: (property: PropertyDefinition) => void; onDeleted: (id: string) => void; onNotice: (message: string) => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState<PropertyType>("text"); const [options, setOptions] = useState("");
  async function create(event: FormEvent) { event.preventDefault(); if (!name.trim()) return; const response = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, options: options.split(",").map((entry) => entry.trim()).filter(Boolean) }) }); if (!response.ok) return; const data = await response.json() as { property: PropertyDefinition }; onCreated(data.property); setName(""); setOptions(""); onNotice("속성을 추가했습니다."); }
  async function remove(id: string) { const response = await fetch(`/api/properties?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (response.ok) { onDeleted(id); onNotice("속성을 삭제했습니다."); } }
  return <div className="modal-backdrop align-right"><aside className="property-panel"><header><div><h2>Task 속성</h2><p>{properties.length}개 열</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="property-list">{properties.map((property) => <div className="property-row" key={property.id}><span className="property-type-icon">{property.type === "number" ? <Hash size={14} /> : <TextCursorInput size={14} />}</span><div><b>{property.name}</b><small>{propertyTypeLabel(property.type)}</small></div><button onClick={() => void remove(property.id)} aria-label="속성 삭제"><Trash2 size={13} /></button></div>)}</div><form className="property-form" onSubmit={create}><h3>속성 추가</h3><label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>유형</span><select value={type} onChange={(event) => setType(event.target.value as PropertyType)}>{(["text", "number", "select", "date", "checkbox"] as PropertyType[]).map((entry) => <option value={entry} key={entry}>{propertyTypeLabel(entry)}</option>)}</select></label>{type === "select" && <label><span>옵션</span><input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="쉼표로 구분" /></label>}<button><Plus size={14} />추가</button></form></aside></div>;
}

function IntegrationModal({ onClose }: { onClose: () => void }) {
  const endpoint = typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`;
  const tools = ["capture_item", "create_item", "update_item", "list_items", "link_item", "review_period", "list_properties", "create_property", "set_property_value", "delete_property", "list_checklist_items", "add_checklist_item", "update_checklist_item", "get_daily_scrum", "save_daily_scrum", "get_recommendations"];
  return <div className="modal-backdrop"><section className="integration-modal"><header><h2>MCP 연결</h2><button className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="endpoint-row"><Bot size={18} /><div><b>Streamable HTTP</b><code>{endpoint}</code></div><button className="icon-button" onClick={() => void navigator.clipboard.writeText(endpoint)} title="주소 복사"><Copy size={14} /></button></div><div className="tool-list">{tools.map((tool) => <code key={tool}>{tool}</code>)}</div><footer><span><CheckCircle2 size={15} />Objective → Key Result → Initiative → Project → Task</span><button onClick={onClose}>닫기</button></footer></section></div>;
}

function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) { return <div className="empty-state"><Icon size={22} /><span>{title}</span></div>; }

const statusLabels: Record<ItemStatus, string> = { inbox: "인박스", todo: "할 일", in_progress: "진행 중", done: "완료", blocked: "막힘" };
const priorityLabels: Record<Priority, string> = { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" };

function item(id: string, parentId: string | null, kind: ItemKind, title: string, status: ItemStatus, cadence: Cadence, progress: number, dueDate: string | null = null, source = "web", priority: Priority = "medium"): OkitaItem { return { id, parentId, kind, title, description: "", status, priority, cadence, progress, dueDate, source, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
function buildDepths(items: OkitaItem[]) { const byId = new Map(items.map((entry) => [entry.id, entry])); const result: Record<string, number> = {}; for (const entry of items) { let depth = 0; let current = entry; while (current.parentId && depth < 5) { depth += 1; const parent = byId.get(current.parentId); if (!parent) break; current = parent; } result[entry.id] = depth; } return result; }
function kindAbbr(kind: ItemKind) { return { objective: "O", key_result: "KR", initiative: "I", project: "P", task: "T" }[kind]; }
function kindLabel(kind: ItemKind) { return { objective: "Objective", key_result: "Key Result", initiative: "Initiative", project: "Project", task: "Task" }[kind]; }
function statusLabel(status: ItemStatus) { return statusLabels[status]; }
function sourceLabel(source: string) { return { mcp: "MCP", slack: "Slack", discord: "Discord", telegram: "Telegram", web: "Web" }[source] ?? "Bot"; }
function propertyTypeLabel(type: PropertyType) { return { text: "텍스트", number: "숫자", select: "선택", date: "날짜", checkbox: "체크박스" }[type]; }
function dueLabel(value: string | null) { if (!value) return "기한 없음"; const due = new Date(`${value}T00:00:00`); return `${due.getMonth() + 1}월 ${due.getDate()}일`; }
function localDate() { const now = new Date(); const offset = now.getTimezoneOffset() * 60_000; return new Date(now.getTime() - offset).toISOString().slice(0, 10); }
function pageSubtitle(view: View) { return { home: "지금 집중할 목표와 작업", inbox: "아직 Project에 연결하지 않은 Task", work: "Project에 연결된 Task 데이터베이스", okr: "Objective부터 Task까지의 실행 구조", scrum: "어제, 오늘, 막힘", recommendations: "현재 데이터에서 계산한 다음 정리 항목", reviews: "주기별 진행과 막힘" }[view]; }
function recommendationIcon(kind: Recommendation["kind"]) { if (kind === "blocked") return "!"; if (kind === "overdue") return "D"; if (kind === "unlinked") return "↗"; if (kind === "due_soon") return "3"; return "P"; }
