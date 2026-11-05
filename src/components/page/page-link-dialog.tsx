"use client";

import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useWorkspace } from "@/components/nav/workspace-context";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Picks a page to link to from the one being written. */
export function PageLinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const t = useTranslations("editor");
  const tNav = useTranslations("nav");
  const { tree } = useWorkspace();
  const [query, setQuery] = useState("");
  const shown = tree
    .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 12);

  function link(id: string, title: string) {
    const text = title || tNav("untitled");
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "text", text, marks: [{ type: "link", attrs: { href: `/pages/${id}` } }] },
        { type: "text", text: " " },
      ])
      .run();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-2">
        <DialogTitle>{t("slash.pageLink")}</DialogTitle>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) link(shown[0].id, shown[0].title);
          }}
          aria-label={t("slash.pageLink")}
          className="border-input h-10 rounded-md border bg-transparent px-3 text-base outline-none"
        />
        <ul className="max-h-72 overflow-y-auto">
          {shown.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => link(node.id, node.title)}
                className="hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-sm"
              >
                {node.title || tNav("untitled")}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
