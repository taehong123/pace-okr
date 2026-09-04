import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/my-work-sort.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { sortMyWorkItems, myWorkSortStorageKey, readMyWorkSort, saveMyWorkSort } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const work = (id, dueDate, priority) => Object.freeze({ id, dueDate, priority });
const entries = Object.freeze([
  work("no-date-urgent", null, "urgent"),
  work("future-high", "2026-09-10", "high"),
  work("today-low", "2026-09-02", "low"),
  work("overdue-low", "2026-08-30", "low"),
  work("today-high", "2026-09-02", "high"),
  work("today-medium-a", "2026-09-02", "medium"),
  work("today-medium-b", "2026-09-02", "medium"),
  work("no-date-high", null, "high"),
  work("no-date-low", null, "low"),
  work("no-date-medium", null, "medium"),
]);
const ids = (items) => items.map((item) => item.id);

test("due sorting includes overdue work, breaks ties by priority, and puts missing dates last", () => {
  assert.deepEqual(ids(sortMyWorkItems(entries, "due")), ["overdue-low", "today-high", "today-medium-a", "today-medium-b", "today-low", "future-high", "no-date-urgent", "no-date-high", "no-date-medium", "no-date-low"]);
});

test("priority sorting orders all four levels with due dates inside each level", () => {
  assert.deepEqual(ids(sortMyWorkItems(entries, "priority")), ["no-date-urgent", "today-high", "future-high", "no-date-high", "today-medium-a", "today-medium-b", "no-date-medium", "overdue-low", "today-low", "no-date-low"]);
});

test("sorts keep input order for ties without mutating input or item references", () => {
  const before = [...entries];
  for (const mode of ["due", "priority"]) {
    const sorted = sortMyWorkItems(entries, mode);
    assert.notEqual(sorted, entries);
    assert.deepEqual(entries, before);
    assert.ok(sorted.every((item) => entries.includes(item)));
    assert.deepEqual(ids(sortMyWorkItems([work("b", null, "low"), work("a", null, "low")], mode)), ["b", "a"]);
    assert.deepEqual(sortMyWorkItems([], mode), []);
  }
});

test("preferences are scoped to workspace and member and reject unknown saved modes", () => {
  const data = new Map();
  const original = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } };
  try {
    assert.equal(readMyWorkSort("w1", "m1"), "due");
    saveMyWorkSort("w1", "m1", "priority");
    assert.equal(readMyWorkSort("w1", "m1"), "priority");
    assert.equal(readMyWorkSort("w2", "m1"), "due");
    assert.equal(readMyWorkSort("w1", "m2"), "due");
    saveMyWorkSort("w1", "m2", "due");
    assert.equal(readMyWorkSort("w1", "m1"), "priority");
    data.set(myWorkSortStorageKey("w1", "m1"), "unexpected");
    assert.equal(readMyWorkSort("w1", "m1"), "due");
    assert.equal(myWorkSortStorageKey("", "m1"), null);
    assert.equal(myWorkSortStorageKey("w1", ""), null);
    const size = data.size;
    saveMyWorkSort("", "m1", "priority");
    assert.equal(data.size, size);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test("server rendering and blocked storage fall back without throwing", () => {
  assert.equal(readMyWorkSort("w", "m"), "due");
  assert.doesNotThrow(() => saveMyWorkSort("w", "m", "priority"));
  const original = globalThis.window;
  globalThis.window = { get localStorage() { throw new Error("Storage blocked"); } };
  try {
    assert.equal(readMyWorkSort("w", "m"), "due");
    assert.doesNotThrow(() => saveMyWorkSort("w", "m", "priority"));
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});
