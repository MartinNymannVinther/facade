"use client";

import type { Editor } from "@tiptap/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { markVersionAction } from "@/modules/pages/actions";
import type { ProposalResult } from "@/modules/ai/wire";
import type { LiveDoc } from "./live-doc";
import { SidePanel } from "./side-panel";

const TASKS = ["summarize", "tasks", "continue", "improve"] as const;
type Task = (typeof TASKS)[number];

/**
 * The AI proposes; the person places it. Nothing reaches the page until
 * somebody presses the button, a version is cut first so it can be undone,
 * and the version says who wrote it (dogma five).
 */
export function AiPanel({
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
  const t = useTranslations("ai");
  const locale = useLocale();
  const [busy, setBusy] = useState<Task | null>(null);
  const [proposal, setProposal] = useState<{ task: Task; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);

  async function ask(task: Task) {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const text = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
    setSelection(empty ? null : { from, to });
    setBusy(task);
    setProposal(null);
    setError(null);
    await live.flushed();
    const answer = await fetch(`/api/ai/page?locale=${locale}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, task, selection: text }),
    }).catch(() => null);
    setBusy(null);
    const result = (await answer?.json().catch(() => null)) as ProposalResult<{
      text: string;
    }> | null;
    if (result?.ok) setProposal({ task, text: result.proposal.text });
    else setError(t(`error.${result?.error ?? "generic"}`));
  }

  async function accept(replace: boolean) {
    if (!editor || !proposal) return;
    await live.flushed();
    await markVersionAction({ id: pageId, reason: "ai" });
    const range = replace ? selection : null;
    const chain = editor.chain().focus();
    if (range)
      chain
        .insertContentAt({ from: range.from, to: range.to }, proposal.text, {
          contentType: "markdown",
        })
        .run();
    else chain.focus("end").insertContent(proposal.text, { contentType: "markdown" }).run();
    await live.flushed();
    toast(t("placed"));
    setProposal(null);
  }

  return (
    <SidePanel title={t("title")} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <p className="text-meta text-sm">{t("hint")}</p>
        <div className="flex flex-col gap-1.5">
          {TASKS.map((task) => (
            <Button
              key={task}
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void ask(task)}
              className="justify-start"
            >
              {busy === task ? t("working") : t(`task.${task}`)}
            </Button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {proposal && (
          <section aria-label={t("proposal")} className="border-border rounded-lg border p-3">
            <h3 className="text-label mb-1.5 text-xs font-medium">{t("proposal")}</h3>
            <div className="text-sm">
              <Markdown source={proposal.text} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selection && proposal.task === "improve" ? (
                <Button size="sm" onClick={() => void accept(true)}>
                  {t("replace")}
                </Button>
              ) : (
                <Button size="sm" onClick={() => void accept(false)}>
                  {t("insert")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                {t("discard")}
              </Button>
            </div>
          </section>
        )}
      </div>
    </SidePanel>
  );
}
