import fs from "node:fs";
import ts from "typescript";
const path = "lib/slack-daily.ts", source = fs.readFileSync(path, "utf8");
const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true), edits = [];
const modal = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "openDailyModal");
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(tree) === "text" && ts.isStringLiteral(node.initializer)) {
    edits.push({ start: node.initializer.getStart(tree), end: node.initializer.end, text: `t(${JSON.stringify(node.initializer.text)})` });
  }
  ts.forEachChild(node, visit);
}
visit(modal);
let output = source;
for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
fs.writeFileSync(path, output);
console.log(`${edits.length} Slack modal labels`);
