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

type OrganizedOkr = {
  assistantMessage: string;
  questions: string[];
  plan: {
    objective: string;
    keyResult: string;
    initiative: string;
    project: string;
    tasks: string;
    taskParent: string;
    routineTitle: string;
    routineTrigger: string;
    routinePlace: string;
    routineSteps: string;
  };
};

type ConversationMode = "okr" | "project" | "onboarding" | "coach";

const maxOutputTokens = 1800;

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
        "objective",
        "keyResult",
        "initiative",
        "project",
        "tasks",
        "taskParent",
        "routineTitle",
        "routineTrigger",
        "routinePlace",
        "routineSteps",
      ],
      properties: {
        objective: { type: "string" },
        keyResult: { type: "string" },
        initiative: { type: "string" },
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
    const currentPlan = typeof payload.plan === "object" && payload.plan ? payload.plan : {};
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
              desiredHierarchy: "OKR: Objective > Key Result > Initiative > Project > Task; independent execution: Routine > Task",
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

    return Response.json({ organized: normalizeOrganized(JSON.parse(text) as OrganizedOkr, mode) });
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
  const common = `You are the conversational assistant inside OKRPTR. Always answer in the user's language. Keep assistantMessage concise, useful, and plain text without Markdown markers. Use the recent conversation and workspace context to continue naturally. The hierarchy is ${hierarchy} Never invent specific metrics, commitments, owners, or Tasks. Ask at most three concise questions when essential information is missing.`;
  if (mode === "project") {
    return `${common} Help plan the first execution below an existing Initiative. Keep objective, keyResult, and initiative empty. Only put a concrete Project, explicitly stated Tasks, and explicitly stated Routine details into the plan. A Project needs a clear outcome and enough scope, timing, or ownership to distinguish it from the Initiative.`;
  }
  if (mode === "onboarding") {
    return `${common} Teach OKR through a short guided conversation. Objective describes the desired change and Key Result is a measurable outcome. First organize an Objective and at least one Key Result. Do not allow a vague activity to masquerade as a Key Result; ask for baseline, target, or timeframe when needed. Initiative and the first Project are optional next steps. If the user is not ready, support skipping them without pressure. Only add Initiative or Project when the user provides enough detail.`;
  }
  if (mode === "coach") {
    return `${common} Act as a context-aware OKR coach. Inspect the supplied hierarchy and focus item. Continue from the earliest useful gap: missing Key Result, missing Initiative, missing first Project, or an active blocker. When multiple parents are plausible, ask the user to choose instead of guessing. Keep existing hierarchy fields empty and only populate the missing descendant fields relevant to the selected target.`;
  }
  return `${common} Respond to greetings, product questions, general work questions, and factual questions directly. For casual or informational messages, leave every plan field empty and usually leave questions empty. When the user gives a real goal or execution commitment, organize only supported details. Initiative is the strategic execution direction under a Key Result. Project belongs below Initiative and should only be created when concrete scope, timing, outcome, or ownership is clear.`;
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

function normalizeOrganized(value: OrganizedOkr, mode: ConversationMode): OrganizedOkr {
  const plan = {
    objective: clean(value.plan?.objective),
    keyResult: clean(value.plan?.keyResult),
    initiative: clean(value.plan?.initiative),
    project: clean(value.plan?.project),
    tasks: clean(value.plan?.tasks),
    taskParent: clean(value.plan?.taskParent),
    routineTitle: clean(value.plan?.routineTitle),
    routineTrigger: clean(value.plan?.routineTrigger),
    routinePlace: clean(value.plan?.routinePlace),
    routineSteps: clean(value.plan?.routineSteps),
  };
  if (mode === "project") {
    plan.objective = "";
    plan.keyResult = "";
    plan.initiative = "";
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

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
