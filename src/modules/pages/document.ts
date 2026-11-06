import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { prosemirrorToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import { contentExtensions } from "./extensions";

/**
 * A page's document, read and written without a browser. Pure: bytes and
 * JSON in, bytes, JSON, text and Markdown out. The database and the wire
 * live elsewhere; docs/adr/0011 is why the document is Yjs at all.
 */

export const FRAGMENT = "default";

const MAX_DEPTH = 64;
/** What search keeps of a page; Postgres caps a tsvector at 1 MB. */
const MAX_TEXT = 300_000;
const MAX_MENTIONS = 200;

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

/**
 * Removes what a page cannot hold: a plain value among the blocks, a tree
 * deeper than anybody writes. An update can be well-formed and still be
 * that, and the shape of one cannot be judged from its bytes alone, so every
 * read repairs instead: one member's bad bytes never take a page down.
 */
function sanitize(doc: Y.Doc): void {
  doc.transact(() => {
    const stack: [Y.XmlFragment, number][] = [[doc.getXmlFragment(FRAGMENT), 0]];
    while (stack.length) {
      const [node, depth] = stack.pop()!;
      const children = node.toArray() as unknown[];
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child instanceof Y.XmlElement && depth < MAX_DEPTH) stack.push([child, depth + 1]);
        else if (!(child instanceof Y.XmlText)) node.delete(i, 1);
      }
    }
  });
}

export function buildDoc(parts: Uint8Array[]): Y.Doc {
  const doc = new Y.Doc();
  for (const part of parts) Y.applyUpdate(doc, part);
  sanitize(doc);
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
  // The node is built here, from our own schema. y-prosemirror is external on
  // the server and has its own copy of prosemirror-model, so anything it builds
  // from JSON is a stranger to that schema, in the production bundle only.
  prosemirrorToYXmlFragment(tools().schema.nodeFromJSON(json), doc.getXmlFragment(FRAGMENT));
  return Y.encodeStateAsUpdate(doc);
}

/** The update that turns a document into `json`, touching only what differs. */
export function rewrite(state: Uint8Array, json: JSONContent): Uint8Array {
  const doc = buildDoc([state]);
  const before = Y.encodeStateVector(doc);
  prosemirrorToYXmlFragment(tools().schema.nodeFromJSON(json), doc.getXmlFragment(FRAGMENT));
  return Y.encodeStateAsUpdate(doc, before);
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
  // Postgres text cannot hold a NUL, and a document can.
  return lines.join("\n").replaceAll("\u0000", "").slice(0, MAX_TEXT);
}

/** Everybody named in a document, once each. */
export function mentionsOf(json: JSONContent): string[] {
  const found = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === "mention" && typeof node.attrs?.id === "string") found.add(node.attrs.id);
    node.content?.forEach(walk);
  };
  walk(json);
  return [...found].slice(0, MAX_MENTIONS);
}
