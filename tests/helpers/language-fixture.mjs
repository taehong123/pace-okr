import { readFile } from "node:fs/promises";
import ts from "typescript";

export function compileLanguageModule(source, dependencies = {}) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", js)((id) => {
    if (!(id in dependencies)) throw new Error(`Unmocked language dependency ${id}`);
    return dependencies[id];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
export const language = compileLanguageModule(await read("lib/language.ts"));
export const preferences = compileLanguageModule(await read("lib/language-preferences.ts"), { "./language": language });
export const catalogs = {};
for (const id of ["en", "ja", "zh", "es"]) catalogs[id] = compileLanguageModule(await read(`lib/locales/${id}.ts`));
export const serverLanguage = compileLanguageModule(await read("lib/server-language.ts"), {
  "./language": language, ...Object.fromEntries(Object.entries(catalogs).map(([id, module]) => [`./locales/${id}`, module])),
});

export function d1Fixture(db) {
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: statement };
}
