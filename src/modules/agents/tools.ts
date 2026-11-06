import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { channels } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { listChannels } from "@/modules/conversation/channels";
import { pageChannelId } from "@/modules/conversation/channels";
import { listInbox } from "@/modules/conversation/inbox";
import { listMessages, listThread, MAX_BODY, sendMessage } from "@/modules/conversation/messages";
import { encodeMentions, plainMentions, type MessageView } from "@/modules/conversation/view";
import { listMembers } from "@/modules/export/workspace";
import { jsonToMarkdown } from "@/modules/pages/document";
import { createPage, getPage, listTree, updatePage } from "@/modules/pages/service";
import { loadJson } from "@/modules/pages/sync";
import { writeMarkdown } from "@/modules/pages/write";
import { listProjects } from "@/modules/projects/service";
import { search } from "@/modules/search/service";
import { Refused } from "@/core/action";
import type { AgentContext } from "./service";

/**
 * What an agent can do, as a fixed list. There is no tool to delete, invite,
 * export or change a setting, so no key can do those things however it is
 * asked to (docs/adr/0015). A tool's input is checked like any other request.
 */

const Id = z.string().min(1).max(100);
const Markdown = z.string().max(200_000);

type Tool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  input: S;
  writes?: boolean;
  run: (ctx: AgentContext, input: z.infer<S>) => Promise<string>;
};

const tool = <S extends z.ZodObject>(t: Tool<S>) => t as unknown as Tool;

function said(messages: MessageView[]): string {
  if (!messages.length) return "(no messages)";
  return messages
    .map((m) => {
      const replies = m.replyCount ? ` [${m.replyCount} replies]` : "";
      const words = m.deleted ? "(deleted)" : plainMentions(m.body);
      return `[${m.id}] ${m.createdAt} ${m.authorName}${replies}: ${words}`;
    })
    .join("\n");
}

async function encoded(ctx: AgentContext, body: string): Promise<string> {
  const people = await listMembers(ctx);
  return encodeMentions(
    body,
    people.map((p) => ({ id: p.userId, name: p.name })),
  );
}

export const TOOLS: Tool[] = [
  tool({
    name: "list_projects",
    description: "The workspace's projects, with their ids and channel ids.",
    input: z.object({}),
    run: async (ctx) => {
      const [projects, list] = await Promise.all([listProjects(ctx), listChannels(ctx)]);
      return JSON.stringify(
        projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          channel_id: list.find((c) => c.projectId === p.id)?.id ?? null,
        })),
        null,
        1,
      );
    },
  }),
  tool({
    name: "list_pages",
    description: "The tree of pages, indented, as `id  title`. Optionally one project only.",
    input: z.object({ project_id: Id.optional() }),
    run: async (ctx, { project_id }) => {
      const tree = await listTree(ctx);
      const lines: string[] = [];
      const walk = (projectId: string, parentId: string | null, depth: number) => {
        for (const node of tree
          .filter((n) => n.projectId === projectId && n.parentId === parentId)
          .sort((a, b) => a.sort - b.sort)) {
          lines.push(`${"  ".repeat(depth)}${node.id}  ${node.title || "(untitled)"}`);
          walk(projectId, node.id, depth + 1);
        }
      };
      for (const project of await listProjects(ctx)) {
        if (project_id && project.id !== project_id) continue;
        lines.push(`# ${project.name} (${project.id})`);
        walk(project.id, null, 0);
      }
      return lines.join("\n") || "(no pages)";
    },
  }),
  tool({
    name: "read_page",
    description: "One page as Markdown, with its title and subpages.",
    input: z.object({ page_id: Id }),
    run: async (ctx, { page_id }) => {
      const page = await getPage(ctx, page_id);
      if (!page) throw new Refused("notFound");
      const below = (await listTree(ctx)).filter((n) => n.parentId === page_id);
      const subpages = below.length
        ? `\n\n---\nSubpages:\n${below.map((n) => `${n.id}  ${n.title}`).join("\n")}`
        : "";
      return `# ${page.title}\n\n${jsonToMarkdown(await loadJson(ctx, page_id))}${subpages}`;
    },
  }),
  tool({
    name: "search",
    description: "Searches every page and message in the workspace. Matches word beginnings.",
    input: z.object({ query: z.string().min(1).max(200) }),
    run: async (ctx, { query }) => JSON.stringify(await search(ctx, query), null, 1),
  }),
  tool({
    name: "list_channels",
    description: "The workspace's channels, with ids.",
    input: z.object({}),
    run: async (ctx) =>
      (await listChannels(ctx)).map((c) => `${c.id}  #${c.name}  ${c.topic}`).join("\n"),
  }),
  tool({
    name: "read_channel",
    description:
      "A channel's latest top-level messages, oldest first. Pass `before` (a timestamp) to go back.",
    input: z.object({ channel_id: Id, before: z.iso.datetime().optional() }),
    run: async (ctx, { channel_id, before }) => {
      const { messages, more } = await listMessages(ctx, channel_id, before);
      return `${said(messages)}${more ? "\n(older messages exist)" : ""}`;
    },
  }),
  tool({
    name: "read_thread",
    description: "A message and every reply to it.",
    input: z.object({ message_id: Id }),
    run: async (ctx, { message_id }) => said(await listThread(ctx, message_id)),
  }),
  tool({
    name: "read_page_conversation",
    description: "The comments beside a page.",
    input: z.object({ page_id: Id }),
    run: async (ctx, { page_id }) => {
      const [row] = await withOrgContext(ctx, (tx) =>
        tx
          .select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.pageId, page_id), inArray(channels.kind, ["page"])))
          .orderBy(asc(channels.createdAt)),
      );
      return row ? said((await listMessages(ctx, row.id)).messages) : "(no comments)";
    },
  }),
  tool({
    name: "read_inbox",
    description: "Where somebody mentioned or answered you, newest first.",
    input: z.object({}),
    run: async (ctx) =>
      JSON.stringify(
        (await listInbox(ctx)).map((i) => ({ ...i, excerpt: plainMentions(i.excerpt) })),
        null,
        1,
      ),
  }),
  tool({
    name: "list_people",
    description: "Who is in the workspace. Write @Name in a message to mention somebody.",
    input: z.object({}),
    run: async (ctx) =>
      (await listMembers(ctx))
        .filter((m) => m.role !== "former_agent")
        .map((m) => `${m.name} (${m.role})`)
        .join("\n"),
  }),
  tool({
    name: "create_page",
    description: "Creates a page in a project, optionally under another page. Body is Markdown.",
    writes: true,
    input: z.object({
      project_id: Id,
      parent_id: Id.optional(),
      title: z.string().min(1).max(300),
      markdown: Markdown.default(""),
    }),
    run: async (ctx, { project_id, parent_id, title, markdown }) => {
      const { id } = await createPage(ctx, {
        projectId: project_id,
        parentId: parent_id ?? null,
        title,
        markdown: markdown || undefined,
      });
      return `Created page ${id}`;
    },
  }),
  tool({
    name: "append_to_page",
    description:
      "Adds Markdown at the end of a page. Prefer this: it cannot touch what colleagues wrote.",
    writes: true,
    input: z.object({ page_id: Id, markdown: Markdown.min(1) }),
    run: async (ctx, { page_id, markdown }) => {
      await writeMarkdown(ctx, page_id, "append", markdown);
      return "Added. A version from before the change is in the page's history.";
    },
  }),
  tool({
    name: "replace_page",
    description:
      "Replaces a whole page's content with Markdown. Read it first, and change only what was asked; people may be writing on it. The page's history keeps the version before.",
    writes: true,
    input: z.object({ page_id: Id, markdown: Markdown.min(1) }),
    run: async (ctx, { page_id, markdown }) => {
      await writeMarkdown(ctx, page_id, "replace", markdown);
      return "Replaced. A version from before the change is in the page's history.";
    },
  }),
  tool({
    name: "rename_page",
    description: "Changes a page's title.",
    writes: true,
    input: z.object({ page_id: Id, title: z.string().min(1).max(300) }),
    run: async (ctx, { page_id, title }) => {
      await updatePage(ctx, page_id, { title });
      return "Renamed.";
    },
  }),
  tool({
    name: "send_message",
    description: "Writes in a channel, or in a thread with `parent_id`. @Name mentions somebody.",
    writes: true,
    input: z.object({
      channel_id: Id,
      body: z.string().min(1).max(MAX_BODY),
      parent_id: Id.optional(),
    }),
    run: async (ctx, { channel_id, body, parent_id }) => {
      const sent = await sendMessage(ctx, {
        channelId: channel_id,
        parentId: parent_id ?? null,
        body: await encoded(ctx, body),
        fileIds: [],
      });
      return `Sent message ${sent.id}`;
    },
  }),
  tool({
    name: "comment_on_page",
    description: "Writes in the conversation beside a page. @Name mentions somebody.",
    writes: true,
    input: z.object({
      page_id: Id,
      body: z.string().min(1).max(MAX_BODY),
      parent_id: Id.optional(),
    }),
    run: async (ctx, { page_id, body, parent_id }) => {
      const sent = await sendMessage(ctx, {
        channelId: await pageChannelId(ctx, page_id),
        parentId: parent_id ?? null,
        body: await encoded(ctx, body),
        fileIds: [],
      });
      return `Sent comment ${sent.id}`;
    },
  }),
];
