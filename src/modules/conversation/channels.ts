import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { Refused } from "@/core/action";
import { channelReads, channels, pages } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { publish } from "@/modules/live/hub";

export const ChannelFields = z.object({
  name: z.string().trim().min(1).max(60),
  topic: z.string().trim().max(300).default(""),
});

export type ChannelView = {
  id: string;
  kind: string;
  name: string;
  topic: string;
  projectId: string | null;
  unread: number;
};

/** The channel every workspace has from the first visit. */
export async function ensureGeneralChannel(ctx: OrgContext, name: string): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    const [any] = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.kind, "workspace"))
      .limit(1);
    if (any) return;
    await tx
      .insert(channels)
      .values({ orgId: ctx.orgId, kind: "workspace", name, createdBy: ctx.userId })
      .onConflictDoNothing();
  });
}

/** Workspace and project channels with what this person has not read. */
export async function listChannels(ctx: OrgContext): Promise<ChannelView[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: channels.id,
        kind: channels.kind,
        name: channels.name,
        topic: channels.topic,
        projectId: channels.projectId,
        unread: sql<number>`(
          select count(*)::int from messages m
          where m.channel_id = ${channels.id}
            and m.parent_id is null
            and m.deleted_at is null
            and m.author_id is distinct from ${ctx.userId}
            and m.created_at > coalesce(${channelReads.lastReadAt}, 'epoch'::timestamptz)
        )`,
      })
      .from(channels)
      .leftJoin(
        channelReads,
        and(eq(channelReads.channelId, channels.id), eq(channelReads.userId, ctx.userId)),
      )
      .where(and(isNull(channels.archivedAt), sql`${channels.kind} <> 'page'`))
      .orderBy(asc(channels.kind), asc(channels.name));
    return rows.sort((a, b) => Number(a.kind === "project") - Number(b.kind === "project"));
  });
}

export async function getChannel(ctx: OrgContext, id: string) {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx.select().from(channels).where(eq(channels.id, id)).limit(1);
    return row ?? null;
  });
}

export async function createChannel(ctx: OrgContext, input: z.infer<typeof ChannelFields>) {
  const created = await withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .insert(channels)
      .values({ ...input, orgId: ctx.orgId, kind: "workspace", createdBy: ctx.userId })
      .onConflictDoNothing()
      .returning({ id: channels.id });
    if (!rows.length) throw new Refused("conflict");
    return rows[0]!;
  });
  publish(ctx.orgId, { type: "tree" });
  return created;
}

export async function updateChannel(
  ctx: OrgContext,
  id: string,
  fields: Partial<z.infer<typeof ChannelFields>>,
): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .update(channels)
      .set(fields)
      .where(eq(channels.id, id))
      .returning({ id: channels.id });
    if (!rows.length) throw new Refused("notFound");
  });
  publish(ctx.orgId, { type: "tree" });
}

export async function archiveChannel(ctx: OrgContext, id: string): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .update(channels)
      .set({ archivedAt: new Date() })
      .where(and(eq(channels.id, id), eq(channels.kind, "workspace")))
      .returning({ id: channels.id });
    if (!rows.length) throw new Refused("notFound");
  });
  publish(ctx.orgId, { type: "tree" });
}

/** A page's conversation exists from the first time somebody opens it. */
export async function pageChannelId(ctx: OrgContext, pageId: string): Promise<string> {
  return withOrgContext(ctx, async (tx) => {
    const [page] = await tx
      .select({ id: pages.id, projectId: pages.projectId, title: pages.title })
      .from(pages)
      .where(eq(pages.id, pageId));
    if (!page) throw new Refused("notFound");
    await tx
      .insert(channels)
      .values({
        orgId: ctx.orgId,
        kind: "page",
        name: "",
        projectId: page.projectId,
        pageId,
        createdBy: ctx.userId,
      })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.pageId, pageId));
    return row!.id;
  });
}

export async function markRead(ctx: OrgContext, channelId: string): Promise<void> {
  await withOrgContext(ctx, async (tx) => {
    // The database's clock, because that is the one messages are stamped by.
    const now = sql`now()`;
    await tx
      .insert(channelReads)
      .values({ orgId: ctx.orgId, channelId, userId: ctx.userId, lastReadAt: now })
      .onConflictDoUpdate({
        target: [channelReads.channelId, channelReads.userId],
        set: { lastReadAt: now },
      });
  });
}
