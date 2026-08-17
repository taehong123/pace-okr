import { env } from "cloudflare:workers";
import { authorizeRequest, ensureWorkspace } from "@/lib/pace-data";

type RuntimeEnv = typeof env & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OKRPTR_OPENAI_MODEL?: string;
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
    routineTitle: string;
    routineTrigger: string;
    routinePlace: string;
    routineSteps: string;
  };
};

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
    if (!message) return Response.json({ error: "message is required" }, { status: 400 });

    const runtime = env as RuntimeEnv;
    const apiKey = runtime.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY is not configured", code: "missing_openai_key" }, { status: 503 });
    }

    const model = runtime.OKRPTR_OPENAI_MODEL || runtime.OPENAI_MODEL || "gpt-5.6-luna";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        max_output_tokens: 1800,
        input: [
          {
            role: "system",
            content:
              "You organize messy Korean or multilingual work notes into practical OKR execution structure. Infer intent semantically, not by keyword. Prefer user language. Do not invent specific metrics unless implied; ask concise follow-up questions when information is missing. Keep routines separate from the OKR hierarchy. Tasks must be concrete next actions, one per line.",
          },
          {
            role: "user",
            content: JSON.stringify({
              message,
              currentPlan,
              desiredHierarchy: "Objective > Key Result > Initiative > Project > Task",
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
      }),
    });

    if (!response.ok) {
      return Response.json({ error: "OpenAI semantic organizer failed", code: "openai_error" }, { status: 502 });
    }

    const data = await response.json() as Record<string, unknown>;
    const text = extractOutputText(data);
    if (!text) return Response.json({ error: "OpenAI response was empty", code: "empty_openai_response" }, { status: 502 });

    return Response.json({ organized: normalizeOrganized(JSON.parse(text) as OrganizedOkr) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /required|not configured/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
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

function normalizeOrganized(value: OrganizedOkr): OrganizedOkr {
  return {
    assistantMessage: clean(value.assistantMessage) || "말씀하신 내용을 OKR 초안으로 정리했습니다.",
    questions: Array.isArray(value.questions) ? value.questions.map(clean).filter(Boolean).slice(0, 3) : [],
    plan: {
      objective: clean(value.plan?.objective),
      keyResult: clean(value.plan?.keyResult),
      initiative: clean(value.plan?.initiative),
      project: clean(value.plan?.project),
      tasks: clean(value.plan?.tasks),
      routineTitle: clean(value.plan?.routineTitle),
      routineTrigger: clean(value.plan?.routineTrigger),
      routinePlace: clean(value.plan?.routinePlace),
      routineSteps: clean(value.plan?.routineSteps),
    },
  };
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
