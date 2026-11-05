import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { Refused } from "@/core/action";
import { channels, projects } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { publish } from "@/modules/live/hub";

export const ProjectFields = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  icon: z.string().trim().max(16).default(""),
});

export type ProjectRow = typeof projects.$inferSelect;

/** Every project starts with a channel: the talk belongs next to the work. */
export async function createProject(
  ctx: OrgContext,
  input: z.infer<typeof ProjectFields>,
): Promise<{ id: string; channelId: string }> {
  const created = await withOrgContext(ctx, async (tx) => {
    const [top] = await tx.select({ sort: max(projects.sort) }).from(projects);
    const [project] = await tx
      .insert(projects)
      .values({ ...input, orgId: ctx.orgId, sort: (top?.sort ?? 0) + 1, createdBy: ctx.userId })
      .returning({ id: projects.id });
    const [channel] = await tx
      .insert(channels)
      .values({
        orgId: ctx.orgId,
        kind: "project",
        name: input.name,
        projectId: project!.id,
        createdBy: ctx.userId,
      })
      .returning({ id: channels.id });
    return { id: project!.id, channelId: channel!.id };
  });
  publish(ctx.orgId, { type: "tree" });
  return created;
}

export async function listProjects(ctx: OrgContext): Promise<ProjectRow[]> {
  return withOrgContext(ctx, (tx) =>
    tx.select().from(projects).where(isNull(projects.archivedAt)).orderBy(asc(projects.sort)),
  );
}

export async function listArchivedProjects(ctx: OrgContext): Promise<ProjectRow[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select()
      .from(projects)
      .where(sql`${projects.archivedAt} is not null`)
      .orderBy(asc(projects.name)),
  );
}

export async function getProject(ctx: OrgContext, id: string): Promise<ProjectRow | null> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx.select().from(projects).where(eq(projects.id, id)).limit(1);
    return row ?? null;
  });
}

export async function updateProject(
  ctx: OrgContext,
  id: string,
  fields: Partial<z.infer<typeof ProjectFields>>,
): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .update(projects)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    if (!rows.length) throw new Refused("notFound");
    if (fields.name)
      await tx
        .update(channels)
        .set({ name: fields.name })
        .where(and(eq(channels.projectId, id), eq(channels.kind, "project")));
  });
  publish(ctx.orgId, { type: "tree" });
}

/** Archiving hides a project and keeps every word of it. */
export async function setProjectArchived(
  ctx: OrgContext,
  id: string,
  archived: boolean,
): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    const when = archived ? new Date() : null;
    const rows = await tx
      .update(projects)
      .set({ archivedAt: when, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    if (!rows.length) throw new Refused("notFound");
    await tx
      .update(channels)
      .set({ archivedAt: when })
      .where(and(eq(channels.projectId, id), eq(channels.kind, "project")));
  });
  publish(ctx.orgId, { type: "tree" });
}
