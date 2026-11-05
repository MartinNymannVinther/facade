import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  customType,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { domainId, users } from "./foundation";
import { tenant } from "./shared";

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/** A project: the top of a tree of pages, and a channel of its own. */
export const projects = pgTable(
  "projects",
  {
    id: domainId("id"),
    orgId: tenant(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    icon: text("icon").notNull().default(""),
    sort: doublePrecision("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_org_idx").on(t.orgId, t.sort)],
);

/**
 * A page: where it hangs in the tree and what it is called. What it says
 * lives in `page_documents` and `page_updates`, because the words change
 * with every keystroke and this row does not (docs/adr/0011).
 *
 * `deleted_at` is the trash. Children are trashed with their parent and
 * share its `deleted_at`, which is how restoring one brings back exactly
 * what went with it and nothing that was trashed on its own before.
 */
export const pages = pgTable(
  "pages",
  {
    id: domainId("id"),
    orgId: tenant(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    title: text("title").notNull().default(""),
    icon: text("icon").notNull().default(""),
    sort: doublePrecision("sort").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pages_tree_idx").on(t.orgId, t.projectId, t.parentId, t.sort),
    index("pages_recent_idx").on(t.orgId, t.updatedAt),
  ],
);

/**
 * The compacted document of a page: one Yjs state, its plain text, and the search vector over title and text.
 * Technical and high-churn, so it carries no audit trigger (docs/adr/0011).
 */
export const pageDocuments = pgTable(
  "page_documents",
  {
    pageId: text("page_id")
      .primaryKey()
      .references(() => pages.id, { onDelete: "cascade" }),
    orgId: tenant(),
    state: bytes("state"),
    text: text("text").notNull().default(""),
    search: tsvector("search").generatedAlwaysAs(sql`to_tsvector('danish'::regconfig, text)`),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    editedBy: text("edited_by").references(() => users.id, { onDelete: "set null" }),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_documents_search_idx").using("gin", t.search)],
);

/** Every edit since the last compaction, in order. Folded into the document. */
export const pageUpdates = pgTable(
  "page_updates",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    orgId: tenant(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    update: bytes("update").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_updates_page_idx").on(t.pageId, t.seq)],
);

/**
 * A page as it stood: taken at most every ten minutes while somebody
 * writes, and before anything is restored. This is the row the audit log
 * sees, so "who changed this page, and when" is answered at the grain a
 * person asks it.
 */
export const pageVersions = pgTable(
  "page_versions",
  {
    id: domainId("id"),
    orgId: tenant(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    state: bytes("state").notNull(),
    reason: text("reason").notNull().default("auto"), // auto | restore | ai
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_versions_page_idx").on(t.pageId, t.createdAt)],
);

/** A file in a page or a message: in Postgres, never on disk. */
export const files = pgTable(
  "files",
  {
    id: domainId("id"),
    orgId: tenant(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    bytes: bytes("bytes").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_org_idx").on(t.orgId, t.createdAt)],
);
