// Mechanical UI-only replacement of API error fallbacks. Never modifies API contracts.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const files = [...fs.readdirSync("app").filter((file) => file.endsWith(".tsx")), ...fs.readdirSync("app/project-review").filter((file) => file.endsWith(".tsx")).map((file) => `project-review/${file}`)];
for (const file of files) {
  const filename = path.join("app", file), source = fs.readFileSync(filename, "utf8");
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), edits = [];
  function visit(node) {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === "error" && ["data", "result", "payload"].includes(node.left.expression.getText(tree))) {
      const fallback = node.right.getText(tree);
      edits.push({ start: node.getStart(tree), end: node.end, text: `apiError(${node.left.expression.getText(tree)}, ${fallback})` });
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!edits.length) continue;
  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  const imported = /import\s*\{([^}]+)\}\s*from ["']@\/lib\/client-language["'];/;
  if (imported.test(output)) output = output.replace(imported, (_, names) => `import {${names}, apiError } from "@/lib/client-language";`);
  else { const position = tree.statements.filter(ts.isImportDeclaration).at(-1).end; output = output.slice(0, position) + '\nimport { apiError } from "@/lib/client-language";' + output.slice(position); }
  if (ts.createSourceFile(filename, output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length) throw new Error(`Invalid error migration: ${filename}`);
  fs.writeFileSync(filename, output);
  console.log(`${filename}: ${edits.length} API error fallbacks`);
}
