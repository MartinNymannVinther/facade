"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { markInboxReadAction } from "@/modules/conversation/actions";

export function InboxActions() {
  const t = useTranslations("inbox");
  return (
    <Button variant="ghost" size="sm" onClick={() => void markInboxReadAction({})}>
      {t("markAll")}
    </Button>
  );
}

export function InboxLink({
  id,
  href,
  read,
  children,
}: {
  id: string;
  href: string;
  read: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        if (!read) void markInboxReadAction({ id });
      }}
      className={cn(
        "hover:bg-muted -mx-2 flex flex-col gap-0.5 rounded-md border-l-2 px-2 py-2",
        read ? "border-transparent" : "border-primary font-medium",
      )}
    >
      {children}
    </Link>
  );
}
