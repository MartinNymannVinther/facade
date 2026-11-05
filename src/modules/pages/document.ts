import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import { contentExtensions } from "./extensions";

/**
 * A page's document, read and written without a browser. Pure: bytes and
 * JSON in, bytes, JSON, text and Markdown out. The database and the wire
 * live elsewhere; docs/adr/0011 is why the document is Yjs at all.
 */

export const FRAGMENT = "default";

const EMPTY: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

let cached: { schema: ReturnType<typeof getSchema>; markdown: MarkdownManager } | null = null;
function tools() {
  if (!cached) {
    const extensions = contentExtensions();
    cached = { schema: getSchema(extensions), markdown: new MarkdownManager({ extensions }) };
  }
  return cached;
}

/** A client's bytes are data until proven to be an update. */
export function isValidUpdate(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  try {
    Y.decodeUpdate(bytes);
    return true;
  } catch {
    return false;
  }
}

export function buildDoc(parts: Uint8Array[]): Y.Doc {
  const doc = new Y.Doc();
  for (const part of parts) Y.applyUpdate(doc, part);
  return doc;
}

export function encodeDoc(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function docToJson(doc: Y.Doc): JSONContent {
  const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(FRAGMENT)) as JSONContent;
  return json.content?.length ? json : EMPTY;
}

export function jsonToState(json: JSONContent): Uint8Array {
  const doc = new Y.Doc();
  prosemirrorJSONToYXmlFragment(tools().schema, json, doc.getXmlFragment(FRAGMENT));
  return Y.encodeStateAsUpdate(doc);
}

export function markdownToJson(markdown: string): JSONContent {
  return tools().markdown.parse(markdown);
}

export function jsonToMarkdown(json: JSONContent): string {
  return tools().markdown.serialize(json).trim();
}

const BLOCKS = new Set([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "codeBlock",
  "tableRow",
  "blockquote",
]);

/** The words of a document, a block to a line: what search and the AI read. */
export function textOf(json: JSONContent): string {
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = "";
  };
  const walk = (node: JSONContent) => {
    if (node.type === "text") line += node.text ?? "";
    else if (node.type === "mention") line += `@${node.attrs?.label ?? ""}`;
    else if (node.type === "hardBreak") line += " ";
    else if (node.type === "tableCell" || node.type === "tableHeader") {
      node.content?.forEach(walk);
      flush();
      return;
    }
    const block = BLOCKS.has(node.type ?? "");
    if (block) flush();
    node.content?.forEach(walk);
    if (block) flush();
  };
  walk(json);
  flush();
  return lines.join("\n");
}

/** Everybody named in a document, once each. */
export function mentionsOf(json: JSONContent): string[] {
  const found = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === "mention" && typeof node.attrs?.id === "string") found.add(node.attrs.id);
    node.content?.forEach(walk);
  };
  walk(json);
  return [...found];
}
