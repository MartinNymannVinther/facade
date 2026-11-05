"use client";

import { ChevronRight, Ellipsis, FileText, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLiveEvent } from "@/components/live/live-provider";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { createPageAction, movePageAction, trashPageAction } from "@/modules/pages/actions";
import type { TreeNode } from "@/modules/pages/tree";
import { MovePageDialog } from "./move-page-dialog";

type Drop = { id: string; where: "before" | "inside" | "after" } | null;

const ROW =
  "group/row text-sidebar-foreground flex h-8 items-center gap-0.5 rounded-[7px] pr-1 text-sm transition-colors duration-[120ms] ease-out";

/**
 * A project's pages. Drag to reorder or nest; "Flyt" in the row's menu does
 * the same without a drag (the family's rule: everything works by keyboard).
 */
export function PageTree({
  nodes,
  projectId,
  open,
  setOpen,
  onNavigate,
}: {
  nodes: TreeNode[];
  projectId: string;
  open: Set<string>;
  setOpen: (id: string, value: boolean) => void;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const [titles, setTitles] = useState<Record<string, { title: string; icon: string }>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [moving, setMoving] = useState<TreeNode | null>(null);

  useLiveEvent((event) => {
    if (event.type === "page.title")
      setTitles((all) => ({ ...all, [event.pageId]: { title: event.title, icon: event.icon } }));
  });

  const childrenOf = (id: string | null) =>
    nodes
      .filter((n) => n.projectId === projectId && n.parentId === id)
      .sort((a, b) => a.sort - b.sort);

  async function addUnder(parentId: string) {
    const made = await createPageAction({ projectId, parentId });
    if (!made.ok) return toast.error(t("failed"));
    setOpen(parentId, true);
    onNavigate?.();
    router.push(`/pages/${made.data.id}`);
  }

  async function trash(id: string) {
    const done = await trashPageAction({ id });
    if (!done.ok) return toast.error(t("failed"));
    if (pathname === `/pages/${id}`) router.push(`/projects/${projectId}`);
    toast(t("trashed"));
  }

  async function finishDrop(target: NonNullable<Drop>) {
    const dragged = drag;
    setDrag(null);
    setDrop(null);
    if (!dragged || dragged === target.id) return;
    const node = nodes.find((n) => n.id === target.id);
    if (!node) return;
    const parentId = target.where === "inside" ? node.id : node.parentId;
    const level = childrenOf(parentId).filter((n) => n.id !== dragged);
    const at = level.findIndex((n) => n.id === node.id);
    const index =
      target.where === "inside" ? level.length : target.where === "before" ? at : at + 1;
    const moved = await movePageAction({ id: dragged, projectId, parentId, index });
    if (!moved.ok) toast.error(t("cannotMove"));
    else if (target.where === "inside") setOpen(node.id, true);
  }

  function row(node: TreeNode, depth: number) {
    const shown = { title: node.title, icon: node.icon, ...titles[node.id] };
    const kids = childrenOf(node.id);
    const expanded = open.has(node.id);
    const active = pathname === `/pages/${node.id}`;
    const marker = drop?.id === node.id ? drop.where : null;
    return (
      <li key={node.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDrag(node.id);
          }}
          onDragEnd={() => {
            setDrag(null);
            setDrop(null);
          }}
          onDragOver={(e) => {
            if (!drag || drag === node.id) return;
            e.preventDefault();
            const box = e.currentTarget.getBoundingClientRect();
            const y = (e.clientY - box.top) / box.height;
            setDrop({
              id: node.id,
              where: y < 0.28 ? "before" : y > 0.72 ? "after" : "inside",
            });
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drop) void finishDrop(drop);
          }}
          style={{ paddingLeft: 4 + depth * 14 }}
          className={cn(
            ROW,
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "hover:bg-sidebar-hover",
            marker === "inside" && "ring-primary ring-2",
            marker === "before" && "shadow-[inset_0_2px_0_var(--primary)]",
            marker === "after" && "shadow-[inset_0_-2px_0_var(--primary)]",
          )}
        >
          <button
            type="button"
            aria-label={expanded ? t("collapse") : t("expand")}
            aria-expanded={expanded}
            onClick={() => setOpen(node.id, !expanded)}
            className="text-meta hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded"
          >
            <ChevronRight
              aria-hidden
              className={cn(
                "size-3.5 transition-transform duration-[120ms]",
                expanded && "rotate-90",
                kids.length === 0 && "opacity-40",
              )}
            />
          </button>
          <Link
            href={`/pages/${node.id}`}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
          >
            {shown.icon ? (
              <span aria-hidden className="w-4 shrink-0 text-center text-[13px]">
                {shown.icon}
              </span>
            ) : (
              <FileText aria-hidden className="text-meta size-3.5 shrink-0" />
            )}
            <span className="truncate">{shown.title || t("untitled")}</span>
          </Link>
          <span className="flex shrink-0 items-center opacity-100 lg:opacity-0 lg:group-focus-within/row:opacity-100 lg:group-hover/row:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("pageMenu", { title: shown.title || t("untitled") })}
                className="text-meta hover:text-foreground hover:bg-sidebar-accent flex size-6 items-center justify-center rounded"
              >
                <Ellipsis aria-hidden className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44">
                <DropdownMenuItem onClick={() => setMoving(node)}>{t("move")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void trash(node.id)}>
                  {t("toTrash")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              aria-label={t("addSubpage")}
              title={t("addSubpage")}
              onClick={() => void addUnder(node.id)}
              className="text-meta hover:text-foreground hover:bg-sidebar-accent flex size-6 items-center justify-center rounded"
            >
              <Plus aria-hidden className="size-3.5" />
            </button>
          </span>
        </div>
        {expanded && kids.length > 0 && <ul>{kids.map((kid) => row(kid, depth + 1))}</ul>}
      </li>
    );
  }

  return (
    <>
      <ul>{childrenOf(null).map((node) => row(node, 1))}</ul>
      {moving && <MovePageDialog page={moving} onClose={() => setMoving(null)} />}
    </>
  );
}
