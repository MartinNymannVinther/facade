import type { AnyExtension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Mention from "@tiptap/extension-mention";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

/**
 * What a page can be made of: the one list both sides agree on. The editor
 * in the browser adds behaviour on top; the server uses this list alone to
 * read a document into text and Markdown, so anything added here is
 * searchable and exportable the moment it can be written.
 *
 * undoRedo is off because Yjs keeps the undo stack (a person undoes their
 * own typing, not their colleague's).
 */
export function contentExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Image,
    Mention.extend({
      // Written out as the name, so Markdown stays readable outside Facade.
      renderMarkdown: (node: { attrs?: { label?: string; id?: string } }) =>
        `@${node.attrs?.label ?? node.attrs?.id ?? ""}`,
    }),
  ];
}
