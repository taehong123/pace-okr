"use client";

import { AlertTriangle, Check, Database, Link2, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { OverlayDialog, useAppConfirm } from "./overlay-dialog";

export type KrDataItem = {
  id: string;
  cycleId: string | null;
  parentId: string | null;
  title: string;
  progress: number;
};

export type KrDataCycle = { id: string; name: string };
type KrDataCadence = "hourly" | "daily" | "weekly" | "manual";
type KrDataConnection = {
  id: string;
  krItemId: string;
  name: string;
  endpointUrl: string;
  valuePath: string;
  baselineValue: number;
  targetValue: number;
  unit: string;
  cadence: KrDataCadence;
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
  krItemId: string;
  name: string;
  endpointUrl: string;
  valuePath: string;
  baselineValue: string;
  targetValue: string;
  unit: string;
  cadence: KrDataCadence;
  active: boolean;
};

const connectionMemoryCache = new Map<string, KrDataConnection[]>();
const cadenceLabels: Record<KrDataCadence, string> = { hourly: "매시간", daily: "매일", weekly: "매주", manual: "수동만" };

export default function KrDataView({ cacheKey, keyResults, cycles, readOnly, onProgressChange, onNotice }: {
  cacheKey: string;
  keyResults: KrDataItem[];
  cycles: KrDataCycle[];
  readOnly: boolean;
  onProgressChange: (id: string, progress: number) => void;
  onNotice: (message: string) => void;
}) {
  const confirmAction = useAppConfirm();
  const [connections, setConnections] = useState<KrDataConnection[] | null>(() => connectionMemoryCache.get(cacheKey) ?? null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"okr" | "cadence" | "status">("okr");
  const [editing, setEditing] = useState<KrDataConnection | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(keyResults[0]?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/kr-data-connections")
      .then(async (response) => response.ok ? response.json() as Promise<{ connections: KrDataConnection[] }> : Promise.reject())
      .then((data) => {
        if (!active) return;
        connectionMemoryCache.set(cacheKey, data.connections);
        setConnections(data.connections);
        setLoadError(false);
      })
      .catch(() => { if (active && !connectionMemoryCache.has(cacheKey)) setLoadError(true); });
    return () => { active = false; };
  }, [cacheKey, loadAttempt]);

  const byKr = useMemo(() => new Map((connections ?? []).map((connection) => [connection.krItemId, connection])), [connections]);
  const cycleById = useMemo(() => new Map(cycles.map((cycle) => [cycle.id, cycle.name])), [cycles]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const rows = keyResults.filter((kr) => !query || `${kr.title} ${byKr.get(kr.id)?.name ?? ""}`.toLocaleLowerCase().includes(query));
    if (sort === "cadence") return [...rows].sort((left, right) => cadenceOrder(byKr.get(left.id)?.cadence) - cadenceOrder(byKr.get(right.id)?.cadence));
    if (sort === "status") return [...rows].sort((left, right) => statusOrder(byKr.get(left.id)) - statusOrder(byKr.get(right.id)));
    return rows;
  }, [byKr, keyResults, search, sort]);

  function openCreate(krId = keyResults.find((kr) => !byKr.has(kr.id))?.id ?? keyResults[0]?.id ?? "") {
    setDraft(emptyDraft(krId));
    setEditing("new");
  }

  function openEdit(connection: KrDataConnection) {
    setDraft({
      krItemId: connection.krItemId,
      name: connection.name,
      endpointUrl: connection.endpointUrl,
      valuePath: connection.valuePath,
      baselineValue: String(connection.baselineValue),
      targetValue: String(connection.targetValue),
      unit: connection.unit,
      cadence: connection.cadence,
      active: connection.active,
    });
    setEditing(connection);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const baselineValue = Number(draft.baselineValue);
    const targetValue = Number(draft.targetValue);
    if (!draft.krItemId || !draft.name.trim() || !draft.endpointUrl.trim() || !Number.isFinite(baselineValue) || !Number.isFinite(targetValue) || baselineValue === targetValue) return;
    setSaving(true);
    const method = editing === "new" ? "POST" : "PATCH";
    const response = await fetch("/api/kr-data-connections", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, baselineValue, targetValue, id: editing === "new" ? undefined : editing?.id }),
    });
    const data = await response.json().catch(() => ({})) as { connection?: KrDataConnection; error?: string };
    setSaving(false);
    if (!response.ok || !data.connection) {
      onNotice(data.error ?? "KR 데이터 연결을 저장하지 못했습니다.");
      return;
    }
    const next = editing === "new"
      ? [...(connections ?? []), data.connection]
      : (connections ?? []).map((connection) => connection.id === data.connection?.id ? data.connection : connection);
    connectionMemoryCache.set(cacheKey, next);
    setConnections(next);
    setEditing(null);
    onNotice(editing === "new" ? "KR 데이터 연결을 만들었습니다." : "KR 데이터 연결을 저장했습니다.");
  }

  async function sync(connection: KrDataConnection) {
    setSyncingId(connection.id);
    const response = await fetch("/api/kr-data-connections/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: connection.id }),
    });
    const data = await response.json().catch(() => ({})) as { connection?: KrDataConnection; progress?: number; error?: string };
    setSyncingId(null);
    if (!response.ok || !data.connection || typeof data.progress !== "number") {
      onNotice(data.error ?? "API 데이터를 업데이트하지 못했습니다.");
      setLoadAttempt((attempt) => attempt + 1);
      return;
    }
    const next = (connections ?? []).map((entry) => entry.id === connection.id ? data.connection! : entry);
    connectionMemoryCache.set(cacheKey, next);
    setConnections(next);
    onProgressChange(connection.krItemId, data.progress);
    onNotice(`KR 진행률을 ${data.progress}%로 업데이트했습니다.`);
  }

  async function remove(connection: KrDataConnection) {
    if (!await confirmAction({ title: "KR 데이터 연결 삭제", message: `'${connection.name}' 연결을 삭제합니다. KR 자체와 현재 진행률은 유지됩니다.`, confirmLabel: "연결 삭제", danger: true })) return;
    const response = await fetch(`/api/kr-data-connections?id=${encodeURIComponent(connection.id)}`, { method: "DELETE" });
    if (!response.ok) { onNotice("KR 데이터 연결을 삭제하지 못했습니다."); return; }
    const next = (connections ?? []).filter((entry) => entry.id !== connection.id);
    connectionMemoryCache.set(cacheKey, next);
    setConnections(next);
    onNotice("KR 데이터 연결을 삭제했습니다.");
  }

  if (loadError) return <KrDataState icon={AlertTriangle} title="KR 데이터 연결을 불러오지 못했습니다" action="다시 시도" onAction={() => { setLoadError(false); setLoadAttempt((attempt) => attempt + 1); }} />;
  if (connections === null) return <KrDataState icon={LoaderCircle} title="KR 데이터 연결을 불러오는 중입니다" loading />;

  return <>
    <section className="kr-data-toolbar">
      <label><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="KR 또는 데이터 소스 검색" aria-label="KR 데이터 검색" /></label>
      <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="KR 데이터 정렬"><option value="okr">OKR 순서</option><option value="cadence">갱신 주기</option><option value="status">연결 상태</option></select>
      <button className="primary-action" disabled={readOnly || !keyResults.some((kr) => !byKr.has(kr.id))} onClick={() => openCreate()}><Plus size={14} />API 연결</button>
    </section>
    <aside className="kr-data-guide"><Database size={17} /><div><b>KR만 수치로 측정합니다</b><p>Objective와 Initiative에는 진행률을 두지 않습니다. 공개 HTTPS JSON API의 숫자를 기준값·목표값 사이의 KR 진행률로 변환합니다.</p></div></aside>
    {!keyResults.length ? <KrDataState icon={Database} title="연결할 Key Result가 없습니다" detail="먼저 OKR 화면에서 KR을 만들어 주세요." /> : (
      <section className="kr-data-list" aria-label="KR 데이터 연결 목록">
        {filtered.map((kr) => {
          const connection = byKr.get(kr.id);
          return <article className={`kr-data-card ${connection ? "connected" : "unconnected"}`} key={kr.id}>
            <header><span className="type-icon type-key_result">KR</span><div><small>{cycleById.get(kr.cycleId ?? "") ?? "OKR 파일"}</small><h2>{kr.title}</h2></div><strong>{kr.progress}%</strong></header>
            {connection ? <>
              <div className="kr-data-progress"><span><i style={{ width: `${kr.progress}%` }} /></span><b>{formatMetric(connection.lastValue, connection.unit)} <em>/ {formatMetric(connection.targetValue, connection.unit)}</em></b></div>
              <dl><div><dt>데이터 소스</dt><dd><Link2 size={12} />{connection.name}</dd></div><div><dt>값 경로</dt><dd>{connection.valuePath || "응답 자체"}</dd></div><div><dt>갱신</dt><dd>{cadenceLabels[connection.cadence]}{connection.active ? " · 활성" : " · 일시정지"}</dd></div><div><dt>최근 결과</dt><dd className={`sync-${connection.lastSyncStatus}`}>{syncStatusLabel(connection)}</dd></div></dl>
              {connection.lastError && <p className="kr-data-error"><AlertTriangle size={13} />{connection.lastError}</p>}
              <footer><button disabled={readOnly || syncingId === connection.id} onClick={() => void sync(connection)}><RefreshCw className={syncingId === connection.id ? "spinning" : ""} size={13} />{syncingId === connection.id ? "업데이트 중" : "지금 업데이트"}</button><button disabled={readOnly} onClick={() => openEdit(connection)}><Pencil size={13} />설정</button><button className="danger" disabled={readOnly} onClick={() => void remove(connection)} aria-label={`${kr.title} 데이터 연결 삭제`}><Trash2 size={13} /></button></footer>
            </> : <div className="kr-data-unconnected"><p>아직 연결된 데이터가 없습니다.</p><button disabled={readOnly} onClick={() => openCreate(kr.id)}><Plus size={13} />이 KR에 API 연결</button></div>}
          </article>;
        })}
        {!filtered.length && <KrDataState icon={Search} title="검색 결과가 없습니다" />}
      </section>
    )}
    {editing && <OverlayDialog title={editing === "new" ? "KR API 연결" : "KR API 설정"} variant="drawer" dirty onRequestClose={() => setEditing(null)}>
      {(requestClose) => <aside className="property-panel kr-data-panel"><header><div><h2>{editing === "new" ? "KR API 연결" : "KR API 설정"}</h2><p>인증이 필요 없는 HTTPS JSON GET API를 연결할 수 있습니다.</p></div><button className="icon-button" onClick={() => requestClose("close-button")} aria-label="KR API 설정 닫기"><X size={17} /></button></header><form className="property-form" onSubmit={(event) => void save(event)}>
        <label><span>Key Result</span><select value={draft.krItemId} disabled={editing !== "new"} onChange={(event) => setDraft({ ...draft, krItemId: event.target.value })} aria-label="연결할 Key Result"><option value="">선택</option>{keyResults.filter((kr) => !byKr.has(kr.id) || kr.id === draft.krItemId).map((kr) => <option value={kr.id} key={kr.id}>{kr.title}</option>)}</select></label>
        <label><span>데이터 소스 이름</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="예: Stripe 월간 매출" /></label>
        <label><span>API URL</span><input type="url" value={draft.endpointUrl} onChange={(event) => setDraft({ ...draft, endpointUrl: event.target.value })} placeholder="https://api.example.com/metrics/revenue" /></label>
        <label><span>숫자 값 경로</span><input value={draft.valuePath} onChange={(event) => setDraft({ ...draft, valuePath: event.target.value })} placeholder="예: data.monthlyRevenue" /><small>응답 자체가 숫자면 비워두세요. 배열은 data.items[0].value처럼 입력합니다.</small></label>
        <div className="kr-data-number-grid"><label><span>기준값</span><input type="number" step="any" value={draft.baselineValue} onChange={(event) => setDraft({ ...draft, baselineValue: event.target.value })} /></label><label><span>목표값</span><input type="number" step="any" value={draft.targetValue} onChange={(event) => setDraft({ ...draft, targetValue: event.target.value })} /></label></div>
        <label><span>단위</span><input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="예: 원, 명, %" /></label>
        <label><span>자동 갱신 주기</span><select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value as KrDataCadence })}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="kr-data-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>자동 갱신 활성화</span></label>
        <button disabled={saving || !draft.krItemId || !draft.name.trim() || !draft.endpointUrl.trim() || !draft.targetValue || draft.baselineValue === draft.targetValue}>{saving ? "저장 중" : <><Check size={14} />연결 저장</>}</button>
      </form></aside>}
    </OverlayDialog>}
  </>;
}

function emptyDraft(krItemId: string): Draft { return { krItemId, name: "", endpointUrl: "", valuePath: "", baselineValue: "0", targetValue: "", unit: "", cadence: "daily", active: true }; }
function cadenceOrder(value?: KrDataCadence) { return value ? { hourly: 0, daily: 1, weekly: 2, manual: 3 }[value] : 4; }
function statusOrder(connection?: KrDataConnection) { return !connection ? 3 : connection.lastSyncStatus === "error" ? 0 : connection.lastSyncStatus === "never" ? 1 : 2; }
function formatMetric(value: number | null, unit: string) { return value === null ? "아직 값 없음" : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}${unit}`; }
function syncStatusLabel(connection: KrDataConnection) { if (connection.lastSyncStatus === "never") return "업데이트 전"; if (connection.lastSyncStatus === "error") return "오류"; return connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "완료"; }

function KrDataState({ icon: Icon, title, detail, action, onAction, loading = false }: { icon: typeof Database; title: string; detail?: string; action?: string; onAction?: () => void; loading?: boolean }) {
  return <section className="kr-data-state"><Icon className={loading ? "spinning" : ""} size={20} /><div><b>{title}</b>{detail && <p>{detail}</p>}</div>{action && onAction && <button onClick={onAction}>{action}</button>}</section>;
}
