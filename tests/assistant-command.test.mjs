import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/assistant-command.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseAssistantCommand } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Task creation command accepts the requested spelling and common Korean variants", () => {
  for (const command of ["!테스크생성", " !테스크 생성 ", "!태스크생성", "!태스크   생성"]) {
    assert.equal(parseAssistantCommand(command), "create-task");
  }
});

test("Task creation command does not intercept ordinary conversation", () => {
  for (const message of ["테스크 생성", "!테스크생성 해줘", "회의에서 !테스크생성을 설명해 줘", "!프로젝트생성", ""]) {
    assert.equal(parseAssistantCommand(message), null);
  }
});
