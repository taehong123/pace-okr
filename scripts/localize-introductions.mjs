// Consolidate already translated introductions into the same lazy catalogs.
import fs from "node:fs";
import ts from "typescript";
const parse = (file) => ts.createSourceFile(file, fs.readFileSync(file, "utf8"), 99, true, file.endsWith("tsx") ? 4 : 3);
function literal(node) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literal(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map((p) => [p.name.text, literal(p.initializer)]));
  throw new Error("Not a static introduction");
}
function render(value) {
  if (typeof value === "string") return `translate(${JSON.stringify(value)})`;
  if (Array.isArray(value)) return "[" + value.map(render).join(", ") + "]";
  return "{" + Object.entries(value).map(([key, v]) => JSON.stringify(key) + ": " + render(v)).join(", ") + "}";
}
const catalogTree = parse("lib/locales/en.ts"), keys = new Set();
function readKeys(node) { if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) keys.add(node.name.text); ts.forEachChild(node, readKeys); }
readKeys(catalogTree);
const rows = new Map();
function collect(variants) {
  if (typeof variants.ko === "string") {
    if (!keys.has(variants.ko)) rows.set(variants.ko, variants);
  } else for (const key of Object.keys(variants.ko)) collect(Object.fromEntries(Object.entries(variants).map(([lang, value]) => [lang, value[key]])));
}
for (const [file, name, type, factory] of [
  ["app/page.tsx", "introCopy", "IntroCopy", "getIntroCopy"],
  ["lib/landing-copy.ts", "landingCopy", "LandingCopy", "getLandingCopy"],
]) {
  const tree=parse(file), source=tree.text;
  let declaration;
  function find(node) { if(ts.isVariableDeclaration(node) && node.name.getText(tree)===name) declaration=node; ts.forEachChild(node,find); }
  find(tree);
  if(!declaration) continue; // Already migrated.
  const variants=literal(declaration.initializer);
  collect(variants);
  const statement=declaration.parent.parent;
  const replacement=`${file.startsWith("lib/") ? "export " : ""}function ${factory}(translate: (key: string) => string): ${type} { return ${render(variants.ko)}; }`;
  let output=source.slice(0,statement.getStart(tree))+replacement+source.slice(statement.end);
  if(name==="introCopy") output=output.replaceAll("introCopy[language]", "getIntroCopy(t)");
  fs.writeFileSync(file,output);
}
for(const lang of ["en","ja","zh","es"]) {
  const file=`lib/locales/${lang}.ts`, source=fs.readFileSync(file,"utf8"), ending=lang==="en"?"} as const;":"} satisfies Catalog;";
  const additions=[...rows].map(([key,values])=>"  "+JSON.stringify(key)+": "+JSON.stringify(values[lang])+",").join("\n");
  fs.writeFileSync(file,source.replace(ending, additions+"\n"+ending));
}
console.log(`${rows.size} existing introduction translations consolidated`);
