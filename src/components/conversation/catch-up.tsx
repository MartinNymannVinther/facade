"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { useWorkspace } from "@/components/nav/workspace-context";
import { useRouter } from "@/i18n/navigation";
import type { ProposalResult } from "@/modules/ai/wire";
import { createPageWithTextAction } from "@/modules/pages/actions";

/** What happened here while I was away: a proposal, kept only if somebody asks. */
export function CatchUp({ channelId, projectId }: { channelId: string; projectId: string | null }) {
  const t = useTranslations("ai");
  const locale = useLocale();
  const router = useRouter();
  const { aiReady } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  if (!aiReady) return null;

  async function ask() {
    setBusy(true);
    const answer = await fetch(`/api/ai/channel?locale=${locale}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    }).catch(() => null);
    setBusy(false);
    const result = (await answer?.json().catch(() => null)) as ProposalResult<{
      text: string;
    }> | null;
    if (result?.ok) setText(result.proposal.text);
    else toast.error(t(`error.${result?.error ?? "generic"}`));
  }

  async function keep() {
    if (!text || !projectId) return;
    const made = await createPageWithTextAction({
      projectId,
      title: t("summaryTitle"),
      markdown: text,
    });
    if (made.ok) router.push(`/pages/${made.data.id}`);
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void ask()}>
        {busy ? t("working") : t("catchUp")}
      </Button>
      {text && (
        <div className="bg-card border-border absolute top-12 right-4 z-30 w-[min(26rem,calc(100vw-2rem))] rounded-lg border p-3 shadow-md">
          <h3 className="text-label mb-1.5 text-xs font-medium">{t("proposal")}</h3>
          <div className="text-sm">
            <Markdown source={text} />
          </div>
          <div className="mt-3 flex gap-2">
            {projectId && (
              <Button size="sm" onClick={() => void keep()}>
                {t("keepAsPage")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setText(null)}>
              {t("discard")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
