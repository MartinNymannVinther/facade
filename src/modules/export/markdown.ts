import { strToU8, zipSync, type Zippable } from "fflate";
import { asc, eq, isNull } from "drizzle-orm";
import { channels, files, messages, pages, projects, users } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { plainMentions } from "@/modules/conversation/view";
import { jsonToMarkdown } from "@/modules/pages/document";
import { loadJson } from "@/modules/pages/sync";

/**
 * The workspace as files a person can open anywhere: a folder per project,
 * a Markdown file per page, nested the way the pages are, channels as
 * plain text and every uploaded file beside them. Links to files are
 * rewritten so the pages still show their pictures once unzipped.
 */

function safe(name: string, fallback: string): string {
  const clean = name
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/^[\s.]+/, "")
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

function unique(taken: Set<string>, wanted: string): string {
  let name = wanted;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${wanted} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

/** One page that cannot be read must not cost the way out for all the others. */
async function pageMarkdown(ctx: OrgContext, id: string): Promise<string> {
  try {
    return jsonToMarkdown(await loadJson(ctx, id));
  } catch (error) {
    console.error("export: page could not be read", id, error);
    return "";
  }
}

export async function exportMarkdownZip(ctx: OrgContext): Promise<Uint8Array> {
  const data = await withOrgContext(ctx, async (tx) => ({
    projects: await tx.select().from(projects).orderBy(asc(projects.sort)),
    pages: await tx
      .select({
        id: pages.id,
        projectId: pages.projectId,
        parentId: pages.parentId,
        title: pages.title,
      })
      .from(pages)
      .where(isNull(pages.deletedAt))
      .orderBy(asc(pages.sort)),
    channels: await tx.select().from(channels),
    messages: await tx
      .select({
        channelId: messages.channelId,
        parentId: messages.parentId,
        body: messages.body,
        author: users.name,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(isNull(messages.deletedAt))
      .orderBy(asc(messages.createdAt)),
    files: await tx.select().from(files),
  }));

  const zip: Zippable = {};
  const fileName = new Map<string, string>();
  const fileNames = new Set<string>();
  for (const file of data.files) {
    const name = unique(fileNames, safe(file.name, file.id));
    fileName.set(file.id, name);
    // Stored as they are: images do not shrink, and deflating them is what
    // would hold the one process up.
    zip[`filer/${name}`] = [new Uint8Array(file.bytes), { level: 0 }];
  }

  const relink = (markdown: string, depth: number) =>
    markdown.replace(/\/api\/files\/([\w-]+)/g, (whole, id: string) => {
      const name = fileName.get(id);
      return name ? `${"../".repeat(depth)}filer/${encodeURI(name)}` : whole;
    });

  const projectNames = new Set<string>();
  for (const project of data.projects) {
    const root = unique(projectNames, safe(project.name, project.id));
    const walk = async (parentId: string | null, folder: string, depth: number) => {
      const taken = new Set<string>();
      const level = data.pages.filter((p) => p.projectId === project.id && p.parentId === parentId);
      for (const page of level) {
        const name = unique(taken, safe(page.title, "Uden titel"));
        const body = await pageMarkdown(ctx, page.id);
        zip[`${folder}/${name}.md`] = strToU8(`# ${page.title}\n\n${relink(body, depth)}\n`);
        await walk(page.id, `${folder}/${name}`, depth + 1);
      }
    };
    await walk(null, root, 1);
  }

  const channelNames = new Set<string>();
  for (const channel of data.channels) {
    const said = data.messages.filter((m) => m.channelId === channel.id);
    if (!said.length) continue;
    const page = data.pages.find((p) => p.id === channel.pageId);
    const label = channel.kind === "page" ? `side - ${page?.title ?? channel.id}` : channel.name;
    const lines = said.map(
      (m) =>
        `${m.parentId ? "  ↳ " : ""}[${m.createdAt.toISOString()}] ${m.author ?? "?"}: ${plainMentions(m.body)}`,
    );
    zip[`kanaler/${unique(channelNames, safe(label, channel.id))}.txt`] = strToU8(
      `${lines.join("\n")}\n`,
    );
  }

  return zipSync(zip, { level: 6 });
}
