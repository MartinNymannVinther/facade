import { bigint, customType, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { messages } from "./conversation";
import { domainId, users } from "./foundation";
import { pages, projects } from "./projects";
import { tenant } from "./shared";

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * A file in a page or a message: in Postgres, never on disk.
 *
 * Where it was shared is written once, when it first lands somewhere: the
 * message it went out with, or the page it was placed on (docs/adr/0016).
 * A file uploaded and never sent has neither, and no project shows it.
 */
export const files = pgTable(
  "files",
  {
    id: domainId("id"),
    orgId: tenant(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    bytes: bytes("bytes").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("files_org_idx").on(t.orgId, t.createdAt),
    index("files_project_idx").on(t.projectId, t.createdAt),
  ],
);
