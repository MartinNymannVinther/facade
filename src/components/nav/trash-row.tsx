"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { purgePageAction, restorePageAction } from "@/modules/pages/actions";
import { setProjectArchivedAction } from "@/modules/projects/actions";

export function TrashRow({ id, title, meta }: { id: string; title: string; meta: string }) {
  const t = useTranslations("trash");
  return (
    <li className="border-hairline flex items-center justify-between gap-3 border-b py-2">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="text-meta block truncate text-xs">{meta}</span>
      </span>
      <span className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" onClick={() => void restorePageAction({ id })}>
          {t("restore")}
        </Button>
        <ConfirmButton
          title={t("purgeTitle", { title })}
          body={t("purgeBody")}
          confirmLabel={t("purge")}
          variant="ghost"
          onConfirm={() => purgePageAction({ id })}
        >
          {t("purge")}
        </ConfirmButton>
      </span>
    </li>
  );
}

export function ArchivedRow({ id, name }: { id: string; name: string }) {
  const t = useTranslations("trash");
  return (
    <li className="border-hairline flex items-center justify-between gap-3 border-b py-2">
      <span className="truncate text-sm font-medium">{name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void setProjectArchivedAction({ id, archived: false })}
      >
        {t("unarchive")}
      </Button>
    </li>
  );
}
