// One-time, AST-bounded migration of UI literals. Never traverses customer data.
// Run after extending the catalog; --check lists UI literals not yet in the catalog.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const catalog = ts.createSourceFile("en.ts", fs.readFileSync("lib/locales/en.ts", "utf8"), ts.ScriptTarget.Latest, true);
const keys = new Set();
function readKeys(node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) keys.add(node.name.text);
  ts.forEachChild(node, readKeys);
}
readKeys(catalog);
const check = process.argv.includes("--check");
const missing = new Map();
const presentationAttributes = new Set(["title", "aria-label", "placeholder", "alt", "label", "description", "detail", "actionLabel", "emptyLabel", "emptyText", "confirmLabel", "cancelLabel", "discardTitle", "discardMessage"]);
const presentationConstants = new Set(["navItems", "cadenceLabels", "viewTitles", "priorityLabels", "statusLabels", "propertyTypeLabels", "signalLabels", "MANAGEMENT_SIGNALS", "workspaceSettingsTabs", "managementSignalLabels", "statuses", "cycleStatuses", "targetLabels"]);
const labelFunctions = new Set(["dailySkipLabel", "kindLabel", "propertyTypeLabel", "teamRoleLabel", "groupColorLabel", "pageSubtitle", "routineCadenceLabel"]);
const skipFiles = new Set(["layout.tsx", "landing.tsx", "language-settings.tsx", "language-load-error.tsx"]);
const uiFiles = [...fs.readdirSync("app").filter((name) => name.endsWith(".tsx") && !skipFiles.has(name)),
  ...fs.readdirSync("app/project-review").filter((name) => name.endsWith(".tsx") && name !== "page.tsx").map((name) => `project-review/${name}`)];
for (const file of uiFiles) {
  const filename = path.join("app", file), source = fs.readFileSync(filename, "utf8");
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function replace(node, text) { edits.push({ start: node.getStart(tree), end: node.end, text }); }
  function insideTranslation(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isCallExpression(parent) && ["t", "translate", "message"].includes(parent.expression.getText(tree))) return true;
    }
    return false;
  }
  function constantFor(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      if (ts.isFunctionLike(parent)) return null;
    }
    return null;
  }
  function inJsx(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isJsxExpression(parent)) return !ts.isJsxAttribute(parent.parent) || presentationAttributes.has(parent.parent.name.getText(tree));
      if (ts.isFunctionLike(parent) || ts.isVariableDeclaration(parent)) return false;
    }
    return false;
  }
  function candidate(node, value, replacement) {
    if (!keys.has(value)) {
      if (/[\uac00-\ud7a3]/u.test(value)) {
        const entry = missing.get(value) ?? [];
        entry.push(file); missing.set(value, entry);
      }
      return;
    }
    if (!check) replace(node, replacement);
  }
  function visit(node) {
    if (insideTranslation(node)) return;
    if (ts.isTemplateExpression(node) && /[\uac00-\ud7a3]/u.test([node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(""))) {
      const key = node.head.text + node.templateSpans.map((span, index) => `{value${index + 1}}${span.literal.text}`).join("");
      const values = node.templateSpans.map((span, index) => `value${index + 1}: messageValue(${span.expression.getText(tree)})`).join(", ");
      candidate(node, key, `t(${JSON.stringify(key)}, { ${values} })`);
      return;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = node.expression.getText(tree);
      if (/^(Error|showNotice|onNotice|onNoticeRef\.current|set\w*Error|setSaved)$/.test(name)) {
        for (const argument of node.arguments ?? []) {
          if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) candidate(argument, argument.text, `t(${JSON.stringify(argument.text)})`);
        }
      }
    }
    if (ts.isReturnStatement(node) && node.expression) {
      let parent = node.parent;
      while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
      if (parent && parent.name && labelFunctions.has(parent.name.getText(tree))) {
        if (!check) replace(node.expression, `t(${node.expression.getText(tree)})`);
        else {
          function values(entry) {
            if (ts.isPropertyAssignment(entry) && ts.isStringLiteral(entry.initializer)) candidate(entry.initializer, entry.initializer.text, "");
            ts.forEachChild(entry, values);
          }
          values(node.expression);
        }
        return;
      }
    }
    if (ts.isJsxText(node)) {
      const value = node.text.trim().replace(/\s+/g, " ");
      if (value) candidate(node, value, `{t(${JSON.stringify(value)})}`);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      if (ts.isJsxAttribute(parent) && presentationAttributes.has(parent.name.getText(tree))) {
        const value = node.text.replace(/&#(x[\da-f]+|\d+);/gi, (_, value) => String.fromCodePoint(value.startsWith("x") ? parseInt(value.slice(1), 16) : Number(value)))
          .replace(/&(amp|lt|gt|quot|apos);/g, (_, value) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[value]);
        candidate(node, value, `{t(${JSON.stringify(value)})}`); return;
      }
      if (ts.isJsxAttribute(parent)) return;
      if (ts.isPropertyAssignment(parent) && presentationConstants.has(constantFor(node)) && parent.initializer === node) {
        if (keys.has(node.text) && !check) replace(parent, `get ${parent.name.getText(tree)}() { return t(${JSON.stringify(node.text)}); }`);
        if (check) candidate(node, node.text, "");
        return;
      }
      if (inJsx(node)) {
        // Values/identifiers and comparison operands are behavioral, not display text.
        if (ts.isBinaryExpression(parent) && parent.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken && parent.operatorToken.kind !== ts.SyntaxKind.BarBarToken) return;
        if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) && !presentationAttributes.has(parent.parent.name.getText(tree))) return;
        if (ts.isCallExpression(parent) || ts.isPropertyAssignment(parent)) return;
        candidate(node, node.text, `t(${JSON.stringify(node.text)})`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (edits.length) {
    let output = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    if (!/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*["']@\/lib\/client-language["']/.test(output)) {
      const lastImport = tree.statements.filter(ts.isImportDeclaration).at(-1);
      const directive = tree.statements.find((node) => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === "use client");
      const position = lastImport?.end ?? directive?.end ?? 0;
      output = output.slice(0, position) + '\nimport { t } from "@/lib/client-language";' + output.slice(position);
    }
    if (edits.some((entry) => entry.text.includes("messageValue(")) && !/import\s*\{[^}]*\bmessageValue\b[^}]*\}\s*from\s*["']@\/lib\/client-language["']/.test(output)) {
      output = output.replace(/import\s*\{([^}]+)\}\s*from\s*["']@\/lib\/client-language["']/, (_, names) => `import {${names}, messageValue } from "@/lib/client-language"`);
    }
    const parsed = ts.createSourceFile(filename, output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (parsed.parseDiagnostics.length) throw new Error(`Migration would introduce invalid JSX in ${filename}`);
    fs.writeFileSync(filename, output);
    console.log(`${filename}: ${edits.length} display literals`);
  }
}
if (check) {
  const offset = Number(process.argv.find((arg) => arg.startsWith("--offset="))?.split("=")[1] ?? 0);
  const count = Number(process.argv.find((arg) => arg.startsWith("--count="))?.split("=")[1] ?? 100);
  console.log(JSON.stringify({ total: missing.size, entries: [...missing].slice(offset, offset + count).map(([text, files]) => ({ text, files: [...new Set(files)] })) }));
}
