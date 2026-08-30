"use client";

import { AlertTriangle, Check, Database, Link2, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { OverlayDialog, useAppConfirm } from "./overlay-dialog";

type DataTargetKind = "key_result" | "project";
export type DataItem = {
  id: string;
  kind: "objective" | "key_result" | "initiative" | "project" | "task";
  cycleId: string | null;
  parentId: string | null;
  title: string;
  progress: number;
};

export type DataCycle = { id: string; name: string };
type DataCadence = "hourly" | "daily" | "weekly" | "manual";
export type DataConnection = {
  id: string;
  itemId: string;
  targetKind: DataTargetKind;
  name: string;
  endpointUrl: string;
  valuePath: string;
  baselineValue: number;
  targetValue: number;
  unit: string;
  cadence: DataCadence;
  active: boolean;
  lastValue: number | null;
  lastSyncStatus: "never" | "success" | "error";
  lastError: string;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  targetKind: DataTargetKind;
  itemId: string;
  name: string;
  endpointUrl: string;
  valuePath: string;
  baselineValue: string;
  targetValue: string;
  unit: string;
  cadence: DataCadence;
  active: boolean;
};

const connectionMemoryCache = new Map<string, DataConnection[]>();
const cadenceLabels: Record<DataCadence, string> = { hourly: "매시간", daily: "매일", weekly: "매주", manual: "수동만" };
const targetLabels: Record<DataTargetKind, string> = { key_result: "KR", project: "Project" };

export default function DataView({ cacheKey, items, cycles, readOnly, onProgressChange, onNotice }: {
  cacheKey: string;
  items: DataItem[];
  cycles: DataCycle[];
  readOnly: boolean;
  onProgressChange: (id: string, progress: number) => void;
  onNotice: (message: string) => void;
}) {
  const confirmAction = useAppConfirm();
  const [connections, setConnections] = useState<DataConnection[] | null>(() => connectionMemoryCache.get(cacheKey) ?? null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState<"all" | DataTargetKind>("all");
  const [sort, setSort] = useState<"structure" | "cadence" | "status">("structure");
  const [editing, setEditing] = useState<DataConnection | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("key_result", ""));
  const [initialDraft, setInitialDraft] = useState<Draft>(() => emptyDraft("key_result", ""));
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/data-connections")
      .then(async (response) => response.ok ? response.json() as Promise<{ connections: DataConnection[] }> : Promise.reject())
      .then((data) => {
        if (!active) return;
        connectionMemoryCache.set(cacheKey, data.connections);
        setConnections(data.connections);
        setLoadError(false);
      })
      .catch(() => { if (active && !connectionMemoryCache.has(cacheKey)) setLoadError(true); });
    return () => { active = false; };
  }, [cacheKey, loadAttempt]);

  const targets = useMemo(() => items.filter((item): item is DataItem & { kind: DataTargetKind } => item.kind === "key_result" || item.kind === "project"), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const byItem = useMemo(() => new Map((connections ?? []).map((connection) => [connection.itemId, connection])), [connections]);
  const cycleById = useMemo(() => new Map(cycles.map((cycle) => [cycle.id, cycle.name])), [cycles]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const rows = targets
      .filter((item) => targetFilter === "all" || item.kind === targetFilter)
      .filter((item) => !query || `${item.title} ${byItem.get(item.id)?.name ?? ""}`.toLocaleLowerCase().includes(query));
    if (sort === "cadence") return [...rows].sort((left, right) => cadenceOrder(byItem.get(left.id)?.cadence) - cadenceOrder(byItem.get(right.id)?.cadence));
    if (sort === "status") return [...rows].sort((left, right) => statusOrder(byItem.get(left.id)) - statusOrder(byItem.get(right.id)));
    return rows;
  }, [byItem, search, sort, targetFilter, targets]);

  const availableForKind = (kind: DataTargetKind) => targets.filter((item) => item.kind === kind && !byItem.has(item.id));

  function openCreate(item?: DataItem & { kind: DataTargetKind }) {
    const targetKind = item?.kind ?? (targetFilter === "project" ? "project" : availableForKind("key_result").length ? "key_result" : "project");
    const itemId = item?.id ?? availableForKind(targetKind)[0]?.id ?? "";
    const nextDraft = emptyDraft(targetKind, itemId);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setEditing("new");
  }

  function openEdit(connection: DataConnection) {
    const nextDraft = {
      targetKind: connection.targetKind,
      itemId: connection.itemId,
      name: connection.name,
      endpointUrl: connection.endpointUrl,
      valuePath: connection.valuePath,
      baselineValue: String(connection.baselineValue),
      targetValue: String(connection.targetValue),
      unit: connection.unit,
      cadence: connection.cadence,
      active: connection.active,
    };
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setEditing(connection);
  }

  function changeTargetKind(targetKind: DataTargetKind) {
    if (editing !== "new") return;
    setDraft((current) => ({ ...current, targetKind, itemId: availableForKind(targetKind)[0]?.id ?? "" }));
  }

  const draftDirty = Object.keys(draft).some((key) => draft[key as keyof Draft] !== initialDraft[key as keyof Draft]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const baselineValue = Number(draft.baselineValue);
    const targetValue = Number(draft.targetValue);
    if (!draft.itemId || !draft.name.trim() || !draft.endpointUrl.trim() || !Number.isFinite(baselineValue) || !Number.isFinite(targetValue) || baselineValue === targetValue) return;
    setSaving(true);
    const method = editing === "new" ? "POST" : "PATCH";
    const response = await fetch("/api/data-connections", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, baselineValue, targetValue, id: editing === "new" ? undefined : editing?.id }),
    });
    const data = await response.json().catch(() => ({})) as { connection?: DataConnection; error?: string };
    setSaving(false);
    if (!response.ok || !data.connection) {
      onNotice(data.error ?? "데이터 연결을 저장하지 못했습니다.");
      return;
    }
    const next = editing === "new"
      ? [...(connections ?? []), data.connection]
      : (connections ?? []).map((connection) => connection.id === data.connection?.id ? data.connection : connection);
    connectionMemoryCache.set(cacheKey, next);
    setConnections(next);
    setEditing(null);
    onNotice(editing === "new" ? "데이터 연결을 만들었습니다." : "데이터 연결을 저장했습니다.");
  }

  async function sync(connection: DataConnection) {
    setSyncingId(connection.id);
    const response = await fetch("/api/data-connections/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: connection.id }),
    });
    const data = await response.json().catch(() => ({})) as { connection?: DataConnection; progress?: number; error?: string };
    setSyncingId(null);
    if (!response.ok || !data.connection || typeof data.progress !== "number") {
      onNotice(data.error ?? "API 데이터를 업데이트하지 못했습니다.");
      setLoadAttempt((attempt) => attempt + 1);
      return;
    }
    const next = (connections ?? []).map((entry) => entry.id === connection.id ? data.connection! : entry);
    connectionMemoryCache.set(cacheKey, next);
    setConnections(next);
    onProgressChange(connection.itemId, data.progress);
    onNotice(`${targetLabels[connection.targetKind]} 진행률을 ${data.progress}%로 업데이트했습니다.`);
  }

  async function remove(connection: DataConnection) {
    const target = itemById.get(connection.itemId);
    if (!await confirmAction({ title: "데이터 연결 삭제", message: `'${connection.name}' 연결을 삭제합니다. ${targetLabels[connection.targetKind]} 자체와 현재 진행률은 유지됩니다.`, confirmLabel: "연결 삭제", danger: true })) return;
    const response = await fetch(`/api/data-connections?id=${encodeURIComponent(connection.id)}`, { method: "DELETE" });
    if (!response.ok) { onNotice("데이터 연결을 삭제하지 못했습니다."); return; }
    const next = (connections ?? []).filter((entry) => entry.id !== connection.id);
    connectionMemoryCache.set(cacheKey, next);
    setConnections(next);
    onNotice(`${target?.title ?? targetLabels[connection.targetKind]}의 데이터 연결을 삭제했습니다.`);
  }

  if (loadError) return <DataState icon={AlertTriangle} title="데이터 연결을 불러오지 못했습니다" action="다시 시도" onAction={() => { setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} />;
  if (connections === null) return <DataState icon={LoaderCircle} title="데이터 연결을 불러오는 중입니다" loading />;

  const hasAvailableTarget = targets.some((item) => !byItem.has(item.id));

  return <>
    <section className="kr-data-toolbar">
      <div className="view-tabs data-target-tabs" role="tablist" aria-label="데이터 대상 필터">
        {([["all", "전체"], ["key_result", "KR"], ["project", "Project"]] as const).map(([value, label]) => <button role="tab" aria-selected={targetFilter === value} className={targetFilter === value ? "active" : ""} onClick={() => setTargetFilter(value)} key={value}>{label}</button>)}
      </div>
      <label><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="항목 또는 데이터 소스 검색" aria-label="데이터 검색" /></label>
      <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="데이터 정렬"><option value="structure">구조 순서</option><option value="cadence">갱신 주기</option><option value="status">연결 상태</option></select>
      <button className="primary-action" disabled={readOnly || !hasAvailableTarget} onClick={() => openCreate()}><Plus size={14} />API 연결</button>
    </section>
    <aside className="kr-data-guide"><Database size={17} /><div><b>KR과 Project를 각각 수치로 측정합니다</b><p>공개 HTTPS JSON API의 숫자를 기준값·목표값 사이의 진행률로 변환합니다. 연결한 항목 하나만 갱신하며 다른 항목과 수치를 섞지 않습니다.</p></div></aside>
    {!targets.length ? <DataState icon={Database} title="연결할 KR 또는 Project가 없습니다" detail="먼저 OKR이나 Project 화면에서 항목을 만들어 주세요." /> : (
      <section className="kr-data-list" aria-label="데이터 연결 목록">
        {filtered.map((item) => {
          const connection = byItem.get(item.id);
          const contextLabel = item.kind === "project" ? itemById.get(item.parentId ?? "")?.title ?? "상위 Initiative 미연결" : cycleById.get(item.cycleId ?? "") ?? "OKR 파일";
          return <article className={`kr-data-card ${connection ? "connected" : "unconnected"}`} key={item.id}>
            <header><span className={`type-icon type-${item.kind}`}>{targetLabels[item.kind]}</span><div><small>{contextLabel}</small><h2>{item.title}</h2></div><strong>{item.progress}%</strong></header>
            {connection ? <>
              <div className="kr-data-progress"><span><i style={{ width: `${item.progress}%` }} /></span><b>{formatDataMetric(connection.lastValue, connection.unit)} <em>/ {formatDataMetric(connection.targetValue, connection.unit)}</em></b></div>
              <dl><div><dt>데이터 소스</dt><dd><Link2 size={12} />{connection.name}</dd></div><div><dt>값 경로</dt><dd>{connection.valuePath || "응답 자체"}</dd></div><div><dt>갱신</dt><dd>{cadenceLabels[connection.cadence]}{connection.active ? " · 활성" : " · 일시정지"}</dd></div><div><dt>최근 결과</dt><dd className={`sync-${connection.lastSyncStatus}`}>{dataSyncStatusLabel(connection)}</dd></div></dl>
              {connection.lastError && <p className="kr-data-error"><AlertTriangle size={13} />{connection.lastError}</p>}
              <footer><button disabled={readOnly || syncingId === connection.id} onClick={() => void sync(connection)}><RefreshCw className={syncingId === connection.id ? "spinning" : ""} size={13} />{syncingId === connection.id ? "업데이트 중" : "지금 업데이트"}</button><button disabled={readOnly} onClick={() => openEdit(connection)}><Pencil size={13} />설정</button><button className="danger" disabled={readOnly} onClick={() => void remove(connection)} aria-label={`${item.title} 데이터 연결 삭제`}><Trash2 size={13} /></button></footer>
            </> : <div className="kr-data-unconnected"><p>아직 연결된 데이터가 없습니다.</p><button disabled={readOnly} onClick={() => openCreate(item)}><Plus size={13} />이 {targetLabels[item.kind]}에 API 연결</button></div>}
          </article>;
        })}
        {!filtered.length && <DataState icon={Search} title="검색 결과가 없습니다" />}
      </section>
    )}
    {editing && <OverlayDialog title={editing === "new" ? "API 연결" : "API 설정"} variant="drawer" dirty={draftDirty} onRequestClose={() => setEditing(null)}>
      {(requestClose) => <aside className="property-panel kr-data-panel"><header><div><h2>{editing === "new" ? "API 연결" : "API 설정"}</h2><p>인증이 필요 없는 HTTPS JSON GET API를 연결할 수 있습니다.</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="API 설정 닫기"><X size={17} /></button></header><form className="property-form" onSubmit={(event) => void save(event)}>
        <div className="view-tabs data-target-type-tabs" role="tablist" aria-label="연결 대상 유형">{([["key_result", "KR"], ["project", "Project"]] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={draft.targetKind === value} disabled={editing !== "new" || (!availableForKind(value).length && draft.targetKind !== value)} className={draft.targetKind === value ? "active" : ""} onClick={() => changeTargetKind(value)} key={value}>{label}</button>)}</div>
        <label><span>연결 대상</span><select value={draft.itemId} disabled={editing !== "new"} onChange={(event) => setDraft({ ...draft, itemId: event.target.value })} aria-label="연결할 항목"><option value="">선택</option>{targets.filter((item) => item.kind === draft.targetKind && (!byItem.has(item.id) || item.id === draft.itemId)).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
        <label><span>데이터 소스 이름</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="예: Stripe 월간 매출" /></label>
        <label><span>API URL</span><input type="url" value={draft.endpointUrl} onChange={(event) => setDraft({ ...draft, endpointUrl: event.target.value })} placeholder="https://api.example.com/metrics/revenue" /></label>
        <label><span>숫자 값 경로</span><input value={draft.valuePath} onChange={(event) => setDraft({ ...draft, valuePath: event.target.value })} placeholder="예: data.monthlyRevenue" /><small>응답 자체가 숫자면 비워두세요. 배열은 data.items[0].value처럼 입력합니다.</small></label>
        <div className="kr-data-number-grid"><label><span>기준값</span><input type="number" step="any" value={draft.baselineValue} onChange={(event) => setDraft({ ...draft, baselineValue: event.target.value })} /></label><label><span>목표값</span><input type="number" step="any" value={draft.targetValue} onChange={(event) => setDraft({ ...draft, targetValue: event.target.value })} /></label></div>
        <label><span>단위</span><input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="예: 원, 명, %" /></label>
        <label><span>자동 갱신 주기</span><select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value as DataCadence })}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="kr-data-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>자동 갱신 활성화</span></label>
        <button disabled={saving || !draft.itemId || !draft.name.trim() || !draft.endpointUrl.trim() || !draft.targetValue || draft.baselineValue === draft.targetValue}>{saving ? "저장 중" : <><Check size={14} />연결 저장</>}</button>
      </form></aside>}
    </OverlayDialog>}
  </>;
}

function emptyDraft(targetKind: DataTargetKind, itemId: string): Draft { return { targetKind, itemId, name: "", endpointUrl: "", valuePath: "", baselineValue: "0", targetValue: "", unit: "", cadence: "daily", active: true }; }
function cadenceOrder(value?: DataCadence) { return value ? { hourly: 0, daily: 1, weekly: 2, manual: 3 }[value] : 4; }
function statusOrder(connection?: DataConnection) { return !connection ? 3 : connection.lastSyncStatus === "error" ? 0 : connection.lastSyncStatus === "never" ? 1 : 2; }
export function formatDataMetric(value: number | null, unit: string) { return value === null ? "아직 값 없음" : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}${unit}`; }
export function dataSyncStatusLabel(connection: DataConnection) { if (connection.lastSyncStatus === "never") return "업데이트 전"; if (connection.lastSyncStatus === "error") return "오류"; return connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "완료"; }

function DataState({ icon: Icon, title, detail, action, onAction, loading = false }: { icon: typeof Database; title: string; detail?: string; action?: string; onAction?: () => void; loading?: boolean }) {
  return <section className="kr-data-state"><Icon className={loading ? "spinning" : ""} size={20} /><div><b>{title}</b>{detail && <p>{detail}</p>}</div>{action && onAction && <button onClick={onAction}>{action}</button>}</section>;
}
