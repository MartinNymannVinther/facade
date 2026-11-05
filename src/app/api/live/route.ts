import { eq } from "drizzle-orm";
import { requireOrgContext } from "@/core/auth/guard";
import { memberships } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { dropConnection, openConnection, presence } from "@/modules/live/hub";
import type { LiveEvent } from "@/modules/live/events";
import { and } from "drizzle-orm";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;
/** How long a removed member can keep listening, at most. */
const RECHECK_MS = 30_000;

async function stillMember(ctx: OrgContext): Promise<boolean> {
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

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
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
        stillMember(ctx)
          .then((member) => {
            if (!member) cleanup();
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
