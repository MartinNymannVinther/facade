import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { Refused } from "@/core/action";
import {
  channels,
  files,
  memberships,
  messageReactions,
  messages,
  notifications,
  users,
} from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { publish, publishToUser } from "@/modules/live/hub";
import { mentionIds, REACTIONS, type MessageView } from "./view";

export const MAX_BODY = 8000;
const PAGE_SIZE = 60;

export const NewMessage = z
  .object({
    channelId: z.string().min(1).max(100),
    parentId: z.string().min(1).max(100).nullable().default(null),
    body: z.string().trim().max(MAX_BODY).default(""),
    fileIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  })
  .refine((m) => m.body.length > 0 || m.fileIds.length > 0);

export const Reaction = z.object({
  messageId: z.string().min(1).max(100),
  emoji: z.enum(REACTIONS),
});

const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function hydrate(
  tx: AppTransaction,
  rows: (typeof messages.$inferSelect)[],
): Promise<MessageView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authors = [...new Set(rows.flatMap((r) => (r.authorId ? [r.authorId] : [])))];
  const names = authors.length
    ? await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, authors))
    : [];
  const name = new Map(names.map((n) => [n.id, n.name]));
  const reactions = await tx
    .select()
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, ids))
    .orderBy(asc(messageReactions.createdAt));
  const replies = await tx
    .select({
      parentId: messages.parentId,
      count: sql<number>`count(*)::int`,
      last: sql<Date>`max(${messages.createdAt})`,
    })
    .from(messages)
    .where(and(inArray(messages.parentId, ids), isNull(messages.deletedAt)))
    .groupBy(messages.parentId);
  const replyOf = new Map(replies.map((r) => [r.parentId, r]));
  return rows.map((row) => {
    const grouped = new Map<string, string[]>();
    for (const r of reactions)
      if (r.messageId === row.id) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId]);
    const reply = replyOf.get(row.id);
    return {
      id: row.id,
      channelId: row.channelId,
      parentId: row.parentId,
      authorId: row.authorId,
      authorName: (row.authorId && name.get(row.authorId)) || "",
      body: row.deletedAt ? "" : row.body,
      attachments: row.deletedAt ? [] : row.attachments,
      reactions: [...grouped].map(([emoji, userIds]) => ({ emoji, userIds })),
      replyCount: reply?.count ?? 0,
      lastReplyAt: reply ? new Date(reply.last).toISOString() : null,
      editedAt: iso(row.editedAt),
      deleted: row.deletedAt !== null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** The newest top-level messages, oldest first; `before` pages further back. */
export async function listMessages(
  ctx: OrgContext,
  channelId: string,
  before?: string,
): Promise<{ messages: MessageView[]; more: boolean }> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.channelId, channelId),
          isNull(messages.parentId),
          before ? lt(messages.createdAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE).reverse();
    return { messages: await hydrate(tx, page), more: rows.length > PAGE_SIZE };
  });
}

export async function listThread(ctx: OrgContext, parentId: string): Promise<MessageView[]> {
  return withOrgContext(ctx, async (tx) => {
    const [parent] = await tx.select().from(messages).where(eq(messages.id, parentId));
    if (!parent) throw new Refused("notFound");
    const rows = await tx
      .select()
      .from(messages)
      .where(eq(messages.parentId, parentId))
      .orderBy(asc(messages.createdAt));
    return hydrate(tx, [parent, ...rows]);
  });
}

async function one(tx: AppTransaction, id: string): Promise<MessageView> {
  const [row] = await tx.select().from(messages).where(eq(messages.id, id));
  if (!row) throw new Refused("notFound");
  return (await hydrate(tx, [row]))[0]!;
}

/** Who is told about a message beyond the channel: named, or answered. */
async function recipients(
  tx: AppTransaction,
  ctx: OrgContext,
  body: string,
  parentAuthor: string | null,
  pageFollowers: string[],
) {
  const named = mentionIds(body);
  const wanted = new Map<string, "mention" | "reply">();
  for (const id of pageFollowers) wanted.set(id, "reply");
  if (parentAuthor) wanted.set(parentAuthor, "reply");
  for (const id of named) wanted.set(id, "mention");
  wanted.delete(ctx.userId);
  if (!wanted.size) return [];
  const members = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, ctx.orgId),
        inArray(memberships.userId, [...wanted.keys()]),
      ),
    );
  return members.map((m) => ({ userId: m.userId, kind: wanted.get(m.userId)! }));
}

export async function sendMessage(
  ctx: OrgContext,
  input: z.infer<typeof NewMessage>,
): Promise<MessageView> {
  const { view, told, parent } = await withOrgContext(ctx, async (tx) => {
    const [channel] = await tx
      .select()
      .from(channels)
      .where(and(eq(channels.id, input.channelId), isNull(channels.archivedAt)));
    if (!channel) throw new Refused("notFound");

    let parentRow: typeof messages.$inferSelect | undefined;
    if (input.parentId) {
      [parentRow] = await tx.select().from(messages).where(eq(messages.id, input.parentId));
      // One level deep, in the same channel: the id is the client's claim.
      if (!parentRow || parentRow.channelId !== channel.id || parentRow.parentId)
        throw new Refused("invalid");
    }
    const attachments = input.fileIds.length
      ? await tx
          .select({ id: files.id, name: files.name, mime: files.mime, size: files.size })
          .from(files)
          .where(inArray(files.id, input.fileIds))
      : [];
    if (attachments.length !== input.fileIds.length) throw new Refused("invalid");

    const [row] = await tx
      .insert(messages)
      .values({
        orgId: ctx.orgId,
        channelId: channel.id,
        parentId: input.parentId,
        authorId: ctx.userId,
        body: input.body,
        attachments,
      })
      .returning({ id: messages.id });

    // On a page, everybody who has spoken there hears the next word.
    const followers =
      channel.kind === "page"
        ? (
            await tx
              .selectDistinct({ id: messages.authorId })
              .from(messages)
              .where(eq(messages.channelId, channel.id))
          ).flatMap((f) => (f.id ? [f.id] : []))
        : [];
    const told = await recipients(tx, ctx, input.body, parentRow?.authorId ?? null, followers);
    if (told.length)
      await tx.insert(notifications).values(
        told.map((t) => ({
          orgId: ctx.orgId,
          userId: t.userId,
          kind: t.kind,
          actorId: ctx.userId,
          messageId: row!.id,
          channelId: channel.id,
          pageId: channel.pageId,
        })),
      );
    return {
      view: await one(tx, row!.id),
      told,
      parent: parentRow ? await one(tx, parentRow.id) : null,
    };
  });
  publish(ctx.orgId, { type: "message.new", message: view });
  if (parent) publish(ctx.orgId, { type: "message.changed", message: parent });
  for (const t of told) publishToUser(ctx.orgId, t.userId, { type: "inbox" });
  return view;
}

async function ownMessage(tx: AppTransaction, ctx: OrgContext, id: string) {
  const [row] = await tx.select().from(messages).where(eq(messages.id, id));
  if (!row || row.deletedAt) throw new Refused("notFound");
  if (row.authorId !== ctx.userId) throw new Refused("forbidden");
  return row;
}

export async function editMessage(ctx: OrgContext, id: string, body: string): Promise<void> {
  const view = await withOrgContext(ctx, async (tx) => {
    await ownMessage(tx, ctx, id);
    await tx.update(messages).set({ body, editedAt: new Date() }).where(eq(messages.id, id));
    return one(tx, id);
  });
  publish(ctx.orgId, { type: "message.changed", message: view });
}

/** The words go at once; the row stays so a thread under it hangs together. */
export async function deleteMessage(ctx: OrgContext, id: string): Promise<void> {
  const view = await withOrgContext(ctx, async (tx) => {
    await ownMessage(tx, ctx, id);
    await tx
      .update(messages)
      .set({ body: "", attachments: [], deletedAt: new Date() })
      .where(eq(messages.id, id));
    return one(tx, id);
  });
  publish(ctx.orgId, { type: "message.changed", message: view });
}

export async function toggleReaction(ctx: OrgContext, input: z.infer<typeof Reaction>) {
  const view = await withOrgContext(ctx, async (tx) => {
    const own = and(
      eq(messageReactions.messageId, input.messageId),
      eq(messageReactions.userId, ctx.userId),
      eq(messageReactions.emoji, input.emoji),
    );
    const removed = await tx
      .delete(messageReactions)
      .where(own)
      .returning({ id: messageReactions.messageId });
    if (!removed.length)
      await tx.insert(messageReactions).values({
        orgId: ctx.orgId,
        messageId: input.messageId,
        userId: ctx.userId,
        emoji: input.emoji,
      });
    return one(tx, input.messageId);
  });
  publish(ctx.orgId, { type: "message.changed", message: view });
}
