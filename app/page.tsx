"use client";

import {
  Activity,
  ArrowDownUp,
  Bell,
  Bot,
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
  Link2,
  ListChecks,
  ListTree,
  MessageSquareText,
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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type View = "home" | "inbox" | "work" | "okr" | "reviews";
type Cadence = "daily" | "weekly" | "monthly" | "quarterly";
type ItemStatus = "inbox" | "todo" | "in_progress" | "done" | "blocked";
type ItemKind = "objective" | "key_result" | "initiative" | "task" | "action";
type Priority = "low" | "medium" | "high" | "urgent";
type PropertyType = "text" | "number" | "select" | "date" | "checkbox";
type PropertyValue = string | number | boolean | null;

type PaceItem = {
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

const navItems = [
  { id: "home" as const, label: "홈", icon: LayoutDashboard },
  { id: "inbox" as const, label: "인박스", icon: Inbox },
  { id: "work" as const, label: "작업", icon: Table2 },
  { id: "okr" as const, label: "OKR", icon: Target },
  { id: "reviews" as const, label: "리뷰", icon: Activity },
];

const cadenceLabels: Record<Cadence, string> = {
  daily: "일간",
  weekly: "주간",
  monthly: "월간",
  quarterly: "분기",
};

const viewTitles: Record<View, string> = {
  home: "홈",
  inbox: "인박스",
  work: "작업",
  okr: "OKR",
  reviews: "리뷰",
};

export default function Home() {
  const [items, setItems] = useState<PaceItem[]>(fallbackItems);
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
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/items"), fetch("/api/properties")])
      .then(async ([itemsResponse, propertiesResponse]) => {
        if (!itemsResponse.ok || !propertiesResponse.ok) throw new Error("offline");
        const itemData = (await itemsResponse.json()) as { items: PaceItem[] };
        const propertyData = (await propertiesResponse.json()) as {
          properties: PropertyDefinition[];
          values: PropertyValueMap;
        };
        if (!active) return;
        if (itemData.items.length) setItems(itemData.items);
        setProperties(propertyData.properties);
        setPropertyValues(propertyData.values);
        setConnected(true);
      })
      .catch(() => setConnected(false));
    return () => {
      active = false;
    };
  }, []);

  const inboxItems = items.filter((entry) => entry.status === "inbox");
  const taskItems = items.filter((entry) => entry.kind === "task");
  const structuredItems = items.filter((entry) => entry.status !== "inbox");
  const periodItems = items.filter(
    (entry) => entry.status !== "inbox" && (cadence === "quarterly" || entry.cadence === cadence || entry.kind === "objective"),
  );
  const objective = items.find((entry) => entry.kind === "objective");
  const initiatives = items.filter((entry) => entry.kind === "initiative");
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
        body: JSON.stringify({ title, kind: "task", source: "web" }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { item: PaceItem };
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
      showNotice("변경사항을 저장하지 못했습니다.");
    }
  }

  async function setPropertyValue(itemId: string, propertyId: string, value: PropertyValue) {
    const previous = propertyValues;
    setPropertyValues((current) => ({
      ...current,
      [itemId]: { ...current[itemId], [propertyId]: value },
    }));
    try {
      const response = await fetch("/api/property-values", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, propertyId, value }),
      });
      if (!response.ok) throw new Error("update failed");
    } catch {
      setPropertyValues(previous);
      showNotice("속성 값을 저장하지 못했습니다.");
    }
  }

  async function createProperty(input: { name: string; type: PropertyType; options: string[] }) {
    const response = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      showNotice("속성을 추가하지 못했습니다.");
      return false;
    }
    const data = (await response.json()) as { property: PropertyDefinition };
    setProperties((current) => [...current, data.property]);
    showNotice(`${data.property.name} 속성을 추가했습니다.`);
    return true;
  }

  async function deleteProperty(id: string) {
    const response = await fetch(`/api/properties?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      showNotice("속성을 삭제하지 못했습니다.");
      return;
    }
    setProperties((current) => current.filter((property) => property.id !== id));
    setPropertyValues((current) => {
      const next: PropertyValueMap = {};
      for (const [itemId, values] of Object.entries(current)) {
        const { [id]: removed, ...rest } = values;
        void removed;
        next[itemId] = rest;
      }
      return next;
    });
  }

  function connectInbox(entry: PaceItem) {
    const parent = initiatives[0];
    if (!parent) return showNotice("연결할 Initiative가 없습니다.");
    void patchItem(entry.id, { parentId: parent.id, status: "todo" });
    showNotice("Initiative에 연결했습니다.");
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function copyValue(value: string) {
    void navigator.clipboard.writeText(value);
    showNotice("주소를 복사했습니다.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="workspace-switcher">
          <span className="brand-mark">P</span>
          <span><strong>Product Lab</strong><small>Pace</small></span>
          <ChevronDown size={14} />
        </button>

        <nav aria-label="주요 메뉴">
          {navItems.map((entry) => {
            const Icon = entry.icon;
            return (
              <button className={`nav-item ${activeView === entry.id ? "active" : ""}`} key={entry.id} onClick={() => setActiveView(entry.id)}>
                <Icon size={16} />
                <span>{entry.label}</span>
                {entry.id === "inbox" && inboxItems.length > 0 && <b>{inboxItems.length}</b>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <span>워크스페이스</span>
          <button className="nav-item" onClick={() => setActiveView("work")}><Table2 size={16} /><span>전체 작업</span></button>
          <button className="nav-item" onClick={() => setActiveView("okr")}><ListTree size={16} /><span>분기 목표</span></button>
        </div>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setIntegrationOpen(true)}><Zap size={16} /><span>연결</span><i className={connected ? "connection-live" : "connection-local"} /></button>
          <button className="nav-item"><CircleHelp size={16} /><span>도움말</span></button>
          <button className="profile-row"><span className="avatar">태</span><span>태홍</span><MoreHorizontal size={15} /></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-topbar">
          <span>Product Lab</span><ChevronRight size={13} /><b>{viewTitles[activeView]}</b>
          <div><button aria-label="알림" title="알림"><Bell size={16} /></button><button aria-label="더 보기" title="더 보기"><MoreHorizontal size={16} /></button></div>
        </header>

        <div className="page-body">
          <header className="page-header">
            <div>
              <h1>{viewTitles[activeView]}</h1>
              {activeView === "work" && <p>{taskItems.length}개 작업</p>}
              {activeView === "inbox" && <p>{inboxItems.length}개 항목</p>}
              {activeView === "okr" && <p>2026년 3분기</p>}
            </div>
            {(activeView === "home" || activeView === "reviews") && (
              <div className="cadence-switch" aria-label="업무 주기">
                {(Object.keys(cadenceLabels) as Cadence[]).map((key) => <button className={cadence === key ? "selected" : ""} key={key} onClick={() => setCadence(key)}>{cadenceLabels[key]}</button>)}
              </div>
            )}
          </header>

          <form className="quick-capture" onSubmit={submitCapture}>
            <Plus size={17} />
            <input aria-label="새 작업 등록" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="할 일을 입력하고 Enter" />
            <button type="submit" disabled={saving}>{saving ? "저장 중" : "추가"}</button>
          </form>

          {activeView === "work" && <TaskDatabase items={taskItems} allItems={items} properties={properties} values={propertyValues} display={taskDisplay} setDisplay={setTaskDisplay} onPatch={patchItem} onSetProperty={setPropertyValue} onOpenProperties={() => setPropertyPanelOpen(true)} />}
          {activeView === "home" && <HomeView objective={objective} items={periodItems} onGoToWork={() => setActiveView("work")} />}
          {activeView === "inbox" && <InboxView items={inboxItems} onConnect={connectInbox} />}
          {activeView === "okr" && <TreeView objective={objective} items={structuredItems} depths={depths} onComplete={(id) => void patchItem(id, { status: "done", progress: 100 })} />}
          {activeView === "reviews" && <ReviewView items={periodItems} cadence={cadence} completed={completed} blocked={blocked} averageProgress={averageProgress} />}
        </div>
      </section>

      {notice && <div className="toast" role="status">{notice}</div>}
      {propertyPanelOpen && <PropertyPanel properties={properties} onCreate={createProperty} onDelete={deleteProperty} onClose={() => setPropertyPanelOpen(false)} />}
      {integrationOpen && (
        <ModalBackdrop onClose={() => setIntegrationOpen(false)}>
          <section className="integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-title">
            <header><h2 id="integration-title">연결</h2><button className="icon-button" aria-label="닫기" title="닫기" onClick={() => setIntegrationOpen(false)}><X size={17} /></button></header>
            <div className="endpoint-row"><MessageSquareText size={18} /><div><b>MCP endpoint</b><code>{typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp"}</code></div><button className="icon-button" aria-label="MCP 주소 복사" title="주소 복사" onClick={() => copyValue(`${window.location.origin}/mcp`)}><Copy size={15} /></button></div>
            <div className="endpoint-row"><Bot size={18} /><div><b>Bot webhook</b><code>{typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/capture` : "/api/webhooks/capture"}</code></div><button className="icon-button" aria-label="웹훅 주소 복사" title="주소 복사" onClick={() => copyValue(`${window.location.origin}/api/webhooks/capture`)}><Copy size={15} /></button></div>
            <div className="tool-list">{["capture_item", "create_item", "list_items", "update_item", "link_item", "review_period", "list_properties", "create_property", "set_property_value", "delete_property"].map((tool) => <code key={tool}>{tool}</code>)}</div>
            <footer><span><CheckCircle2 size={15} />Objective → Key Result → Initiative → Task → Action</span><button onClick={() => setIntegrationOpen(false)}>닫기</button></footer>
          </section>
        </ModalBackdrop>
      )}
    </main>
  );
}

function TaskDatabase({ items, allItems, properties, values, display, setDisplay, onPatch, onSetProperty, onOpenProperties }: {
  items: PaceItem[];
  allItems: PaceItem[];
  properties: PropertyDefinition[];
  values: PropertyValueMap;
  display: "table" | "board";
  setDisplay: (display: "table" | "board") => void;
  onPatch: (id: string, patch: Partial<PaceItem>) => Promise<void>;
  onSetProperty: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  onOpenProperties: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done">("all");
  const [sortOrder, setSortOrder] = useState<"default" | "due" | "title">("default");
  const filtered = items
    .filter((entry) => entry.title.toLowerCase().includes(query.toLowerCase()))
    .filter((entry) => statusFilter === "all" || (statusFilter === "done" ? entry.status === "done" : entry.status !== "done"))
    .sort((a, b) => {
      if (sortOrder === "title") return a.title.localeCompare(b.title, "ko");
      if (sortOrder === "due") return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
      return 0;
    });
  const byId = new Map(allItems.map((entry) => [entry.id, entry]));

  return (
    <section className="database-section">
      <div className="database-toolbar">
        <div className="view-tabs">
          <button className={display === "table" ? "active" : ""} onClick={() => setDisplay("table")}><Table2 size={15} />테이블</button>
          <button className={display === "board" ? "active" : ""} onClick={() => setDisplay("board")}><Columns3 size={15} />보드</button>
        </div>
        <div className="database-actions">
          <label className="table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="작업 검색" placeholder="검색" /></label>
          <button title="상태 필터" onClick={() => setStatusFilter(statusFilter === "all" ? "open" : statusFilter === "open" ? "done" : "all")}><Filter size={15} /><span>{statusFilter === "all" ? "필터" : statusFilter === "open" ? "미완료" : "완료"}</span></button>
          <button title="정렬" onClick={() => setSortOrder(sortOrder === "default" ? "due" : sortOrder === "due" ? "title" : "default")}><ArrowDownUp size={15} /><span>{sortOrder === "default" ? "정렬" : sortOrder === "due" ? "기한순" : "이름순"}</span></button>
          <button title="속성 관리" onClick={onOpenProperties}><Settings2 size={15} /><span>속성</span></button>
        </div>
      </div>

      {display === "board" ? <BoardView items={filtered} /> : (
        <div className="database-scroll">
          <div className="task-table" style={{ "--custom-columns": properties.length } as React.CSSProperties}>
            <div className="task-table-row task-table-head">
              <span className="name-cell"><TextCursorInput size={14} />이름</span>
              <span>상태</span><span>우선순위</span><span><CalendarDays size={14} />기한</span><span><Link2 size={14} />Initiative</span>
              {properties.map((property) => <span key={property.id}>{property.type === "number" ? <Hash size={14} /> : <TextCursorInput size={14} />}{property.name}</span>)}
              <button aria-label="속성 추가" title="속성 추가" onClick={onOpenProperties}><Plus size={15} /></button>
            </div>
            {filtered.map((entry) => {
              const parent = entry.parentId ? byId.get(entry.parentId) : null;
              return (
                <div className="task-table-row" key={entry.id}>
                  <div className="name-cell"><button className={`task-check ${entry.status === "done" ? "checked" : ""}`} aria-label="완료 상태 변경" onClick={() => void onPatch(entry.id, { status: entry.status === "done" ? "todo" : "done", progress: entry.status === "done" ? 0 : 100 })}>{entry.status === "done" && <Check size={13} />}</button><input aria-label="작업 이름" defaultValue={entry.title} onBlur={(event) => event.target.value.trim() && event.target.value !== entry.title && void onPatch(entry.id, { title: event.target.value })} /></div>
                  <select className={`status-select status-${entry.status}`} aria-label="상태" value={entry.status} onChange={(event) => void onPatch(entry.id, { status: event.target.value as ItemStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                  <select className={`priority-select priority-${entry.priority}`} aria-label="우선순위" value={entry.priority} onChange={(event) => void onPatch(entry.id, { priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                  <input className="date-cell" aria-label="기한" type="date" value={entry.dueDate ?? ""} onChange={(event) => void onPatch(entry.id, { dueDate: event.target.value || null })} />
                  <span className="relation-cell">{parent?.title ?? "-"}</span>
                  {properties.map((property) => <PropertyCell key={property.id} itemId={entry.id} property={property} value={values[entry.id]?.[property.id] ?? null} onChange={onSetProperty} />)}
                  <button className="row-menu" aria-label="작업 메뉴" title="작업 메뉴"><MoreHorizontal size={15} /></button>
                </div>
              );
            })}
            {!filtered.length && <div className="table-empty">작업 없음</div>}
          </div>
        </div>
      )}
    </section>
  );
}

function PropertyCell({ itemId, property, value, onChange }: { itemId: string; property: PropertyDefinition; value: PropertyValue; onChange: (itemId: string, propertyId: string, value: PropertyValue) => Promise<void> }) {
  if (property.type === "checkbox") return <label className="property-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => void onChange(itemId, property.id, event.target.checked)} /><span><Check size={12} /></span></label>;
  if (property.type === "select") return <select className="custom-select" aria-label={property.name} value={String(value ?? "")} onChange={(event) => void onChange(itemId, property.id, event.target.value || null)}><option value="">-</option>{property.options.map((option) => <option key={option}>{option}</option>)}</select>;
  return <input key={`${itemId}:${property.id}:${String(value)}`} className="property-input" aria-label={property.name} type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"} defaultValue={value === null ? "" : String(value)} onBlur={(event) => void onChange(itemId, property.id, property.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value || null)} />;
}

function PropertyPanel({ properties, onCreate, onDelete, onClose }: { properties: PropertyDefinition[]; onCreate: (input: { name: string; type: PropertyType; options: string[] }) => Promise<boolean>; onDelete: (id: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [options, setOptions] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const created = await onCreate({ name: name.trim(), type, options: options.split(",").map((value) => value.trim()).filter(Boolean) });
    if (created) { setName(""); setOptions(""); }
  }
  return (
    <ModalBackdrop onClose={onClose} align="right">
      <aside className="property-panel" role="dialog" aria-modal="true" aria-labelledby="property-panel-title">
        <header><div><h2 id="property-panel-title">속성</h2><p>{properties.length}개</p></div><button className="icon-button" aria-label="닫기" title="닫기" onClick={onClose}><X size={17} /></button></header>
        <div className="property-list">
          {properties.map((property) => <div className="property-row" key={property.id}><span className="property-type-icon">{property.type === "number" ? <Hash size={15} /> : property.type === "checkbox" ? <CheckCircle2 size={15} /> : <TextCursorInput size={15} />}</span><div><b>{property.name}</b><small>{propertyTypeLabel(property.type)}</small></div><button aria-label={`${property.name} 삭제`} title="속성 삭제" onClick={() => void onDelete(property.id)}><Trash2 size={15} /></button></div>)}
        </div>
        <form className="property-form" onSubmit={submit}>
          <h3>속성 추가</h3>
          <label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 팀, 스프린트, 점수" /></label>
          <label><span>유형</span><select value={type} onChange={(event) => setType(event.target.value as PropertyType)}><option value="text">텍스트</option><option value="number">숫자</option><option value="select">선택</option><option value="date">날짜</option><option value="checkbox">체크박스</option></select></label>
          {type === "select" && <label><span>선택 항목</span><input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="기획, 개발, 디자인" /></label>}
          <button type="submit"><Plus size={15} />추가</button>
        </form>
      </aside>
    </ModalBackdrop>
  );
}

function ModalBackdrop({ children, onClose, align = "center" }: { children: React.ReactNode; onClose: () => void; align?: "center" | "right" }) {
  return <div className={`modal-backdrop align-${align}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>{children}</div>;
}

function HomeView({ objective, items, onGoToWork }: { objective?: PaceItem; items: PaceItem[]; onGoToWork: () => void }) {
  const tasks = items.filter((entry) => entry.kind === "task").slice(0, 5);
  return <div className="home-layout"><section className="home-focus"><header><span>분기 목표</span><button onClick={onGoToWork}>작업 보기<ChevronRight size={14} /></button></header>{objective ? <div className="home-objective"><Target size={19} /><div><h2>{objective.title}</h2><span><i style={{ width: `${objective.progress}%` }} /></span><small>{objective.progress}%</small></div></div> : <EmptyState icon={Target} title="Objective 없음" />}</section><section className="home-tasks"><header><span>다가오는 작업</span><b>{tasks.length}</b></header>{tasks.map((entry) => <button key={entry.id} onClick={onGoToWork}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><small>{dueLabel(entry.dueDate)}</small></button>)}</section></div>;
}

function TreeView({ objective, items, depths, onComplete }: { objective?: PaceItem; items: PaceItem[]; depths: Record<string, number>; onComplete: (id: string) => void }) {
  if (!objective) return <EmptyState icon={Target} title="Objective 없음" />;
  return <section className="outline-section"><div className="objective-row"><Target size={18} /><div><span>Objective</span><h2>{objective.title}</h2></div><b>{objective.progress}%</b></div><div className="hierarchy">{items.filter((entry) => entry.id !== objective.id).map((entry) => <div className="hierarchy-row" key={entry.id} style={{ "--depth": Math.min(depths[entry.id] ?? 1, 4) } as React.CSSProperties}><span className={`type-icon type-${entry.kind}`}>{kindAbbr(entry.kind)}</span><span className="hierarchy-copy"><small>{kindLabel(entry.kind)}</small><b>{entry.title}</b></span><span className={`status-tag status-${entry.status}`}>{statusLabel(entry.status)}</span><em>{entry.progress}%</em>{entry.status !== "done" && ["task", "action"].includes(entry.kind) ? <button className="row-action" aria-label="완료 처리" title="완료 처리" onClick={() => onComplete(entry.id)}><Check size={13} /></button> : <ChevronRight className="row-chevron" size={15} />}</div>)}</div></section>;
}

function BoardView({ items }: { items: PaceItem[] }) {
  const columns: { status: ItemStatus; label: string }[] = [{ status: "todo", label: "할 일" }, { status: "in_progress", label: "진행 중" }, { status: "done", label: "완료" }];
  return <div className="board">{columns.map((column) => { const rows = items.filter((entry) => entry.status === column.status); return <section className="board-column" key={column.status}><header><span className={`status-dot status-${column.status}`} /><b>{column.label}</b><em>{rows.length}</em></header><div>{rows.map((entry) => <button className="board-item" key={entry.id}><b>{entry.title}</b><span><CalendarDays size={13} />{dueLabel(entry.dueDate)}</span></button>)}{!rows.length && <span className="empty-column">작업 없음</span>}</div></section>; })}</div>;
}

function InboxView({ items, onConnect }: { items: PaceItem[]; onConnect: (item: PaceItem) => void }) {
  if (!items.length) return <EmptyState icon={Inbox} title="인박스가 비어 있습니다" />;
  return <section className="inbox-list"><div className="list-head"><span>이름</span><span>등록 경로</span><span /></div>{items.map((entry) => <article className="inbox-item" key={entry.id}><div><span className="page-icon"><ListChecks size={15} /></span><h3>{entry.title}</h3></div><span className={`source-badge source-${entry.source}`}>{sourceLabel(entry.source)}</span><button onClick={() => onConnect(entry)}><Link2 size={14} />연결</button></article>)}</section>;
}

function ReviewView({ items, cadence, completed, blocked, averageProgress }: { items: PaceItem[]; cadence: Cadence; completed: number; blocked: number; averageProgress: number }) {
  return <section className="review-content"><div className="metrics-row"><div><span>완료</span><strong>{completed}<small> / {items.length}</small></strong></div><div><span>평균 진척</span><strong>{averageProgress}<small>%</small></strong></div><div><span>막힘</span><strong>{blocked}</strong></div></div><div className="review-progress"><div><b>{cadenceLabels[cadence]} 진척도</b><span>{averageProgress}%</span></div><span><i style={{ width: `${averageProgress}%` }} /></span></div><div className="review-list"><span>검토할 항목</span>{items.slice(0, 7).map((entry) => <div key={entry.id}><span className={`status-dot status-${entry.status}`} /><b>{entry.title}</b><em>{entry.progress}%</em></div>)}</div></section>;
}

function EmptyState({ icon: Icon, title }: { icon: typeof Target; title: string }) {
  return <div className="empty-state"><Icon size={22} /><span>{title}</span></div>;
}

const statusLabels: Record<ItemStatus, string> = { inbox: "인박스", todo: "할 일", in_progress: "진행 중", done: "완료", blocked: "막힘" };
const priorityLabels: Record<Priority, string> = { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" };

function item(id: string, parentId: string | null, kind: ItemKind, title: string, status: ItemStatus, cadence: Cadence, progress: number, dueDate: string | null = null, source = "web", priority: Priority = "medium"): PaceItem {
  return { id, parentId, kind, title, description: "", status, priority, cadence, progress, dueDate, source, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function buildDepths(items: PaceItem[]) {
  const byId = new Map(items.map((entry) => [entry.id, entry]));
  const result: Record<string, number> = {};
  for (const entry of items) { let depth = 0; let current = entry; while (current.parentId && depth < 5) { depth += 1; const parent = byId.get(current.parentId); if (!parent) break; current = parent; } result[entry.id] = depth; }
  return result;
}

function kindAbbr(kind: ItemKind) { return { objective: "O", key_result: "KR", initiative: "I", task: "T", action: "A" }[kind]; }
function kindLabel(kind: ItemKind) { return { objective: "Objective", key_result: "Key Result", initiative: "Initiative", task: "Task", action: "Action" }[kind]; }
function statusLabel(status: ItemStatus) { return statusLabels[status]; }
function sourceLabel(source: string) { return { mcp: "MCP", slack: "Slack", discord: "Discord", telegram: "Telegram", web: "Web" }[source] ?? "Bot"; }
function propertyTypeLabel(type: PropertyType) { return { text: "텍스트", number: "숫자", select: "선택", date: "날짜", checkbox: "체크박스" }[type]; }
function dueLabel(value: string | null) { if (!value) return "기한 없음"; const due = new Date(`${value}T00:00:00`); return `${due.getMonth() + 1}월 ${due.getDate()}일`; }
