import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import "dotenv/config";
import { Pool } from "pg";
import { createPage } from "../src/modules/pages/service";
import { createProject } from "../src/modules/projects/service";

/**
 * A folder of Markdown into a project, the way the export writes it: a file
 * is a page, a folder beside it (or a bare folder) is what hangs under it.
 * Goes through the ordinary services as a member of the workspace, so the
 * pages land with RLS, audit and search like any other.
 *
 *   pnpm script scripts/import-markdown.ts <folder> <owner-email> "<project>" ["<workspace>"]
 *
 * The workspace can be left out when the person is in only one.
 */

type Ctx = { orgId: string; userId: string };

async function resolve(email: string, workspace?: string): Promise<Ctx> {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
  const { rows } = await pool.query<Ctx & { name: string }>(
    `select m.organization_id as "orgId", m.user_id as "userId", o.name
    from memberships m
    join users u on u.id = m.user_id
    join organizations o on o.id = m.organization_id
     where lower(u.email) = lower($1)`,
    [email],
  );
  await pool.end();
  const found = rows.filter((r) => !workspace || r.name === workspace);
  if (found.length !== 1)
    throw new Error(
      found.length
        ? `${email} is in several workspaces; name one: ${found.map((r) => r.name).join(", ")}`
        : `no workspace for ${email}`,
    );
  return { orgId: found[0]!.orgId, userId: found[0]!.userId };
}

/** "02 Spilmotor.md" sorts second and is called "Spilmotor". */
function titleOf(name: string): string {
  return name.replace(/\.md$/i, "").replace(/^\d+[\s._-]+/, "");
}

/** A first "# Heading" that repeats the title would show it twice. */
function withoutTitle(markdown: string, title: string): string {
  const first = markdown.match(/^#\s+(.+)\n+/);
  return first && first[1]!.trim() === title ? markdown.slice(first[0].length) : markdown;
}

async function importFolder(
  ctx: Ctx,
  folder: string,
  projectId: string,
  parentId: string | null,
): Promise<number> {
  let count = 0;
  const entries = readdirSync(folder)
    .filter((name) => !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b, "da", { numeric: true }));
  const folders = new Set(entries.filter((n) => statSync(path.join(folder, n)).isDirectory()));
  for (const name of entries.filter((n) => n.toLowerCase().endsWith(".md"))) {
    const title = titleOf(name);
    const markdown = withoutTitle(readFileSync(path.join(folder, name), "utf8"), title);
    const page = await createPage(ctx, { projectId, parentId, title, markdown });
    count += 1;
    const under = name.replace(/\.md$/i, "");
    if (folders.delete(under))
      count += await importFolder(ctx, path.join(folder, under), projectId, page.id);
  }
  for (const name of folders) {
    const page = await createPage(ctx, { projectId, parentId, title: titleOf(name) });
    count += 1 + (await importFolder(ctx, path.join(folder, name), projectId, page.id));
  }
  return count;
}

async function main() {
  const [folder, email, project, workspace] = process.argv.slice(2);
  if (!folder || !email || !project) {
    console.error('usage: import-markdown.ts <folder> <email> "<project>" ["<workspace>"]');
    process.exit(1);
  }
  const ctx = await resolve(email, workspace);
  const { id } = await createProject(ctx, { name: project, description: "", icon: "" });
  const count = await importFolder(ctx, folder, id, null);
  console.log(`import-markdown: ${count} pages into "${project}"`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`import-markdown: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
