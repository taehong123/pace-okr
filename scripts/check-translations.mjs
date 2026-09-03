import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const catalogSource = await readFile(new URL("../lib/locales/en.ts", import.meta.url), "utf8");
const catalogFile = ts.createSourceFile("en.ts", catalogSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const keys = new Set();
function collectCatalog(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "messages" && node.initializer) {
    let initializer = node.initializer;
    while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer) || ts.isParenthesizedExpression(initializer)) initializer = initializer.expression;
    if (!ts.isObjectLiteralExpression(initializer)) return;
    for (const property of initializer.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      if (ts.isStringLiteralLike(property.name)) keys.add(property.name.text);
    }
  }
  ts.forEachChild(node, collectCatalog);
}
collectCatalog(catalogFile);

async function filesBelow(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(path));
    else if ([".ts", ".tsx"].includes(extname(path)) && !path.includes(`${join("lib", "locales")}`)) result.push(path);
  }
  return result;
}

const failures = [];
const callers = new Set(["t", "translateForLanguage"]);
for (const path of [...await filesBelow(fileURLToPath(new URL("../app", import.meta.url))), ...await filesBelow(fileURLToPath(new URL("../lib", import.meta.url)))]) {
  const source = await readFile(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function inspect(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && callers.has(node.expression.text)) {
      const keyIndex = node.expression.text === "translateForLanguage" ? 1 : 0;
      const keyNode = node.arguments[keyIndex];
      if (keyNode && ts.isStringLiteralLike(keyNode)) {
        if (!keys.has(keyNode.text)) failures.push(`${relative(rootPath, path)}:${file.getLineAndCharacterOfPosition(keyNode.getStart()).line + 1} missing ${JSON.stringify(keyNode.text)}`);
        const variables = [...keyNode.text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
        const values = node.arguments[keyIndex + 1];
        if (variables.length && values && ts.isObjectLiteralExpression(values)) {
          const supplied = new Set(values.properties.flatMap((property) => {
            if (ts.isShorthandPropertyAssignment(property)) return [property.name.text];
            if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))) return [property.name.text];
            return [];
          }));
          for (const variable of variables) if (!supplied.has(variable)) failures.push(`${relative(rootPath, path)}:${file.getLineAndCharacterOfPosition(keyNode.getStart()).line + 1} missing variable {${variable}}`);
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t" && ts.isCallExpression(node.arguments[0]) && ts.isIdentifier(node.arguments[0].expression) && node.arguments[0].expression.text === "t") {
      failures.push(`${relative(rootPath, path)}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} nested t(t(...))`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(file);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ catalogKeys: keys.size, status: "ok" }));
}
