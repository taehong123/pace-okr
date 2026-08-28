"use client";

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useRef } from "react";

const projectDocumentSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    divider: defaultBlockSpecs.divider,
    table: defaultBlockSpecs.table,
  },
});

export type ProjectBlockEditorChange = {
  content: string;
  plainText: string;
};

export default function ProjectBlockEditor({ initialContent, editable = true, onChange }: {
  initialContent: string;
  editable?: boolean;
  onChange?: (change: ProjectBlockEditorChange) => void;
}) {
  const initialBlocks = parseInitialContent(initialContent);
  const changeTimer = useRef<number | null>(null);
  const editor = useCreateBlockNote({
    schema: projectDocumentSchema,
    dictionary: ko,
    initialContent: initialBlocks as never,
  });

  useEffect(() => () => {
    if (changeTimer.current !== null) window.clearTimeout(changeTimer.current);
  }, []);

  function changed() {
    if (!onChange) return;
    if (changeTimer.current !== null) window.clearTimeout(changeTimer.current);
    changeTimer.current = window.setTimeout(() => {
      const document = editor.document;
      onChange({
        content: JSON.stringify(document),
        plainText: blocksToPlainText(document),
      });
    }, 450);
  }

  return (
    <div className="project-block-editor">
      <BlockNoteView editor={editor} editable={editable} onChange={changed} theme="light" />
    </div>
  );
}

function parseInitialContent(value: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
      return parsed as Record<string, unknown>[];
    }
  } catch {
    // The API validates persisted content; this keeps a damaged local draft editable.
  }
  return [{ type: "paragraph", content: "" }];
}

function blocksToPlainText(blocks: readonly unknown[]): string {
  const lines: string[] = [];
  for (const block of blocks) collectBlockText(block, lines);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function collectBlockText(value: unknown, lines: string[]) {
  if (!value || typeof value !== "object") return;
  const block = value as Record<string, unknown>;
  const content = block.content;
  if (typeof content === "string") lines.push(content);
  else if (Array.isArray(content)) {
    const line = content.map((entry) => inlineText(entry)).join("");
    if (line || block.type !== "table") lines.push(line);
    for (const entry of content) if (entry && typeof entry === "object" && "content" in entry) collectBlockText(entry, lines);
  }
  if (Array.isArray(block.children)) for (const child of block.children) collectBlockText(child, lines);
}

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const inline = value as Record<string, unknown>;
  if (typeof inline.text === "string") return inline.text;
  if (Array.isArray(inline.content)) return inline.content.map(inlineText).join("");
  return "";
}
