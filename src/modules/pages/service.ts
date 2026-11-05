import { and, asc, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { Refused } from "@/core/action";
import { pageDocuments, pages, projects, users } from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { publish } from "@/modules/live/hub";
import { jsonToState, markdownToJson, textOf } from "./document";
import { sortAt, subtreeIds, wouldCycle, type TreeNode } from "./tree";

export const PageFields = z.object({
  title: z.string().max(300),
  icon: z.string().trim().max(16),
});

export const NewPage = z.object({
  projectId: z.string().min(1).max(100),
  parentId: z.string().min(1).max(100).nullable().default(null),
  title: z.string().max(300).default(""),
});

export const MovePage = z.object({
  id: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100),
  parentId: z.string().min(1).max(100).nullable(),
  index: z.number().int().min(0).max(100_000),
});

const NODE = {
  id: pages.id,
  parentId: pages.parentId,
  projectId: pages.projectId,
  title: pages.title,
  icon: pages.icon,
  sort: pages.sort,
};

async function liveNodes(tx: AppTransaction): Promise<TreeNode[]> {
  return tx.select(NODE).from(pages).where(isNull(pages.deletedAt)).orderBy(asc(pages.sort));
}

async function requireProject(tx: AppTransaction, id: string) {
  const [row] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, id));
  if (!row) throw new Refused("notFound");
}

async function requireLivePage(tx: AppTransaction, id: string) {
  const [row] = await tx
    .select({ id: pages.id, projectId: pages.projectId, parentId: pages.parentId })
    .from(pages)
    .where(and(eq(pages.id, id), isNull(pages.deletedAt)));
  if (!row) throw new Refused("notFound");
  return row;
}

export async function createPage(
  ctx: OrgContext,
  input: z.infer<typeof NewPage> & { markdown?: string },
): Promise<{ id: string }> {
  const created = await withOrgContext(ctx, async (tx) => {
    await requireProject(tx, input.projectId);
    if (input.parentId) {
      const parent = await requireLivePage(tx, input.parentId);
      if (parent.projectId !== input.projectId) throw new Refused("invalid");
    }
    const sibling = input.parentId ? eq(pages.parentId, input.parentId) : isNull(pages.parentId);
    const [top] = await tx
      .select({ sort: max(pages.sort) })
      .from(pages)
      .where(and(eq(pages.projectId, input.projectId), sibling));
    const [page] = await tx
      .insert(pages)
      .values({
        orgId: ctx.orgId,
        projectId: input.projectId,
        parentId: input.parentId,
        title: input.title,
        sort: (top?.sort ?? 0) + 1,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning({ id: pages.id });
    const json = input.markdown ? markdownToJson(input.markdown) : null;
    await tx.insert(pageDocuments).values({
      pageId: page!.id,
      orgId: ctx.orgId,
      state: json ? Buffer.from(jsonToState(json)) : null,
      text: json ? textOf(json) : "",
      editedBy: ctx.userId,
    });
    return { id: page!.id };
  });
  publish(ctx.orgId, { type: "tree" });
  return created;
}

export async function listTree(ctx: OrgContext): Promise<TreeNode[]> {
  return withOrgContext(ctx, liveNodes);
}

export type PageView = {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  icon: string;
  editedAt: Date | null;
  editedBy: string | null;
};

export async function getPage(ctx: OrgContext, id: string): Promise<PageView | null> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({
        id: pages.id,
        projectId: pages.projectId,
        parentId: pages.parentId,
        title: pages.title,
        icon: pages.icon,
        editedAt: pageDocuments.editedAt,
        editedBy: users.name,
      })
      .from(pages)
      .leftJoin(pageDocuments, eq(pageDocuments.pageId, pages.id))
      .leftJoin(users, eq(users.id, pageDocuments.editedBy))
      .where(and(eq(pages.id, id), isNull(pages.deletedAt)));
    return row ?? null;
  });
}

export async function updatePage(
  ctx: OrgContext,
  id: string,
  fields: Partial<z.infer<typeof PageFields>>,
): Promise<void> {
  const row = await withOrgContext(ctx, async (tx) => {
    const [updated] = await tx
      .update(pages)
      .set({ ...fields, updatedBy: ctx.userId, updatedAt: new Date() })
      .where(and(eq(pages.id, id), isNull(pages.deletedAt)))
      .returning({ title: pages.title, icon: pages.icon });
    if (!updated) throw new Refused("notFound");
    return updated;
  });
  publish(ctx.orgId, { type: "page.title", pageId: id, ...row });
}

export async function movePage(ctx: OrgContext, input: z.infer<typeof MovePage>): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    await requireProject(tx, input.projectId);
    await requireLivePage(tx, input.id);
    const nodes = await liveNodes(tx);
    if (input.parentId) {
      const parent = nodes.find((n) => n.id === input.parentId);
      if (!parent || parent.projectId !== input.projectId) throw new Refused("invalid");
    }
    if (wouldCycle(nodes, input.id, input.parentId)) throw new Refused("conflict");
    const siblings = nodes.filter(
      (n) => n.id !== input.id && n.projectId === input.projectId && n.parentId === input.parentId,
    );
    await tx
      .update(pages)
      .set({
        parentId: input.parentId,
        projectId: input.projectId,
        sort: sortAt(siblings, input.index),
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(pages.id, input.id));
    // What hangs under a page goes with it to another project.
    const below = subtreeIds(nodes, input.id).filter((id) => id !== input.id);
    if (below.length)
      await tx.update(pages).set({ projectId: input.projectId }).where(inArray(pages.id, below));
  });
  publish(ctx.orgId, { type: "tree" });
}

/** To the trash, with everything under it, under one shared timestamp. */
export async function trashPage(ctx: OrgContext, id: string): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    await requireLivePage(tx, id);
    const ids = subtreeIds(await liveNodes(tx), id);
    await tx
      .update(pages)
      .set({ deletedAt: new Date(), updatedBy: ctx.userId })
      .where(inArray(pages.id, ids));
  });
  publish(ctx.orgId, { type: "tree" });
}

export type TrashedPage = { id: string; title: string; project: string; deletedAt: Date };

/** Only what a person threw away: not what went along with it. */
export async function listTrash(ctx: OrgContext): Promise<TrashedPage[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: pages.id,
        title: pages.title,
        project: projects.name,
        deletedAt: pages.deletedAt,
        parentDeletedAt: sql<string | null>`(
          select p.deleted_at::text from pages p where p.id = ${pages.parentId}
        )`,
        same: sql<boolean>`coalesce((
          select p.deleted_at = ${pages.deletedAt} from pages p where p.id = ${pages.parentId}
        ), false)`,
      })
      .from(pages)
      .innerJoin(projects, eq(projects.id, pages.projectId))
      .where(isNotNull(pages.deletedAt))
      .orderBy(desc(pages.deletedAt));
    return rows
      .filter((r) => !r.same)
      .map((r) => ({ id: r.id, title: r.title, project: r.project, deletedAt: r.deletedAt! }));
  });
}

/** Brings back what went out together; the page lands at the top if its parent is gone. */
export async function restorePage(ctx: OrgContext, id: string): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ deletedAt: pages.deletedAt, parentId: pages.parentId })
      .from(pages)
      .where(eq(pages.id, id));
    if (!row?.deletedAt) throw new Refused("notFound");
    const together = await tx
      .select({ id: pages.id, parentId: pages.parentId })
      .from(pages)
      .where(eq(pages.deletedAt, row.deletedAt));
    const ids = subtreeIds(together, id);
    await tx
      .update(pages)
      .set({ deletedAt: null, updatedBy: ctx.userId })
      .where(inArray(pages.id, ids));
    if (row.parentId) {
      const [parent] = await tx
        .select({ deletedAt: pages.deletedAt })
        .from(pages)
        .where(eq(pages.id, row.parentId));
      if (parent?.deletedAt) await tx.update(pages).set({ parentId: null }).where(eq(pages.id, id));
    }
  });
  publish(ctx.orgId, { type: "tree" });
}

/** The only way a page really goes: from the trash, by a person who asked. */
export async function purgePage(ctx: OrgContext, id: string): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .delete(pages)
      .where(and(eq(pages.id, id), isNotNull(pages.deletedAt)))
      .returning({ id: pages.id });
    if (!rows.length) throw new Refused("notFound");
  });
}

export type RecentPage = {
  id: string;
  title: string;
  icon: string;
  project: string;
  editedAt: Date;
  editedBy: string | null;
};

export async function recentPages(ctx: OrgContext, limit = 12): Promise<RecentPage[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: pages.id,
        title: pages.title,
        icon: pages.icon,
        project: projects.name,
        editedAt: pageDocuments.editedAt,
        editedBy: users.name,
      })
      .from(pageDocuments)
      .innerJoin(pages, eq(pages.id, pageDocuments.pageId))
      .innerJoin(projects, eq(projects.id, pages.projectId))
      .leftJoin(users, eq(users.id, pageDocuments.editedBy))
      .where(and(isNull(pages.deletedAt), isNull(projects.archivedAt)))
      .orderBy(desc(pageDocuments.editedAt))
      .limit(limit),
  );
}
