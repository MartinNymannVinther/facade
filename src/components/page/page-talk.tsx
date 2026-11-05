"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Conversation } from "@/components/conversation/conversation";
import { pageChannelAction } from "@/modules/conversation/actions";
import { SidePanel } from "./side-panel";

/** A page's conversation: an ordinary channel that only this page shows. */
export function PageTalk({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const t = useTranslations("page");
  const [channelId, setChannelId] = useState<string | null>(null);
  useEffect(() => {
    void pageChannelAction({ id: pageId }).then((made) => {
      if (made.ok) setChannelId(made.data);
    });
  }, [pageId]);
  return (
    <SidePanel title={t("talk")} onClose={onClose}>
      {channelId && (
        <Conversation
          channelId={channelId}
          compact
          emptyHint={t("talkEmpty")}
          placeholder={t("talkPlaceholder")}
        />
      )}
    </SidePanel>
  );
}
