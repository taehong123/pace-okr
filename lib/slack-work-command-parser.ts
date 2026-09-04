export const SLACK_WORK_COMMANDS = [
  "help", "my_work",
  "project_create", "project_view", "project_edit", "project_status",
  "task_create", "task_view", "task_edit", "task_complete", "task_reopen",
] as const;

export type SlackWorkCommand = (typeof SLACK_WORK_COMMANDS)[number];
export type ParsedSlackWorkCommand = { command: SlackWorkCommand; query: string };

const commandPatterns: Array<[SlackWorkCommand, RegExp]> = [
  ["help", /^!\s*도움말(?:\s+(.*))?$/u],
  ["my_work", /^!\s*내\s*업무(?:\s+(.*))?$/u],
  ["project_create", /^!\s*프로젝트\s*생성(?:\s+(.*))?$/u],
  ["project_view", /^!\s*프로젝트\s*조회(?:\s+(.*))?$/u],
  ["project_edit", /^!\s*프로젝트\s*수정(?:\s+(.*))?$/u],
  ["project_status", /^!\s*프로젝트\s*상태(?:\s+(.*))?$/u],
  ["task_create", /^!\s*(?:테스크|태스크)\s*생성(?:\s+(.*))?$/u],
  ["task_view", /^!\s*(?:테스크|태스크)\s*조회(?:\s+(.*))?$/u],
  ["task_edit", /^!\s*(?:테스크|태스크)\s*수정(?:\s+(.*))?$/u],
  ["task_complete", /^!\s*(?:테스크|태스크)\s*완료(?:\s+(.*))?$/u],
  ["task_reopen", /^!\s*(?:테스크|태스크)\s*재\s*열기(?:\s+(.*))?$/u],
];

export function parseSlackWorkCommand(input: string): ParsedSlackWorkCommand | null {
  const normalized = input.normalize("NFC").trim();
  for (const [command, pattern] of commandPatterns) {
    const match = normalized.match(pattern);
    if (match) return { command, query: (match[1] ?? "").trim().slice(0, 240) };
  }
  return null;
}
