"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listVersionsAction, markVersionAction, readVersionAction } from "@/modules/pages/actions";
import type { VersionRow } from "@/modules/pages/versions";
import type { LiveDoc } from "./live-doc";
import { SidePanel } from "./side-panel";

function plain(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  const inner = (node.content ?? []).map(plain).join("");
  return ["paragraph", "heading", "listItem", "taskItem"].includes(node.type ?? "")
    ? `${inner}\n`
    : inner;
}

/**
 * The page as it stood. A restore is an ordinary edit on the live document:
 * a colleague writing right now watches it land, and a version is cut on
 * both sides of it, so restoring can itself be undone.
 */
export function HistoryPanel({
  pageId,
  editor,
  live,
  onClose,
}: {
  pageId: string;
  editor: Editor | null;
  live: LiveDoc;
  onClose: () => void;
}) {
  const t = useTranslations("page");
  const format = useFormatter();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [chosen, setChosen] = useState<{ id: string; json: JSONContent } | null>(null);

  useEffect(() => {
    void listVersionsAction({ id: pageId }).then((list) => {
      if (list.ok) setVersions(list.data);
    });
  }, [pageId]);

  async function show(id: string) {
    const version = await readVersionAction({ pageId, versionId: id });
    if (version.ok) setChosen({ id, json: version.data });
  }

  async function restore() {
    if (!chosen || !editor) return;
    await live.flushed();
    await markVersionAction({ id: pageId, reason: "restore" });
    editor.commands.setContent(chosen.json);
    await live.flushed();
    toast(t("restored"));
    onClose();
  }

  return (
    <SidePanel title={t("history")} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {versions?.length === 0 && <p className="text-meta p-2 text-sm">{t("noHistory")}</p>}
        <ul>
          {versions?.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => void show(version.id)}
                aria-pressed={chosen?.id === version.id}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm",
                  chosen?.id === version.id ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <span className="block">
                  {format.dateTime(new Date(version.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <span className="text-meta block text-xs">
                  {version.author ?? ""}
                  {version.reason !== "auto" && ` (${t(`reason.${version.reason}`)})`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {chosen && (
        <div className="border-border flex max-h-[45%] flex-col gap-2 border-t p-3">
          <pre className="text-muted-foreground min-h-0 flex-1 overflow-y-auto font-sans text-xs whitespace-pre-wrap">
            {plain(chosen.json)}
          </pre>
          <Button size="sm" onClick={() => void restore()}>
            {t("restore")}
          </Button>
        </div>
      )}
    </SidePanel>
  );
}
