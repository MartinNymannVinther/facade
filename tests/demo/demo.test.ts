import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  cleanupExpiredDemos,
  createDemoWorkspace,
  demoLandingUrl,
  isDemoWorkspace,
} from "@/modules/demo/service";
import { createAgent } from "@/modules/agents/service";
import { storeFile } from "@/modules/files/service";
import { colleagueOnPage } from "@/modules/demo/colleague";
import type { LiveEvent } from "@/modules/live/events";
import { dropConnection, openConnection, watchPage } from "@/modules/live/hub";
import { textOf } from "@/modules/pages/document";
import { createPage } from "@/modules/pages/service";
import { loadJson } from "@/modules/pages/sync";
import { createProject } from "@/modules/projects/service";
import { seedWorkspace } from "../helpers/workspace";
import { adminPool } from "../helpers/db";

/**
 * The demo, built through the ordinary sign-up path: a real workspace, a
 * throwaway account, and a date it stops existing. The suite runs with
 * DEMO=on (see the test environment); the shipped default is off and
 * proven in tests/core/env. A demo opens on a seeded portfolio, written
 * through the ordinary services (src/modules/demo/seed.ts).
 */

let admin: Pool;
let orgId: string;
let userId: string;

beforeAll(async () => {
  admin = adminPool();
});

afterAll(async () => {
  await admin.end();
});

describe("a demo workspace", () => {
  it("is created with a signed-in guest, a portfolio in it, and lands on the overview", async () => {
    const demo = await createDemoWorkspace("da");
    expect(demo).not.toBeNull();
    expect(demo!.headers.get("cookie")).toMatch(/better-auth/);
    const row = await admin.query(
      `select organization_id, user_id from demo_workspaces order by created_at desc limit 1`,
    );
    orgId = row.rows[0].organization_id;
    userId = row.rows[0].user_id;
    expect(await isDemoWorkspace(orgId)).toBe(true);
    expect(demoLandingUrl("da").pathname).toBe("/home");
    expect(demoLandingUrl("en").pathname).toBe("/en/home");
    const seeded = await admin.query(
      `select (select count(*)::int from projects where org_id = $1) as projects,
              (select count(*)::int from pages where org_id = $1) as pages,
              (select count(*)::int from messages where org_id = $1) as messages`,
      [orgId],
    );
    expect(seeded.rows[0]).toEqual({ projects: 1, pages: 3, messages: 6 });
    const people = await admin.query(
      `select count(*)::int as n from memberships where organization_id = $1`,
      [orgId],
    );
    expect(people.rows[0].n).toBe(3);
    const inbox = await admin.query(
      `select count(*)::int as n from notifications where org_id = $1 and user_id = $2`,
      [orgId, userId],
    );
    expect(inbox.rows[0].n).toBeGreaterThan(0);
    const plan = await admin.query(
      `select d.text from page_documents d join pages p on p.id = d.page_id
       where p.org_id = $1 and p.parent_id is null`,
      [orgId],
    );
    expect(plan.rows[0].text).toContain("120");
  });

  it("has a colleague write once on the plan, with a cursor, and nowhere else", async () => {
    const ctx = { orgId, userId };
    const pace = { startMs: 0, stepMs: 0, endMs: 0 };
    const events: LiveEvent[] = [];
    const stream = openConnection(
      orgId,
      userId,
      (e) => events.push(e),
      () => {},
    );
    const { rows } = await admin.query(
      `select id, title from pages where org_id = $1 and parent_id is null`,
      [orgId],
    );
    const plan = rows[0].id as string;
    watchPage(stream, plan);

    await colleagueOnPage(ctx, plan, pace);
    await colleagueOnPage(ctx, plan, pace);
    const said = textOf(await loadJson(ctx, plan));
    expect(said.match(/Jeg tager teltet/g)).toHaveLength(1);
    expect(said).toContain("lørdag morgen.");
    expect(events.some((e) => e.type === "doc.awareness")).toBe(true);
    expect(events.filter((e) => e.type === "doc.update").length).toBeGreaterThan(10);
    dropConnection(stream.id);

    const { rows: under } = await admin.query(
      `select id from pages where org_id = $1 and parent_id is not null limit 1`,
      [orgId],
    );
    await colleagueOnPage(ctx, under[0].id, pace);
    expect(textOf(await loadJson(ctx, under[0].id))).not.toContain("Jeg tager teltet");
  });

  it("leaves a real workspace alone, even a page called the same", async () => {
    const real = await seedWorkspace(admin, "not_a_demo");
    const { id: projectId } = await createProject(real, { name: "P", description: "", icon: "" });
    const page = await createPage(real, { projectId, parentId: null, title: "Planen" });
    await colleagueOnPage(real, page.id, { startMs: 0, stepMs: 0, endMs: 0 });
    expect(textOf(await loadJson(real, page.id))).toBe("");
  });

  it("keeps a demo to 10 MB of files and away from agent keys", async () => {
    const ctx = { orgId, userId };
    await storeFile(ctx, { name: "a", mime: "image/png", bytes: Buffer.alloc(9 * 1024 * 1024) });
    await expect(
      storeFile(ctx, { name: "b", mime: "image/png", bytes: Buffer.alloc(2 * 1024 * 1024) }),
    ).rejects.toThrow("conflict");
    await expect(createAgent(ctx, { name: "Nej", access: "read" })).rejects.toThrow("forbidden");
  });

  it("is deleted whole when its time is up, guest account included", async () => {
    await admin.query(
      `update demo_workspaces set expires_at = now() - interval '1 minute' where organization_id = $1`,
      [orgId],
    );
    expect(await cleanupExpiredDemos()).toBe(1);
    const org = await admin.query(`select 1 from organizations where id = $1`, [orgId]);
    const user = await admin.query(`select 1 from users where id = $1`, [userId]);
    const rows = await admin.query(`select 1 from projects where org_id = $1`, [orgId]);
    expect([org.rowCount, user.rowCount, rows.rowCount]).toEqual([0, 0, 0]);
    const colleagues = await admin.query(
      `select 1 from users u where u.email like '%.facade.invalid'
         and not exists (select 1 from memberships m where m.user_id = u.id)`,
    );
    expect(colleagues.rowCount).toBe(0);
  });
});
