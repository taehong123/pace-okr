import fs from "node:fs";
let source=fs.readFileSync("app/page.tsx","utf8");
for(const [from,to] of [["systemProperty(\"project_workers\")?.name ?? t(\"하위 업무자\")","systemPropertyLabel(systemProperty(\"project_workers\"), t, \"하위 업무자\")"],["systemProperty(\"parent_id\")?.name ?? t(\"상위 Initiative\")","systemPropertyLabel(systemProperty(\"parent_id\"), t, \"상위 Initiative\")"],["? t(draft.messageTemplate) : draft.messageTemplate","? translateForLanguage(messageLanguage, draft.messageTemplate) : draft.messageTemplate"]])source=source.replaceAll(from,to);
fs.writeFileSync("app/page.tsx",source);
