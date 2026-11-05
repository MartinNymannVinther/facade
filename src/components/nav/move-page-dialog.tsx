"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { movePageAction } from "@/modules/pages/actions";
import { subtreeIds, type TreeNode } from "@/modules/pages/tree";
import { useWorkspace } from "./workspace-context";

/** The way to move a page without dragging it. */
export function MovePageDialog({ page, onClose }: { page: TreeNode; onClose: () => void }) {
  const t = useTranslations("nav");
  const { projects, tree } = useWorkspace();
  const [target, setTarget] = useState(`project:${page.projectId}`);
  const below = new Set(subtreeIds(tree, page.id));

  const depthOf = (node: TreeNode): number => {
    const parent = tree.find((n) => n.id === node.parentId);
    return parent ? depthOf(parent) + 1 : 1;
  };
  const inOrder = (projectId: string, parentId: string | null): TreeNode[] =>
    tree
      .filter((n) => n.projectId === projectId && n.parentId === parentId && !below.has(n.id))
      .sort((a, b) => a.sort - b.sort)
      .flatMap((n) => [n, ...inOrder(projectId, n.id)]);

  async function move() {
    const [kind, id] = target.split(":") as [string, string];
    const node = tree.find((n) => n.id === id);
    const projectId = kind === "project" ? id : node!.projectId;
    const parentId = kind === "project" ? null : id;
    const index = tree.filter((n) => n.projectId === projectId && n.parentId === parentId).length;
    const moved = await movePageAction({ id: page.id, projectId, parentId, index });
    if (!moved.ok) return toast.error(t("cannotMove"));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("moveTitle", { title: page.title || t("untitled") })}</DialogTitle>
          <DialogDescription>{t("moveHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="move-target">{t("moveTo")}</Label>
          <NativeSelect id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            {projects.flatMap((project) => [
              <option key={project.id} value={`project:${project.id}`}>
                {project.name}
              </option>,
              ...inOrder(project.id, null).map((node) => (
                <option key={node.id} value={`page:${node.id}`}>
                  {"  ".repeat(depthOf(node))}
                  {node.title || t("untitled")}
                </option>
              )),
            ])}
          </NativeSelect>
        </div>
        <DialogFooter>
          <Button onClick={() => void move()}>{t("move")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
