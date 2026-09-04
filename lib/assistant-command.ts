export type AssistantCommand = "create-task";

export function parseAssistantCommand(input: string): AssistantCommand | null {
  const normalized = input.normalize("NFC").trim();
  return /^!(?:테스크|태스크)\s*생성$/u.test(normalized) ? "create-task" : null;
}
