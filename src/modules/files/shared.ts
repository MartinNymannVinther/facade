import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { files, messages, pages, users } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { INLINE_MIMES } from "./service";

export type FileKind = "all" | "images" | "other";

export type SharedFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  author: string | null;
  /** The page it is on, or the page whose conversation it was sent in. */
  page: { id: string; title: string } | null;
  /** The message it went out with. */
  message: { id: string; channelId: string; parentId: string | null } | null;
};

const LIMIT = 500;

/**
 * Everything shared in a project, newest first (docs/adr/0016): placed on
 * one of its pages or sent in one of its conversations. A page in the trash
 * takes its files with it until it comes back.
 */
export async function listProjectFiles(
  ctx: OrgContext,
  projectId: string,
  kind: FileKind = "all",
): Promise<SharedFile[]> {
  const images = [...INLINE_MIMES];
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        size: files.size,
        createdAt: files.createdAt,
        author: users.name,
        pageId: pages.id,
        pageTitle: pages.title,
        messageId: messages.id,
        channelId: messages.channelId,
        parentId: messages.parentId,
      })
      .from(files)
      .leftJoin(users, eq(users.id, files.createdBy))
      .leftJoin(pages, eq(pages.id, files.pageId))
      .leftJoin(messages, eq(messages.id, files.messageId))
      .where(
        and(
          eq(files.projectId, projectId),
          isNull(pages.deletedAt),
          isNull(messages.deletedAt),
          kind === "images" ? inArray(files.mime, images) : undefined,
          kind === "other" ? notInArray(files.mime, images) : undefined,
        ),
      )
      .orderBy(desc(files.createdAt))
      .limit(LIMIT);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      mime: row.mime,
      size: row.size,
      createdAt: row.createdAt.toISOString(),
      author: row.author,
      page: row.pageId ? { id: row.pageId, title: row.pageTitle ?? "" } : null,
      message: row.messageId
        ? { id: row.messageId, channelId: row.channelId!, parentId: row.parentId }
        : null,
    }));
  });
}
