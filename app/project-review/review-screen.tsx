"use client";

// Full document navigation intentionally preserves the browser's unsaved-edit warning.
/* eslint-disable @next/next/no-html-link-for-pages */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { InitiativeChoice, ProjectProposal, ProjectReview } from "@/lib/project-review";
import type { ProjectReviewEditor } from "@/lib/project-review-editor";
import { ReviewFields, ReviewSummary, withVisibleProperties } from "./review-fields";
import "./review.css";
import { t, apiError, applyAccountLanguage, displayLanguageHeaders, useLanguage } from "@/lib/client-language";
import type { LanguagePreferences } from "@/lib/language";

type Candidates = { choices: InitiativeChoice[]; truncated: boolean };
type ReviewData = {
  account?: { userId: string; preferences: LanguagePreferences };
  review: ProjectReview; workspaceName: string; existingProjectId: string | null; editor: ProjectReviewEditor | null;
  canApprove?: boolean;
  candidates: Candidates; recommendations: { initiativeId: string; reason: string; initiative: InitiativeChoice | null }[];
};

export default function ProjectReviewScreen() {
  useLanguage();
  const [data, setData] = useState<ReviewData | null>(null);
  const [proposal, setProposal] = useState<ProjectProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loginUrl, setLoginUrl] = useState("");
  const [query, setQuery] = useState("");
  const [cycleFilter, setCycleFilter] = useState("");
  const [selection, setSelection] = useState<InitiativeChoice | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const searchSequence = useRef(0);
  const initialized = useRef(false);

  const requestDetails = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return { id: params.get("id") ?? "", headers: { "Content-Type": "application/json", ...displayLanguageHeaders(), "X-Okrptr-Workspace-Id": params.get("workspaceId") ?? "" } };
  }, []);

  const load = useCallback(async () => {
    try {
      const { id, headers } = requestDetails();
      const response = await fetch(`/api/project-reviews?id=${encodeURIComponent(id)}`, { headers, cache: "no-store" });
      if (response.status === 401) {
        setLoginUrl(`/api/auth/google?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return false;
      }
      const result = await response.json() as ReviewData & { error?: string };
      if (!response.ok) throw new Error(apiError(result, "확인 요청을 불러오지 못했습니다."));
      if (result.account) await applyAccountLanguage(result.account.userId, result.account.preferences);
      setData(result); setLoginUrl(""); setUncertain(false);
      if (!initialized.current) {
        initialized.current = true;
        setProposal(withVisibleProperties(result.review.proposal, result.editor));
        setCycleFilter(result.review.proposal.requestedCycleId ?? "");
      } else if (result.review.state === "pending") setProposal((current) => current && withVisibleProperties(current, result.editor));
      if (result.review.state !== "pending") setDirty(false);
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "연결을 확인해 주세요."); return false; }
    finally { setLoading(false); }
  }, [requestDetails]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function search(event?: FormEvent, filter = cycleFilter) {
    event?.preventDefault();
    const sequence = ++searchSequence.current;
    setSearching(true);
    try {
      const { id, headers } = requestDetails();
      const params = new URLSearchParams({ id, mode: "candidates", q: query, cycleId: filter });
      const response = await fetch(`/api/project-reviews?${params}`, { headers, cache: "no-store" });
      const result = await response.json() as { candidates: Candidates; error?: string };
      if (!response.ok) throw new Error(apiError(result, "후보 검색에 실패했습니다. 수정 내용은 유지됩니다."));
      if (sequence === searchSequence.current) {
        setData((current) => current && { ...current, candidates: result.candidates,
          recommendations: current.recommendations.map((r) => ({ ...r, initiative: result.candidates.choices.find((c) => c.id === r.initiativeId) ?? r.initiative })) });
        const refreshed = result.candidates.choices.find((c) => c.id === selection?.id);
        if (refreshed && refreshed.fingerprint !== selection?.fingerprint) { setSelection(null); setConfirmed(false); }
      }
    } catch (failure) { if (sequence === searchSequence.current) setError(failure instanceof Error ? failure.message : "후보 검색에 실패했습니다."); }
    finally { if (sequence === searchSequence.current) setSearching(false); }
  }

  function update(next: ProjectProposal, field: string) {
    setProposal(next); setConfirmed(false); setDirty(true);
    setFieldErrors((current) => { const result = { ...current }; delete result[field]; return result; });
  }
  function choose(candidate: InitiativeChoice) {
    setSelection(candidate); setDeferred(false);
    if (proposal) update({ ...proposal, requestedCycleId: candidate.cycleId }, "initiativeId");
  }

  async function decide(decision: "approve" | "cancel") {
    if (!data || !proposal || data.canApprove === false || submitting.current || uncertain || (decision === "approve" && (!selection || !confirmed || !proposal.title.trim() || !data.editor))) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const { headers } = requestDetails();
      const response = await fetch("/api/project-reviews", { method: "POST", headers,
        body: JSON.stringify({ decision, id: data.review.id, version: data.review.version,
          ...(decision === "approve" && selection ? { initiativeId: selection.id, initiativeFingerprint: selection.fingerprint,
            confirmed: true, proposal, editorRevision: data.editor!.revision } : {}) }),
      });
      const result = await response.json() as { review: ProjectReview; error?: string; code?: string; fieldErrors?: Record<string, string>; editor?: ProjectReviewEditor };
      if (!response.ok) {
        setConfirmed(false); setFieldErrors(result.fieldErrors ?? {});
        if (result.editor) {
          setData((current) => current && { ...current, editor: result.editor! });
          setProposal((current) => current && withVisibleProperties(current, result.editor!));
        }
        if (result.code === "initiative_changed") {
          setSelection(null);
          setData((current) => current && { ...current, recommendations: current.recommendations.filter((r) => r.initiativeId !== selection?.id) });
          await search();
        }
        if (!["invalid_proposal", "editor_changed", "initiative_changed", "invalid_request"].includes(result.code ?? "")) { setUncertain(true); await load(); }
        setError(apiError(result, "처리 결과를 확인해 주세요.")); return;
      }
      setData((current) => current && { ...current, review: result.review }); setDirty(false); setConfirmed(false);
    } catch {
      setConfirmed(false); setUncertain(true);
      await load(); // Read the existing receipt only; never retry creation automatically.
      setError(t("응답이 불확실해 기존 처리 결과를 조회했습니다. 확인되지 않으면 ‘처리 결과 확인’을 눌러 주세요."));
    } finally { submitting.current = false; setBusy(false); }
  }

  const review = data?.review, pending = review?.state === "pending";
  const disabled = busy || uncertain || !pending || data?.canApprove === false;
  const visibleRecommendations = (data?.recommendations ?? []).filter((r) => !cycleFilter || r.initiative?.cycleId === cycleFilter);
  const recommendationIds = new Set(visibleRecommendations.map((r) => r.initiativeId));
  return <main className="project-review-page">
    <header><a href="/">OKRPTR</a><span>{data?.workspaceName || t("Project 생성 확인")}</span></header>
    <article>
      <h1>{t("생성 전에 연결과 내용을 확인해 주세요")}</h1>
      <p className="review-intro">{t("AI 초안을 여기서 수정하고 Initiative를 직접 선택하세요. 최종 확인 전에는 Project가 생성되지 않습니다.")}</p>
      {loading && <p role="status">{t("확인 내용을 불러오는 중입니다…")}</p>}
      {loginUrl && <section className="review-notice"><h2>{t("연결한 계정으로 확인해 주세요")}</h2><p>{t("GPT에 연결한 동일한 OKRPTR 계정으로 로그인해야 합니다.")}</p><a className="review-primary" href={loginUrl}>{t("Google로 로그인하고 계속")}</a></section>}
      {error && <p className="review-error" role="alert">{error}</p>}
      {data?.canApprove === false && <p className="review-notice">{t("현재 계정은 읽기 전용입니다. 생성하려면 워크스페이스의 편집 권한이 필요합니다.")}</p>}
      {!loading && !data && !loginUrl && <button type="button" onClick={() => void load()}>{t("다시 불러오기")}</button>}
      {review && proposal && <>
        {pending && data?.editor && <ReviewFields review={review} proposal={proposal} editor={data.editor} errors={fieldErrors} disabled={disabled} onChange={update} />}
        {pending && <section className="review-choices" aria-labelledby="initiative-heading">
          <h2 id="initiative-heading">{t("어느 Initiative에 기여하나요? (필수)")}</h2>
          <p className="review-help">{t("전체 경로와 근거를 보고 선택하세요. 하나뿐인 후보도 자동 선택하지 않습니다.")}</p>
          {fieldErrors.initiativeId && <p className="review-error">{fieldErrors.initiativeId}</p>}
          <form onSubmit={(event) => void search(event)} className="review-search">
            <label htmlFor="cycle-filter">{t("OKR 파일 필터")}</label><select id="cycle-filter" value={cycleFilter} disabled={busy} onChange={(e) => { setCycleFilter(e.target.value); setConfirmed(false); void search(undefined, e.target.value); }}><option value="">{t("모든 활성 OKR 파일")}</option>{data?.editor?.cycles.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
            <label htmlFor="initiative-search">{t("다른 Initiative 검색")}</label><div><input id="initiative-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Initiative·KR·Objective 제목이나 설명")} maxLength={120} disabled={busy} /><button type="submit" disabled={busy || searching}>{t("검색")}</button></div>
          </form>
          {searching && <p role="status">{t("후보를 찾는 중입니다. 수정 내용과 선택한 연결은 유지됩니다.")}</p>}
          {visibleRecommendations.map((entry) => entry.initiative ? <Candidate key={entry.initiativeId} candidate={entry.initiative} reason={entry.reason} selected={selection?.id === entry.initiativeId} onSelect={choose} disabled={disabled} /> : <p key={entry.initiativeId}>{t("추천 후보가 변경됐습니다. 다른 후보를 선택해 주세요.")}</p>)}
          {data!.candidates.choices.filter((candidate) => !recommendationIds.has(candidate.id)).map((candidate) => <Candidate key={candidate.id} candidate={candidate} selected={selection?.id === candidate.id} onSelect={choose} disabled={disabled || searching} />)}
          {!searching && !data!.candidates.choices.length && <p>{t("검색 결과가 없습니다. 다른 표현으로 찾거나 생성을 보류해 주세요.")}</p>}
          {data!.candidates.truncated && <p className="review-help">{t("후보 20개만 표시했습니다. 검색어와 OKR 파일 필터로 좁혀 주세요.")}</p>}
        </section>}
        <ReviewSummary review={review} proposal={pending ? proposal : review.proposal} editor={data?.editor ?? null} selection={pending ? selection : review.selectedParent} />
        {review.state === "created" ? <section className="review-notice" role="status"><h2>{t("확인한 내용으로 생성했습니다")}</h2><a href={`/?project=${encodeURIComponent(review.projectId)}`}>{t("생성한 Project 열기")}</a></section>
          : review.state === "cancelled" ? <section className="review-notice" role="status"><h2>{t("생성을 취소했습니다")}</h2><p>{t("Project를 만들지 않았습니다.")}</p><a href="/">{t("OKRPTR로 돌아가기")}</a></section>
            : !pending || uncertain ? <section className="review-notice" role="status"><h2>{t("저장 결과 확인이 필요합니다")}</h2><p>{t("중복 생성을 막기 위해 새 요청을 만들지 않습니다. 기존 요청의 처리 결과를 확인해 주세요.")}</p><button type="button" onClick={() => void load()} disabled={busy}>{t("처리 결과 확인")}</button>{data?.existingProjectId && <a href={`/?project=${encodeURIComponent(data.existingProjectId)}`}>{t("저장된 Project 확인")}</a>}</section> : <section className="review-confirm">
              <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!selection || disabled || !data?.editor || !proposal.title.trim()} />{t("위 내용과 선택한 Initiative 연결을 확인했습니다.")}</label>
              <div className="review-actions"><button className="review-primary" type="button" disabled={!selection || !confirmed || disabled || !data?.editor || !proposal.title.trim()} onClick={() => void decide("approve")}>{busy ? t("처리 중…") : t("확인한 내용으로 Project 생성")}</button><button type="button" disabled={disabled} onClick={() => { setDeferred(true); setConfirmed(false); }}>{t("맞는 후보 없음 · 생성 보류")}</button><button type="button" disabled={disabled} onClick={() => void decide("cancel")}>{t("요청 취소")}</button></div>
              {deferred && <p role="status">{t("생성하지 않았습니다. 이 화면에서 계속 수정하거나 다른 후보를 검색할 수 있습니다.")}</p>}
              <p className="review-help">{t("요청 생성 후 30분 동안 유효합니다. 수정값은 생성 버튼을 누를 때만 저장됩니다.")}</p>
            </section>}
      </>}
    </article>
  </main>;
}

function Candidate({ candidate, reason, selected, onSelect, disabled }: { candidate: InitiativeChoice; reason?: string; selected: boolean; onSelect: (candidate: InitiativeChoice) => void; disabled: boolean }) {
  return <label className={`review-candidate${selected ? " selected" : ""}`}>
    <input type="radio" name="initiative" value={candidate.id} checked={selected} onChange={() => onSelect(candidate)} disabled={disabled} />
    <span>{reason && <small>{t("AI 추천 · 직접 확인 필요")}</small>}<b>{candidate.title}</b>{candidate.cycleName && <span>{t("OKR 파일:")}{candidate.cycleName}</span>}<span className="review-path">{candidate.path.join(" → ")}</span>{reason && <span className="review-reason">{t("추천 이유:")}{reason}</span>}<span>{candidate.description || t("Initiative 설명 없음")}</span>{candidate.keyResultDescription && <span>{t("KR 측정 맥락:")}{candidate.keyResultDescription}</span>}{candidate.objectiveDescription && <span>{t("Objective 맥락:")}{candidate.objectiveDescription}</span>}</span>
  </label>;
}
