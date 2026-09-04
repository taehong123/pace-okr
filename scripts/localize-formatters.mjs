import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
for (const file of fs.readdirSync("app").filter((file) => file.endsWith(".tsx"))) {
  const filename = path.join("app", file), source = fs.readFileSync(filename, "utf8");
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), edits = [];
  function visit(node) {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && ts.isPropertyAccessExpression(node.expression)
      && ["toLocaleString", "DateTimeFormat", "NumberFormat", "toLocaleDateString", "toLocaleTimeString"].includes(node.expression.name.text)
      && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "ko-KR") {
      edits.push({ start: node.arguments[0].getStart(tree), end: node.arguments[0].end });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!edits.length) continue;
  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + "getClientLocale()" + output.slice(edit.end);
  output = output.replace(/import\s*\{([^}]+)\}\s*from ["']@\/lib\/client-language["'];/, (_, names) => `import {${names}, getClientLocale } from "@/lib/client-language";`);
  fs.writeFileSync(filename, output);
  console.log(`${filename}: ${edits.length} display formatters`);
}
