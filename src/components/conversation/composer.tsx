"use client";

import { Paperclip, SendHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/nav/workspace-context";
import { uploadFile, type StoredFile } from "@/components/page/upload";
import { cn } from "@/lib/utils";
import { sendMessageAction } from "@/modules/conversation/actions";
import { encodeMentions } from "@/modules/conversation/view";

/** The writing field: Enter sends, Shift+Enter breaks the line, @ names a person. */
export function Composer({
  channelId,
  parentId = null,
  placeholder,
}: {
  channelId: string;
  parentId?: string | null;
  placeholder: string;
}) {
  const t = useTranslations("conversation");
  const { people, me } = useWorkspace();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const matches = mention
    ? people
        .filter((p) => p.id !== me.id && p.name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  function changed(value: string, cursor: number) {
    setText(value);
    const before = value.slice(0, cursor);
    const at = before.match(/(?:^|\s)@([\p{L}\p{N} ]{0,24})$/u);
    setMention(at ? { start: cursor - at[1]!.length - 1, query: at[1]! } : null);
    setActive(0);
  }

  function pick(name: string) {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const next = `${text.slice(0, mention.start)}@${name} ${text.slice(end)}`;
    setText(next);
    setMention(null);
    box.current?.focus();
  }

  async function attach(list: File[]) {
    for (const file of list) {
      const stored = await uploadFile(file);
      if (stored) setFiles((all) => [...all, stored]);
      else toast.error(t("uploadFailed", { name: file.name }));
    }
  }

  async function send() {
    const body = encodeMentions(text, people).trim();
    if ((!body && files.length === 0) || sending) return;
    setSending(true);
    const sent = await sendMessageAction({
      channelId,
      parentId,
      body,
      fileIds: files.map((f) => f.id),
    });
    setSending(false);
    if (!sent.ok) return toast.error(t("failed"));
    setText("");
    setFiles([]);
    box.current?.focus();
  }

  return (
    <div className="relative shrink-0 px-3 pt-1 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label={t("mentionList")}
          className="bg-popover ring-foreground/10 absolute right-3 bottom-full left-3 mb-1 rounded-lg p-1 shadow-md ring-1"
        >
          {matches.map((person, i) => (
            <li key={person.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(person.name);
                }}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm",
                  i === active && "bg-muted",
                )}
              >
                {person.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-input bg-card focus-within:border-ring rounded-lg border transition-colors duration-[120ms]">
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-2 pt-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="bg-muted flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-xs"
              >
                <span className="max-w-40 truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={t("removeFile", { name: file.name })}
                  onClick={() => setFiles((all) => all.filter((f) => f.id !== file.id))}
                  className="hover:bg-input flex size-5 items-center justify-center rounded"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => changed(e.target.value, e.target.selectionStart)}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            if (pasted.length) {
              e.preventDefault();
              void attach(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : matches.length - 1;
                setActive((a) => (a + step) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(matches[active]!.name);
                return;
              }
              if (e.key === "Escape") {
                setMention(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          className="placeholder:text-label block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-base outline-none sm:text-sm"
        />
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <button
            type="button"
            aria-label={t("attach")}
            title={t("attach")}
            onClick={() => picker.current?.click()}
            className="text-meta hover:text-foreground hover:bg-muted flex size-8 items-center justify-center rounded-md"
          >
            <Paperclip aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t("send")}
            title={t("send")}
            onClick={() => void send()}
            className="text-primary hover:bg-accent flex size-8 items-center justify-center rounded-md"
          >
            <SendHorizontal aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        aria-label={t("attach")}
        onChange={(e) => {
          void attach([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
