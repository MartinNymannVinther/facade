import { requireOrgContext } from "@/core/auth/guard";
import { search } from "@/modules/search/service";

export async function GET(request: Request) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
  return Response.json({ hits: await search(ctx, q) });
}
