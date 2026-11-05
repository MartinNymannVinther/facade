"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useRouter } from "@/i18n/navigation";
import { createPageAction } from "@/modules/pages/actions";
import { setProjectArchivedAction, updateProjectAction } from "@/modules/projects/actions";

/** A project's name and what it is for, edited where they stand. */
export function ProjectHeader({
  id,
  name: initialName,
  description: initialDescription,
  icon,
  archived,
}: {
  id: string;
  name: string;
  description: string;
  icon: string;
  archived: boolean;
}) {
  const t = useTranslations("project");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  async function save(fields: { name?: string; description?: string }) {
    const done = await updateProjectAction({ id, ...fields });
    if (!done.ok) toast.error(tNav("failed"));
  }

  async function newPage() {
    const made = await createPageAction({ projectId: id });
    if (made.ok) router.push(`/pages/${made.data.id}`);
    else toast.error(tNav("failed"));
  }

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        {icon && (
          <span aria-hidden className="pt-0.5 text-2xl">
            {icon}
          </span>
        )}
        <input
          value={name}
          aria-label={t("nameLabel")}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== initialName) void save({ name: name.trim() });
          }}
          className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-tight outline-none"
        />
      </div>
      <textarea
        rows={2}
        value={description}
        placeholder={t("descriptionPlaceholder")}
        aria-label={t("descriptionLabel")}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          if (description !== initialDescription) void save({ description });
        }}
        className="placeholder:text-label text-muted-foreground w-full resize-none bg-transparent text-sm outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void newPage()}>
          {tNav("addPage")}
        </Button>
        {!archived && (
          <ConfirmButton
            variant="ghost"
            title={t("archiveTitle", { name })}
            body={t("archiveBody")}
            confirmLabel={t("archive")}
            onConfirm={async () => {
              await setProjectArchivedAction({ id, archived: true });
              router.push("/home");
            }}
          >
            {t("archive")}
          </ConfirmButton>
        )}
      </div>
    </header>
  );
}
