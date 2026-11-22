"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadFile } from "@/components/page/upload";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { sendMessageAction } from "@/modules/conversation/actions";

/** As many as one message carries (modules/conversation/messages.ts). */
const PER_MESSAGE = 10;

/**
 * Sharing a file from the project's file list. It goes out as a message in
 * the project's channel, so the talk, the inbox and the search see it the
 * way they see any other (docs/adr/0016). A drop, or the button: dragging
 * is never the only way.
 */
export function UploadZone({ channelId, channel }: { channelId: string; channel: string }) {
  const t = useTranslations("files");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function share(list: File[]) {
    if (!list.length || busy) return;
    setBusy(true);
    const ids: string[] = [];
    for (const file of list) {
      const stored = await uploadFile(file);
      if (stored) ids.push(stored.id);
      else toast.error(t("uploadFailed", { name: file.name }));
    }
    for (let i = 0; i < ids.length; i += PER_MESSAGE) {
      const sent = await sendMessageAction({
        channelId,
        parentId: null,
        body: "",
        fileIds: ids.slice(i, i + PER_MESSAGE),
      });
      if (!sent.ok) toast.error(t("shareFailed"));
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void share([...e.dataTransfer.files]);
      }}
      className={cn(
        "border-border flex flex-col items-start gap-2 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center",
        over && "border-primary bg-accent",
      )}
    >
      <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
        <Upload aria-hidden className="size-4" />
        {busy ? t("uploading") : t("upload")}
      </Button>
      <p className="text-meta text-xs">{t("hint", { channel })}</p>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label={t("upload")}
        onChange={(e) => {
          void share([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
