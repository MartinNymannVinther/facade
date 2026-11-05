"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLive, useLiveEvent } from "@/components/live/live-provider";
import {
  listMessagesAction,
  listThreadAction,
  markReadAction,
} from "@/modules/conversation/actions";
import type { MessageView } from "@/modules/conversation/view";

function upsert(list: MessageView[], message: MessageView): MessageView[] {
  const at = list.findIndex((m) => m.id === message.id);
  if (at === -1) return [...list, message];
  const next = [...list];
  next[at] = message;
  return next;
}

/** One channel's top-level messages, kept live; read again after a reconnect. */
export function useChannel(channelId: string) {
  const { generation } = useLive();
  const [messages, setMessages] = useState<MessageView[] | null>(null);
  const [more, setMore] = useState(false);
  const read = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const markRead = useCallback(() => {
    clearTimeout(read.current);
    read.current = setTimeout(() => void markReadAction({ id: channelId }), 200);
  }, [channelId]);

  useEffect(() => {
    let gone = false;
    void listMessagesAction({ channelId }).then((list) => {
      if (gone || !list.ok) return;
      setMessages(list.data.messages);
      setMore(list.data.more);
      markRead();
    });
    return () => {
      gone = true;
    };
  }, [channelId, generation, markRead]);

  useLiveEvent((event) => {
    if (event.type === "message.new" && event.message.channelId === channelId) {
      if (event.message.parentId) return;
      setMessages((list) => upsert(list ?? [], event.message));
      if (!document.hidden) markRead();
    } else if (event.type === "message.changed" && event.message.channelId === channelId) {
      setMessages((list) =>
        list?.some((m) => m.id === event.message.id) ? upsert(list, event.message) : list,
      );
    }
  });

  const loadOlder = useCallback(async () => {
    const oldest = messages?.[0];
    if (!oldest) return;
    const page = await listMessagesAction({ channelId, before: oldest.createdAt });
    if (!page.ok) return;
    setMessages((list) => [...page.data.messages, ...(list ?? [])]);
    setMore(page.data.more);
  }, [channelId, messages]);

  return { messages, more, loadOlder };
}

/** One thread, the message it hangs on first. */
export function useThread(parentId: string) {
  const { generation } = useLive();
  const [messages, setMessages] = useState<MessageView[] | null>(null);

  useEffect(() => {
    let gone = false;
    void listThreadAction({ id: parentId }).then((list) => {
      if (!gone && list.ok) setMessages(list.data);
    });
    return () => {
      gone = true;
    };
  }, [parentId, generation]);

  useLiveEvent((event) => {
    if (event.type !== "message.new" && event.type !== "message.changed") return;
    const { message } = event;
    if (message.id === parentId || message.parentId === parentId)
      setMessages((list) => (list ? upsert(list, message) : list));
  });

  return messages;
}
