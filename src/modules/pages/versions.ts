import { and, desc, eq } from "drizzle-orm";
import { Refused } from "@/core/action";
import { pageVersions, users } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { buildDoc, docToJson } from "./document";

export type VersionRow = {
  id: string;
  title: string;
  reason: string;
  author: string | null;
  createdAt: Date;
};

export async function listVersions(ctx: OrgContext, pageId: string): Promise<VersionRow[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: pageVersions.id,
        title: pageVersions.title,
        reason: pageVersions.reason,
        author: users.name,
        createdAt: pageVersions.createdAt,
      })
      .from(pageVersions)
      .leftJoin(users, eq(users.id, pageVersions.createdBy))
      .where(eq(pageVersions.pageId, pageId))
      .orderBy(desc(pageVersions.createdAt))
      .limit(200),
  );
}

/**
 * A version as content. Restoring is done in the browser as an ordinary
 * edit on the live document, so a colleague writing right now sees it
 * happen and it can itself be undone: there is no second write path.
 */
export async function readVersion(ctx: OrgContext, pageId: string, id: string) {
  const row = await withOrgContext(ctx, async (tx) => {
    const [version] = await tx
      .select({ state: pageVersions.state })
      .from(pageVersions)
      .where(and(eq(pageVersions.id, id), eq(pageVersions.pageId, pageId)));
    return version;
  });
  if (!row) throw new Refused("notFound");
  return docToJson(buildDoc([row.state]));
}
