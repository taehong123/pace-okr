import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/pace-data.ts", import.meta.url), "utf8");
const defaults = source.match(/const DEFAULT_PROJECT_EXECUTION_PROPERTIES:[\s\S]*?\n\];/)[0];
const seed = source.slice(source.indexOf("async function seedProjectExecutionProperties("), source.indexOf("async function migrateLegacyItemAssignments("));
const compiled = ts.transpileModule(`${defaults}\n${seed}\nreturn seedProjectExecutionProperties;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const names = ["상위 Initiative", "상태", "우선순위", "기한", "책임자", "하위 업무자", "KR 기여 예상치"];
const retired = ["주기", "스프린트", "예상 시간", "예상 기간", "시기"];

function fixture(initial = []) {
  const rows = structuredClone(initial);
  const columns = { ownerId: "ownerId", id: "id", name: "name" };
  const eq = (column, value) => (row) => row[column] === value;
  const and = (...conditions) => (row) => conditions.every((condition) => condition(row));
  const getDb = () => ({
    update: () => ({ set: (patch) => ({ where: async (condition) => { for (const row of rows.filter(condition)) Object.assign(row, patch); } }) }),
    insert: () => ({ values: async (newRows) => { rows.push(...newRows); } }),
  });
  const list = async (ownerId) => rows.filter((row) => row.ownerId === ownerId).map((row) => ({ ...row }));
  const run = new Function("getDb", "listPropertyDefinitions", "propertyDefinitions", "eq", "and", "normalizeOptions", "ITEM_STATUSES", "ITEM_PRIORITIES", compiled)(getDb, list, columns, eq, and, (options) => options, ["todo", "done", "archived"], ["low", "medium", "high", "urgent"]);
  return { rows, run };
}
const property = (id, name, systemKey = null, active = true, ownerId = "a") => ({ id, name, systemKey, active, ownerId, type: "member", defaultValue: '"member-1"', options: "[]", sortOrder: 10 });

test("fresh Project properties keep only due date for scheduling and seed idempotently", async () => {
  const { rows, run } = fixture();
  await run("a");
  assert.deepEqual(rows.map((row) => row.name), names);
  assert.ok(!rows.some((row) => retired.includes(row.name)));
  const once = structuredClone(rows);
  await run("a");
  assert.deepEqual(rows, once);
});

test("removed properties stay removed with IDs and stored defaults untouched", async () => {
  const old = retired.map((name, i) => property(`old-${i}`, name, i === 0 ? "cadence" : null, false));
  const { rows, run } = fixture(old);
  await run("a"); await run("a");
  assert.deepEqual(rows.filter((row) => row.id.startsWith("old-")), old);
  assert.deepEqual(rows.filter((row) => row.active).map((row) => row.name), names);
});

test("DRI rename preserves the built-in ID, default, inactive state and other workspace", async () => {
  const old = property("dri", "DRI", "project_dri", false);
  const other = property("other", "DRI", "project_dri", true, "b");
  const { rows, run } = fixture([old, other]);
  await run("a");
  const updated = rows.find((row) => row.id === old.id);
  const { updatedAt, ...persisted } = updated;
  assert.ok(updatedAt);
  assert.deepEqual(persisted, { ...old, name: "책임자" });
  assert.deepEqual(rows.find((row) => row.id === other.id), other);
  await run("a");
  assert.equal(rows.find((row) => row.id === old.id).updatedAt, updatedAt);
});

test("custom owner labels and same-name fields are not overwritten", async () => {
  for (const initial of [[property("custom-dri", "프로젝트 리드", "project_dri")], [property("dri", "DRI", "project_dri"), property("custom", "책임자")]]) {
    const { rows, run } = fixture(initial);
    await run("a");
    for (const original of initial) assert.deepEqual(rows.find((row) => row.id === original.id), original);
  }
});

test("legacy DRI upgrades in place without restoring hidden fields or losing assignments", async () => {
  const { rows, run } = fixture([property("legacy", "DRI", null, false)]);
  await run("a");
  assert.equal(rows.find((row) => row.id === "legacy").name, "책임자");
  assert.equal(rows.find((row) => row.id === "legacy").systemKey, "project_dri");
  assert.equal(rows.find((row) => row.id === "legacy").active, false);
  assert.equal(rows.filter((row) => row.systemKey === "project_dri").length, 1);
  assert.match(source, /LOWER\(TRIM\(property\.name\)\) IN \('dri', 'owner', 'assignee', '담당', '담당자', '책임자'\)/);
});

test("Project surfaces no longer expose cadence; Routine recurrence remains", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const detail = page.slice(page.indexOf("function ProjectPageView("), page.indexOf("function ProjectDataSection("));
  const create = page.slice(page.indexOf("function CreateItemPanel("), page.indexOf("function CreatePropertyField("));
  const review = await readFile(new URL("../app/project-review/review-fields.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(detail, /systemPropertyVisible\("cadence"\)/);
  assert.doesNotMatch(create, /<span>주기<\/span>/);
  assert.doesNotMatch(review, /cadenceNames|검토 주기|담당 DRI/);
  assert.match(create, /cadence: kind === "project" \? undefined : cadence/);
  assert.match(page, /aria-label=\{t\("반복 주기"\)\}/);
  assert.match(create, /label=\{t\("책임자"\)\}/);
});
