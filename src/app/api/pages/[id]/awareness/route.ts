import { requireOrgContext } from "@/core/auth/guard";
import { crossSite } from "@/core/http/cross-site";
import { readCapped } from "@/core/http/capped-body";
import { rateLimit } from "@/core/rate-limit";
import { ownConnection, publishToPage } from "@/modules/live/hub";

const MAX_BYTES = 16_384;

/**
 * Where a person's cursor is: passed on, never stored. Only from a stream
 * already proven to be on this page, so nothing reaches a page by asking.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (crossSite(request)) return new Response(null, { status: 403 });
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  const pageId = (await params).id;
  const id = new URL(request.url).searchParams.get("connection") ?? "";
  const connection = ownConnection(id, ctx.orgId, ctx.userId);
  if (!connection || connection.pageId !== pageId) return new Response(null, { status: 409 });
  if (!rateLimit(`aware:${ctx.userId}`, 120, 1000 * 10).allowed)
    return new Response(null, { status: 429 });
  const bytes = await readCapped(request, MAX_BYTES);
  if (!bytes?.length) return new Response(null, { status: 413 });
  const data = Buffer.from(bytes).toString("base64");
  publishToPage(ctx.orgId, pageId, { type: "doc.awareness", pageId, data, from: id }, id);
  return new Response(null, { status: 204 });
}
