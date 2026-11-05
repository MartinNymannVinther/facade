import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

/**
 * Workspace A cannot reach workspace B, table by table, in raw SQL as the
 * application role: exactly what any application bug would be able to do.
 */

const TABLES = [
  "projects",
  "pages",
  "page_documents",
  "page_updates",
  "page_versions",
  "files",
  "channels",
  "messages",
  "message_reactions",
  "channel_reads",
  "notifications",
];

/** ADR 0011: technical and high-churn, so no row trigger. Everything else has one. */
const UNAUDITED = [
  "channel_reads",
  "message_reactions",
  "notifications",
  "page_documents",
  "page_updates",
];

let admin: Pool;
let app: Client;
const A = { orgId: "org_iso_a", userId: "user_iso_a" };
const B = { orgId: "org_iso_b", userId: "user_iso_b" };

async function seed(key: string, orgId: string, userId: string) {
  await admin.query(`insert into projects (id, org_id, name) values ($1, $2, 'P')`, [
    `proj_${key}`,
    orgId,
  ]);
  await admin.query(`insert into pages (id, org_id, project_id) values ($1, $2, $3)`, [
    `page_${key}`,
    orgId,
    `proj_${key}`,
  ]);
  await admin.query(`insert into page_documents (page_id, org_id, text) values ($1, $2, 'x')`, [
    `page_${key}`,
    orgId,
  ]);
  await admin.query(
    `insert into page_updates (org_id, page_id, update) values ($1, $2, '\\x00'::bytea)`,
    [orgId, `page_${key}`],
  );
  await admin.query(
    `insert into page_versions (org_id, page_id, state) values ($1, $2, '\\x00'::bytea)`,
    [orgId, `page_${key}`],
  );
  await admin.query(
    `insert into files (org_id, name, mime, size, bytes) values ($1, 'f', 'text/plain', 1, '\\x00'::bytea)`,
    [orgId],
  );
  await admin.query(`insert into channels (id, org_id, name) values ($1, $2, 'c')`, [
    `chan_${key}`,
    orgId,
  ]);
  await admin.query(
    `insert into messages (id, org_id, channel_id, author_id, body) values ($1, $2, $3, $4, 'hej')`,
    [`msg_${key}`, orgId, `chan_${key}`, userId],
  );
  await admin.query(
    `insert into message_reactions (org_id, message_id, user_id, emoji) values ($1, $2, $3, '👍')`,
    [orgId, `msg_${key}`, userId],
  );
  await admin.query(`insert into channel_reads (org_id, channel_id, user_id) values ($1, $2, $3)`, [
    orgId,
    `chan_${key}`,
    userId,
  ]);
  await admin.query(
    `insert into notifications (org_id, user_id, kind) values ($1, $2, 'mention')`,
    [orgId, userId],
  );
}

/** A write the policies must stop, proven by its SQLSTATE: never by silence. */
async function refused(query: (c: Client) => Promise<unknown>) {
  const code = await asApp(app, A, (c) => expectSqlError(query(c)));
  expect(code).toBe("42501");
}

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  await seedWorkspace(admin, "iso_a");
  await seedWorkspace(admin, "iso_b");
  await seed("a", A.orgId, A.userId);
  await seed("b", B.orgId, B.userId);
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("product tables", () => {
  it.each(TABLES)("%s shows a workspace only its own rows", async (table) => {
    const orgs = await asApp(app, A, (c) => c.query(`select distinct org_id from "${table}"`));
    expect(orgs.rows).toEqual([{ org_id: A.orgId }]);
  });

  it.each(TABLES)("%s shows nothing without a context", async (table) => {
    const rows = await asApp(app, null, (c) => c.query(`select 1 from "${table}"`));
    expect(rows.rowCount).toBe(0);
  });

  it.each(TABLES)("%s cannot be emptied across the line", async (table) => {
    const done = await asApp(app, A, (c) =>
      c.query(`delete from "${table}" where org_id = $1`, [B.orgId]),
    );
    expect(done.rowCount).toBe(0);
  });

  it("refuses a row in another workspace's name", async () => {
    await refused((c) =>
      c.query(`insert into projects (org_id, name) values ($1, 'smuglet')`, [B.orgId]),
    );
  });

  it("refuses a page that points into another workspace", async () => {
    await refused((c) =>
      c.query(`insert into pages (org_id, project_id) values ($1, 'proj_b')`, [A.orgId]),
    );
    await refused((c) =>
      c.query(`insert into pages (org_id, project_id, parent_id) values ($1, 'proj_a', 'page_b')`, [
        A.orgId,
      ]),
    );
  });

  it("refuses an edit, a message or a reply aimed at another workspace", async () => {
    await refused((c) =>
      c.query(`insert into page_updates (org_id, page_id, update) values ($1, 'page_b', '\\x00')`, [
        A.orgId,
      ]),
    );
    await refused((c) =>
      c.query(`insert into messages (org_id, channel_id) values ($1, 'chan_b')`, [A.orgId]),
    );
    await refused((c) =>
      c.query(
        `insert into messages (org_id, channel_id, parent_id) values ($1, 'chan_a', 'msg_b')`,
        [A.orgId],
      ),
    );
  });

  it("keeps the inbox and the read marks one person's, inside a workspace too", async () => {
    const other = await seedMember(admin, A.orgId, "iso_a2");
    const inbox = await asApp(app, other, (c) => c.query(`select 1 from notifications`));
    expect(inbox.rowCount).toBe(0);
    const reads = await asApp(app, other, (c) => c.query(`select 1 from channel_reads`));
    expect(reads.rowCount).toBe(0);
    const reacted = await asApp(app, other, (c) =>
      c.query(`delete from message_reactions where message_id = 'msg_a'`),
    );
    expect(reacted.rowCount).toBe(0);
  });

  it("will not put a notification in the box of somebody outside the workspace", async () => {
    await refused((c) =>
      c.query(
        `insert into notifications (org_id, user_id, actor_id, kind) values ($1, $2, $3, 'mention')`,
        [A.orgId, B.userId, A.userId],
      ),
    );
  });

  it("audits exactly the tables ADR 0011 says it does", async () => {
    const rows = await admin.query(
      `select distinct c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where t.tgname like 'audit\\_%' and c.relname = any($1)`,
      [TABLES],
    );
    const audited = rows.rows.map((r) => r.relname as string).sort();
    expect(audited).toEqual(TABLES.filter((t) => !UNAUDITED.includes(t)).sort());
  });

  it("keeps words and bytes out of the audit log", async () => {
    const rows = await admin.query(
      `select after_data from audit_log where entity_type in ('messages', 'files', 'page_versions')
         and org_id = $1`,
      [A.orgId],
    );
    expect(rows.rowCount).toBeGreaterThan(0);
    for (const row of rows.rows) {
      expect(row.after_data).not.toHaveProperty("body");
      expect(row.after_data).not.toHaveProperty("bytes");
      expect(row.after_data).not.toHaveProperty("state");
      expect(row.after_data).not.toHaveProperty("search");
    }
  });
});
