"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { createProjectAction } from "@/modules/projects/actions";
import { NameDialog } from "./name-dialog";

export function ProjectButton() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t("addProject")}
      </Button>
      {open && (
        <NameDialog
          title={t("addProject")}
          label={t("projectName")}
          action={t("create")}
          onClose={() => setOpen(false)}
          onSubmit={async (name) => {
            const made = await createProjectAction({ name });
            if (!made.ok) {
              toast.error(t("failed"));
              return;
            }
            setOpen(false);
            router.push(`/projects/${made.data.id}`);
          }}
        />
      )}
    </>
  );
}
