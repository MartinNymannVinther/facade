"use client";

import { Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { trashPageAction } from "@/modules/pages/actions";

export function PageMenu({
  pageId,
  projectId,
  title,
  onMove,
}: {
  pageId: string;
  projectId: string;
  title: string;
  onMove: () => void;
}) {
  const t = useTranslations("page");
  const tNav = useTranslations("nav");
  const router = useRouter();

  async function trash() {
    const done = await trashPageAction({ id: pageId });
    if (!done.ok) return toast.error(tNav("failed"));
    toast(tNav("trashed"));
    router.push(`/projects/${projectId}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("menu", { title: title || tNav("untitled") })}
        className="text-meta hover:text-foreground hover:bg-muted flex size-8 items-center justify-center rounded-md"
      >
        <Ellipsis aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onMove}>{tNav("move")}</DropdownMenuItem>
        <DropdownMenuItem render={<a href={`/api/pages/${pageId}/markdown`} download />}>
          {t("downloadMarkdown")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void trash()}>{tNav("toTrash")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
