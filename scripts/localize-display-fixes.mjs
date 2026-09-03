// Bounded mechanical substitutions, separate from persisted values and behavior.
import fs from "node:fs";
const substitutions = {
  "app/page.tsx": [
    ['applyAccountLanguage(user.id, language.preferences); onClose();', 'applyAccountLanguage(user.id, language.preferences, { commit: true }); onClose();'],
  ],
};
for (const [file, pairs] of Object.entries(substitutions)) {
  const source = fs.readFileSync(file, "utf8");
  let next = source;
  for (const [from, to] of pairs) next = next.replaceAll(from, to);
  if (source !== next) fs.writeFileSync(file, next);
}
