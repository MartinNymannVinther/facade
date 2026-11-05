import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { channels, messages, notifications, pages, users } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { publishToUser } from "@/modules/live/hub";

export type InboxItem = {
  id: string;
  kind: string;
  actor: string | null;
  excerpt: string;
  channelId: string | null;
  channelName: string | null;
  messageId: string | null;
  parentId: string | null;
  pageId: string | null;
  pageTitle: string | null;
  read: boolean;
  createdAt: Date;
};

export async function listInbox(ctx: OrgContext): Promise<InboxItem[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: notifications.id,
        kind: notifications.kind,
        actor: users.name,
        excerpt: messages.body,
        channelId: notifications.channelId,
        channelName: channels.name,
        messageId: notifications.messageId,
        parentId: messages.parentId,
        pageId: notifications.pageId,
        pageTitle: pages.title,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .leftJoin(messages, eq(messages.id, notifications.messageId))
      .leftJoin(channels, eq(channels.id, notifications.channelId))
      .leftJoin(pages, eq(pages.id, notifications.pageId))
      .where(eq(notifications.userId, ctx.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    return rows.map(({ readAt, excerpt, ...row }) => ({
      ...row,
      excerpt: excerpt ?? "",
      read: readAt !== null,
    }));
  });
}

export async function unreadInbox(ctx: OrgContext): Promise<number> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)));
    return row?.count ?? 0;
  });
}

export async function markInboxRead(ctx: OrgContext, id?: string): Promise<void> {
  await withOrgContext(ctx, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt),
          id ? eq(notifications.id, id) : undefined,
        ),
      ),
  );
  publishToUser(ctx.orgId, ctx.userId, { type: "inbox" });
}
