# Fast, accurate conversational work intake

## Decision

The main improvement is fewer model↔tool round trips, not a second "classifier"
model or a longer mandatory questionnaire. ChatGPT already understands the user's
sentence: give that conversation a clear domain contract and one small read that
returns everything needed to connect the work.

The web `/api/okr-organize` flow is separate and still calls OpenAI Responses.
This change targets the externally connected GPT/MCP path. It does not change the
user's ChatGPT model, claim to control its reasoning time, or change stored
workspace preferences.

## Completion-boundary classification

| Type | Distinguishing criterion | Essential placement | Helpful, not mandatory before every save |
| --- | --- | --- | --- |
| Task | One independently completable action/result; internal steps are a checklist | Project or Routine; General fallback if unknown | Single assignee, due date, completion criterion |
| Project | Finite deliverable with scope/end condition and independently managed Tasks | Existing Initiative | DRI, workers, deadline, Project properties |
| Routine | Same execution repeats on a time/event/state trigger | Independent of OKR | Trigger, cadence, place/tool, concrete steps |
| Objective | Qualitative desired change | Selected OKR file | Context for the desired change |
| Key Result | Measurable evidence of Objective achievement | Objective | Baseline, target, unit, measurement period/source |
| Initiative | Strategic approach to moving a KR | Key Result | Explanation of how it contributes |

Duration, number of verbs, and keywords such as "개발" are not classifiers. A
long-running single investigation can still be a Task; a short coordinated launch
can be a Project. Respect a user-chosen type unless it conflicts with the data
model, in which case explain the specific gap. Never invent owners, dates,
targets, child Tasks or parent OKRs.

## Conversation contract

1. State the likely type and a one-sentence reason promptly. For ambiguity, use
   "한 번 완료할 일인가요, 여러 Task를 묶어 완성할 결과물인가요?" and offer a recommendation.
2. If IDs/context are missing, call `prepare_work` once. If all IDs and fields
   are already known, skip straight to the requested save. Discussion alone is
   not authorization to create data.
3. Ask at most one short round of up to three essential missing details. Carry
   forward facts the user already supplied. Optional fields remain unset or use
   existing workspace defaults; do not turn every field into a question.
4. Save with `create_item`, `create_tasks`, or `create_routine`. A Project without
   an Initiative stays an explicitly unsaved conversation draft. General is only
   a fallback for a clear Task, never a silent Project→Task conversion.
5. Confirm using the saved record: type, title, actual container, supplied owner
   and deadline. Do not list everything again. Uncertain write failures require
   checking for an existing save before retrying.

Example (connection options require real returned IDs):

> User: 결제 화면 문구 금요일까지 수정해야 해.
>
> Assistant: 한 가지 완료 결과가 있는 Task로 볼게요. 결제 개선 Project에 연결하면 될까요?
>
> After the user's selection: Task 저장 완료 · 결제 화면 문구 수정 · 결제 개선 · 금요일 마감.

If the parent is already unambiguous from the current conversation, do not ask
again. If no parent is known and the user just wants a quick capture, General is
valid. Resolve "금요일" from the conversation's current date/timezone; if that
context is missing or ambiguous, ask rather than inventing a date.

## Technical changes

- Shared contract in `lib/work-intake.ts`, consumed by MCP initialization and the
  REST guide. `prepare_work` does not run an LLM and does not save records.
- One D1 batch returns bounded, workspace-scoped projections. Parent paths and
  cycle IDs avoid follow-up ancestor lookups. No Project documents, checklist
  bodies, invitations or all-workspace property values enter the intake context.
- Known types receive only their own classification/field guide. `unsure` exposes
  alternatives without asserting a classification. Member and parent searches
  escape SQL LIKE wildcards; incomplete lists have explicit truncation flags.
- `create_tasks` reuses the transactional batch writer, including assignments,
  shared due date/priority/cadence and MCP provenance. Distinct per-Task metadata
  or descriptions still use `create_item`; exact duplicate titles in a batch are
  deduplicated by the existing writer.
- `create_item` accepts Routine and cycle IDs, inherits an explicit parent's
  cycle, validates incompatible fields and member/property inputs before writes,
  and records the creator. This reduces deterministic failures after a partial
  save; it is not a claim that the multi-step Project writer is fully atomic.
- `link_item` supports Routine placement without resetting status. Non-Task
  cross-cycle moves are rejected to avoid detaching a subtree across cycles.
- Task responses skip Project-property reads; Project responses fetch values
  only for returned Project IDs. Existing full-workspace consumers keep their
  behavior when no ID filter is supplied.
- MCP read-only calls are permitted for viewers even though the transport uses
  POST. Known read tools are allowlisted; writes, unknown tools and mixed batches
  remain write-gated. No membership/authorization cache was introduced.
- `Server-Timing` reports auth, workspace initialization, server preparation,
  handler and total times without logging user content or credentials.

## Measurements and limits

On 2026-09-02, three alternating warm local read-only samples per scenario:

| Scenario | Typical separate reads | `prepare_work` | Median before → after | Bytes before → after |
| --- | ---: | ---: | ---: | ---: |
| Task context | 4 | 1 | 1,144 → 256 ms | 2,546 → 2,392 |
| Project context | 4 | 1 | 795 → 220 ms | 5,225 → 4,709 |

These compare the prior **workflow shape** against the new tool on the same
current server, not a controlled before/after deployment. Three local samples,
small local data, other concurrent development and warm-up effects are not a
production latency guarantee. The robust gain is 4→1 context calls; byte and
wall-time changes depend on data and environment. Subsequent wording changes may
slightly alter payload size. A separate production `get_workspace_rules` call
took approximately 1.7 s including connector/network overhead; one sample cannot
identify the dominant latency source.

The benchmark never saves data and prints only timing/count/size summaries.
ChatGPT generation, tool approval UI, cold starts, and Slack notification
delivery during writes are outside these local read measurements. The current
writer still awaits configured Slack automation delivery. A durable outbox would
be a separate reliability/latency change, not an unawaited fire-and-forget patch.

## Golden conversation cases (manual model evaluation still required)

| User input/context | Expected behavior |
| --- | --- |
| 결제 문구 수정해야 해; user asks to save | Task, preserve stated deadline/assignee; known Project or General |
| 홈 리뉴얼: 디자인·개발·QA를 각 담당자가 진행 | Recommend Project; resolve Initiative, carry scope; do not invent child Tasks |
| 온보딩 개선해야 해 | Ambiguous Task/Project/Initiative; one short completion-boundary question |
| 매주 월요일 오전 지표 검토 | Routine; preserve trigger; no Initiative required |
| 이건 Task로 해줘 | Respect choice; internal steps are a checklist |
| 가입 전환율 20%에서 30%로 | KR; ask period/Objective only if missing |
| 기존 Project에 A/B/C Task 추가; IDs known | One `create_tasks`, no context or post-save listing |
| 본문/담당/기한이 각기 다른 Task들 | Preserve per-Task data using individual creates; no lossy batch |
| 담당자가 검색되지 않음 | Ask identity clarification; no invented ID or invitation |
| 이름이 같은 Project가 여럿 | Show returned ancestor paths and ask which one |
| Project지만 상위 Initiative 없음 | Explicit unsaved draft; no fake ancestors, no downgrade to Task |
| 어떻게 정리하는 게 좋을까? | Explain/prepare read-only; do not write without save intent |
| 목록 잘림 | Narrow parent/member search; needed missing property only → list_properties |
| 저장 요청 응답 유실 | Verify possible existing record before retry; avoid duplicate save |

The deterministic tests validate SQL isolation, projection limits, escaping,
contracts, field propagation, failure preflight, cycle inheritance, status
preservation, read/write gating, and actual batch SQL atomicity. They do **not**
prove that every ChatGPT model will choose the right tool or classify every
natural-language prompt. After publication, evaluate these cases in a fresh
conversation with the refreshed MCP tool catalog. Track first useful response,
clarification rounds, tool-call count, correct type/parent/field carryover and
end-to-end p50/p95 before making production speed claims.

## Source guidance

- [OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization): minimize sequential requests and avoid unnecessary model calls.
- [OpenAI tool design](https://developers.openai.com/plugins/plan/tools): group one coherent user action, separate reads from writes, return IDs needed for follow-up work.
- [OpenAI metadata optimization](https://developers.openai.com/plugins/guides/optimize-metadata): differentiate tool intent and evaluate against direct, indirect and negative prompts.
