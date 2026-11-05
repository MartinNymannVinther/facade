import { Refused } from "@/core/action";
import { requireOrgContext } from "@/core/auth/guard";
import { crossSite } from "@/core/http/cross-site";
import { readCapped } from "@/core/http/capped-body";
import { rateLimit } from "@/core/rate-limit";
import { ownConnection } from "@/modules/live/hub";
import { appendUpdate, loadState, MAX_UPDATE_BYTES } from "@/modules/pages/sync";

type Params = { params: Promise<{ id: string }> };

function refused(error: unknown): Response {
  if (error instanceof Refused)
    return new Response(null, { status: error.code === "notFound" ? 404 : 400 });
  console.error("page document failed", error);
  return new Response(null, { status: 500 });
}

/** The whole document, as one Yjs update. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  try {
    const state = await loadState(ctx, (await params).id);
    return new Response(Buffer.from(state), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return refused(error);
  }
}

/** One edit. Binary, so a route and not an action (ADR 0012). */
export async function POST(request: Request, { params }: Params) {
  if (crossSite(request)) return new Response(null, { status: 403 });
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  if (!rateLimit(`doc:${ctx.userId}`, 40, 1000 * 10).allowed)
    return new Response(null, { status: 429 });
  const bytes = await readCapped(request, MAX_UPDATE_BYTES);
  if (!bytes) return new Response(null, { status: 413 });
  // Large edits are rare and honest ones are few: a paste, a restore, a
  // return from offline. This is what bounds the log a member can pile up.
  if (bytes.length > 64_000 && !rateLimit(`docbig:${ctx.userId}`, 12, 60_000).allowed)
    return new Response(null, { status: 429 });
  const id = new URL(request.url).searchParams.get("connection") ?? "";
  const from = ownConnection(id, ctx.orgId, ctx.userId)?.id;
  try {
    await appendUpdate(ctx, (await params).id, bytes, from);
    return new Response(null, { status: 204 });
  } catch (error) {
    return refused(error);
  }
}
