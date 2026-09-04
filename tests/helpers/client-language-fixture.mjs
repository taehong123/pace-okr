import React from "react";
import { readFile } from "node:fs/promises";
import { compileLanguageModule, language, catalogs } from "./language-fixture.mjs";
const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), "utf8");
const api = compileLanguageModule(await read("lib/api-error.ts"));
export const clientLanguage = compileLanguageModule(await read("lib/client-language.ts"), {
  react: React, "./language": language, "./api-error": api,
  ...Object.fromEntries(Object.entries(catalogs).map(([id, value]) => [`./locales/${id}`, value])),
});
export const propertyLabels = compileLanguageModule(await read("lib/property-label.ts"));
