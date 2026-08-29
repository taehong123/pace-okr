import { env } from "cloudflare:workers";
import { authorizeRequest, ensureWorkspace, getAiUsageSummary, recordAiUsageEvent } from "@/lib/pace-data";

type RuntimeEnv = typeof env & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OKRPTR_OPENAI_MODEL?: string;
  OKRPTR_AI_FREE_BUDGET_WON?: string;
  OKRPTR_AI_MAX_REQUESTS_PER_DAY?: string;
  OKRPTR_AI_MAX_REQUESTS_PER_MINUTE?: string;
  OKRPTR_AI_MIN_CALL_COST_WON?: string;
  OKRPTR_AI_INPUT_WON_PER_1K_TOKENS?: string;
  OKRPTR_AI_OUTPUT_WON_PER_1K_TOKENS?: string;
};

type DraftInitiative = {
  clientId: string;
  title: string;
};

type DraftKeyResult = {
  clientId: string;
  title: string;
  initiatives: DraftInitiative[];
};

type OrganizedPlan = {
  objectiveTitle: string;
  keyResults: DraftKeyResult[];
  targetInitiatives: DraftInitiative[];
  unassignedInitiatives: DraftInitiative[];
  project: string;
  tasks: string;
  taskParent: string;
  routineTitle: string;
  routineTrigger: string;
  routinePlace: string;
  routineSteps: string;
};

type OrganizedOkr = {
  assistantMessage: string;
  questions: string[];
  plan: OrganizedPlan;
};

type ConversationMode = "okr" | "project" | "onboarding" | "coach";

const maxOutputTokens = 3200;

const okrSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assistantMessage", "questions", "plan"],
  properties: {
    assistantMessage: { type: "string" },
    questions: {
      type: "array",
      maxItems: 3,
      items: { type: "string" },
    },
    plan: {
      type: "object",
      additionalProperties: false,
      required: [
        "objectiveTitle",
        "keyResults",
        "targetInitiatives",
        "unassignedInitiatives",
        "project",
        "tasks",
        "taskParent",
        "routineTitle",
        "routineTrigger",
        "routinePlace",
        "routineSteps",
      ],
      properties: {
        objectiveTitle: { type: "string" },
        keyResults: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["clientId", "title", "initiatives"],
            properties: {
              clientId: { type: "string" },
              title: { type: "string" },
              initiatives: {
                type: "array",
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["clientId", "title"],
                  properties: {
                    clientId: { type: "string" },
                    title: { type: "string" },
                  },
                },
              },
            },
          },
        },
        targetInitiatives: {
          type: "array",
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["clientId", "title"],
            properties: {
              clientId: { type: "string" },
              title: { type: "string" },
            },
          },
        },
        unassignedInitiatives: {
          type: "array",
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["clientId", "title"],
            properties: {
              clientId: { type: "string" },
              title: { type: "string" },
            },
          },
        },
        project: { type: "string" },
        tasks: { type: "string" },
        taskParent: { type: "string", enum: ["", "project", "routine"] },
        routineTitle: { type: "string" },
        routineTrigger: { type: "string" },
        routinePlace: { type: "string" },
        routineSteps: { type: "string" },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request);
  if (authorization instanceof Response) return authorization;

  try {
    await ensureWorkspace(authorization.ownerId);
    const payload = (await request.json()) as Record<string, unknown>;
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    const mode = asConversationMode(payload.mode);
    const history = sanitizeHistory(payload.history);
    const workspaceContext = sanitizeWorkspaceContext(payload.workspaceContext);
    const parentContext = payload.parentContext && typeof payload.parentContext === "object"
      ? payload.parentContext as Record<string, unknown>
      : {};
    const initiativeTitle = typeof parentContext.initiativeTitle === "string" ? parentContext.initiativeTitle.trim() : "";
    const targetContext = parentContext.target && typeof parentContext.target === "object"
      ? sanitizeTargetContext(parentContext.target as Record<string, unknown>)
      : undefined;
    const currentPlan = sanitizeCurrentPlan(payload.plan, targetContext?.kind);
    if (!message) return Response.json({ error: "message is required" }, { status: 400 });
    if (mode === "project" && !initiativeTitle) {
      return Response.json({ error: "initiative context is required for project mode" }, { status: 400 });
    }

    const runtime = env as RuntimeEnv;
    const apiKey = runtime.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY is not configured", code: "missing_openai_key" }, { status: 503 });
    }

    const model = runtime.OKRPTR_OPENAI_MODEL || runtime.OPENAI_MODEL || "gpt-5.6-luna";
    const inputChars = message.length + JSON.stringify(currentPlan).length + JSON.stringify(history).length + JSON.stringify(workspaceContext).length;
    const limit = await checkAiUsageLimit(runtime, authorization.ownerId, authorization.userId, inputChars);
    if (limit) return limit;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        input: [
          {
            role: "system",
            content: systemInstruction(mode),
          },
          {
            role: "user",
            content: JSON.stringify({
              message,
              currentPlan,
              mode,
              recentConversation: history,
              workspaceContext,
              parentContext: mode === "project" ? { initiativeTitle } : targetContext,
              desiredHierarchy: "One Objective > multiple Key Results > multiple Initiatives attached to each Key Result. Project and Task are created later from one selected Initiative. Routine > Task is independent.",
              draftRule: "Return the complete revised draft. Preserve every existing clientId exactly. Use an empty clientId for a new node. Never merge separate Key Results or Initiatives into one string. Put an Initiative in unassignedInitiatives when its Key Result is unclear.",
              projectRule: "If Project and Initiative would be similar, keep the idea as Initiative and leave Project empty.",
              routineShape: "trigger point, where/tool, what/how steps",
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "okr_organization",
            strict: true,
            schema: okrSchema,
          },
        },
        max_output_tokens: maxOutputTokens,
      }),
    });

    if (!response.ok) {
      return Response.json({ error: "OpenAI semantic organizer failed", code: "openai_error" }, { status: 502 });
    }

    const data = await response.json() as Record<string, unknown>;
    const usage = extractUsage(data, inputChars);
    await recordAiUsageEvent({
      ownerId: authorization.ownerId,
      userId: authorization.userId,
      model,
      source: "web",
      inputChars,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostWonMicros: estimateCostWonMicros(runtime, usage.inputTokens, usage.outputTokens),
    });
    const text = extractOutputText(data);
    if (!text) return Response.json({ error: "OpenAI response was empty", code: "empty_openai_response" }, { status: 502 });

    return Response.json({ organized: normalizeOrganized(JSON.parse(text) as OrganizedOkr, mode, currentPlan, targetContext?.kind) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /required|not configured/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

function asConversationMode(value: unknown): ConversationMode {
  return value === "project" || value === "onboarding" || value === "coach" ? value : "okr";
}

function sanitizeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
    const content = typeof record.content === "string" ? record.content.trim().slice(0, 1200) : "";
    return role && content ? [{ role, content }] : [];
  });
}

function sanitizeWorkspaceContext(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.slice(0, 80).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return [{
      id: cleanContextValue(item.id, 80),
      parentId: cleanContextValue(item.parentId, 80),
      kind: cleanContextValue(item.kind, 30),
      title: cleanContextValue(item.title, 300),
      status: cleanContextValue(item.status, 40),
      progress: typeof item.progress === "number" ? Math.max(0, Math.min(100, item.progress)) : 0,
      dri: cleanContextValue(item.dri, 120),
    }];
  }) : [];
  return {
    cycleId: cleanContextValue(record.cycleId, 80),
    cycleName: cleanContextValue(record.cycleName, 160),
    focusedItemId: cleanContextValue(record.focusedItemId, 80),
    blockedTaskCount: typeof record.blockedTaskCount === "number" ? Math.max(0, Math.min(999, record.blockedTaskCount)) : 0,
    items,
  };
}

function cleanContextValue(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sanitizeTargetContext(value: Record<string, unknown>) {
  return {
    id: cleanContextValue(value.id, 80),
    kind: cleanContextValue(value.kind, 30),
    title: cleanContextValue(value.title, 300),
  };
}

function systemInstruction(mode: ConversationMode) {
  const hierarchy = "Objective > Key Result > Initiative > Project > Task. Routine is independent and may contain Task.";
  const common = `You are the conversational assistant inside OKRPTR. Always answer in the user's language. Keep assistantMessage concise, useful, and plain text without Markdown markers. Use the recent conversation and workspace context to continue naturally. The hierarchy is ${hierarchy} Never invent specific metrics, commitments, owners, dates, or Tasks. Ask at most three concise questions when essential information is missing. Polish every supported title while preserving its meaning, numbers, dates, and proper nouns: an Objective is a concise desired change, a Key Result is a measurable outcome, and an Initiative is a concise strategic direction. Do not turn an activity into a Key Result. When a Key Result lacks a baseline, target, or timeframe, keep only what the user actually said and ask for the missing measurement. Never concatenate separate Key Results or Initiatives into one title.`;
  if (mode === "project") {
    return `${common} Help plan the first execution below an existing Initiative. Keep objectiveTitle, keyResults, targetInitiatives, and unassignedInitiatives empty. Only put a concrete Project, explicitly stated Tasks, and explicitly stated Routine details into the plan. A Project needs a clear outcome and enough scope, timing, or ownership to distinguish it from the Initiative.`;
  }
  if (mode === "onboarding") {
    return `${common} Teach OKR through a short guided conversation. Organize exactly one Objective with every distinct supported Key Result, and attach every Initiative only to the Key Result it clearly supports. If the user gives multiple Objective candidates, do not combine them: leave the OKR tree unchanged and ask which single Objective to use. Initiative is optional. Project is a later step and must stay empty until one Initiative is selected after this tree is saved.`;
  }
  if (mode === "coach") {
    return `${common} Act as a context-aware OKR coach. Inspect the supplied hierarchy and focus item. Continue from the earliest useful gap: missing Key Result, missing Initiative, missing first Project, or an active blocker. For an Objective target, return every new Key Result in keyResults with its clearly attached Initiatives. For a Key Result target, return every new Initiative in targetInitiatives. For an Initiative target, only return Project details. When multiple parents are plausible, ask the user to choose instead of guessing.`;
  }
  return `${common} Respond to greetings, product questions, general work questions, and factual questions directly. For casual or informational messages, leave every plan field empty and usually leave questions empty. When the user gives a real goal, organize exactly one Objective with every distinct Key Result and each Key Result's clearly related Initiatives. If an Initiative's parent is ambiguous, keep it in unassignedInitiatives rather than guessing. Project and Task are later steps after an Initiative is selected.`;
}

async function checkAiUsageLimit(runtime: RuntimeEnv, ownerId: string, userId: string, inputChars: number) {
  const budgetWon = envNumber(runtime.OKRPTR_AI_FREE_BUDGET_WON, 500);
  const dailyLimit = Math.max(1, Math.round(envNumber(runtime.OKRPTR_AI_MAX_REQUESTS_PER_DAY, 40)));
  const minuteLimit = Math.max(1, Math.round(envNumber(runtime.OKRPTR_AI_MAX_REQUESTS_PER_MINUTE, 5)));
  const budgetWonMicros = Math.round(budgetWon * 1_000_000);
  const summary = await getAiUsageSummary(ownerId, userId);

  if (summary.requestsThisMinute >= minuteLimit) {
    return Response.json({
      error: "AI 호출이 너무 빠르게 반복되고 있습니다. 잠시 후 다시 시도해 주세요.",
      code: "ai_rate_limited",
    }, { status: 429 });
  }

  if (summary.requestsToday >= dailyLimit) {
    return Response.json({
      error: "오늘의 무료 AI 정리 횟수를 모두 사용했습니다.",
      code: "ai_daily_limit_reached",
      usage: usagePayload(summary.spentWonMicros, budgetWonMicros, summary.requestsToday),
      options: limitOptions(),
    }, { status: 429 });
  }

  const reservedCostWonMicros = estimateCostWonMicros(
    runtime,
    estimateTokensFromChars(inputChars) + 200,
    maxOutputTokens,
  );
  if (summary.spentWonMicros + reservedCostWonMicros > budgetWonMicros) {
    return Response.json({
      error: "무료 AI 정리 예산을 모두 사용했습니다.",
      code: "ai_free_limit_reached",
      usage: usagePayload(summary.spentWonMicros, budgetWonMicros, summary.requestsToday),
      options: limitOptions(),
    }, { status: 402 });
  }

  return null;
}

function usagePayload(spentWonMicros: number, budgetWonMicros: number, requestsToday: number) {
  return {
    spentWon: Math.round(spentWonMicros / 10_000) / 100,
    budgetWon: Math.round(budgetWonMicros / 10_000) / 100,
    remainingWon: Math.max(0, Math.round((budgetWonMicros - spentWonMicros) / 10_000) / 100),
    requestsToday,
  };
}

function limitOptions() {
  return [
    "유료 플랜으로 서버 AI 정리 계속 사용",
    "개인 OpenAI API 키 연결",
    "ChatGPT에서 OKRPTR MCP로 연결해 직접 정리",
  ];
}

function extractUsage(data: Record<string, unknown>, inputChars: number) {
  const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : {};
  const inputTokens = numberValue(usage.input_tokens) || numberValue(usage.prompt_tokens) || estimateTokensFromChars(inputChars);
  const outputTokens = numberValue(usage.output_tokens) || numberValue(usage.completion_tokens) || 600;
  return { inputTokens, outputTokens };
}

function estimateTokensFromChars(chars: number) {
  return Math.max(1, Math.ceil(chars / 2));
}

function estimateCostWonMicros(runtime: RuntimeEnv, inputTokens: number, outputTokens: number) {
  const inputWonPerThousand = envNumber(runtime.OKRPTR_AI_INPUT_WON_PER_1K_TOKENS, 0.2);
  const outputWonPerThousand = envNumber(runtime.OKRPTR_AI_OUTPUT_WON_PER_1K_TOKENS, 2);
  const minimumCallWon = envNumber(runtime.OKRPTR_AI_MIN_CALL_COST_WON, 25);
  const tokenCostWon = (inputTokens / 1000 * inputWonPerThousand) + (outputTokens / 1000 * outputWonPerThousand);
  return Math.round(Math.max(minimumCallWon, tokenCostWon) * 1_000_000);
}

function envNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const content = (entry as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const text = (entry as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeOrganized(value: OrganizedOkr, mode: ConversationMode, current: OrganizedPlan, targetKind?: string): OrganizedOkr {
  const proposed = value.plan ?? emptyPlan();
  const tree = mergeOkrTree(current, proposed, mode, targetKind);
  const plan: OrganizedPlan = {
    ...tree,
    project: clean(proposed.project) || current.project,
    tasks: clean(proposed.tasks) || current.tasks,
    taskParent: clean(proposed.taskParent) || current.taskParent,
    routineTitle: clean(proposed.routineTitle) || current.routineTitle,
    routineTrigger: clean(proposed.routineTrigger) || current.routineTrigger,
    routinePlace: clean(proposed.routinePlace) || current.routinePlace,
    routineSteps: clean(proposed.routineSteps) || current.routineSteps,
  };
  if (mode === "project") {
    plan.objectiveTitle = "";
    plan.keyResults = [];
    plan.targetInitiatives = [];
    plan.unassignedInitiatives = [];
  }
  if (plan.taskParent !== "project" && plan.taskParent !== "routine") plan.taskParent = "";
  if (plan.taskParent === "project" && !plan.project) plan.taskParent = plan.routineTitle ? "routine" : "";
  if (plan.taskParent === "routine" && !plan.routineTitle) plan.taskParent = plan.project ? "project" : "";
  if (!plan.taskParent && plan.tasks) plan.taskParent = plan.routineTitle && !plan.project ? "routine" : plan.project ? "project" : "";
  return {
    assistantMessage: clean(value.assistantMessage) || "말씀하신 내용을 OKR 초안으로 정리했습니다.",
    questions: Array.isArray(value.questions) ? value.questions.map(clean).filter(Boolean).slice(0, 3) : [],
    plan,
  };
}

function emptyPlan(): OrganizedPlan {
  return {
    objectiveTitle: "",
    keyResults: [],
    targetInitiatives: [],
    unassignedInitiatives: [],
    project: "",
    tasks: "",
    taskParent: "",
    routineTitle: "",
    routineTrigger: "",
    routinePlace: "",
    routineSteps: "",
  };
}

function sanitizeCurrentPlan(value: unknown, targetKind?: string): OrganizedPlan {
  if (!value || typeof value !== "object") return emptyPlan();
  const record = value as Record<string, unknown>;
  const plan = emptyPlan();
  plan.objectiveTitle = clean(record.objectiveTitle) || clean(record.objective);
  plan.keyResults = sanitizeKeyResults(record.keyResults);
  plan.targetInitiatives = sanitizeInitiatives(record.targetInitiatives);
  plan.unassignedInitiatives = sanitizeInitiatives(record.unassignedInitiatives);
  plan.project = clean(record.project);
  plan.tasks = clean(record.tasks);
  plan.taskParent = clean(record.taskParent);
  plan.routineTitle = clean(record.routineTitle);
  plan.routineTrigger = clean(record.routineTrigger);
  plan.routinePlace = clean(record.routinePlace);
  plan.routineSteps = clean(record.routineSteps);

  const legacyKeyResult = clean(record.keyResult);
  const legacyInitiative = clean(record.initiative);
  if (!plan.keyResults.length && legacyKeyResult && targetKind !== "key_result") {
    plan.keyResults = [{ clientId: draftId("kr"), title: legacyKeyResult, initiatives: legacyInitiative ? [{ clientId: draftId("initiative"), title: legacyInitiative }] : [] }];
  } else if (!plan.targetInitiatives.length && legacyInitiative && targetKind === "key_result") {
    plan.targetInitiatives = [{ clientId: draftId("initiative"), title: legacyInitiative }];
  }
  return plan;
}

function sanitizeKeyResults(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const title = clean(record.title).slice(0, 500);
    if (!title) return [];
    return [{
      clientId: clean(record.clientId).slice(0, 100) || draftId("kr"),
      title,
      initiatives: sanitizeInitiatives(record.initiatives),
    }];
  });
}

function sanitizeInitiatives(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const title = clean(record.title).slice(0, 500);
    if (!title) return [];
    return [{ clientId: clean(record.clientId).slice(0, 100) || draftId("initiative"), title }];
  });
}

function mergeOkrTree(current: OrganizedPlan, proposed: OrganizedPlan, mode: ConversationMode, targetKind?: string) {
  if (mode === "project" || targetKind === "initiative") {
    return { objectiveTitle: "", keyResults: [], targetInitiatives: [], unassignedInitiatives: [] };
  }

  const currentKeyResults = sanitizeKeyResults(current.keyResults);
  const currentTargetInitiatives = sanitizeInitiatives(current.targetInitiatives);
  const currentUnassigned = sanitizeInitiatives(current.unassignedInitiatives);
  const knownKeyResults = new Map(currentKeyResults.map((entry) => [entry.clientId, entry]));
  const knownInitiatives = new Map([
    ...currentKeyResults.flatMap((entry) => entry.initiatives),
    ...currentTargetInitiatives,
    ...currentUnassigned,
  ].map((entry) => [entry.clientId, entry]));
  const rawKeyResults = Array.isArray(proposed.keyResults) ? proposed.keyResults : [];
  const rawTargetInitiatives = Array.isArray(proposed.targetInitiatives) ? proposed.targetInitiatives : [];
  const rawUnassigned = Array.isArray(proposed.unassignedInitiatives) ? proposed.unassignedInitiatives : [];
  const proposedInitiativeIds = new Set<string>();
  for (const entry of [...rawKeyResults.flatMap((keyResult) => Array.isArray(keyResult?.initiatives) ? keyResult.initiatives : []), ...rawTargetInitiatives, ...rawUnassigned]) {
    const id = clean(entry?.clientId);
    if (knownInitiatives.has(id)) proposedInitiativeIds.add(id);
  }
  const usedIds = new Set<string>();

  const normalizeInitiative = (entry: DraftInitiative) => {
    const requestedId = clean(entry?.clientId);
    const known = knownInitiatives.get(requestedId);
    const clientId = known && !usedIds.has(requestedId) ? requestedId : draftId("initiative");
    usedIds.add(clientId);
    return { clientId, title: clean(entry?.title).slice(0, 500) || known?.title || "" };
  };

  const keyResults = rawKeyResults.slice(0, 20).flatMap((entry) => {
    const requestedId = clean(entry?.clientId);
    const known = knownKeyResults.get(requestedId);
    const clientId = known && !usedIds.has(requestedId) ? requestedId : draftId("kr");
    usedIds.add(clientId);
    const proposedInitiatives = (Array.isArray(entry?.initiatives) ? entry.initiatives : []).slice(0, 30).map(normalizeInitiative).filter((initiative) => initiative.title);
    const retainedInitiatives = (known?.initiatives ?? []).filter((initiative) => !proposedInitiativeIds.has(initiative.clientId) && !usedIds.has(initiative.clientId));
    retainedInitiatives.forEach((initiative) => usedIds.add(initiative.clientId));
    const title = clean(entry?.title).slice(0, 500) || known?.title || "";
    return title ? [{ clientId, title, initiatives: dedupeInitiatives([...proposedInitiatives, ...retainedInitiatives]) }] : [];
  });
  for (const existing of currentKeyResults) {
    if (keyResults.some((entry) => entry.clientId === existing.clientId)) continue;
    keyResults.push({
      ...existing,
      initiatives: existing.initiatives.filter((initiative) => !proposedInitiativeIds.has(initiative.clientId)),
    });
  }

  const targetInitiatives = mergeInitiativeList(rawTargetInitiatives, currentTargetInitiatives, proposedInitiativeIds, usedIds, normalizeInitiative);
  const unassignedInitiatives = mergeInitiativeList(rawUnassigned, currentUnassigned, proposedInitiativeIds, usedIds, normalizeInitiative);
  return {
    objectiveTitle: targetKind ? "" : clean(proposed.objectiveTitle).slice(0, 500) || current.objectiveTitle,
    keyResults: targetKind === "key_result" ? [] : keyResults,
    targetInitiatives: targetKind === "key_result" ? targetInitiatives : [],
    unassignedInitiatives: targetKind === "key_result" ? [] : unassignedInitiatives,
  };
}

function mergeInitiativeList(
  proposed: DraftInitiative[],
  current: DraftInitiative[],
  proposedIds: Set<string>,
  usedIds: Set<string>,
  normalize: (entry: DraftInitiative) => DraftInitiative,
) {
  const merged = proposed.slice(0, 30).map(normalize).filter((entry) => entry.title);
  for (const existing of current) {
    if (proposedIds.has(existing.clientId) || usedIds.has(existing.clientId)) continue;
    usedIds.add(existing.clientId);
    merged.push(existing);
  }
  return dedupeInitiatives(merged);
}

function dedupeInitiatives(value: DraftInitiative[]) {
  const seen = new Set<string>();
  return value.filter((entry) => {
    const key = entry.title.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function draftId(kind: "kr" | "initiative") {
  return `draft-${kind}-${crypto.randomUUID()}`;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
