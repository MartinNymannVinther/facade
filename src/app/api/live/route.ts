import { and, eq } from "drizzle-orm";
import { auth } from "@/core/auth/auth";
import { requireOrgContext } from "@/core/auth/guard";
import { memberships } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { dropConnection, openConnection, presence, streamsOf } from "@/modules/live/hub";
import type { LiveEvent } from "@/modules/live/events";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;
/** How long somebody signed out or removed can keep listening, at most. */
const RECHECK_MS = 30_000;
/** Queued events before a browser that stopped reading is cut off; it reads again on return. */
const SLOW_READER = 2000;
const MAX_STREAMS_PER_PERSON = 24;

/**
 * The stream outlives the request that opened it, so what was true then is
 * asked again: is the session still alive, still this person, still in this
 * workspace?
 */
async function stillAllowed(ctx: OrgContext, headers: Headers): Promise<boolean> {
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (session?.user.id !== ctx.userId) return false;
  if (session.session.activeOrganizationId !== ctx.orgId) return false;
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, ctx.orgId), eq(memberships.userId, ctx.userId))),
  );
  return rows.length > 0;
}

/**
 * The live stream: one per open tab, bound to the session's person and
 * workspace when it opens (ADR 0012). A plain route rather than a socket,
 * so it runs in the same standalone server behind the same proxy.
 */
export async function GET(request: Request) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  if (streamsOf(ctx.orgId, ctx.userId) >= MAX_STREAMS_PER_PERSON)
    return new Response(null, { status: 429 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) < -SLOW_READER) return cleanup();
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const connection = openConnection(
        ctx.orgId,
        ctx.userId,
        (event: LiveEvent) => write(`data: ${JSON.stringify(event)}\n\n`),
        () => cleanup(),
      );
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      const recheck = setInterval(() => {
        stillAllowed(ctx, request.headers)
          .then((allowed) => {
            if (!allowed) cleanup();
          })
          .catch(() => cleanup());
      }, RECHECK_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(recheck);
        dropConnection(connection.id);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", cleanup);
      write(
        `event: hello\ndata: ${JSON.stringify({ id: connection.id, online: presence(ctx.orgId) })}\n\n`,
      );
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
