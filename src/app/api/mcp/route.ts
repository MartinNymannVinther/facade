import { crossSite } from "@/core/http/cross-site";
import { readCapped } from "@/core/http/capped-body";
import { callerKey, rateLimit } from "@/core/rate-limit";
import { handleMcp } from "@/modules/agents/mcp";
import { authenticateAgent } from "@/modules/agents/service";

const MAX_BODY_BYTES = 1_000_000;

const refuse = (status: number, headers?: HeadersInit) => new Response(null, { status, headers });

/**
 * The door for agents (docs/adr/0015). No session and no cookie: the key
 * decides who and which workspace, and everything behind it runs through the
 * same services and RLS as a person does.
 */
export async function POST(request: Request) {
  if (crossSite(request)) return refuse(403);
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const agent = await authenticateAgent(token);
  if (!agent) {
    if (!rateLimit(callerKey(request.headers, "mcp"), 30, 60_000).allowed) return refuse(429);
    return refuse(401, { "WWW-Authenticate": "Bearer" });
  }
  if (!rateLimit(`mcp:${agent.tokenId}`, 240, 60_000).allowed) return refuse(429);
  const body = await readCapped(request, MAX_BODY_BYTES);
  if (!body) return refuse(413);
  let message: unknown;
  try {
    message = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const reply = await handleMcp(agent, message);
  return reply ? Response.json(reply) : refuse(202);
}

/** No server-initiated stream: the transport's way of saying so. */
export function GET() {
  return refuse(405, { Allow: "POST" });
}

export function DELETE() {
  return refuse(405, { Allow: "POST" });
}
