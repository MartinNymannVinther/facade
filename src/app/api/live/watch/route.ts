import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { crossSite } from "@/core/http/cross-site";
import { ownConnection, watchPage } from "@/modules/live/hub";
import { getPage } from "@/modules/pages/service";

const Body = z.object({
  connection: z.string().min(1).max(100),
  pageId: z.string().min(1).max(100).nullable(),
});

/** Moves this tab's stream onto a page, once that page is proven the workspace's. */
export async function POST(request: Request) {
  if (crossSite(request)) return new Response(null, { status: 403 });
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const connection = ownConnection(parsed.data.connection, ctx.orgId, ctx.userId);
  if (!connection) return new Response(null, { status: 409 });
  const { pageId } = parsed.data;
  if (pageId && !(await getPage(ctx, pageId))) return new Response(null, { status: 404 });
  return Response.json({ users: watchPage(connection, pageId) });
}
