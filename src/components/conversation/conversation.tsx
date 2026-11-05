"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Composer } from "./composer";
import { MessageRow } from "./message-row";
import { useChannel, useThread } from "./use-conversation";

/** Stays at the bottom when it was already there; leaves a reader in peace. */
function useStickToBottom(count: number | undefined) {
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [count]);
  const onScroll = () => {
    const el = list.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  return { list, onScroll };
}

export function Thread({
  parentId,
  channelId,
  onClose,
}: {
  parentId: string;
  channelId: string;
  onClose: () => void;
}) {
  const t = useTranslations("conversation");
  const messages = useThread(parentId);
  const { list, onScroll } = useStickToBottom(messages?.length);
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="text-meta hover:text-foreground flex h-9 shrink-0 items-center gap-1.5 px-4 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("backToChannel")}
      </button>
      <div ref={list} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-2">
        {messages?.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </div>
      <Composer channelId={channelId} parentId={parentId} placeholder={t("replyPlaceholder")} />
    </>
  );
}

/** A channel: the list, the writing field, and a thread in place of them. */
export function Conversation({
  channelId,
  thread: initialThread = null,
  compact = false,
  emptyHint,
  placeholder,
}: {
  channelId: string;
  thread?: string | null;
  compact?: boolean;
  emptyHint: string;
  placeholder: string;
}) {
  const t = useTranslations("conversation");
  const { messages, more, loadOlder } = useChannel(channelId);
  const [thread, setThread] = useState<string | null>(initialThread);
  const { list, onScroll } = useStickToBottom(messages?.length);

  const threadOpen = thread !== null;
  const main = (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${threadOpen ? "max-lg:hidden" : ""}`}>
      <div ref={list} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-2">
        {more && (
          <div className="px-4 pb-2">
            <Button variant="ghost" size="sm" onClick={() => void loadOlder()}>
              {t("older")}
            </Button>
          </div>
        )}
        {messages?.length === 0 && <p className="text-meta px-4 py-3 text-sm">{emptyHint}</p>}
        {messages?.map((message) => (
          <MessageRow key={message.id} message={message} onThread={() => setThread(message.id)} />
        ))}
      </div>
      <Composer channelId={channelId} placeholder={placeholder} />
    </div>
  );

  if (compact)
    return thread ? (
      <Thread parentId={thread} channelId={channelId} onClose={() => setThread(null)} />
    ) : (
      main
    );

  return (
    <div className="flex min-h-0 flex-1">
      {main}
      {thread && (
        <section
          aria-label={t("thread")}
          className="border-border flex min-h-0 w-full flex-col lg:w-[24rem] lg:shrink-0 lg:border-l"
        >
          <Thread parentId={thread} channelId={channelId} onClose={() => setThread(null)} />
        </section>
      )}
    </div>
  );
}
