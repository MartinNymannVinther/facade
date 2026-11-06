import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { domainId, users } from "./foundation";
import { tenant } from "./shared";

/**
 * The key an agent comes in with. The agent itself is a user with no way to
 * log in and the role `agent` (docs/adr/0015); only the hash of the key is
 * kept, and the key is shown once.
 */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: domainId("id"),
    orgId: tenant(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    access: text("access").notNull().default("read"), // read | write
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_tokens_hash_uq").on(t.tokenHash),
    index("agent_tokens_org_idx").on(t.orgId),
  ],
);
