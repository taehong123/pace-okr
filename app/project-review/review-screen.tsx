"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { InitiativeChoice, ProjectReview } from "@/lib/project-review";
import "./review.css";

type ReviewData = {
  review: ProjectReview; workspaceName: string; existingProjectId: string | null;
  candidates: { choices: InitiativeChoice[]; truncated: boolean };
  recommendations: { initiativeId: string; reason: string; initiative: InitiativeChoice | null }[];
};
const priorityNames: Record<string, string> = { low: "낮음", medium: "보통", high: "높음", urgent: "긴급" };
const statusNames: Record<string, string> = { backlog: "대기", todo: "할 일", policy_discussion: "정책 논의", in_progress: "진행 중", developing: "개발 중", development_done: "개발 완료", done: "완료", blocked: "막힘" };
const cadenceNames: Record<string, string> = { daily: "일간", weekly: "주간", monthly: "월간", quarterly: "분기" };

export default function ProjectReviewScreen() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<InitiativeChoice | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [deferred, setDeferred] = useState(false);

  const requestDetails = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return { id: params.get("id") ?? "", headers: { "Content-Type": "application/json", "X-Okrptr-Workspace-Id": params.get("workspaceId") ?? "" } };
  }, []);

  const load = useCallback(async (search = "") => {
    try {
      const { id, headers } = requestDetails();
      const response = await fetch(`/api/project-reviews?id=${encodeURIComponent(id)}&q=${encodeURIComponent(search)}`, { headers, cache: "no-store" });
      setError(""); setSelection(null); setConfirmed(false);
      if (response.status === 401) {
        setLoginUrl(`/api/auth/google?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      const result = await response.json() as ReviewData & { error?: string };
      if (!response.ok) throw new Error(result.error || "확인 요청을 불러오지 못했습니다.");
      setData(result); setLoginUrl("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "연결을 확인해 주세요."); }
    finally { setLoading(false); }
  }, [requestDetails]);

  // Initial hydration is a network subscription; updates happen after the fetch resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function reload(search = "") {
    setLoading(true); setError(""); setSelection(null); setConfirmed(false);
    await load(search);
  }

  async function decide(decision: "approve" | "cancel") {
    if (!data || busy || (decision === "approve" && (!selection || !confirmed))) return;
    setBusy(true); setError("");
    try {
      const { headers } = requestDetails();
      const response = await fetch("/api/project-reviews", { method: "POST", headers,
        body: JSON.stringify({ decision, id: data.review.id, version: data.review.version,
          ...(decision === "approve" && selection ? { initiativeId: selection.id, initiativeFingerprint: selection.fingerprint, confirmed: true } : {}) }),
      });
      const result = await response.json() as { review: ProjectReview; error?: string };
      if (!response.ok) {
        await reload(query);
        throw new Error(result.error || "처리 결과를 확인해 주세요.");
      }
      setData({ ...data, review: result.review });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "응답이 불확실합니다. 다시 생성하지 말고 처리 결과를 확인해 주세요."); }
    finally { setBusy(false); }
  }

  function choose(candidate: InitiativeChoice) { setSelection(candidate); setConfirmed(false); setDeferred(false); }
  function search(event: FormEvent) { event.preventDefault(); void reload(query); }
  const review = data?.review;
  const pending = review?.state === "pending";
  const recommendationIds = new Set(data?.recommendations.flatMap((entry) => entry.initiative ? [entry.initiative.id] : []) ?? []);

  return <main className="project-review-page">
    <header><Link href="/">OKRPTR</Link><span>{data?.workspaceName || "Project 생성 확인"}</span></header>
    <article>
      <h1>생성 전에 연결을 확인해 주세요</h1>
      <p className="review-intro">AI 추천은 확정이 아닙니다. 내용을 검토하고 Initiative를 직접 선택해야 Project가 생성됩니다.</p>
      {loading && <p role="status">확인 내용을 불러오는 중입니다…</p>}
      {loginUrl && <section className="review-notice"><h2>연결한 계정으로 확인해 주세요</h2><p>GPT에 연결한 동일한 OKRPTR 계정으로 로그인해야 합니다.</p><a className="review-primary" href={loginUrl}>Google로 로그인하고 계속</a></section>}
      {error && <p className="review-error" role="alert">{error}</p>}
      {!loading && !data && !loginUrl && <button type="button" onClick={() => void reload(query)}>다시 불러오기</button>}
      {review && <>
        <section className="review-summary" aria-labelledby="project-summary-heading">
          <h2 id="project-summary-heading">생성할 Project</h2><h3>{review.proposal.title}</h3>
          <p className="review-description">{review.proposal.description || "범위·완료 기준 미입력"}</p>
          <dl>
            <div><dt>담당 DRI</dt><dd>{review.fieldLabels.dri || "미지정"}</dd></div>
            <div><dt>참여자</dt><dd>{review.fieldLabels.workers.join(", ") || "미지정"}</dd></div>
            <div><dt>마감</dt><dd>{review.proposal.dueDate || "미지정"}</dd></div>
            <div><dt>우선순위</dt><dd>{priorityNames[review.proposal.priority]}</dd></div>
            <div><dt>상태 · 진행률</dt><dd>{statusNames[review.proposal.status]} · {review.proposal.progress}%</dd></div>
            <div><dt>검토 주기</dt><dd>{cadenceNames[review.proposal.cadence]}</dd></div>
            <div><dt>본문 템플릿</dt><dd>{review.fieldLabels.template || "없음"}</dd></div>
            <div><dt>OKR 파일</dt><dd>{review.fieldLabels.cycle || "직접 선택한 Initiative의 OKR 파일"}</dd></div>
            {Object.entries(review.proposal.properties).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value === null ? "미지정" : Array.isArray(value) ? value.join(", ") : String(value)}</dd></div>)}
          </dl>
          {review.templatePreview !== null && <details><summary>적용할 템플릿 본문 미리보기</summary><p className="review-help">템플릿 뒤에 위의 범위·완료 기준이 이어서 저장됩니다.</p><p className="review-description">{review.templatePreview || "빈 본문"}</p>{review.templatePreview.length === 4000 && <p className="review-help">앞 4,000자만 표시했습니다. 전체 내용은 OKRPTR 템플릿에서 확인해 주세요.</p>}</details>}
          <p className="review-help">이 내용이 다르면 생성하지 말고 GPT에 수정을 요청해 주세요. 미지정 담당자·기한이나 하위 Task를 임의로 추가하지 않습니다.</p>
        </section>
        {review.state === "created" ? <section className="review-notice" role="status"><h2>확인한 내용으로 생성했습니다</h2><p>{review.selectedParent?.path.join(" → ")}</p><Link href="/?view=projects">Project 목록으로 이동</Link></section>
          : review.state === "cancelled" ? <section className="review-notice" role="status"><h2>생성을 취소했습니다</h2><p>Project를 만들지 않았습니다.</p><Link href="/">OKRPTR로 돌아가기</Link></section>
            : !pending ? <section className="review-notice" role="status"><h2>저장 결과 확인이 필요합니다</h2><p>처리 상태: {review.state === "creating" ? "처리 중" : "처리 실패"}. 중복 생성을 막기 위해 이 요청을 다시 실행하지 않습니다.{data?.existingProjectId ? " 이 요청의 Project가 있으니 저장된 내용을 확인해 주세요." : " 완료 여부를 확인한 뒤 다음 작업을 진행해 주세요."}</p><button type="button" onClick={() => void reload(query)} disabled={loading}>처리 결과 확인</button><Link href="/?view=projects">Project 목록 확인</Link></section> : <>
              <section className="review-choices" aria-labelledby="initiative-heading">
                <h2 id="initiative-heading">어느 Initiative에 기여하나요?</h2>
                <p className="review-help">전체 경로와 근거를 보고 선택하세요. 하나뿐인 후보도 자동 선택하지 않습니다.</p>
                {data!.recommendations.length > 0 ? data!.recommendations.map((entry) => entry.initiative
                  ? <Candidate key={entry.initiativeId} candidate={entry.initiative} reason={entry.reason} selected={selection?.id === entry.initiativeId} onSelect={choose} disabled={busy || loading} />
                  : <p key={entry.initiativeId} className="review-error">제안된 후보가 삭제되거나 변경됐습니다. 다른 Initiative를 선택해 주세요.</p>)
                  : <p className="review-notice">확정할 만한 추천이 없습니다. 아래에서 직접 찾아보거나 생성을 보류할 수 있습니다.</p>}
                <form onSubmit={search} className="review-search"><label htmlFor="initiative-search">다른 Initiative 검색</label><div><input id="initiative-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Initiative·KR·Objective 제목이나 설명" maxLength={120} disabled={busy} /><button type="submit" disabled={busy || loading}>검색</button></div></form>
                {!loading && data!.candidates.choices.filter((candidate) => !recommendationIds.has(candidate.id)).map((candidate) => <Candidate key={candidate.id} candidate={candidate} selected={selection?.id === candidate.id} onSelect={choose} disabled={busy} />)}
                {!loading && !data!.candidates.choices.length && <p>검색 결과가 없습니다. 다른 표현으로 찾거나 생성을 보류해 주세요.</p>}
                {data!.candidates.truncated && <p className="review-help">후보 20개만 표시했습니다. 원하는 항목이 없으면 검색어를 구체화해 주세요.</p>}
              </section>
              <section className="review-confirm">
                <h2>최종 생성 내용</h2><p><b>{review.proposal.title}</b></p><p>{selection ? selection.path.join(" → ") : "아직 Initiative를 선택하지 않았습니다."}</p>
                <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!selection || busy || loading} />위 내용과 선택한 Initiative 연결을 확인했습니다.</label>
                <div className="review-actions"><button className="review-primary" type="button" disabled={!selection || !confirmed || busy || loading} onClick={() => void decide("approve")}>{busy ? "처리 중…" : "확인한 연결로 Project 생성"}</button><button type="button" disabled={busy} onClick={() => { setDeferred(true); setConfirmed(false); }}>맞는 후보 없음 · 생성 보류</button><button type="button" disabled={busy} onClick={() => void decide("cancel")}>요청 취소</button></div>
                {deferred && <p role="status">생성하지 않았습니다. GPT에 다른 후보 검색이나 초안 수정을 요청해 주세요.</p>}
                <p className="review-help">이 검토 요청은 30분 동안 유효합니다. 생성 버튼을 누르기 전에는 Project가 만들어지지 않습니다.</p>
              </section>
            </>}
      </>}
    </article>
  </main>;
}

function Candidate({ candidate, reason, selected, onSelect, disabled }: { candidate: InitiativeChoice; reason?: string; selected: boolean; onSelect: (candidate: InitiativeChoice) => void; disabled: boolean }) {
  return <label className={`review-candidate${selected ? " selected" : ""}`}>
    <input type="radio" name="initiative" value={candidate.id} checked={selected} onChange={() => onSelect(candidate)} disabled={disabled} />
    <span>{reason && <small>AI 추천 · 직접 확인 필요</small>}<b>{candidate.title}</b>{candidate.cycleName && <span>OKR 파일: {candidate.cycleName}</span>}<span className="review-path">{candidate.path.join(" → ")}</span>{reason && <span className="review-reason">추천 이유: {reason}</span>}<span>{candidate.description || "Initiative 설명 없음"}</span>{candidate.keyResultDescription && <span>KR 측정 맥락: {candidate.keyResultDescription}</span>}{candidate.objectiveDescription && <span>Objective 맥락: {candidate.objectiveDescription}</span>}</span>
  </label>;
}
