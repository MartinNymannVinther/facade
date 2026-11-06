import { Refused } from "@/core/action";
import type { OrgContext } from "@/core/db/tenant";
import { docToJson, buildDoc, markdownToJson, rewrite } from "./document";
import { getPage } from "./service";
import { appendUpdate, loadState, settlePage } from "./sync";

/**
 * A page written from the server rather than from an editor: a Yjs update
 * like any other, so whoever has the page open sees it land and what they
 * are typing survives. A version is cut first, so it can be undone.
 */
export async function writeMarkdown(
  ctx: OrgContext,
  pageId: string,
  mode: "append" | "replace",
  markdown: string,
): Promise<void> {
  if (!(await getPage(ctx, pageId))) throw new Refused("notFound");
  await settlePage(ctx, pageId, "ai");
  const state = await loadState(ctx, pageId);
  const added = markdownToJson(markdown);
  const was = docToJson(buildDoc([state]));
  const next =
    mode === "append"
      ? { ...was, content: [...(was.content ?? []), ...(added.content ?? [])] }
      : added;
  await appendUpdate(ctx, pageId, rewrite(state, next));
}
