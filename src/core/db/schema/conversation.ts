import { sql } from "drizzle-orm";
import {
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { domainId, users } from "./foundation";
import { tenant } from "./shared";
import { pages, projects } from "./projects";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * Where people talk. A channel belongs to the workspace, to a project, or
 * to one page (the conversation beside it); all three are the same thing
 * underneath, so a comment on a page is an ordinary message. Everybody in
 * the workspace can read every channel (docs/adr/0013).
 */
export const channels = pgTable(
  "channels",
  {
    id: domainId("id"),
    orgId: tenant(),
    kind: text("kind").notNull().default("workspace"), // workspace | project | page
    name: text("name").notNull().default(""),
    topic: text("topic").notNull().default(""),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("channels_org_idx").on(t.orgId, t.kind),
    uniqueIndex("channels_workspace_name_uq")
      .on(t.orgId, t.name)
      .where(sql`kind = 'workspace'`),
    uniqueIndex("channels_project_uq")
      .on(t.projectId)
      .where(sql`kind = 'project'`),
    uniqueIndex("channels_page_uq").on(t.pageId),
  ],
);

/**
 * One message. `parent_id` makes it a reply: threads are one level deep.
 * A deleted message keeps its row and loses its words, so a thread under
 * it still hangs together.
 */
export const messages = pgTable(
  "messages",
  {
    id: domainId("id"),
    orgId: tenant(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull().default(""),
    attachments: jsonb("attachments")
      .$type<{ id: string; name: string; mime: string; size: number }[]>()
      .notNull()
      .default([]),
    search: tsvector("search").generatedAlwaysAs(sql`to_tsvector('danish'::regconfig, body)`),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_channel_idx").on(t.channelId, t.createdAt),
    index("messages_parent_idx").on(t.parentId, t.createdAt),
    index("messages_search_idx").using("gin", t.search),
  ],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    orgId: tenant(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/** How far one person has read in one channel. */
export const channelReads = pgTable(
  "channel_reads",
  {
    orgId: tenant(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

/**
 * The inbox: somebody named you, or answered you. One row per person per
 * thing. Only the person it is for can see it (docs/adr/0013).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: domainId("id"),
    orgId: tenant(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // mention | reply | page_mention
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
    channelId: text("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.orgId, t.userId, t.createdAt),
    uniqueIndex("notifications_page_mention_uq")
      .on(t.userId, t.pageId, t.actorId)
      .where(sql`kind = 'page_mention' and read_at is null`),
  ],
);
