"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/** The column beside a page; over it, on a phone. Esc closes it. */
export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("common");
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <aside
      aria-label={title}
      className="bg-card border-border fixed inset-0 z-40 flex flex-col lg:static lg:z-auto lg:w-[22rem] lg:shrink-0 lg:border-l"
    >
      <header className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="text-meta hover:text-foreground hover:bg-muted flex size-8 items-center justify-center rounded-md"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
