"use client";

import { MessageSquareReply, Paperclip, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PersonDot, useWorkspace } from "@/components/nav/workspace-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  deleteMessageAction,
  editMessageAction,
  toggleReactionAction,
} from "@/modules/conversation/actions";
import {
  encodeMentions,
  plainMentions,
  REACTIONS,
  type MessageView,
} from "@/modules/conversation/view";
import { MessageText } from "./message-text";

const ACTION =
  "text-meta hover:text-foreground hover:bg-muted flex size-7 items-center justify-center rounded";

function Attachment({ file }: { file: MessageView["attachments"][number] }) {
  const src = `/api/files/${file.id}`;
  if (/^image\/(png|jpeg|gif|webp|avif)$/.test(file.mime))
    return (
      <a href={src} target="_blank" rel="noreferrer" className="mt-1.5 block w-fit">
        {/* Served from the workspace's own files; next/image would need a loader for a cookie-guarded route. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={file.name} className="max-h-64 max-w-full rounded-lg" loading="lazy" />
      </a>
    );
  return (
    <a
      href={src}
      download={file.name}
      className="border-border hover:bg-muted mt-1.5 flex w-fit max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
    >
      <Paperclip aria-hidden className="text-meta size-3.5 shrink-0" />
      <span className="truncate">{file.name}</span>
    </a>
  );
}

export function MessageRow({
  message,
  onThread,
  highlighted,
}: {
  message: MessageView;
  onThread?: () => void;
  highlighted?: boolean;
}) {
  const t = useTranslations("conversation");
  const format = useFormatter();
  const { me, people } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const author = { id: message.authorId ?? "?", name: message.authorName || t("formerMember") };
  const mine = message.authorId === me.id;

  if (message.deleted)
    return (
      <div className="text-meta px-4 py-1 text-sm italic">
        {t("deleted")}
        {onThread && message.replyCount > 0 && (
          <button type="button" onClick={onThread} className="ml-2 underline not-italic">
            {t("replies", { count: message.replyCount })}
          </button>
        )}
      </div>
    );

  async function saveEdit() {
    const body = encodeMentions(editing ?? "", people).trim();
    if (!body) return;
    const done = await editMessageAction({ id: message.id, body });
    if (done.ok) setEditing(null);
    else toast.error(t("failed"));
  }

  return (
    <article
      id={`m-${message.id}`}
      className={cn(
        "group/message hover:bg-muted/50 focus-within:bg-muted/50 relative flex gap-2.5 px-4 py-1.5",
        highlighted && "bg-accent/60",
      )}
    >
      <PersonDot person={author} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{author.name}</span>
          <time dateTime={message.createdAt} className="text-meta shrink-0 text-xs">
            {format.dateTime(new Date(message.createdAt), {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </time>
          {message.editedAt && <span className="text-label text-xs">{t("edited")}</span>}
        </div>
        {editing !== null ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === "Escape") setEditing(null);
              }}
              aria-label={t("editLabel")}
              className="border-input bg-card w-full rounded-md border p-2 text-base outline-none sm:text-sm"
            />
            <p className="text-meta text-xs">{t("editHint")}</p>
          </div>
        ) : (
          message.body && <MessageText body={message.body} />
        )}
        {message.attachments.map((file) => (
          <Attachment key={file.id} file={file} />
        ))}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                aria-pressed={reaction.userIds.includes(me.id)}
                title={reaction.userIds
                  .map((id) => people.find((p) => p.id === id)?.name ?? "")
                  .join(", ")}
                onClick={() =>
                  void toggleReactionAction({ messageId: message.id, emoji: reaction.emoji })
                }
                className={cn(
                  "border-border flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
                  reaction.userIds.includes(me.id) && "bg-accent border-primary/40",
                )}
              >
                <span>{reaction.emoji}</span>
                <span className="tabular-nums">{reaction.userIds.length}</span>
              </button>
            ))}
          </div>
        )}
        {onThread && message.replyCount > 0 && (
          <button
            type="button"
            onClick={onThread}
            className="text-primary-hover mt-1 text-xs font-medium hover:underline"
          >
            {t("replies", { count: message.replyCount })}
          </button>
        )}
      </div>
      <div className="bg-card border-border absolute top-0 right-3 -translate-y-1/3 items-center rounded-md border p-0.5 opacity-0 shadow-sm group-focus-within/message:opacity-100 group-hover/message:opacity-100 [@media(hover:none)]:hidden flex">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("react")} className={ACTION}>
            <SmilePlus aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="flex w-auto min-w-0 gap-0.5">
            {REACTIONS.map((emoji) => (
              <DropdownMenuItem
                key={emoji}
                onClick={() => void toggleReactionAction({ messageId: message.id, emoji })}
                className="px-1.5 text-base"
              >
                {emoji}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onThread && (
          <button type="button" aria-label={t("reply")} onClick={onThread} className={ACTION}>
            <MessageSquareReply aria-hidden className="size-4" />
          </button>
        )}
        {mine && (
          <>
            <button
              type="button"
              aria-label={t("edit")}
              onClick={() => setEditing(plainMentions(message.body))}
              className={ACTION}
            >
              <Pencil aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t("delete")}
              onClick={() => {
                if (window.confirm(t("deleteConfirm")))
                  void deleteMessageAction({ id: message.id });
              }}
              className={ACTION}
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}
