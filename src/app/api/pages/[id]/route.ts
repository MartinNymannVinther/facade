import { Refused } from "@/core/action";
import { requireOrgContext } from "@/core/auth/guard";
import { crossSite } from "@/core/http/cross-site";
import { PageFields, updatePage } from "@/modules/pages/service";

/**
 * A page's name. A route rather than an action, because only a fetch can be
 * told to finish after the tab has closed, and a title typed just before
 * leaving is still a title.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (crossSite(request)) return new Response(null, { status: 403 });
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  const parsed = PageFields.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    await updatePage(ctx, (await params).id, parsed.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Refused) return new Response(null, { status: 404 });
    console.error("page rename failed", error);
    return new Response(null, { status: 500 });
  }
}
